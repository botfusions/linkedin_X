// Telegram-approved LinkedIn post publisher for Cenk's own profile.
//
// --request --captions <json with linkedin_personal> --image <png|jpg> [--slot 10|16] [--source-url <https url>]
//   --source-url: after publishing, adds "Kaynak: <url>" as our first comment (shown in the approval message).
//   Snapshots the text and image into data/post-onay/<id>/, writes a pending record and
//   sends the image plus the full text with publish/reject buttons (py:/pr:<id>:<nonce>).
// --callback
//   Called by the Hermes plugin (linkedin-yorum-onay) for one press. Publishes only the
//   pressed snapshot, once. No press, no post. No automatic retry after an uncertain publish.
//
// Publishing here is approved per press by Cenk, not by the 30-day trial window in
// data/geo-trial.json; only expectedSub is taken from that file.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import dotenv from 'dotenv';
import dns from 'node:dns';
import {openMcp, publishWithMcp, dayInIstanbul} from './geo-linkedin-trial.mjs';
import {withLock, tg, commentWithThreadFix} from './linkedin-comment-approval.mjs';

const DIR = path.resolve('data/post-onay');
// Receipts: <day>-<slot>.json for the 10:00/16:00 slots (Cenk 2026-11-25: two own posts a day);
// a request without --slot keeps the old <day>.json lock shared with geo-linkedin-trial.mjs.
export const SLOTS = ['10', '16'];
export const receiptKey = (day, slot) => (slot ? `${day}-${slot}` : day);
const RECEIPTS = path.resolve('data/geo-trial-receipts');
const MAX_AGE_MS = 48 * 3600 * 1000;
const DEFAULT_APPROVER = 6030287709; // Cenk

export function parsePostCallback(data) {
  const m = /^p(y|r):(\d{13}):([0-9a-f]{8})$/.exec(data || '');
  return m ? {action: m[1] === 'y' ? 'publish' : 'reject', id:m[2], nonce:m[3]} : null;
}

// Same content rules as geo-linkedin-trial.mjs validate(), without its trial dates.
export function checkPost(text, image) {
  if (typeof text !== 'string' || text.trim().length < 10 || text.length > 3000) throw new Error('Geçersiz LinkedIn metni (10-3000 karakter).');
  if ((text.match(/#[\p{L}\p{N}_]+/gu) || []).length > 3) throw new Error('En fazla 3 hashtag kullanılabilir.');
  const png = image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = image[0] === 255 && image[1] === 216 && image[2] === 255;
  if (!png && !jpeg) throw new Error('Yalnızca PNG veya JPEG görsel desteklenir.');
  if (image.length > 10 * 1024 * 1024) throw new Error('Görsel 10 MB sınırını aşıyor.');
  return png ? 'png' : 'jpg';
}

// First comment under our own post: the source link, from a fixed template (never model text).
export function firstComment(url) {
  if (typeof url !== 'string' || url.length > 500 || !/^https:\/\/[^\s]+$/.test(url)) throw new Error('Geçersiz kaynak linki (tek https URL olmalı).');
  return `Kaynak: ${url}`;
}

export const hashOf = (text, image) => createHash('sha256').update(text).update(image).digest('hex');

// Pure decision; side effects injected so tests run without network or disk.
export async function handlePostCallback({cb, approverId, chatId, store, publish, comment, now = Date.now()}) {
  if (cb.from?.id !== approverId || String(cb.message?.chat?.id) !== String(chatId)) return {reply:'Yetkin yok.', ignored:true};
  const p = parsePostCallback(cb.data);
  if (!p) return {reply:'Geçersiz buton.'};
  const rec = await store.read(p.id);
  if (!rec) return {reply:'Kayıt bulunamadı.'};
  if (rec.nonce !== p.nonce) return {reply:'Bu buton eski bir mesaja ait, yayınlamadım.', done:true};
  if (rec.status !== 'pending') return {reply:`Zaten işlendi: ${rec.status}.`, done:true};
  const at = new Date(now).toISOString();
  if (p.action === 'reject') {
    await store.write(p.id, {...rec, status:'rejected', decided_at:at});
    return {reply:'Reddedildi, post gitmedi.', done:true};
  }
  if (now - Date.parse(rec.created_at) > MAX_AGE_MS) {
    await store.write(p.id, {...rec, status:'expired'});
    return {reply:'Taslak 48 saatten eski, yayınlamadım.', done:true};
  }
  const snap = await store.snapshot(p.id, rec);
  if (hashOf(snap.text, snap.image) !== rec.hash) return {reply:'Taslak dosyaları onaydan sonra değişmiş, yayınlamadım.', done:true};
  if (await store.hashSeen(rec.hash)) return {reply:'Aynı metin ve görsel daha önce gönderilmiş, yayınlamadım.', done:true};
  const day = dayInIstanbul(new Date(now));
  const key = receiptKey(day, rec.slot);
  const base = {day, slot:rec.slot || null, hash:rec.hash, source:'post-onay', record:p.id, image:snap.imagePath, createdAt:at};
  // Exclusive day receipt: blocks a second own post today from this path and from the trial script.
  if (!(await store.claimDay(key, {...base, status:'posting'}))) return {reply: rec.slot ? `Bugünün ${rec.slot}:00 postu zaten yayınlandı ya da yayınlanıyor.` : 'Bugün zaten bir post yayınlandı ya da yayınlanıyor. Yarın tekrar basabilirsin.'};
  // Mark before the call: a crash mid-publish must never lead to a second post.
  await store.write(p.id, {...rec, status:'publishing', decided_at:at});
  try {
    const result = await publish(snap.text, snap.imagePath);
    await store.write(p.id, {...rec, status:'published', decided_at:at, published_at:new Date(now).toISOString(), result});
    await store.writeDay(key, {...base, ...result});
    let note = '';
    // The post is out and recorded; a comment failure is reported, never retried, never un-publishes.
    if (rec.first_comment && comment) {
      try {
        const c = await comment(result.urn, rec.first_comment);
        await store.write(p.id, {...rec, status:'published', decided_at:at, published_at:new Date(now).toISOString(), result, first_comment_result:{status:'published', ...c}});
        note = '\nKaynak linki ilk yoruma eklendi.';
      } catch (e) {
        await store.write(p.id, {...rec, status:'published', decided_at:at, published_at:new Date(now).toISOString(), result, first_comment_result:{status:'failed', error:e.message}});
        note = `\nKaynak yorumu eklenemedi, tekrar denemedim: ${e.message}`;
      }
    }
    return {reply:`Post yayınlandı.\n${result.url}${note}\nİlk 60 dakikada gelen yorumlara yanıt ver.`, done:true};
  } catch (e) {
    await store.write(p.id, {...rec, status:'needs_verification', decided_at:at, error:e.message});
    await store.writeDay(key, {...base, status:'needs_verification', error:e.message});
    return {reply:`Yayın hatası, tekrar denemedim. LinkedIn profilinde kontrol et.\n${e.message}`, done:true};
  }
}

const atomicWrite = async (f, obj) => {
  const tmp = `${f}.tmp-${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(obj, null, 2) + '\n');
  await fs.rename(tmp, f);
};

const fileStore = {
  async read(id) {
    try { return JSON.parse(await fs.readFile(path.join(DIR, id, 'record.json'), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  },
  write: (id, rec) => atomicWrite(path.join(DIR, id, 'record.json'), rec),
  async snapshot(id, rec) {
    const imagePath = path.join(DIR, id, rec.image_file);
    return {text: await fs.readFile(path.join(DIR, id, 'text.txt'), 'utf8'), image: await fs.readFile(imagePath), imagePath};
  },
  async hashSeen(hash) {
    for (const f of await fs.readdir(RECEIPTS).catch((e) => { if (e.code === 'ENOENT') return []; throw e; })) {
      if (f.endsWith('.json') && JSON.parse(await fs.readFile(path.join(RECEIPTS, f), 'utf8')).hash === hash) return true;
    }
    return false;
  },
  async claimDay(day, receipt) {
    await fs.mkdir(RECEIPTS, {recursive:true});
    try { await fs.writeFile(path.join(RECEIPTS, `${day}.json`), JSON.stringify(receipt, null, 2), {flag:'wx'}); return true; }
    catch (e) { if (e.code === 'EEXIST') return false; throw e; }
  },
  writeDay: (day, receipt) => atomicWrite(path.join(RECEIPTS, `${day}.json`), receipt),
};

async function publishPost(text, imagePath) {
  const t = JSON.parse(await fs.readFile('data/.linkedin_token.json', 'utf8'));
  if (!t.access_token || Date.now() >= t.expiresAt) throw new Error('LinkedIn token eksik veya süresi dolmuş.');
  const cfg = JSON.parse(await fs.readFile('data/geo-trial.json', 'utf8'));
  if (!cfg.expectedSub) throw new Error('Beklenen LinkedIn profili tanımlı değil.');
  const client = await openMcp(t.access_token);
  try { return await publishWithMcp({client, config:{expectedSub:cfg.expectedSub}, text, imagePath, onPosting: async () => {}}); }
  finally { await client.close(); }
}

async function commentOnPost(urn, text) {
  const t = JSON.parse(await fs.readFile('data/.linkedin_token.json', 'utf8'));
  const client = await openMcp(t.access_token);
  try { return await commentWithThreadFix((u) => client.callTool({name:'linkedin_comment_on_post', arguments:{post_urn:u, text}}), urn); }
  finally { await client.close(); }
}

async function requestMode(args) {
  const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const captions = arg('--captions'), imageIn = arg('--image'), slot = arg('--slot'), sourceUrl = arg('--source-url');
  if (slot !== undefined && !SLOTS.includes(slot)) throw new Error(`--slot ${SLOTS.join(' veya ')} olmalı.`);
  if (!captions || !imageIn) throw new Error('Kullanım: node scripts/linkedin-post-approval.mjs --request --captions captions.json --image gorsel.png');
  const token = process.env.TELEGRAM_ENGAGEMENT_BOT_TOKEN, chatId = process.env.TELEGRAM_ENGAGEMENT_CHAT_ID;
  if (!token || !chatId) throw new Error('TELEGRAM_ENGAGEMENT_BOT_TOKEN / TELEGRAM_ENGAGEMENT_CHAT_ID eksik.');
  const text = JSON.parse(await fs.readFile(captions, 'utf8')).linkedin_personal;
  const image = await fs.readFile(imageIn);
  const ext = checkPost(text, image);
  const first = sourceUrl ? firstComment(sourceUrl) : undefined;
  const id = String(Date.now()), nonce = randomBytes(4).toString('hex'), dir = path.join(DIR, id);
  await fs.mkdir(dir, {recursive:true});
  await fs.writeFile(path.join(dir, 'text.txt'), text);
  await fs.writeFile(path.join(dir, `image.${ext}`), image);
  const rec = {schema:'linkedin-post-approval/v1', status:'pending', created_at:new Date().toISOString(), nonce,
    hash:hashOf(text, image), image_file:`image.${ext}`, ...(slot ? {slot} : {}), ...(first ? {first_comment:first} : {}), source:{captions:path.resolve(captions), image:path.resolve(imageIn)}};
  await fileStore.write(id, rec);
  const form = new FormData();
  form.set('chat_id', chatId);
  form.set('caption', `📣 Post onayı #${id}: görsel. Metin ve butonlar bir sonraki mesajda.`);
  form.set('photo', new Blob([image], {type: ext === 'png' ? 'image/png' : 'image/jpeg'}), `image.${ext}`);
  const r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {method:'POST', body:form, signal:AbortSignal.timeout(30000)});
  const j = await r.json();
  if (!j.ok) throw new Error(`Telegram sendPhoto: ${r.status} ${j.description || ''}`);
  await tg(token, 'sendMessage', {chat_id:chatId, text:`📣 Post onayı #${id}${slot ? ` · ${slot}:00 postu` : ''} (${text.length} karakter)\n\n${text}${first ? `\n\n💬 İlk yorum (yayından sonra): ${first}` : ''}`,
    reply_markup:{inline_keyboard:[[{text:'✅ Yayınla', callback_data:`py:${id}:${nonce}`}, {text:'❌ Reddet', callback_data:`pr:${id}:${nonce}`}]]}});
  console.log(JSON.stringify({schema:'linkedin-post-approval-request/v1', status:'sent', id, slot:slot || null, characters:text.length}));
}

async function callbackMode() {
  const cb = JSON.parse(await new Promise((res, rej) => { let d = ''; process.stdin.on('data', (c) => d += c); process.stdin.on('end', () => res(d)); process.stdin.on('error', rej); }));
  const approverId = Number(process.env.TELEGRAM_ENGAGEMENT_APPROVER_ID || DEFAULT_APPROVER);
  const chatId = process.env.TELEGRAM_ENGAGEMENT_CHAT_ID || String(DEFAULT_APPROVER);
  const r = await withLock(() => handlePostCallback({cb, approverId, chatId, store:fileStore, publish:publishPost, comment:commentOnPost}), DIR);
  console.log(JSON.stringify(r.locked ? {reply:'Başka bir onay işleniyor, birkaç saniye sonra tekrar bas.'} : r.value));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  dotenv.config({quiet:true});
  // This Mac's IPv6 path to api.telegram.org fails (fetch failed, 2026-11-25); curl and the gateway fall back to IPv4.
  dns.setDefaultResultOrder('ipv4first');
  const args = process.argv.slice(2);
  (args.includes('--callback') ? callbackMode() : args.includes('--request') ? requestMode(args) : Promise.reject(new Error('--request veya --callback gerekli.')))
    .catch((e) => {
      console.error(`❌ ${e.message}`);
      process.exitCode = 1;
      if (args.includes('--callback')) console.log(JSON.stringify({reply:`Hata, post gönderilmedi: ${e.message}`.slice(0, 900)}));
    });
}

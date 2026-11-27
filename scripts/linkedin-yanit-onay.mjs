// Telegram-approved REPLIES to comments on our own posts (comment follow-up, step 5-6).
//
//   --request <file.json>   write data/yanit-onay/<commentId>.json (pending) + send the draft with buttons
//   --callback              one button press from the Hermes plugin (JSON on stdin), prints {reply, done?}
//
// Replies are published ONLY after Cenk's press (qy:<commentId>:<nonce>), once per comment, never retried.
// Scope: comments on OUR posts. Replies under our comments on other people's posts are not read yet.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import dotenv from 'dotenv';
import {openMcp, readMcpResult} from './geo-linkedin-trial.mjs';
import {tg, withLock, commentWithThreadFix} from './linkedin-comment-approval.mjs';

const DIR = path.resolve('data/yanit-onay');
const MAX_AGE_MS = 72 * 3600e3; // Cenk's rule: older than 72 h gets no reply
const THREAD_CAP = 2; // never more than 2 replies to one commenter under one post
const DEFAULT_APPROVER = 6030287709;
const LIVE = ['published', 'publishing', 'needs_verification']; // may have gone out: they all count

// LinkedIn ids are snowflakes: the top bits are the creation time in ms.
export const commentTimeMs = (urn) => {
  const m = /,(\d{10,25})\)$/.exec(urn || '');
  return m ? Number(BigInt(m[1]) >> 22n) : null;
};
export const commentId = (urn) => /,(\d{10,25})\)$/.exec(urn || '')?.[1] ?? null;
// The post URN comes from inside the parent comment URN (the share form in post records fails).
export const postUrnFromComment = (urn) => /^urn:li:comment:\((urn:li:(?:activity|share|ugcPost):\d+),\d+\)$/.exec(urn || '')?.[1] ?? null;

export function parseCallback(data) {
  const m = /^q(y|r):(\d{6,25}):([0-9a-f]{8})$/.exec(data || '');
  return m ? {action: m[1] === 'y' ? 'publish' : 'reject', id: m[2], nonce: m[3]} : null;
}

export function validRequest(r) {
  const why = (s) => ({ok: false, why: s});
  if (!commentId(r.comment_urn) || !postUrnFromComment(r.comment_urn)) return why('comment_urn');
  for (const k of ['author', 'comment_text', 'draft', 'post_url']) if (typeof r[k] !== 'string' || !r[k].trim()) return why(k);
  if (r.draft.length > 1250) return why('draft too long');
  return {ok: true};
}

export async function handleCallback({cb, approverId, chatId, store, publish, now = Date.now()}) {
  if (cb.from?.id !== approverId || String(cb.message?.chat?.id) !== String(chatId)) return {reply: 'Yetkin yok.', ignored: true};
  const p = parseCallback(cb.data);
  if (!p) return {reply: 'Geçersiz buton.'};
  const rec = await store.read(p.id);
  if (!rec) return {reply: 'Kayıt bulunamadı.'};
  if (rec.nonce !== p.nonce) return {reply: 'Bu buton eski bir mesaja ait, yayınlamadım.', done: true};
  if (rec.status !== 'pending') return {reply: `Zaten işlendi: ${rec.status}.`, done: true};
  const at = new Date(now).toISOString();
  if (p.action === 'reject') {
    await store.write(p.id, {...rec, status: 'rejected', decided_at: at});
    return {reply: 'Reddedildi, yanıt gitmedi.', done: true};
  }
  const born = commentTimeMs(rec.comment_urn);
  if (born === null || now - born > MAX_AGE_MS) {
    await store.write(p.id, {...rec, status: 'expired'});
    return {reply: 'Yorum 72 saatten eski, yayınlamadım.', done: true};
  }
  if ((await store.liveReplies(rec.post_urn, rec.profile)) >= THREAD_CAP) {
    return {reply: `Bu kişiye bu gönderi altında zaten ${THREAD_CAP} yanıt verdik, yayınlamadım.`, done: true};
  }
  if (!(await store.claim(p.id))) return {reply: 'Bu yoruma zaten yanıt yayınlandı ya da yayınlanıyor.', done: true};
  // Mark before the call: a crash mid-publish must never lead to a second reply.
  await store.write(p.id, {...rec, status: 'publishing', decided_at: at});
  try {
    const result = await publish(rec.post_urn, rec.parent_comment, rec.draft);
    await store.write(p.id, {...rec, status: 'published', decided_at: at, published_at: at, result});
    return {reply: `Yanıt yayınlandı.\n${rec.post_url}`, done: true};
  } catch (e) {
    await store.write(p.id, {...rec, status: 'needs_verification', decided_at: at, error: e.message});
    // Neutral wording on purpose: an unparsed answer after LinkedIn accepted must not claim "not sent".
    return {reply: `Yayın sonucu belirsiz, tekrar denemedim. LinkedIn'de kontrol et: ${rec.post_url}\n${e.message}\n\nTaslak elle yapıştırmak için mesajda duruyor.`, done: true};
  }
}

export const fileStore = (dir = DIR) => ({
  async read(id) {
    try { return JSON.parse(await fs.readFile(path.join(dir, `${id}.json`), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  },
  async write(id, rec) {
    await fs.mkdir(dir, {recursive: true});
    const f = path.join(dir, `${id}.json`), tmp = `${f}.tmp-${process.pid}`;
    await fs.writeFile(tmp, JSON.stringify(rec, null, 2) + '\n');
    await fs.rename(tmp, f);
  },
  async claim(id) {
    try { await (await fs.open(path.join(dir, `${id}.publish-claim`), 'wx')).close(); return true; }
    catch (e) { if (e.code === 'EEXIST') return false; throw e; }
  },
  async liveReplies(postUrn, profile) {
    let n = 0;
    for (const f of await fs.readdir(dir).catch(() => [])) {
      if (!f.endsWith('.json')) continue;
      const r = JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'));
      if (r.post_urn === postUrn && r.profile === profile && LIVE.includes(r.status)) n++;
    }
    return n;
  },
});

function makePublisher() {
  let client = null;
  const publish = async (postUrn, parent, text) => {
    if (!client) {
      const t = JSON.parse(await fs.readFile('data/.linkedin_token.json', 'utf8'));
      if (!t.access_token || Date.now() >= t.expiresAt) throw new Error('LinkedIn token eksik veya süresi dolmuş.');
      const cfg = JSON.parse(await fs.readFile('data/geo-trial.json', 'utf8'));
      const c = await openMcp(t.access_token);
      try {
        const sub = readMcpResult(await c.callTool({name: 'linkedin_get_profile', arguments: {}})).sub;
        if (!cfg.expectedSub || sub !== cfg.expectedSub) throw new Error('Bağlı LinkedIn profili beklenen hesap değil.');
      } catch (e) { await c.close(); throw e; }
      client = c;
    }
    return commentWithThreadFix((u) => client.callTool({name: 'linkedin_comment_on_post', arguments: {post_urn: u, text, parent_comment: parent}}), postUrn);
  };
  return {publish, close: async () => { if (client) await client.close(); }};
}

async function callbackMode() {
  const cb = JSON.parse(await new Promise((res, rej) => { let d = ''; process.stdin.on('data', (c) => d += c); process.stdin.on('end', () => res(d)); process.stdin.on('error', rej); }));
  const approverId = Number(process.env.TELEGRAM_ENGAGEMENT_APPROVER_ID || DEFAULT_APPROVER);
  const chatId = process.env.TELEGRAM_ENGAGEMENT_CHAT_ID || String(DEFAULT_APPROVER);
  const r = await withLock(async () => {
    const pub = makePublisher();
    try { return await handleCallback({cb, approverId, chatId, store: fileStore(), publish: pub.publish}); } finally { await pub.close(); }
  }, DIR);
  console.log(JSON.stringify(r.locked ? {reply: 'Başka bir onay işleniyor, birkaç saniye sonra tekrar bas.'} : r.value));
}

export function requestText(rec) {
  return [
    `Yeni yorum: ${rec.author}${rec.headline ? ` (${rec.headline.slice(0, 80)})` : ''}`,
    rec.post_url, '',
    `Yorumu:\n${rec.comment_text}`, '',
    `Taslak yanıt:\n${rec.draft}`, '',
    'Yayınla dersen yanıt senin hesabından o yorumun altına gider. Basmazsan hiçbir şey gitmez.',
  ].join('\n');
}

// Record first, then buttons: a press must always find its record. A comment that already has a
// record (any status) never gets a second one.
export async function request(file, {store = fileStore(), send, now = Date.now(), randomHex}) {
  const r = JSON.parse(await fs.readFile(file, 'utf8'));
  const v = validRequest(r);
  if (!v.ok) throw new Error(`Geçersiz istek: ${v.why}`);
  const id = commentId(r.comment_urn);
  const born = commentTimeMs(r.comment_urn);
  if (born === null || now - born > MAX_AGE_MS) throw new Error('Yorum 72 saatten eski.');
  const old = await store.read(id);
  if (old && old.status !== 'send_failed') throw new Error('Bu yorum için kayıt zaten var.');
  const nonce = randomHex();
  const rec = {schema: 'linkedin-yanit-onay/v1', status: 'pending', created_at: new Date(now).toISOString(), nonce,
    comment_urn: r.comment_urn, parent_comment: r.comment_urn, post_urn: postUrnFromComment(r.comment_urn), post_url: r.post_url,
    author: r.author, profile: r.profile || r.author, headline: r.headline || '', comment_text: r.comment_text, draft: r.draft};
  await store.write(id, rec);
  const buttons = {inline_keyboard: [[{text: '✅ Yanıtı yayınla', callback_data: `qy:${id}:${nonce}`}, {text: '❌ Reddet', callback_data: `qr:${id}:${nonce}`}]]};
  try { await send(requestText(rec), buttons); } // plain text, no parse_mode: comment text is untrusted
  catch (e) { await store.write(id, {...rec, status: 'send_failed', error: e.message}); throw e; } // no buttons exist, so a later run may try again
  return {id, status: 'sent'};
}

async function main() {
  dotenv.config({quiet: true});
  if (process.argv.includes('--callback')) return callbackMode();
  const i = process.argv.indexOf('--request');
  if (i < 0) throw new Error('usage: --request <file.json> | --callback');
  const token = process.env.TELEGRAM_ENGAGEMENT_BOT_TOKEN, chat = process.env.TELEGRAM_ENGAGEMENT_CHAT_ID;
  if (!token || !chat) throw new Error('TELEGRAM_ENGAGEMENT_BOT_TOKEN / TELEGRAM_ENGAGEMENT_CHAT_ID eksik.');
  const {randomBytes} = await import('node:crypto');
  const out = await withLock(() => request(process.argv[i + 1], {
    send: (text, reply_markup) => tg(token, 'sendMessage', {chat_id: chat, text, reply_markup}),
    randomHex: () => randomBytes(4).toString('hex'),
  }), DIR);
  console.log(JSON.stringify(out.locked ? {status: 'locked'} : out.value));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e.message); process.exit(1); });

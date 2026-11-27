// Telegram-approved LinkedIn comment publisher.
//
// engagement_agent.ts writes data/yorum-onay/<activityId>.json (status
// "pending") and sends drafts with buttons. This script (Hermes cron, every
// few minutes) reads button presses from the engagement bot and publishes
// ONLY the draft Cenk pressed, through linkedin-mcp's linkedin_comment_on_post.
// No press, no comment. No automatic retry after an uncertain publish.
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import dotenv from 'dotenv';
import {openMcp, readMcpResult} from './geo-linkedin-trial.mjs';

const DIR = path.resolve('data/yorum-onay');
const OFFSET = path.join(DIR, '.telegram-offset.json');
const MAX_AGE_MS = 48 * 3600 * 1000; // comment visibility drops fast; older approvals are refused
const DAILY_LIMIT = 6; // at most 6 comments a day (Cenk raised it from 3 on 27 Nov 2026; 3 since 16 Sep)
const DEFAULT_APPROVER = 6030287709; // Cenk, same as the linkedin profile's TELEGRAM_ALLOWED_USERS

export const dayTRT = (ms) => new Date(ms).toLocaleDateString('en-CA', {timeZone:'Europe/Istanbul'});

export function parseCallback(data) {
  const m = /^(y|r):(\d{6,25}):(\d):([0-9a-f]{8})$/.exec(data || '');
  if (!m) return null;
  return {action: m[1] === 'y' ? 'publish' : 'reject', id:m[2], draft:Number(m[3]), nonce:m[4]};
}

// Feed URLs often carry urn:li:activity, but comments need the post's own thread URN.
// LinkedIn rejects that with a 400 naming the real one; a 400 means nothing was posted,
// so one call with the named URN is safe (not a retry of an uncertain publish).
// Right after publishing, LinkedIn can answer 404 "Unable to obtain activity" (seen 2026-11-26 on
// a first comment). A 404 posted nothing, so waiting and calling again is safe.
export async function commentWithThreadFix(call, postUrn, waits = [10e3, 30e3]) {
  const errText = (res) => res.content?.map(c => c.text).join(' ') || 'MCP hata döndürdü.';
  const notReady = (res) => /failed with 404: Unable to obtain activity/.test(errText(res));
  let res = await call(postUrn);
  for (const ms of waits) {
    if (!res.isError || !notReady(res)) break;
    await new Promise((r) => setTimeout(r, ms));
    res = await call(postUrn);
  }
  if (res.isError) {
    const m = /actual threadUrn: (urn:li:(?:ugcPost|share):\d+)/.exec(errText(res));
    if (!m || !/failed with 400/.test(errText(res))) throw new Error(errText(res));
    res = await call(m[1]);
    if (res.isError) throw new Error(errText(res));
  }
  return readMcpResult(res);
}

// Pure decision + side effects injected, so tests run without network.
export async function handleCallback({cb, approverId, chatId, store, publish, now = Date.now()}) {
  if (cb.from?.id !== approverId || String(cb.message?.chat?.id) !== String(chatId)) return {reply:'Yetkin yok.', ignored:true};
  const p = parseCallback(cb.data);
  if (!p) return {reply:'Geçersiz buton.'};
  const rec = await store.read(p.id);
  if (!rec) return {reply:'Kayıt bulunamadı.'};
  if (rec.nonce !== p.nonce) return {reply:'Bu buton eski bir mesaja ait, yayınlamadım.', done:true};
  if (rec.status !== 'pending') return {reply:`Zaten işlendi: ${rec.status}.`, done:true};
  if (p.action === 'reject') {
    await store.write(p.id, {...rec, status:'rejected', decided_at:new Date(now).toISOString()});
    return {reply:'Reddedildi, yorum gitmedi.', done:true};
  }
  if (now - Date.parse(rec.created_at) > MAX_AGE_MS) {
    await store.write(p.id, {...rec, status:'expired'});
    return {reply:'Taslak 48 saatten eski, yayınlamadım.', done:true};
  }
  const today = dayTRT(now);
  if ((await store.publishedOn(today)) >= DAILY_LIMIT) return {reply:`Bugün ${DAILY_LIMIT} yorum sınırı doldu, yayınlamadım. Yarın tekrar basabilirsin.`};
  const text = rec.drafts?.[p.draft - 1];
  if (typeof text !== 'string' || !text.trim() || text.length > 1250) return {reply:'Taslak geçersiz.'};
  // One comment per post, ever: an exclusive claim file that is never deleted. Holds even if
  // the run lock races or the producer rewrites the record as 'pending' again.
  if (!(await store.claim(p.id))) return {reply:'Bu gönderiye zaten bir yorum yayınlandı ya da yayınlanıyor.', done:true};
  // Mark before the call: a crash mid-publish must never lead to a second comment.
  await store.write(p.id, {...rec, status:'publishing', chosen_draft:p.draft, decided_at:new Date(now).toISOString()});
  try {
    const result = await publish(rec.post_urn, text);
    await store.write(p.id, {...rec, status:'published', chosen_draft:p.draft, decided_at:new Date(now).toISOString(), published_at:new Date(now).toISOString(), result});
    return {reply:`Yorum yayınlandı (taslak ${p.draft}).\n${rec.url}`, done:true};
  } catch (e) {
    await store.write(p.id, {...rec, status:'needs_verification', chosen_draft:p.draft, decided_at:new Date(now).toISOString(), error:e.message});
    return {reply:`Yayın hatası, tekrar denemedim. LinkedIn'de kontrol et: ${rec.url}\n${e.message}`, done:true};
  }
}

const fileStore = {
  async read(id) {
    try { return JSON.parse(await fs.readFile(path.join(DIR, `${id}.json`), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; } // other errors stop the run; offset stays put
  },
  async claim(id) {
    try { await (await fs.open(path.join(DIR, `${id}.publish-claim`), 'wx')).close(); return true; }
    catch (e) { if (e.code === 'EEXIST') return false; throw e; }
  },
  async publishedOn(day) {
    let n = 0;
    for (const f of await fs.readdir(DIR)) {
      if (!f.endsWith('.json')) continue;
      const r = JSON.parse(await fs.readFile(path.join(DIR, f), 'utf8'));
      // 'publishing'/'needs_verification' may have gone out, so they count too
      if (['published', 'publishing', 'needs_verification'].includes(r.status) && r.decided_at && dayTRT(Date.parse(r.decided_at)) === day) n++;
    }
    return n;
  },
  async write(id, rec) {
    const f = path.join(DIR, `${id}.json`), tmp = `${f}.tmp-${process.pid}`;
    await fs.writeFile(tmp, JSON.stringify(rec, null, 2) + '\n');
    await fs.rename(tmp, f);
  },
};

export async function tg(token, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), signal:AbortSignal.timeout(20000)});
  const j = await r.json();
  if (!j.ok) throw new Error(`Telegram ${method}: ${r.status} ${j.description || ''}`);
  return j.result;
}

// One run at a time: two overlapping runs could both see 'pending' and publish twice.
export async function withLock(fn, dir = DIR) {
  await fs.mkdir(dir, {recursive:true});
  const LOCK = path.join(dir, '.run.lock');
  const take = () => fs.open(LOCK, 'wx').then(async (h) => { await h.writeFile(String(process.pid)); return h; });
  const lock = await take().catch(async (e) => {
    if (e.code !== 'EEXIST') throw e;
    // A killed run (plugin timeout) leaves the lock; if its pid is gone, take it over.
    // Safe: records it touched stay 'publishing', so nothing is published twice.
    const pid = Number(await fs.readFile(LOCK, 'utf8').catch(() => ''));
    let alive = false;
    if (pid > 0) { try { process.kill(pid, 0); alive = true; } catch (err) { alive = err.code === 'EPERM'; } }
    if (pid > 0 && !alive) { await fs.unlink(LOCK).catch(() => {}); return take(); }
    const age = Date.now() - (await fs.stat(LOCK)).mtimeMs;
    if (age < 10 * 60e3) return null;
    throw new Error(`Eski kilit dosyası (${Math.round(age / 60e3)} dk): ${LOCK}. Önceki çalışmanın yarıda kaldığı kayıtları kontrol et, sonra kilidi sil.`);
  });
  if (!lock) return {locked:true};
  try { return {locked:false, value: await fn()}; }
  finally { await lock.close().catch(() => {}); await fs.unlink(LOCK).catch(() => {}); } // cleanup must not turn a success into an error
}

// Lazily opens linkedin-mcp; the client is kept only after the profile check passed.
function makePublisher() {
  let client = null;
  const publish = async (postUrn, text) => {
    if (!client) {
      const t = JSON.parse(await fs.readFile('data/.linkedin_token.json', 'utf8'));
      if (!t.access_token || Date.now() >= t.expiresAt) throw new Error('LinkedIn token eksik veya süresi dolmuş.');
      const cfg = JSON.parse(await fs.readFile('data/geo-trial.json', 'utf8'));
      const c = await openMcp(t.access_token);
      try {
        const sub = readMcpResult(await c.callTool({name:'linkedin_get_profile', arguments:{}})).sub;
        if (!cfg.expectedSub || sub !== cfg.expectedSub) throw new Error('Bağlı LinkedIn profili beklenen hesap değil.');
      } catch (e) { await c.close(); throw e; }
      client = c;
    }
    return commentWithThreadFix((urn) => client.callTool({name:'linkedin_comment_on_post', arguments:{post_urn:urn, text}}), postUrn);
  };
  return {publish, close: async () => { if (client) await client.close(); }};
}

// --callback: called by the Hermes plugin (linkedin-yorum-onay) for one button press.
// Reads the callback JSON on stdin, prints {reply, ignored?, done?}. Telegram I/O stays in the plugin.
async function callbackMode() {
  const cb = JSON.parse(await new Promise((res, rej) => { let d = ''; process.stdin.on('data', (c) => d += c); process.stdin.on('end', () => res(d)); process.stdin.on('error', rej); }));
  const approverId = Number(process.env.TELEGRAM_ENGAGEMENT_APPROVER_ID || DEFAULT_APPROVER);
  const chatId = process.env.TELEGRAM_ENGAGEMENT_CHAT_ID || String(DEFAULT_APPROVER);
  const r = await withLock(async () => {
    const pub = makePublisher();
    try { return await handleCallback({cb, approverId, chatId, store:fileStore, publish:pub.publish}); } finally { await pub.close(); }
  });
  console.log(JSON.stringify(r.locked ? {reply:'Başka bir onay işleniyor, birkaç saniye sonra tekrar bas.'} : r.value));
}

async function main() {
  dotenv.config({quiet:true});
  if (process.argv.includes('--callback')) return callbackMode();
  const token = process.env.TELEGRAM_ENGAGEMENT_BOT_TOKEN, chatId = process.env.TELEGRAM_ENGAGEMENT_CHAT_ID;
  if (!token || !chatId) throw new Error('TELEGRAM_ENGAGEMENT_BOT_TOKEN / TELEGRAM_ENGAGEMENT_CHAT_ID eksik.');
  const approverId = Number(process.env.TELEGRAM_ENGAGEMENT_APPROVER_ID || DEFAULT_APPROVER);
  const r = await withLock(() => run(token, chatId, approverId));
  if (r.locked) console.log(JSON.stringify({schema:'linkedin-comment-approval-run/v1', status:'locked'}));
}

async function saveOffset(offset) {
  const tmp = `${OFFSET}.tmp-${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify({offset}));
  await fs.rename(tmp, OFFSET);
}

async function run(token, chatId, approverId) {
  const offset = JSON.parse(await fs.readFile(OFFSET, 'utf8').catch((e) => { if (e.code === 'ENOENT') return '{"offset":0}'; throw e; })).offset;
  // A 409 here means another poller (e.g. a Hermes gateway) uses this bot token.
  const updates = await tg(token, 'getUpdates', {offset, timeout:0, allowed_updates:['callback_query']});
  const pub = makePublisher(), publish = pub.publish;
  let handled = 0;
  try {
    for (const u of updates) {
      const cb = u.callback_query;
      if (cb) {
        const out = await handleCallback({cb, approverId, chatId, store:fileStore, publish});
        await tg(token, 'answerCallbackQuery', {callback_query_id:cb.id, text:out.reply.slice(0, 190)}).catch(() => {});
        if (!out.ignored) {
          await tg(token, 'sendMessage', {chat_id:chatId, text:out.reply, reply_to_message_id:cb.message.message_id}).catch(() => {});
          if (out.done) await tg(token, 'editMessageReplyMarkup', {chat_id:chatId, message_id:cb.message.message_id, reply_markup:{inline_keyboard:[]}}).catch(() => {});
        }
        handled++;
      }
      await saveOffset(u.update_id + 1);
    }
  } finally { await pub.close(); }
  console.log(JSON.stringify({schema:'linkedin-comment-approval-run/v1', status: handled ? 'handled' : 'no_work', handled}));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(async (e) => {
  console.error(`❌ ${e.message}`);
  process.exitCode = 1;
  if (process.argv.includes('--callback')) { console.log(JSON.stringify({reply:`Hata, yorum gönderilmedi: ${e.message}`.slice(0, 900)})); return; }
  // Hermes delivers this job locally, so a run-level failure must reach Cenk here or he presses buttons into silence.
  const {TELEGRAM_ENGAGEMENT_BOT_TOKEN:t, TELEGRAM_ENGAGEMENT_CHAT_ID:c} = process.env;
  if (t && c) await tg(t, 'sendMessage', {chat_id:c, text:`⚠️ Yorum onay script'i hata verdi: ${e.message}`}).catch(() => {});
});

// Competitor tracking (lane 2), step 1-2: which pages to read, which fresh posts need a draft.
// Pure + file helpers only. Reading pages (Neo) and drafting happen elsewhere.
//   node scripts/linkedin-rakip-takip.mjs --watch                 # targets for this run, JSON
//   node scripts/linkedin-rakip-takip.mjs --new <okuma.json>      # fresh unseen posts, JSON
//   node scripts/linkedin-rakip-takip.mjs --mark-read <key,key>   # remember which pages were read
//   node scripts/linkedin-rakip-takip.mjs --mark <id,id>          # remember posts (sent or skipped)
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const H = 3600e3;
export const MAX_AGE_H = Number(process.env.RAKIP_MAX_SAAT || 6); // Cenk's rule: visibility drops after ~6 h
export const MAX_PAGES = 12;
export const TARGETS = 'data/rakip-takip/hedefler.json';
export const SEEN = 'data/rakip-takip/durum/gorulen.json';
export const READ = 'data/rakip-takip/durum/okunan.json';

// LinkedIn ids are snowflakes: the top bits are the creation time in ms.
export const postTimeMs = (id) => (/^\d{10,25}$/.test(id || '') ? Number(BigInt(id) >> 22n) : null);

const loadJson = async (f, d) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return d; } };
async function saveJson(f, o) {
  await fs.mkdir(path.dirname(f), {recursive: true});
  await fs.writeFile(`${f}.tmp`, JSON.stringify(o, null, 2));
  await fs.rename(`${f}.tmp`, f);
}

// Priority 1 targets every run; the rest rotate, least recently read first. Hard page cap.
export function pickTargets(targets, lastRead, max = MAX_PAGES) {
  const p1 = targets.filter((t) => t.priority === 1);
  const rest = targets.filter((t) => t.priority !== 1)
    .sort((a, b) => Date.parse(lastRead[a.key] || 0) - Date.parse(lastRead[b.key] || 0));
  return [...p1, ...rest].slice(0, max);
}

// Reader output: {pages:[{key, error, posts:[{id, urn, url, author, page_text}]}]}.
// Fresh = <= MAX_AGE_H by the id's own timestamp; unseen; no approval record yet (this also
// de-duplicates against the older Cowork bridge, which writes data/yorum-onay/<id>.json).
export async function freshPosts(reading, {seen = {}, now = Date.now(), maxAgeH = MAX_AGE_H, hasRecord = async () => false} = {}) {
  const out = [], dup = new Set();
  for (const page of reading.pages || []) {
    if (page.error) continue;
    for (const p of page.posts || []) {
      const t = postTimeMs(p.id);
      if (t === null || dup.has(p.id) || p.id in seen) continue;
      const ageH = (now - t) / H;
      if (ageH < 0 || ageH > maxAgeH || !(p.page_text || '').trim()) continue;
      if (await hasRecord(p.id)) continue;
      dup.add(p.id);
      out.push({...p, target: page.key, age_h: Math.round(ageH * 10) / 10});
    }
  }
  // Posts that invite an answer first (agent.md rule 8), then the youngest.
  const asks = (p) => /\?\s*$/m.test(p.page_text.slice(0, 3000)) ? 1 : 0;
  return out.sort((a, b) => asks(b) - asks(a) || a.age_h - b.age_h);
}

export async function markSeen(ids, seen, file = SEEN, now = Date.now()) {
  const next = {...seen};
  for (const id of ids) next[id] ??= new Date(now).toISOString();
  await saveJson(file, next);
  return next;
}

export async function markRead(keys, file = READ, now = Date.now()) {
  const next = await loadJson(file, {});
  for (const k of keys) next[k] = new Date(now).toISOString();
  await saveJson(file, next);
}

export const recordExists = (id) => fs.stat(path.join('data/yorum-onay', `${id}.json`)).then(() => true, () => false);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (f) => { const i = process.argv.indexOf(f); return i < 0 ? null : process.argv[i + 1]; };
  if (process.argv.includes('--watch')) {
    console.log(JSON.stringify(pickTargets(await loadJson(TARGETS, []), await loadJson(READ, {})), null, 2));
  } else if (arg('--new')) {
    const reading = JSON.parse(await fs.readFile(arg('--new'), 'utf8'));
    console.log(JSON.stringify(await freshPosts(reading, {seen: await loadJson(SEEN, {}), hasRecord: recordExists}), null, 2));
  } else if (arg('--mark-read')) {
    await markRead(arg('--mark-read').split(',').filter(Boolean));
  } else if (arg('--mark')) {
    await markSeen(arg('--mark').split(',').filter(Boolean), await loadJson(SEEN, {}));
  } else { console.error('usage: --watch | --new <okuma.json> | --mark-read <key,key> | --mark <id,id>'); process.exit(2); }
}

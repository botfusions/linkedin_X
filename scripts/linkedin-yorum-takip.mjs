// Comment follow-up, step 1-2 (HANDOFF "NEXT BUILD"): what to watch and what is new.
// Pure + file helpers only. Reading pages (Neo) and drafting happen elsewhere.
//   node scripts/linkedin-yorum-takip.mjs --watch [own|comments]   # print the watch list as JSON
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const H = 3600e3;
export const MAX_AGE_H = 72;

// Cenk's timing rules: 0-6 h hot, 6-24 h warm, 24-72 h cool, older: no reply.
export function windowOf(ageH) {
  if (ageH < 0 || ageH > MAX_AGE_H) return null;
  return ageH <= 6 ? 'hot' : ageH <= 24 ? 'warm' : 'cool';
}

// Short DOM form "(activity:1,2)" -> API form "urn:li:comment:(urn:li:activity:1,2)".
export function toApiCommentUrn(key) {
  const m = /^(?:replaceableComment_|CommentComponentReference_)?(?:urn:li:comment:)?\((?:urn:li:)?(activity|share|ugcPost):(\d+),(\d+)\)$/.exec(key);
  return m ? `urn:li:comment:(urn:li:${m[1]}:${m[2]},${m[3]})` : null;
}

async function readJsonDir(dir, file) {
  const out = [];
  for (const e of await fs.readdir(dir).catch(() => [])) {
    const f = file ? path.join(dir, e, file) : path.join(dir, e);
    try { out.push(JSON.parse(await fs.readFile(f, 'utf8'))); } catch { /* not a record */ }
  }
  return out;
}

// kind 'own_post': our published posts. kind 'our_comment': our comments on other people's posts.
export async function watchList({now = Date.now(), root = 'data', kind} = {}) {
  const items = [];
  const add = (it) => {
    const ageH = (now - Date.parse(it.published_at)) / H;
    const w = windowOf(ageH);
    if (w) items.push({...it, age_h: Math.round(ageH * 10) / 10, window: w});
  };
  if (!kind || kind === 'own_post') {
    for (const r of await readJsonDir(path.join(root, 'post-onay'), 'record.json')) {
      if (r.status === 'published' && r.result?.url && r.published_at) add({kind: 'own_post', url: r.result.url, published_at: r.published_at});
    }
  }
  if (!kind || kind === 'our_comment') {
    for (const r of await readJsonDir(path.join(root, 'yorum-onay'))) {
      const urn = r.result?.$URN; // our comment's API URN, stored by the approval script
      if (r.status === 'published' && r.url && urn && r.published_at) add({kind: 'our_comment', url: r.url, published_at: r.published_at, our_comment_urn: urn, account: r.account});
    }
  }
  return items.sort((a, b) => a.age_h - b.age_h);
}

// seen.json holds personal data (names, texts): data/yorum-takip/ is gitignored.
export const SEEN = 'data/yorum-takip/seen.json';
export async function loadSeen(file = SEEN) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return {}; }
}
// Returns the comments not seen before. Never counts our own comments.
export function newComments(comments, seen) {
  return comments.filter((c) => c.urn && !c.by_us && !(c.urn in seen));
}
export async function markSeen(urns, seen, file = SEEN, now = Date.now()) {
  const next = {...seen};
  for (const u of urns) next[u] ??= new Date(now).toISOString();
  await fs.mkdir(path.dirname(file), {recursive: true});
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(next, null, 2));
  await fs.rename(tmp, file);
  return next;
}

// Our two accounts (profile slugs): comments by them are never "new", and a reply addressed to them is a reply to us.
export const OUR_PROFILES = ['ömer-cenk-tokgöz-0918ab373', 'cenk-tokgoz-82010992'];
const isUs = (c) => c.by_us || OUR_PROFILES.includes(c.profiles?.[0] || c.profile);

// Replies to OUR comment on someone else's post. The page lists a thread flat: our comment, then its
// replies (each carries the author slug first and the addressee slug second in `profiles`), then the next
// top-level comment (one slug only). Shortcut: a top-level comment that mentions someone looks like a
// reply and would end the scan late; the addressee check keeps it from counting as a reply to us.
export function repliesToUs(page) {
  const list = page.comments || [];
  const i = list.findIndex((c) => c.urn === page.our_comment_urn);
  if (i < 0) return [];
  const out = [];
  for (const c of list.slice(i + 1)) {
    if ((c.profiles?.length || 0) < 2) break; // next top-level comment: thread over
    if (!isUs(c) && OUR_PROFILES.includes(c.profiles[1])) out.push(c);
  }
  return out;
}

// From a reader output file: unseen comments of OTHER people that need a decision, newest first.
// kind own_post: any comment on our post. kind our_comment: only replies addressed to our comment.
export async function pendingFromReading(reading, {seen, now = Date.now(), maxAgeH = MAX_AGE_H} = {}) {
  const out = [];
  for (const page of reading.pages || []) {
    if (page.error || !['own_post', 'our_comment'].includes(page.kind)) continue;
    const cands = page.kind === 'own_post' ? page.comments || [] : repliesToUs(page);
    for (const c of newComments(cands.filter((x) => !isUs(x)), seen)) {
      const born = commentTimeMs(c.urn);
      if (born === null || windowOf((now - born) / H) === null || (now - born) / H > maxAgeH) continue;
      out.push({...c, post_url: page.url, window: windowOf((now - born) / H), age_h: Math.round((now - born) / H * 10) / 10,
        ...(page.kind === 'our_comment' ? {kind: 'reply_to_our_comment', parent_comment: page.our_comment_urn,
          our_comment_text: (page.comments || []).find((x) => x.urn === page.our_comment_urn)?.text || ''} : {})});
    }
  }
  return out.sort((a, b) => a.age_h - b.age_h);
}
export const commentTimeMs = (urn) => {
  const m = /,(\d{10,25})\)$/.exec(urn || '');
  return m ? Number(BigInt(m[1]) >> 22n) : null; // LinkedIn ids are snowflakes: top bits = creation ms
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (f) => { const i = process.argv.indexOf(f); return i < 0 ? null : process.argv[i + 1]; };
  if (arg('--watch') !== null || process.argv.includes('--watch')) {
    const k = {own: 'own_post', comments: 'our_comment'}[arg('--watch')];
    console.log(JSON.stringify(await watchList({kind: k}), null, 2));
  } else if (arg('--new')) { // --new <okuma.json>: print the comments that still need a decision
    console.log(JSON.stringify(await pendingFromReading(JSON.parse(await fs.readFile(arg('--new'), 'utf8')), {seen: await loadSeen()}), null, 2));
  } else if (arg('--mark')) { // --mark <urn>[,<urn>...]: remember them (sent or skipped)
    await markSeen(arg('--mark').split(/,(?=urn:)/), await loadSeen());
  } else { console.error('usage: --watch [own|comments] | --new <okuma.json> | --mark <urn,urn>'); process.exit(2); }
}

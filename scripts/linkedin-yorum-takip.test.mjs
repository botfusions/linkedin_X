import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {windowOf, toApiCommentUrn, watchList, newComments, markSeen, loadSeen, pendingFromReading} from './linkedin-yorum-takip.mjs';

const NOW = Date.parse('2026-11-27T12:00:00Z');
const ago = (h) => new Date(NOW - h * 3600e3).toISOString();

test('timing windows follow the 0-6 / 6-24 / 24-72 h rules', () => {
  assert.equal(windowOf(0), 'hot'); assert.equal(windowOf(6), 'hot');
  assert.equal(windowOf(6.1), 'warm'); assert.equal(windowOf(24), 'warm');
  assert.equal(windowOf(24.1), 'cool'); assert.equal(windowOf(72), 'cool');
  assert.equal(windowOf(72.1), null); assert.equal(windowOf(-1), null);
});

test('DOM comment key becomes the API URN; junk is rejected', () => {
  const want = 'urn:li:comment:(urn:li:activity:7531336715454730240,7531755988157292544)';
  assert.equal(toApiCommentUrn('replaceableComment_urn:li:comment:(activity:7531336715454730240,7531755988157292544)'), want);
  assert.equal(toApiCommentUrn('CommentComponentReference_urn:li:comment:(activity:7531336715454730240,7531755988157292544)'), want);
  assert.equal(toApiCommentUrn(want), want);
  assert.equal(toApiCommentUrn('commentBox-abc'), null);
});

test('watch list: own posts and our comments, newest first, >72 h dropped, unpublished skipped', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-'));
  const w = async (p, o) => { await fs.mkdir(path.dirname(path.join(root, p)), {recursive: true}); await fs.writeFile(path.join(root, p), JSON.stringify(o)); };
  await w('post-onay/a/record.json', {status: 'published', published_at: ago(30), result: {url: 'https://x/own-old'}});
  await w('post-onay/b/record.json', {status: 'published', published_at: ago(2), result: {url: 'https://x/own-new'}});
  await w('post-onay/c/record.json', {status: 'pending', published_at: ago(1), result: {url: 'https://x/pending'}});
  await w('post-onay/d/record.json', {status: 'published', published_at: ago(100), result: {url: 'https://x/too-old'}});
  await w('yorum-onay/1.json', {status: 'published', url: 'https://x/theirs', published_at: ago(5), account: 'Acme', result: {$URN: 'urn:li:comment:(urn:li:activity:1,2)'}});
  await w('yorum-onay/2.json', {status: 'published', url: 'https://x/no-urn', published_at: ago(5), result: {}});
  const all = await watchList({now: NOW, root});
  assert.deepEqual(all.map((i) => [i.kind, i.url, i.window]), [['own_post', 'https://x/own-new', 'hot'], ['our_comment', 'https://x/theirs', 'hot'], ['own_post', 'https://x/own-old', 'cool']]);
  assert.equal(all[1].our_comment_urn, 'urn:li:comment:(urn:li:activity:1,2)');
  assert.deepEqual((await watchList({now: NOW, root, kind: 'our_comment'})).map((i) => i.url), ['https://x/theirs']);
});

test('pendingFromReading: own-post pages only, unseen, not ours, within 72 h, newest first', async () => {
  const mk = (ms) => `urn:li:comment:(urn:li:activity:1,${(BigInt(ms) << 22n) + 5n})`;
  const A = mk(NOW - 2 * 3600e3), B = mk(NOW - 30 * 3600e3), OLD = mk(NOW - 80 * 3600e3), SEEN = mk(NOW - 1 * 3600e3), US = mk(NOW - 1 * 3600e3 - 1);
  const reading = {pages: [
    {kind: 'own_post', url: 'https://x/p', comments: [{urn: B}, {urn: A}, {urn: OLD}, {urn: SEEN}, {urn: US, by_us: true}]},
    {kind: 'our_comment', url: 'https://x/theirs', comments: [{urn: mk(NOW - 3600e3 * 3)}]},
    {kind: 'own_post', url: 'https://x/broken', error: 'login', comments: [{urn: mk(NOW - 3600e3 * 4)}]},
  ]};
  const out = await pendingFromReading(reading, {seen: {[SEEN]: 'x'}, now: NOW});
  assert.deepEqual(out.map((c) => [c.urn, c.window, c.post_url]), [[A, 'hot', 'https://x/p'], [B, 'cool', 'https://x/p']]);
});

test('dedupe: only unseen, non-own comments; marking is idempotent', async () => {
  const f = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'yt-')), 'seen.json');
  const cs = [{urn: 'u1'}, {urn: 'u2'}, {urn: 'u3', by_us: true}, {text: 'no urn'}];
  assert.deepEqual(newComments(cs, {}).map((c) => c.urn), ['u1', 'u2']);
  await markSeen(['u1'], await loadSeen(f), f, NOW);
  const again = await markSeen(['u1'], await loadSeen(f), f, NOW + 1000);
  assert.equal(again.u1, new Date(NOW).toISOString()); // first-seen time kept
  assert.deepEqual(newComments(cs, await loadSeen(f)).map((c) => c.urn), ['u2']);
});

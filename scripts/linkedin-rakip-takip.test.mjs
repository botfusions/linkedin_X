import test from 'node:test';
import assert from 'node:assert/strict';
import {postTimeMs, pickTargets, freshPosts} from './linkedin-rakip-takip.mjs';

const NOW = 1795704842516 + 4 * 3600e3;
const idAt = (hAgo) => String((BigInt(Math.round(NOW - hAgo * 3600e3)) << 22n));

test('post time comes from the id; junk gives null', () => {
  assert.equal(postTimeMs(idAt(1)), Math.round(NOW - 3600e3));
  assert.equal(postTimeMs('abc'), null);
});

test('targets: priority 1 always, the rest least recently read first, hard cap', () => {
  const t = [{key: 'a', priority: 1}, {key: 'b', priority: 2}, {key: 'c', priority: 2}, {key: 'd', priority: 2}];
  const got = pickTargets(t, {b: '2026-11-27T10:00:00Z', c: '2026-11-26T10:00:00Z'}, 3).map((x) => x.key);
  assert.deepEqual(got, ['a', 'd', 'c']); // d never read, then c (older) ; b dropped by the cap
});

test('fresh posts: age rule, seen, existing record, duplicates, errors, invitation first', async () => {
  const post = (h, text = 'metin') => ({id: idAt(h), urn: 'urn:li:activity:' + idAt(h), url: 'u', page_text: text});
  const old = post(7), fresh1 = post(2), ask = post(5, 'Siz ne eklerdiniz?'), seenP = post(1), rec = post(1.5);
  const reading = {pages: [
    {key: 'x', posts: [old, fresh1, ask, seenP, rec, {...fresh1}]},
    {key: 'y', error: 'login', posts: [post(1)]},
    {key: 'z', posts: [{...post(1), page_text: '  '}]},
  ]};
  const got = await freshPosts(reading, {seen: {[seenP.id]: 'x'}, now: NOW, hasRecord: async (id) => id === rec.id});
  assert.deepEqual(got.map((p) => p.id), [ask.id, fresh1.id]); // question first even though older; fresh1 once
  assert.equal(got[0].target, 'x');
});

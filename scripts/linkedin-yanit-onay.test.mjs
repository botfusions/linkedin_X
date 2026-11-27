import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseCallback, handleCallback, commentTimeMs, commentId, postUrnFromComment, request, fileStore, validRequest} from './linkedin-yanit-onay.mjs';

const ME = 6030287709, CHAT = '6030287709';
const CU = 'urn:li:comment:(urn:li:activity:7531705466192601105,7531732003784892417)'; // born 1795704842516
const NOW = 1795704842516 + 3600e3;
const cb = (data, from = ME) => ({id: 'q', data, from: {id: from}, message: {message_id: 1, chat: {id: Number(CHAT)}}});
const rec = (o = {}) => ({status: 'pending', nonce: 'abcd1234', comment_urn: CU, parent_comment: CU, post_urn: 'urn:li:activity:7531705466192601105', post_url: 'u', profile: 'ertunckoruc', draft: 'Katılıyorum.', ...o});
const mem = (r, live = 0) => { const s = {r, writes: []}; s.read = async () => s.r; s.write = async (_, v) => { s.r = v; s.writes.push(v.status); }; s.liveReplies = async () => live; s.claims = new Set(); s.claim = async (id) => s.claims.has(id) ? false : (s.claims.add(id), true); return s; };
const press = (s, data, publish = async () => ({id: 'c'}), now = NOW) => handleCallback({cb: cb(data), approverId: ME, chatId: CHAT, store: s, publish, now});

test('callback prefix matches only this script, not the comment or post handlers', () => {
  const OLD = /^(y|r):\d{6,25}:\d:[0-9a-f]{8}$/, POST = /^p(y|r):\d{13}:[0-9a-f]{8}$/, NEW = /^q(y|r):\d{6,25}:[0-9a-f]{8}$/;
  const mine = 'qy:7531732003784892417:abcd1234';
  assert.ok(NEW.test(mine) && !OLD.test(mine) && !POST.test(mine));
  for (const d of ['y:7531732003784892417:1:abcd1234', 'py:1795760403691:abcd1234']) assert.ok(!NEW.test(d));
  assert.deepEqual(parseCallback(mine), {action: 'publish', id: '7531732003784892417', nonce: 'abcd1234'});
  assert.equal(parseCallback('qr:7531732003784892417:abcd1234').action, 'reject');
  assert.equal(parseCallback('qy:../x:abcd1234'), null);
});

test('time and post URN come from the comment URN', () => {
  assert.equal(commentTimeMs(CU), 1795704842516);
  assert.equal(commentId(CU), '7531732003784892417');
  assert.equal(postUrnFromComment(CU), 'urn:li:activity:7531705466192601105');
  assert.equal(postUrnFromComment('urn:li:comment:(activity:1,2)'), null);
});

test('only the approver can press; wrong nonce and finished records do nothing', async () => {
  const s = mem(rec()); let n = 0; const pub = async () => { n++; return {}; };
  assert.equal((await handleCallback({cb: cb('qy:7531732003784892417:abcd1234', 1), approverId: ME, chatId: CHAT, store: s, publish: pub, now: NOW})).ignored, true);
  assert.match((await press(s, 'qy:7531732003784892417:ffff0000', pub)).reply, /eski/);
  s.r = rec({status: 'published'});
  assert.match((await press(s, 'qy:7531732003784892417:abcd1234', pub)).reply, /Zaten/);
  assert.equal(n, 0);
});

test('publish: marks publishing first, passes post, parent and draft, then published', async () => {
  const s = mem(rec()); const calls = [];
  const out = await press(s, 'qy:7531732003784892417:abcd1234', async (...a) => { calls.push([...a, s.r.status]); return {id: 'c9'}; });
  assert.deepEqual(calls, [['urn:li:activity:7531705466192601105', CU, 'Katılıyorum.', 'publishing']]);
  assert.deepEqual(s.writes, ['publishing', 'published']); assert.match(out.reply, /yayınlandı/);
  assert.match((await press(s, 'qy:7531732003784892417:abcd1234')).reply, /Zaten/);
});

test('a second press cannot publish even if the record is rewritten as pending (claim file)', async () => {
  const s = mem(rec()); let n = 0; const pub = async () => { n++; return {}; };
  await press(s, 'qy:7531732003784892417:abcd1234', pub);
  s.r = rec(); await press(s, 'qy:7531732003784892417:abcd1234', pub);
  assert.equal(n, 1);
});

test('publish error -> needs_verification, no retry, neutral wording', async () => {
  const s = mem(rec()); let n = 0;
  const out = await press(s, 'qy:7531732003784892417:abcd1234', async () => { n++; throw new Error('LinkedIn API failed with 400: x'); });
  assert.equal(n, 1); assert.equal(s.r.status, 'needs_verification'); assert.match(out.reply, /belirsiz/); assert.doesNotMatch(out.reply, /gönderilmedi|gitmedi/);
});

test('reject, expiry and thread cap never publish', async () => {
  let n = 0; const pub = async () => { n++; return {}; };
  const a = mem(rec()); await press(a, 'qr:7531732003784892417:abcd1234', pub); assert.equal(a.r.status, 'rejected');
  const b = mem(rec()); const late = await press(b, 'qy:7531732003784892417:abcd1234', pub, 1795704842516 + 73 * 3600e3); assert.equal(b.r.status, 'expired'); assert.match(late.reply, /72/);
  const c = mem(rec(), 2); assert.match((await press(c, 'qy:7531732003784892417:abcd1234', pub)).reply, /zaten 2 yanıt/);
  assert.equal(n, 0);
});

test('request validation, record, buttons, send failure and no second record', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'yo-')), store = fileStore(dir), f = path.join(dir, 'in.json');
  const good = {comment_urn: CU, author: 'Ertunç Koruç', profile: 'ertunckoruc', comment_text: 'metin', draft: 'yanıt', post_url: 'https://x/p'};
  assert.equal(validRequest({...good, draft: ''}).ok, false);
  assert.equal(validRequest({...good, comment_urn: 'urn:li:comment:(activity:1,2)'}).ok, false);
  await fs.writeFile(f, JSON.stringify(good));
  const sent = [];
  const r = await request(f, {store, now: NOW, randomHex: () => 'abcd1234', send: async (t, m) => sent.push([t, m])});
  assert.equal(r.id, '7531732003784892417');
  assert.match(sent[0][0], /Taslak yanıt:\nyanıt/); assert.deepEqual(sent[0][1].inline_keyboard[0].map((b) => b.callback_data), ['qy:7531732003784892417:abcd1234', 'qr:7531732003784892417:abcd1234']);
  assert.equal((await store.read(r.id)).post_urn, 'urn:li:activity:7531705466192601105');
  await assert.rejects(request(f, {store, now: NOW, randomHex: () => 'x', send: async () => {}}), /zaten var/);
  await assert.rejects(request(f, {store: fileStore(await fs.mkdtemp(path.join(os.tmpdir(), 'yo-'))), now: 1795704842516 + 73 * 3600e3, randomHex: () => 'x', send: async () => {}}), /72 saat/);
  // a failed send leaves no live record: the next run may try again
  const d2 = fileStore(await fs.mkdtemp(path.join(os.tmpdir(), 'yo-')));
  await assert.rejects(request(f, {store: d2, now: NOW, randomHex: () => 'aaaa1111', send: async () => { throw new Error('tg down'); }}), /tg down/);
  assert.equal((await d2.read('7531732003784892417')).status, 'send_failed');
  await request(f, {store: d2, now: NOW, randomHex: () => 'bbbb2222', send: async () => {}});
  assert.equal((await d2.read('7531732003784892417')).nonce, 'bbbb2222');
});

test('liveReplies counts published/publishing/needs_verification per post and commenter', async () => {
  const st = fileStore(await fs.mkdtemp(path.join(os.tmpdir(), 'yo-')));
  const w = (id, o) => st.write(id, {post_urn: 'P', profile: 'a', status: 'published', ...o});
  await w('1', {}); await w('2', {status: 'needs_verification'}); await w('3', {status: 'rejected'}); await w('4', {profile: 'b'}); await w('5', {post_urn: 'Q'});
  assert.equal(await st.liveReplies('P', 'a'), 2);
});

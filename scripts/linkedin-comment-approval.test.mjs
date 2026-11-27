import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCallback, handleCallback, commentWithThreadFix} from './linkedin-comment-approval.mjs';

const ME = 6030287709, CHAT = '6030287709', NOW = Date.parse('2026-11-24T12:00:00Z');
const rec = () => ({status:'pending', created_at:'2026-11-24T10:00:00Z', post_urn:'urn:li:activity:7390000000000000001', url:'u', drafts:['bir', 'iki'], nonce:'abcd1234'});
const mem = (r) => { const s = {r, writes:[]}; s.read = async () => s.r; s.write = async (_, v) => { s.r = v; s.writes.push(v.status); }; s.published = 0; s.publishedOn = async () => s.published; s.claims = new Set(); s.claim = async (id) => s.claims.has(id) ? false : (s.claims.add(id), true); return s; };
const cb = (data, from = ME) => ({id:'q', data, from:{id:from}, message:{message_id:1, chat:{id:Number(CHAT)}}});

test('callback parse', () => {
  assert.deepEqual(parseCallback('y:7390000000000000001:2:abcd1234'), {action:'publish', id:'7390000000000000001', draft:2, nonce:'abcd1234'});
  assert.equal(parseCallback('r:7390000000000000001:0:abcd1234').action, 'reject');
  assert.equal(parseCallback('y:../etc:1:abcd1234'), null);
  assert.equal(parseCallback('y:7390000000000000001:1'), null);
});

test('only the approver can publish', async () => {
  let called = 0; const s = mem(rec());
  const out = await handleCallback({cb:cb('y:7390000000000000001:1:abcd1234', 999), approverId:ME, chatId:CHAT, store:s, publish:async () => called++, now:NOW});
  assert.equal(out.ignored, true); assert.equal(called, 0); assert.equal(s.r.status, 'pending');
});

test('publishes the chosen draft once, marks before calling', async () => {
  const sent = []; const s = mem(rec());
  await handleCallback({cb:cb('y:7390000000000000001:2:abcd1234'), approverId:ME, chatId:CHAT, store:s, publish:async (u, t) => { assert.equal(s.r.status, 'publishing'); sent.push(t); return {id:'c'}; }, now:NOW});
  assert.deepEqual(sent, ['iki']); assert.equal(s.r.status, 'published');
  const again = await handleCallback({cb:cb('y:7390000000000000001:1:abcd1234'), approverId:ME, chatId:CHAT, store:s, publish:async () => sent.push('x'), now:NOW});
  assert.equal(sent.length, 1); assert.match(again.reply, /Zaten/);
});

test('error -> needs_verification, no retry; reject and expiry never publish', async () => {
  const s = mem(rec());
  await handleCallback({cb:cb('y:7390000000000000001:1:abcd1234'), approverId:ME, chatId:CHAT, store:s, publish:async () => { throw new Error('403'); }, now:NOW});
  assert.equal(s.r.status, 'needs_verification');
  let called = 0; const r = mem(rec());
  await handleCallback({cb:cb('r:7390000000000000001:0:abcd1234'), approverId:ME, chatId:CHAT, store:r, publish:async () => called++, now:NOW});
  assert.equal(r.r.status, 'rejected');
  const e = mem(rec());
  await handleCallback({cb:cb('y:7390000000000000001:1:abcd1234'), approverId:ME, chatId:CHAT, store:e, publish:async () => called++, now:NOW + 72 * 3600e3});
  assert.equal(e.r.status, 'expired'); assert.equal(called, 0);
});

test('stale button (old nonce) never publishes the newer draft', async () => {
  let called = 0; const s = mem(rec());
  const out = await handleCallback({cb:cb('y:7390000000000000001:1:00000000'), approverId:ME, chatId:CHAT, store:s, publish:async () => called++, now:NOW});
  assert.equal(called, 0); assert.equal(s.r.status, 'pending'); assert.match(out.reply, /eski/);
});

test('daily limit of 3 blocks the 4th comment and keeps the record pending', async () => {
  let called = 0; const s = mem(rec()); s.published = 3;
  const out = await handleCallback({cb:cb('y:7390000000000000001:1:abcd1234'), approverId:ME, chatId:CHAT, store:s, publish:async () => called++, now:NOW});
  assert.equal(called, 0); assert.equal(s.r.status, 'pending'); assert.match(out.reply, /sınırı/);
});

test('activity URN 400 -> one call with the thread URN LinkedIn names; other errors throw', async () => {
  const err = (t) => ({isError:true, content:[{type:'text', text:t}]});
  const ok = {content:[{type:'text', text:'{"id":"c1"}'}]};
  const seen = [];
  const r = await commentWithThreadFix(async (u) => { seen.push(u); return seen.length === 1 ? err('LinkedIn API POST /v2/socialActions/x/comments failed with 400: ... Provided threadUrn: urn:li:activity:1 is not the same as the actual threadUrn: urn:li:ugcPost:7530993250128568320') : ok; }, 'urn:li:activity:1');
  assert.deepEqual(seen, ['urn:li:activity:1', 'urn:li:ugcPost:7530993250128568320']); assert.equal(r.id, 'c1');
  let n = 0;
  await assert.rejects(commentWithThreadFix(async () => { n++; return err('failed with 500: boom'); }, 'urn:li:activity:1'));
  assert.equal(n, 1);
});

test('404 "Unable to obtain activity" waits and calls again, then gives up', async () => {
  const err = (t) => ({isError:true, content:[{text:t}]}), ok = {content:[{type:'text', text:JSON.stringify({id:'c2'})}]};
  const nf = err("LinkedIn API POST /v2/socialActions/x/comments failed with 404: Unable to obtain activity for urn: 'urn:li:share:1'");
  let n = 0;
  const r = await commentWithThreadFix(async () => (++n < 3 ? nf : ok), 'urn:li:share:1', [0, 0]);
  assert.equal(n, 3); assert.equal(r.id, 'c2');
  n = 0;
  await assert.rejects(commentWithThreadFix(async () => (n++, nf), 'urn:li:share:1', [0, 0]), /404/);
  assert.equal(n, 3);
});

test('claim blocks a second comment even if the record is rewritten as pending', async () => {
  const sent = []; const s = mem(rec());
  await handleCallback({cb:cb('y:7390000000000000001:1:abcd1234'), approverId:ME, chatId:CHAT, store:s, publish:async (u, t) => { sent.push(t); return {}; }, now:NOW});
  s.r = {...rec(), nonce:'ffff0000'}; // producer overwrote the record
  const out = await handleCallback({cb:cb('y:7390000000000000001:1:ffff0000'), approverId:ME, chatId:CHAT, store:s, publish:async (u, t) => { sent.push(t); return {}; }, now:NOW});
  assert.equal(sent.length, 1); assert.match(out.reply, /zaten/);
});

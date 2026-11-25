import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePostCallback, checkPost, hashOf, handlePostCallback, receiptKey} from './linkedin-post-approval.mjs';

const OWNER = 6030287709;
const PNG = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(16)]);
const TEXT = 'Bu bir deneme postudur, yeterince uzun.';
const NOW = Date.parse('2026-11-25T09:00:00Z');
const ID = '1764061200000';

function setup({rec = {}, snapText = TEXT, seen = false, dayFree = true, publishImpl} = {}) {
  const writes = [], days = [], keys = [];
  let published = 0;
  const record = {status:'pending', nonce:'abcd1234', created_at:new Date(NOW - 3600e3).toISOString(), hash:hashOf(TEXT, PNG), image_file:'image.png', ...rec};
  const store = {
    read: async (id) => (id === ID ? record : null),
    write: async (id, r) => writes.push(r.status),
    snapshot: async () => ({text:snapText, image:PNG, imagePath:'/x/image.png'}),
    hashSeen: async () => seen,
    claimDay: async (day, r) => { days.push(['claim', r.status]); keys.push(day); return dayFree; },
    writeDay: async (day, r) => { days.push(['write', r.status]); keys.push(day); },
  };
  const publish = publishImpl || (async () => { published++; return {status:'api_accepted', urn:'urn:li:share:1', url:'https://www.linkedin.com/feed/update/urn:li:share:1/'}; });
  return {store, publish, writes, days, keys, get published() { return published; }};
}
const press = (data, from = OWNER, chat = OWNER) => ({data, from:{id:from}, message:{message_id:1, chat:{id:chat}}});
const run = (s, data, cb = press(data)) => handlePostCallback({cb, approverId:OWNER, chatId:String(OWNER), store:s.store, publish:s.publish, now:NOW});

test('parsePostCallback accepts only py/pr with 13-digit id and 8-hex nonce', () => {
  assert.deepEqual(parsePostCallback(`py:${ID}:abcd1234`), {action:'publish', id:ID, nonce:'abcd1234'});
  assert.equal(parsePostCallback(`pr:${ID}:abcd1234`).action, 'reject');
  for (const bad of [`y:${ID}:1:abcd1234`, `py:123:abcd1234`, `py:${ID}:ABCD1234`, '', null]) assert.equal(parsePostCallback(bad), null);
});

test('checkPost enforces length, hashtags and image type', () => {
  assert.equal(checkPost(TEXT, PNG), 'png');
  assert.equal(checkPost(TEXT, Buffer.from([255, 216, 255, 0])), 'jpg');
  assert.throws(() => checkPost('kısa', PNG));
  assert.throws(() => checkPost(`${TEXT} #a #b #c #d`, PNG));
  assert.throws(() => checkPost(TEXT, Buffer.from('GIF89a')));
});

test('stranger press is ignored and nothing runs', async () => {
  const s = setup();
  const out = await run(s, `py:${ID}:abcd1234`, press(`py:${ID}:abcd1234`, 1));
  assert.equal(out.ignored, true);
  assert.equal(s.published, 0);
});

test('reject marks rejected, never publishes', async () => {
  const s = setup();
  const out = await run(s, `pr:${ID}:abcd1234`);
  assert.equal(out.done, true);
  assert.deepEqual(s.writes, ['rejected']);
  assert.equal(s.published, 0);
});

test('wrong nonce, processed record and old draft are refused', async () => {
  assert.match((await run(setup(), `py:${ID}:00000000`)).reply, /eski bir mesaj/);
  assert.match((await run(setup({rec:{status:'published'}}), `py:${ID}:abcd1234`)).reply, /Zaten işlendi/);
  const old = setup({rec:{created_at:new Date(NOW - 49 * 3600e3).toISOString()}});
  assert.match((await run(old, `py:${ID}:abcd1234`)).reply, /48 saat/);
  assert.equal(old.published, 0);
});

test('changed snapshot, seen hash and taken day block publishing', async () => {
  for (const s of [setup({snapText:`${TEXT}!`}), setup({seen:true}), setup({dayFree:false})]) {
    await run(s, `py:${ID}:abcd1234`);
    assert.equal(s.published, 0);
    assert.ok(!s.writes.includes('publishing'));
  }
});

test('publish: day claimed, marked publishing before the call, receipt updated', async () => {
  const s = setup();
  const out = await run(s, `py:${ID}:abcd1234`);
  assert.equal(s.published, 1);
  assert.deepEqual(s.writes, ['publishing', 'published']);
  assert.deepEqual(s.days, [['claim', 'posting'], ['write', 'api_accepted']]);
  assert.match(out.reply, /urn:li:share:1/);
});

test('publish error becomes needs_verification and is not retried', async () => {
  let calls = 0;
  const s = setup({publishImpl: async () => { calls++; throw new Error('ağ hatası'); }});
  const out = await run(s, `py:${ID}:abcd1234`);
  assert.equal(calls, 1);
  assert.deepEqual(s.writes, ['publishing', 'needs_verification']);
  assert.deepEqual(s.days.at(-1), ['write', 'needs_verification']);
  assert.match(out.reply, /tekrar denemedim/);
});

test('slot records lock <day>-<slot>, legacy records lock <day>', async () => {
  assert.equal(receiptKey('2026-11-25', '10'), '2026-11-25-10');
  assert.equal(receiptKey('2026-11-25', undefined), '2026-11-25');
  const slotted = setup({rec:{slot:'16'}});
  const r = await run(slotted, `py:${ID}:abcd1234`);
  assert.match(r.reply, /Post yayınlandı/);
  assert.deepEqual(slotted.keys, ['2026-11-25-16', '2026-11-25-16']);
  const busy = setup({rec:{slot:'10'}, dayFree:false});
  assert.match((await run(busy, `py:${ID}:abcd1234`)).reply, /10:00 postu zaten/);
  assert.equal(busy.published, 0);
  const legacy = setup();
  await run(legacy, `py:${ID}:abcd1234`);
  assert.equal(legacy.keys[0], '2026-11-25');
});

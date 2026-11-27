# Competitor post reader — headless, READ-ONLY (BrowserOS Neo)

Run by a wrapper with `claude -p`, nobody watching. You only READ LinkedIn pages and write one JSON
file. You never click, type, comment, react, follow, send or publish. You do not touch Telegram,
`.env` files or tokens. If something is unclear or a step fails, record it in the JSON (`error`)
and move on; do not improvise.

Inputs (first lines of the prompt): `WATCH=<path>` (JSON array of targets `{key, name, kind, url}`) and `OUT=<path>`.

Browser: BrowserOS Neo MCP, its `run` tool. The Default profile is signed in to Cenk's SECOND
account; posts are public, so that is enough. Open your own tab per URL and close it after. Neo's
`page.evaluate` does not exist: read the DOM with raw CDP (`page.cdp(method, paramsJson)`).
One `run` call is capped at 30 s: handle about 4 targets per call.

## Steps for each target (list page, then only the FRESH posts)
1. `const p = await browser.open(url)`; `await p.waitForTime(4000)`. For `kind: "company"` also
   `await p.scroll('down', 600); await p.waitForTime(3000)`.
2. If the page is a login/checkpoint/CAPTCHA page, or the title says the page does not exist: set
   `error` ("login" or "gone") for it. On "login" stop reading all further targets.
3. Find the post ids in the page HTML and keep the fresh ones. Paste this, nothing else decides freshness:
```js
const c = (m, o) => p.cdp(m, JSON.stringify(o || {}));
const doc = await c('DOM.getDocument', {depth: -1});
const html = (await c('DOM.getOuterHTML', {nodeId: doc.root.nodeId})).outerHTML;
const ids = [...new Set([...html.matchAll(/urn:li:activity:(\d{15,25})/g)].map((m) => m[1]))]
  .sort((a, b) => (BigInt(b) > BigInt(a) ? 1 : -1)).slice(0, 6);
const now = Date.now();
const fresh = ids.filter((id) => (now - Number(BigInt(id) >> 22n)) / 3600e3 <= 8).slice(0, 2);
return {ids: ids.length, fresh};
```
   Only `activity` ids; ignore `share` and `ugcPost` ids (they are the same posts under other ids).
4. For each fresh id (at most 2 per target) open `https://www.linkedin.com/feed/update/urn:li:activity:<id>/`,
   `await q.waitForTime(3500)`, then `const t = await q.read()` and take the post card:
   `const s = t.indexOf('## Faaliyet akışı gönderisi'); const page_text = t.slice(s < 0 ? 0 : s, (s < 0 ? 0 : s) + 4500);`
   Close the tab. Do not click "daha fazla"/"see more". Keep `page_text` exactly as read: do not
   translate, shorten, summarize or fix it.
5. Write `OUT` as JSON:
   `{"read_at": "<ISO>", "pages": [{"key": "<from watch>", "error": null, "list_ids": <number>, "posts": [{"id": "<id>", "urn": "urn:li:activity:<id>", "url": "https://www.linkedin.com/feed/update/urn:li:activity:<id>/", "page_text": "<...>"}]}]}`.
   One entry per target you actually tried, in watch order; `posts` is `[]` when nothing is fresh
   (that is the normal case). Copy `key` from the watch item. Add nothing else.

## Failure conditions
- Login, checkpoint or CAPTCHA: `error: "login"` for that target, stop, still write `OUT` with what you have.
- A page is gone: `error: "gone"`, continue.
- Any other failure: `error: "<one short sentence>"`, continue.
- Never write anything from outside the page into `OUT`. Never read any file other than `WATCH`.
- Take at most the first 12 targets of `WATCH`.

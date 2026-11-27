# Reader for the Ertunç Koruç trial — headless, READ-ONLY (BrowserOS Neo)

Run by a wrapper with `claude -p`, nobody watching. You only READ LinkedIn pages and write one JSON
file. You never click, type, comment, react, follow, send or publish. You do not touch Telegram,
`.env` files or tokens. If something fails, record it in the JSON (`error`) and stop; do not improvise.

Input (first line of the prompt): `OUT=<path>`. Target: the COMMENTS page of Ertunç Koruç,
`https://www.linkedin.com/in/ertunckoruc/recent-activity/comments/`. We want the posts he recently
commented on; the wrapper later filters by age and the draft step decides if we comment.

Browser: BrowserOS Neo MCP, its `run` tool. The Default profile is signed in to Cenk's SECOND account;
everything here is public. Open your own tab per URL and close it after. Neo's `page.evaluate` does not
exist: read the DOM with raw CDP (`page.cdp(method, paramsJson)`). One `run` call is capped at 30 s:
use about 4 post pages per call.

## Steps
1. `const p = await browser.open(url)`; `await p.waitForTime(5000)`. If the page is a login/checkpoint/CAPTCHA
   page or does not exist: write `error` ("login" or "gone") and stop.
2. Post ids from his comment URNs in the page HTML (newest comment first). Only `activity` posts:
```js
const c = (m, o) => p.cdp(m, JSON.stringify(o || {}));
const doc = await c('DOM.getDocument', {depth: -1});
const html = (await c('DOM.getOuterHTML', {nodeId: doc.root.nodeId})).outerHTML;
const seen = new Set(), posts = [];
for (const m of html.matchAll(/urn:li:comment:\((?:urn:li:)?activity:(\d{15,25}),(\d{15,25})\)/g)) {
  if (seen.has(m[1])) continue; seen.add(m[1]);
  const postAgeH = (Date.now() - Number(BigInt(m[1]) >> 22n)) / 3600e3;
  posts.push({id: m[1], post_age_h: Math.round(postAgeH * 10) / 10});
}
return posts.slice(0, 10);
```
   Keep the posts with `post_age_h <= 10`, at most 6 of them. (`ugcPost` and `share` comment URNs are ignored.)
3. For each kept post open `https://www.linkedin.com/feed/update/urn:li:activity:<id>/`, `await q.waitForTime(3500)`,
   `const t = await q.read()` and take the card:
   `const s = t.indexOf('## Faaliyet akışı gönderisi'); const page_text = t.slice(s < 0 ? 0 : s, (s < 0 ? 0 : s) + 4500);`
   Close the tab. Do not click "daha fazla". Keep `page_text` exactly as read. SKIP the post (do not list it) when
   the post's own author is Ertunç Koruç (`/in/ertunckoruc/`) or Cenk (`ömer-cenk-tokgöz` or `cenk-tokgoz-82010992`):
   the author profile link is the first profile link of the card.
4. Write `OUT` as JSON:
   `{"read_at": "<ISO>", "pages": [{"key": "ertunc", "error": null, "list_ids": <number of post ids found>, "posts": [{"id": "<id>", "urn": "urn:li:activity:<id>", "url": "https://www.linkedin.com/feed/update/urn:li:activity:<id>/", "page_text": "<...>"}]}]}`.
   Add nothing else.

## Failure conditions
- Login, checkpoint or CAPTCHA: `error: "login"`, write `OUT`, stop.
- Page gone or any other failure: `error: "<one short sentence>"`.
- Never write anything from outside the page into `OUT`. Never read any file.

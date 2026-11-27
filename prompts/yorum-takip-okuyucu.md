# Comment reader — headless, READ-ONLY (BrowserOS Neo)

Run by a wrapper with `claude -p`, nobody watching. You only READ LinkedIn pages and write one JSON
file. You never click, type, comment, react, send or publish. You do not touch Telegram, `.env`
files or tokens. If something is unclear or a step fails, write what you saw into the JSON
(`error`) and stop; do not improvise.

Inputs (first lines of the prompt): `WATCH=<path>` (JSON array from `node scripts/linkedin-yorum-takip.mjs --watch ...`) and `OUT=<path>` (where to write the result).

Browser: BrowserOS Neo MCP, its `run` tool. The Default profile is signed in to Cenk's SECOND
account; comments are public, so that is enough. Open your own tab for each URL and close it after.
Neo's `page.evaluate` does not exist; read the DOM with raw CDP (`page.cdp(method, paramsJson)`).

## Steps
1. Read `WATCH`. Take at most 10 items (the list is already newest first).
2. For each item, in one `run` call per page (about 5 fresh pages per call at most, the cap is 30 s):
   `browser.open(url)`, `waitForSelector('[componentkey^="replaceableComment_"]', {timeout: 15000})`
   (no match = zero comments, that is a valid result), then run the extraction below, then `page.close()`.
3. Write `OUT` as JSON: `{"read_at": "<ISO>", "pages": [{"url", "kind", "our_comment_urn", "error", "has_more", "comments": [...]}]}`.
   Copy `kind` and `our_comment_urn` from the watch item. Do not add anything else.

## Extraction (paste into `run`, `p` is the page handle)
```js
const c = (m, o) => p.cdp(m, JSON.stringify(o || {}));
const doc = await c('DOM.getDocument', {depth: -1});
const q = await c('DOM.querySelectorAll', {nodeId: doc.root.nodeId, selector: '[componentkey^="replaceableComment_urn:li:comment"]'});
const comments = [];
for (const [i, id] of q.nodeIds.entries()) {
  const a = (await c('DOM.getAttributes', {nodeId: id})).attributes;
  const key = a[a.indexOf('componentkey') + 1];
  const m = /\((?:urn:li:)?(activity|share|ugcPost):(\d+),(\d+)\)/.exec(key);
  if (!m) continue;
  const html = (await c('DOM.getOuterHTML', {nodeId: id})).outerHTML;
  const profile = (/href="https:\/\/www\.linkedin\.com\/in\/([^"?\/]+)/.exec(html) || [])[1] || '';
  const lines = html.replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').split('\n').map((s) => s.trim()).filter(Boolean);
  comments.push({
    position: i,                                   // order on the page
    urn: `urn:li:comment:(urn:li:${m[1]}:${m[2]},${m[3]})`,   // API form, ready for parent_comment
    profile: decodeURIComponent(profile),
    author: lines[0] || '',
    author_badge: lines[1] === 'Yazar' ? 'Yazar' : '',        // "Yazar" = author of the post
    headline: lines[1] === 'Yazar' ? lines[2] || '' : lines[1] || '',
    age_text: lines.find((s) => /^\d+\s*(dk|sa|saat|gün|hf|ay|yıl|sn)\b/i.test(s)) || '',
    text_lines: lines,                             // raw lines; step 3 below cleans them
  });
}
return comments;
```

## Clean-up before writing (do this in your own head, no tool needed)
- `text`: the comment body only. Drop the header lines (author, badge, headline, age), and the trailing
  UI lines ("Çeviriyi göster", "Beğen", "Yanıtla", bare numbers). Keep the body lines joined with a space.
  Never drop part of a real sentence. Do not translate, shorten or fix the text.
- `by_us`: true when `profile` is `ömer-cenk-tokgöz-0918ab373` (the main account), else false.
  The reading account is a different one (`cenk-tokgoz-82010992`); its comments are also ours: by_us true.
- `reply_count`: if the last lines of the node are two numbers, they are likes then replies; otherwise null.
  If you are not sure, null. Never guess.
- Drop `text_lines`. Keep: `position`, `urn`, `profile`, `author`, `author_badge`, `headline`, `age_text`, `text`, `by_us`, `reply_count`.
- `has_more`: true if the page text contains "daha fazla yorum" or "yanıtı gör" / "yanıtları gör" (use `page.grep`). Do NOT click it.

## Known limit (do not try to solve it)
A reply sits at the same DOM level as its parent comment: nesting is not visible. Do not write a
`parent` field. Order (`position`) is all you give.

## Failure conditions
- A page redirects to a login or checkpoint page, or shows a CAPTCHA: write `"error": "login"` for it and read no further pages. Do not try to sign in.
- A page is gone ("bu sayfa yok" or similar): `"error": "gone"`, continue with the next one.
- Any other failure: `"error": "<one short sentence>"`, continue.
- Never write personal data from outside the page into `OUT`. Never read any file other than `WATCH`.

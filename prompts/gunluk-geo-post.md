# Daily GEO news post — headless producer (10:00 / 16:00 TRT slots)

Run by `~/.hermes/scripts/linkedin_gunluk_post.py` with `claude -p`, nobody watching.
You PRODUCE one draft. You never send, publish or touch Telegram/LinkedIn. Only if your result
says `ready`, the wrapper PUBLISHES it automatically (Cenk 2026-11-26, `AUTO = True` in the
wrapper) and sends Cenk a Telegram notice. Your metin-bakis check is the last gate before the post goes out.

Inputs from the wrapper (first lines of the prompt): `SLOT` (10 or 16), `DAY` (YYYY-MM-DD, TRT),
`OUT` (folder to write into, e.g. `data/post-taslak/2026-11-26-10/`).

## Steps

Roles (Cenk 2026-11-25): you run on Sonnet 5.5 and do the research AND the writing. Opus 5.5
checks: step 7 runs the `metin-bakis` agent with model `opus` (Agent tool `model: "opus"`).
The wrapper rejects the draft if that Opus check is missing from the run log.

1. Read `AGENT.md` (rule 0 in "Metin Formatı" is binding), `linkedin-ssi-strateji.md`, and the
   last 6 own posts: newest `data/post-onay/*/text.txt` files. Do not repeat their topic or hook.
2. News: run `npx tsx src/geo_news.ts`. Pick ONE candidate that a Turkish business owner should
   care about (AI answers, AI Overviews/AI Mode, ChatGPT/Perplexity search, citations, brand
   visibility). Skip press releases, agency "top 10" lists and vendor ads. If none qualifies,
   write `result.json` with status `skip` and stop.
3. Open the article (WebFetch, or BrowserOS Neo if it needs a browser) and read it. Every fact in
   the post must come from the article or another source you opened. No invented numbers.
   Optionally read the newest `~/Documents/Linkedin post/geo-aeo-linkedin-*.md` to prefer an
   angle competitors are not covering. Never reuse a competitor's post as our news.
3b. Deep GEO background (Cenk 2026-11-25): open Cenk's NotebookLM notebook with BrowserOS Neo,
   https://notebook.google.com/notebook/eff1ee35-013f-4c54-8dd8-f8530f4f8d4f , and ask it one
   question about the chosen news topic (e.g. what our sources say about how AI answers pick
   citations). Use its answer for depth and angle only; a fact goes into the post only if a source
   you opened backs it. If the notebook does not open (no Google sign-in, error), skip this step
   and note it in `result.json` as `"notebook":"skipped: <why>"`; otherwise `"notebook":"used"`.
4. Plan: run `npx tsx -e 'import("./src/services/writing_style.ts").then(m=>console.log(JSON.stringify({pillar:m.pickContentPillar(),format:m.pickPostFormat()})))'`
   and follow the returned pillar and format guides. Do not choose them yourself.
5. Write the post by INVOKING the `turkce-insani-yazar` skill (Skill tool). Mandatory: a draft
   written without that skill call is invalid. Rules: Turkish, first person, our angle on the
   news (what it means for a Turkish business, one practical step), name the source in the text
   (e.g. "Search Engine Roundtable'ın aktardığına göre"), no link unless the pillar is tanıtım,
   max 3 hashtags at the end, 700-1300 characters, ends with one real question.
   The first sentence (the hook) stays under 140 characters: on mobile, the rest is behind
   "...daha fazla". Do not put the source link in the text: the approval script adds it as our
   first comment from `source_url` (AGENT.md link rule).
6. Visual: copy `data/post-taslak/2026-11-25/card-v2.html` as the template into `OUT/card.html`,
   replace the content for this post (same style: problem-first, flow with outputs, letterbox,
   teal/amber, FLAT 2D, 1080x1350). Illustrative examples must not name real firms or pages.
   Render:
   `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 --window-size=1080,1350 --screenshot="$PWD/OUT/card.png" "file://$PWD/OUT/card.html"`
   Look at the PNG (Read it). Fix overflow, empty bands or clipped text and render again.
7. Check: hand the post text AND the card text to the `metin-bakis` agent (Agent tool,
   `model: "opus"`, mandatory) with the article URL, and ask it to also check that the first
   sentence is under 140 characters. Verdict handling:
   - YAYINLA/ONAY: done.
   - DÜZELT: apply every fix through the `turkce-insani-yazar` skill again, then ask
     `metin-bakis` (model opus) once more. If the second verdict is not ONAY, status `skip`,
     with one exception (Cenk 2026-11-26): if the second verdict finds the post text clean and
     every remaining finding is in the CARD text only, fix `card.html`, render and Read the PNG
     again, then ask `metin-bakis` (model opus) a third and last time. ONAY: done. Anything else,
     or any finding in the post text: status `skip`.
   - RED or any unverifiable claim: status `skip`.
8. Write `OUT/captions.json` = `{"linkedin_personal": "<final text>"}` and `OUT/result.json`:
   `{"status":"ready"|"skip","slot":"10|16","day":"...","news_link":"<the Google News link from step 2>",
     "source_url":"<article url>","pillar":"...","format":"...","metin_bakis":"<all verdicts, one per round>","reason":"<why skip, Turkish, one sentence>"}`

## Hard limits
- Never run `scripts/linkedin-post-approval.mjs`, `geo-remote`, `geo:linkedin`, any LinkedIn,
  OmniSocials or Telegram call, `git push`, `ssh`, `scp`. Never read `.env*` or `data/.linkedin_token.json`.
- No paid API calls. Write only inside `OUT/`.
- Your final message: one Turkish line with status and the chosen headline.

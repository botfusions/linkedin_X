# Reply draft for ONE comment on our own post — headless producer

Run by `~/.hermes/scripts/linkedin_yorum_takip.py` with `claude -p`, nobody watching. You handle
exactly ONE comment per run. You never send, publish or touch Telegram/LinkedIn, and you never
read `.env` files or tokens. Only if your result says `ready`, the wrapper sends the draft to
Cenk's Telegram; nothing is published without his press.

Inputs (first lines of the prompt): `COMMENT=<path to a JSON file>` with one comment
`{urn, author, headline, profile, text, author_badge, age_h, window, post_url}` and `OUT=<result path>`.
If the comment has `kind: "reply_to_our_comment"` it is a reply to OUR comment on SOMEONE ELSE'S post: it also has
`our_comment_text` (what we wrote) and `parent_comment`. Use the section "Reply to our comment on another post" below instead of the own-post steps 1 and 3 (the rest, incl. the check and the result file, is the same).

## Steps
1. Read `agent.md`: the section "Replies to people who comment on OUR posts" and comment rules 1, 2, 6, 10.
   Read the post text: find the record in `data/post-onay/*/record.json` whose `result.url` equals
   `post_url`, then read `text.txt` in that folder.
2. Decide: reply or skip. Reply only to a real question, an objection, or a point that adds
   information. SKIP (with a reason) for: one-word or generic praise, engagement-pod style
   comments, sellers or self-promotion, comments by `author_badge` "Yazar" (that is us), emoji only,
   anything you cannot answer without inventing a fact. When unsure, skip. A skip is a normal result.
3. If replying: write the reply by invoking the `turkce-insani-yazar` skill (agent.md rule 0).
   Follow the "Replies to people who comment on OUR posts" rules: no question at the end, say
   politely whether we agree, one concrete proof point from OUR post or a named source in it,
   30-55 words, 3 sentences at most, no brand names, links, hashtags or emoji, no number that is
   not in the post or the comment. Do not invent a measurement or a client case.
4. Check: call the `metin-bakis` agent with `model: "opus"`. Give it the post text, the comment,
   the draft and the reply rules. Read its `KARAR` line. If `DÜZELT`, apply its fixes (keep the
   skill's style) and call `metin-bakis` (opus) AGAIN. Repeat until `KARAR: ONAY`, at most 3
   rounds. After round 3 without ONAY, result is `error`. The wrapper only trusts the LAST verdict.
5. Write `OUT` (JSON, nothing else in the file):
   - reply: `{"status":"ready","draft":"<text>","reason":""}`
   - skip: `{"status":"skip","draft":"","reason":"<one short sentence>"}`
   - failure: `{"status":"error","draft":"","reason":"<one short sentence>"}`

## Reply to our comment on another post (kind `reply_to_our_comment`)
- Context is `our_comment_text` plus the reply `text`; there is no post record. You may open `post_url` read-only with
  BrowserOS Neo `run` (read, never click or type) to see the post the thread is under.
- Cenk's rule (2026-11-27): we answer from what we can really do and know in GEO / AI visibility and its neighbours.
  Ground every factual claim in a source you actually opened, in this order:
  1. Cenk's NotebookLM notebook, `https://notebook.google.com/notebook/eff1ee35-013f-4c54-8dd8-f8530f4f8d4f`
     (BrowserOS Neo; ask it ONE focused question about the reply's topic). If it does not open (no sign-in, error),
     do not retry; put `"notebook":"skipped: <why>"` in the result, otherwise `"notebook":"used"`.
  2. The measurement practice notes of our own tooling, read-only: `/Users/cenktk/Documents/Botfusions Web/botfusions-com/rankie/PANEL-HANDBOOK.md`
     and the files in `/Users/cenktk/Documents/Botfusions Web/botfusions-com/seo-takip/` (weekly runs, change log). They tell
     what we do in practice (for example: weekly measurement plus a change log, no standard monthly export).
  Never name Rankie or any brand (agent.md rule 1). Describe the practice, not the tool.
- If the reply asks about OUR practice and the sources do not show it, do not invent one: skip, or answer only the general GEO part you can back up.
- If the reply is only thanks or a closing remark, skip.

## Failure conditions
Stop and write `error` when: the post record or text is missing, the comment file is not valid
JSON, a tool call is denied, or the `turkce-insani-yazar` skill or `metin-bakis` cannot run.
Do not work around a denial. Do not write the draft without running both steps.

Status: active - first live queue post at 10:00 TRT 2026-11-27 (Telegram press); then engager/comment follow-up build

- 2026-11-27: Hermes job `40325d617668` "LinkedIn Rakip Takibi" created with Cenk OK: `30 9,12,15,18 * * 1-5` TRT, no-agent, deliver local, script `linkedin_rakip_takip.sh` (default profile). Next: watch the first live run (12:30 TRT), run it in parallel with Cowork for a week, then ask Cenk about pausing the Cowork task `geo-aeo-linkedin-takip` (it also writes the follower/newsletter/ad report).
## Update 2026-11-27 ~12:50 TRT: lane 2 own competitor tracking built (replaces the Cowork comment-opportunity step)
- Built: `data/rakip-takip/hedefler.json` (25 targets from the Cowork SKILL.md; P1 = 7 pages every run, rest rotate, cap 12), `scripts/linkedin-rakip-takip.mjs` (+ test 3/3: `npm run rakip:takip:test`), `prompts/rakip-okuyucu.md` (Neo reader: ids from list-page HTML, only posts <= 8 h are opened), `prompts/rakip-taslak.md` (2 drafts, skip allowed, turkce-insani-yazar + metin-bakis opus), `src/rakip_onay_gonder.ts` (`npm run rakip:onay -- <istek.json>`, same buttons/records as the Cowork bridge), wrapper `~/.hermes/scripts/linkedin_rakip_takip.py` (`--worker [--dry-run]`, `--self-test`).
- Dry run 12:2x TRT: 12 pages read, 3 fresh posts, 1 skip (Webtures product post), 2 drafts passed the gate; sent for real to Telegram (Brantial TR 7531991490953175040, Brantial EN 7531989835948101632). Dedupe against the old bridge is by `data/yorum-onay/<id>.json`.
- Bug found and fixed in `~/.hermes/scripts/linkedin_gunluk_post.py` (backup `.bak-evdict-20261127`): `used_tools`/`last_verdict` crashed on stream events that are not dicts.
- NOT done: Hermes job (times need Cenk's OK; the old 13:00/19:00/22:00 idea misses the 6 h rule), Cowork pause (it also writes follower/newsletter/ad-library report; lane 1 only reads it optionally). Plan: run both in parallel one week, then decide. Lane 2 reads from the second account; watch for login/checkpoint.
- Correction: Cowork did run on 25 Nov (report + entry 119 exist); no report for 26 Nov. Earlier claim "stale since 4 Nov" was wrong.


- 2026-11-27 ~11:40 TRT: Hermes jobs created with Cenk OK (default profile, no-agent, deliver local, script `linkedin_yorum_takip.sh`): "Yorum Takibi A" `45 10,16 * * *` and "Yorum Takibi B" `30 11,17 * * *` (next runs 16:45 and 17:30 TRT today). Competitor-thread runs are not built. Lock file stops overlap.
## Update 2026-11-27 ~11:35 TRT: reply approval button proven
- Test with a fake record (not a real comment): Cenk pressed Reddet, record became `rejected`, nothing published. Fake record deleted.
- Two causes of the first failures: (1) my manual test used the project `.env` bot (bilmis1_bot); the real wrapper uses the linkedin profile token = aifatura_bot, the bot the gateway polls. For manual tests pass `TELEGRAM_ENGAGEMENT_BOT_TOKEN` from `~/.hermes/profiles/linkedin/.env` and `TELEGRAM_ENGAGEMENT_CHAT_ID=6030287709`. (2) `/reload-plugins` did not wire the new plugin; a restart of `ai.hermes.gateway` (Cenk OK, 11:11 TRT) did.
- NEXT: Hermes jobs for `linkedin_yorum_takip.py` (need Cenk's OK), first live reader run on a thread with a stranger's comment, commit (integrations/ and new scripts untracked).


## Update 2026-11-27 ~03:30 TRT: own-content post queue (read this first)
- Shared queue `data/post-kuyruk/` (contract in its `README.md`): Botfusions Web sessions write finished Turkish posts as `NN-slug.md` (`status: bekliyor`, `source_url`, `konu`, `olgular`, `---`, text). 6 posts queued (01..06, sources botfusions.com /blog/60, /blog/4, /about, /blog/65).
- Wrapper `~/.hermes/scripts/linkedin_gunluk_post.py` (backup `.bak-kuyruk-20261127`): slot 10 only takes the first waiting item (`next_queue_item`), passes `QUEUE=` in the prompt, checks `result.json` `queue_item` matches, marks the item `kullanildi <day> <slot>` BEFORE the publish call, and sends queue posts WITHOUT `--auto` (`QUEUE_AUTO = False`: Cenk's Telegram press). Empty queue = news post as before. Slot 16 unchanged. Self-test extended, ok.
- Prompt `prompts/gunluk-geo-post.md` (backup `.bak-kuyruk-20261127`): new "Queue post" section (skip news steps, light turkce-insani-yazar pass, facts only from `olgular`, metin-bakis opus with source page).
- Dry run 2026-11-27 ~03:20: ready, metin-bakis DÜZELT then ONAY (opus), card OK; kept as `data/post-taslak/2026-11-27-10-dryrun-kuyruk`. Item 01 still `bekliyor` (dry run does not mark).
- To auto-publish queue posts later: set `QUEUE_AUTO = True` (Cenk's call).

# HANDOFF — 2026-11-24 (Telegram-approved LinkedIn comments)

## Update 2026-11-25 ~11:20 TRT (read this first)
- Dry-run slot 16 (Sonnet writer, Opus metin-bakis) passed the log gate: ready, metin-bakis ONAY on round 1, NotebookLM used, TechCrunch "AI Mode taps Drive and Wallet" (2026-11-23); 4 factual claims checked against the article. Kept as `data/post-taslak/2026-11-25-16-dryrun` (moved so it cannot mix with today's real run).
- Hermes jobs created with Cenk's OK, default profile (same place as b5fba5532233), no-agent, deliver local: `ec53d67c42a8` "LinkedIn Günlük GEO Post 10" (`15 9 * * *`, `linkedin_gunluk_post_10.sh`), `04dbbcd27c39` "LinkedIn Günlük GEO Post 16" (`15 15 * * *`, `linkedin_gunluk_post_16.sh`). Hermes scripts take no args, so each .sh fixes the slot and execs `/usr/bin/python3 linkedin_gunluk_post.py --slot N`. Backup: `~/.hermes/cron/jobs.json.bak-gunluk-geo-post-20261125`.
- First real run: 2026-11-25 15:15 TRT (slot 16). Check that the Telegram request arrived ~15:30-15:55 and the per-slot receipt after Cenk's press.
- Wrapper fix: worker deletes a non-sent `result.json` before the run, so a same-day dry-run result can never be sent.
- Dry-run does not mark the news link used, so a real run may pick the same story as a dry-run.
- ~12:40 TRT, from github.com/sergebulaev/linkedin-skills (rules only, no code; it needs paid Apify/Publora):
  - Hook rule: first sentence under 140 chars (prompt step 5 + metin-bakis ask in step 7, AGENT.md link rule). Soft rule, no hard gate.
  - Source link as our FIRST COMMENT: wrapper passes `result.json` `source_url` as `--source-url` (dropped if not a clean https URL). `--request` stores `first_comment` = `Kaynak: <url>` (fixed template, `firstComment()`) in record.json and shows it in the Telegram approval text. On the press: publish -> record + receipt `published` -> then one `linkedin_comment_on_post` via `commentWithThreadFix`; a comment failure keeps `published`, is reported, never retried. `hashOf` unchanged. Tests 12/12. UNTESTED LIVE until Cenk's first Yayınla press on a post with a source link. Plugin timeout 150 s covers publish + comment.
  - "Post yayınlandı" reply now ends with "İlk 60 dakikada gelen yorumlara yanıt ver."
- NEXT job (Cenk 2026-11-25): engager analytics. Pull who likes/comments on our own posts, segment by ICP fit, list prospects. Idea from that repo's linkedin-engager-analytics; build on linkedin-mcp/Neo, not Apify. Then: follow-up on replies to our comments (thread-monitor rules: 0-6 h hot, 6-24 h warm, 24-72 h cool, >72 h DM; never 3+ chained replies; skip if author deleted).
- Engager analytics, first run 2026-11-25 (manual, Neo): own posts have 0 reactions/comments (last 20), so the only real source is the Premium profile-viewers page (`/me/profile-views/`, shows ~10 people, 7 named). ICP in `icp.md`; list in `data/engager/2026-11-25.md` (gitignored, personal data). Result: 1 aday, 4 meslektaş. No weekly job yet: volume too low; re-run by hand or add a job when posts start getting reactions. Apify not used: LinkedIn actors need Cenk's session cookie handed to a third party.
- Update same day: Cenk signed the Neo Default profile into his unused second account (cenk-tokgoz-82010992, 6 connections) for reading competitor posts. The main account (0918ab373) is no longer signed in on Neo. Profile viewers: never contact (mostly sellers, `icp.md`). Read 2 Webtures posts (~120 reactions): mostly an engagement pod (Kafası pages, the same ~20 people, Webtures staff); 2 weak aday. Then read 1 Brantial TR post (55 reactions): the same pod (Webtures, Brantial, Exportial share one engagement network); Hüseyin Kılıç / Can Doğan posts get 1-2 reactions. Conclusion: reactor mining is not a prospect source here; only 1 weak aday (Dinçer Ç., Tüyap). Better route for prospects: the `musteri-bul` skill (treg) or a LinkedIn people search by title, not engagers.
- 2026-11-26 ~17:00 TRT, NEXT BUILD (Cenk approved the plan): comment follow-up. Replies are published ONLY after Cenk's Telegram press (not auto).
  1. Watch list: own posts of the last 72 h (`data/post-onay/*/record.json`, result.url) + our competitor comments of the last 72 h (`data/yorum-onay/*.json`, status published).
  2. Reader: wrapper like `~/.hermes/scripts/linkedin_gunluk_post.py` runs `claude -p` (Sonnet) that only READS pages with BrowserOS Neo (Default profile = second account cenk-tokgoz-82010992; comments are public). Output per new item: author, headline, text, time, comment URN, parent. Dedupe in `data/yorum-takip/seen.json` (gitignore it: personal data).
  3. Schedule (Hermes jobs, need Cenk's OK): 10:45, 11:30, 16:45, 17:30 TRT for own posts; 13:00, 19:00, 22:00 TRT for competitor threads. Max ~10 pages per run.
  4. Filter: reply only to real questions/objections/added info. Skip pod accounts, sellers, one-word praise, deleted threads. Timing: 0-6 h hot, 6-24 h warm, 24-72 h cool, >72 h no reply. Never more than 2 chained replies in one thread.
  5. Draft: `turkce-insani-yazar` skill, then `metin-bakis` (opus). No brand names or links in competitor threads (agent.md comment rules).
  6. Publish: linkedin-mcp `linkedin_comment_on_post` has NO reply-to-comment support. Add optional `parent_comment` (LinkedIn Comments API `parentComment`) in `integrations/linkedin-mcp/src/server.ts` + client, then prove it with ONE test reply under a real comment on our own post. If the API refuses it: fall back to a Telegram message with the ready text for Cenk to paste.
  Unverified: whether Neo exposes the comment URN in the DOM; whether `parentComment` works with our w_member_social token.
- 2026-11-26 ~19:50 TRT, steps 1 and 6 PROVEN:
  - Neo: `page.evaluate` is gone; read the DOM with raw CDP (`DOM.getDocument` depth -1, `DOM.querySelectorAll`, `DOM.getAttributes`). Comment URN is in `componentkey="replaceableComment_urn:li:comment:(activity:<post>,<id>)"` (short form, no `urn:li:` before `activity`; the reader must add it). Page markdown and links carry no URN. A reply node is a DOM sibling of its parent, not a child, so parent detection is still open. Not yet tried: other people's comments, author/text mapping per URN, lazy-loaded comments.
  - linkedin-mcp: `linkedin_comment_on_post` has optional `parent_comment` (full form `urn:li:comment:(urn:li:activity:N,M)`). POST goes to `/v2/socialActions/<parent>/comments` with `parentComment` in the body; `(` `)` must be encoded as %28/%29 or LinkedIn returns 400 "Syntax exception in path variables". Tests 18/18. Code in `integrations/` (untracked in git).
  - Live test with Cenk's OK: reply `urn:li:comment:(urn:li:activity:7531336715454730240,7531755988157292544)` under our "Kaynak" comment on https://www.linkedin.com/feed/update/urn:li:share:7531336714297090048/ (text via turkce-insani-yazar + metin-bakis opus). Visible from the second account. Cenk may delete it by hand; the MCP has no delete-comment tool.
  - Found BUG (not fixed): post 1795698243989 (2026-11-26 15:59 TRT hand run) first comment failed with 404 "Unable to obtain activity for urn:li:share:7531705446366277633". `commentWithThreadFix` only handled 400. Likely the activity is not ready right after publish (unverified: the API cannot read personal posts, 403). FIXED same evening: on that 404 it waits 10 s, then 30 s, and calls again (max 3 calls; a 404 posted nothing). Tests: yorum:onay 9/9, post:onay 13/13. Fits the plugin 150 s and wrapper 300 s timeouts. First live check: 2026-11-27 09:15 TRT auto-publish. Post 1795698243989 still has no source comment.
  - Next: step 2-5 reader + Telegram approval; Hermes jobs need Cenk's OK.
- 2026-11-27 ~09:50 TRT, comment follow-up READER built and proven (steps 1-2 of NEXT BUILD):
  - `scripts/linkedin-yorum-takip.mjs` (+ test, 4/4; run `node --test scripts/linkedin-yorum-takip.test.mjs`): `watchList` (own posts from `data/post-onay`, our comments from `data/yorum-onay` with `result.$URN`; 72 h limit; hot/warm/cool windows), `toApiCommentUrn`, `newComments` + `markSeen` (dedupe file `data/yorum-takip/seen.json`, gitignored). CLI: `--watch own|comments`.
  - `prompts/yorum-takip-okuyucu.md`: headless read-only Neo reader (extraction script embedded, raw CDP, writes `OUT` json: per page comments with urn/author/headline/age/text/by_us/reply_count). Test run via `claude -p` Sonnet on 2 own posts: correct, no click/type calls in the log (only Bash, Read, ToolSearch, neo `run`). Found a real third-party comment (Ertunç Koruç) on the 2026-11-26 SEJ post, unanswered.
  - LIMIT: a reply is a DOM sibling of its parent; no `parent` field. Replies to a reply must use the top-level comment as `parent_comment` (LinkedIn threads are 2 levels; unverified here), so the draft step must pick the thread's top-level comment by position/reply_count.
- 2026-11-27 ~11:30 TRT, DRAFT + TELEGRAM steps built (own-post comments only; our comments on other people's posts are NOT read: a stranger there cannot be told from a reply to us). NOT live: nothing enabled, no Hermes job, no commit.
  - `scripts/linkedin-yanit-onay.mjs` (+ test 9/9, `npm run yanit:onay:test`): `--request <file>` writes `data/yanit-onay/<commentId>.json` and sends the draft with buttons `qy:/qr:<commentId>:<nonce>`; `--callback` publishes ONLY on the press (approver+chat, nonce, pending-only, wx claim file, mark `publishing` first, error -> `needs_verification`, no retry, 72 h by comment id time `id>>22`, max 2 live replies per post+commenter). `post_urn` is taken from inside the parent comment URN. Reply to a REPLY as parent is unverified: on refusal the draft text is still in the Telegram message. Ertunç's reply was imported as a published record so it counts toward the cap.
  - `scripts/linkedin-yorum-takip.mjs` gained `--new <okuma.json>` (unseen, not ours, <=72 h, own_post pages only) and `--mark <urn,...>`; test 5/5 (`npm run yorum:takip:test`).
  - `prompts/yorum-takip-taslak.md`: one comment per headless run; reply or skip; turkce-insani-yazar, metin-bakis opus, fix-and-recheck up to 3 rounds; result json.
  - `~/.hermes/scripts/linkedin_yorum_takip.py` (`--worker [--dry-run]`, `--self-test`): watch -> reader (claude -p) -> `--new` -> max 3 drafts per run, each gated on real Skill + Agent(metin-bakis, opus) calls, LAST verdict ONAY, no question ending -> request via bot token held only by the wrapper -> `--mark`. Skip is marked seen; an error is not (next run retries, and notifies each time). Lock file `data/yorum-takip/.wrapper.lock` (60 min stale). `linkedin-yanit-onay` is also in the DENY list of `linkedin_gunluk_post.py` (backup `.bak-yanit-20261127`).
  - Plugin: `~/.hermes/plugins/linkedin-yorum-onay/__init__.py` got `YANIT_PATTERN`, `handle_yanit_callback`, `telegram_yanit_factory` (backup `.bak-yanit-20261127`, tests 12/12); registered ONLY by the new sibling plugin `~/.hermes/plugins/linkedin-yanit-onay`. NOT yet in `plugins.enabled` of `~/.hermes/config.yaml` and not wired: a press does nothing until Cenk OKs enabling it + reload-plugins (no gateway restart).
  - Dry run (2026-11-27 ~11:20 TRT, seen.json temporarily emptied, then restored): 3 pages read, 1 new comment (Ertunç), draft passed the gate. Nothing sent, nothing marked seen.
  - Agent rule for replies written to `agent.md` ("Replies to people who comment on OUR posts").
  - STILL TO DO: enable plugin + one real request for a test record, Cenk presses Reddet; then Hermes job(s) (need Cenk's OK); first live reader run on a thread with a stranger's comment; commit.
  - (SUPERSEDED by the 11:30 entry above, wrapper/draft/Telegram are built) NOT built then: wrapper `~/.hermes/scripts/linkedin_yorum_takip.py` (run reader, dedupe, call draft), draft step (turkce-insani-yazar + metin-bakis), Telegram approval with a reply-publish handler (plugin needs a new callback type), Hermes jobs (need Cenk's OK), the 2-chained-replies cap, the "has_more" click-to-load case.
- 2026-11-26 ~16:10 TRT, daily GEO posts:
  - AUTO-PUBLISH (Cenk: "kendiliğinden yayınlansın"): wrapper `AUTO = True` passes `--auto`; `linkedin-post-approval.mjs --auto` builds the press in code (`autoPress`) and runs the same `handlePostCallback` guards (hash, once-only, per-slot receipt, first comment), then sends a Telegram notice with the result. Back to press approval: set `AUTO = False` (backup `linkedin_gunluk_post.py.bak-onayli-20261126`).
  - Why both 2026-11-26 slots skipped: (1) `geo_news.ts` took the top 10 in feed order and the GEO/AEO query filled them with agency lists/press releases; fixed: trade feeds first (SEJ + Search Engine Roundtable), JUNK title filter, test added. (2) 10:00 stopped on a card-only error at round 2; fixed: third metin-bakis round for card-only findings.
  - Auto-publish gate: the wrapper reads the LAST metin-bakis verdict from harness `task_notification` events (`last_verdict`, model text never counts) and publishes only on ONAY/YAYINLA. Checked on real logs: 2026-11-25-16 ONAY, 2026-11-26-10 ONAY, 2026-11-26-10-skip1 DÜZELT.
  - If the approval lock is busy, `--auto` falls back to the normal button message. Publish call timeout 300 s; on timeout the wrapper notifies "check the profile" and never retries.
  - WARNING: a hand run of `linkedin_gunluk_post_10.sh` / `_16.sh` now publishes. For tests use `linkedin_gunluk_post.py --slot 10 --worker --dry-run`.
  - First live `--auto` run: 2026-11-27 09:15 TRT. Only `autoPress` + `handlePostCallback` are unit-tested; the `--auto` branch itself has not run yet.
  - Rankie (app.rankie.ai MCP) holds social-post briefs per Cenk; the MCP is configured only for the `Botfusions Web` project, not here. Not wired in.
  - The 10:00 slot was re-run by hand at 15:59 (old wrapper, Telegram buttons): SEJ "Is GEO visibility delivering business value".
- Cenk 2026-11-25 ~15:45 TRT: prospect finding is ON HOLD. Focus is comments and own posts. Next build candidate: follow-up on replies to our comments (thread-monitor rules above).

## Current state 2026-11-25 ~03:00 TRT
- Goal now: two own GEO news posts a day (10:00, 16:00 TRT), each published only on Cenk's Telegram press; competitor comments keep the existing Cowork scan -> Hermes bridge -> press flow.
- Pipeline: Hermes job (NOT yet created) runs `~/.hermes/scripts/linkedin_gunluk_post.py --slot 10|16` at 09:15/15:15 -> detached `claude -p` Sonnet 5.5 follows `prompts/gunluk-geo-post.md` (src/geo_news.ts candidates -> article + NotebookLM via Neo -> writing_style pickers -> Skill turkce-insani-yazar -> card from data/post-taslak/2026-11-25/card-v2.html -> Agent metin-bakis with model opus) -> writes `data/post-taslak/<day>-<slot>/{captions.json,card.png,result.json,claude.log}` -> wrapper verifies both tool calls in the stream-json log, then sends `linkedin-post-approval.mjs --request --slot` and marks the news link used. Model never holds the bot token.
- Dry-run 1 (slot 10, Opus writer, before the log gate): ready, claims verified. Dry-run 2 (slot 16) was started before the Sonnet/Opus switch, so it is expected to fail the new gate ("missing step"). NEXT: delete data/post-taslak/2026-11-25-16, run `python3 ~/.hermes/scripts/linkedin_gunluk_post.py --slot 16 --worker --dry-run` with the new setup, check result + card, show Cenk.
- Then, with Cenk's OK: create the two Hermes jobs (linkedin profile, no-agent script mode like b5fba5532233), then commit.
- Uncommitted: AGENT.md (rule 0 writer skill, max 3 hashtags), HANDOFF.md, linkedin-ssi-strateji.md, prompts/gunluk-geo-post.md, scripts/geo-remote.sh (publish blocked), scripts/linkedin-post-approval{,.test}.mjs (slots), src/geo_news{,.test}.ts, src/services/rss.ts (url param, logs to stderr), src/services/writing_style.ts (max 3 hashtags). Outside repo: ~/.hermes/scripts/linkedin_gunluk_post.py, Codex automation memory.md note.
- Later phases: replies-to-our-comments follow-up; carousel/motion visuals; Hermes Marketplace idea (Lemma mf78bf349201a).
- Noted, untouched: `.claude/settings.local.json` holds a Supabase service_role key in plain text (gitignored); kaziyici job dc9f0dbe4203 fails nightly (deepseek model EOL); Cowork SKILL.md says Chrome but runs use Neo; Neo's LinkedIn account unchecked.

## Update 2026-11-25 01:45 TRT
- Approval path is now the Hermes plugin `~/.hermes/plugins/linkedin-yorum-onay` in the main gateway (bot @aifatura_bot). Reject test on record `1000000000000000002` passed at 01:07 TRT. No real "Yayınla" press through the plugin yet.
- Bridge job b5fba5532233 resumed. Poller job acfc15be0419 deleted 2026-11-25 ~01:20 TRT with Cenk's OK. Draft job stays paused (capture file stale).
- Bridge/draft wrappers in `~/.hermes/scripts/` send via the profile bot token (= @aifatura_bot).
- Token rotation: Cenk owns it (said 2026-11-25). Do not raise it again; restart the gateway only when he asks.
- Resolved 2026-11-25 01:16 TRT: live test passed. Main gateway received Cenk's "Selam neden gitmedi" (01:13) and "Test" (01:16) and replied to both. The earlier "ping" was lost; its send time is unknown. One likely cause is the paused poller acfc15be0419 (getUpdates with allowed_updates=callback_query, ran every 2 min until 2026-11-24 21:17), but this is not proven.
- Own-post decisions 2026-11-25 ~02:30 TRT (Cenk), overriding "one own post per TRT day":
  - Two own posts per day, 10:00 and 16:00 TRT, GEO news rewritten in our format (writing_style.ts pillar/format, card-v2.html visual). Publish only on Cenk's Telegram press (draft arrives ~09:30 / ~15:30).
  - News sources: independent GEO/industry news (Google News search, Search Engine Land/Journal, Google Search Central); the Cowork competitor report is used only to pick topics competitors are not covering. Phase 2: a Gemini NotebookLM notebook with deep GEO sources, queried via BrowserOS Neo (feasibility unchecked).
  - Later: carousel and motion formats now and then.
  - Codex automation "Botfusions GEO Organik Büyüme Sistemi" (~/.codex/automations/botfusions-instagram-zel-i-erik-ak, daily 09:00, ACTIVE) had standing Mon/Wed/Fri auto-publish rights to the personal profile via `npm run geo:remote --publish` (VPS). Its VPS day receipts never see Mac receipts -> double-post risk. Blocked: `scripts/geo-remote.sh` now exits 3 on `--publish` (before any SSH); note appended to that automation's memory.md (backup memory.md.bak-20261125). Its drafts, company-page derivatives and OmniSocials work continue.
  - Built 2026-11-25 (uncommitted): `linkedin-post-approval.mjs --slot 10|16` -> receipt `<day>-<slot>.json` (tests 9/9); `src/geo_news.ts` (+test) GEO candidates from Google News + SEJ, `--mark` -> `data/geo-news-used.json`; `prompts/gunluk-geo-post.md` (headless producer: news -> NotebookLM via Neo (optional) -> writing_style pickers -> turkce-insani-yazar skill -> card from card-v2.html -> metin-bakis -> result.json); wrapper `~/.hermes/scripts/linkedin_gunluk_post.py --slot 10|16` (detached `claude -p` Opus, deny list for publish/telegram/ssh/.env; wrapper alone holds the bot token and sends via --request; skip/failure -> Telegram note). Hashtag rule max 3 aligned in AGENT.md, writing_style.ts, linkedin-ssi-strateji.md.
  - NOT done: Hermes jobs (09:15 and 15:15 TRT, script `linkedin_gunluk_post.py --slot 10|16`) need Cenk's OK; dry-run result pending.
  - NotebookLM notebook: https://notebook.google.com/notebook/eff1ee35-013f-4c54-8dd8-f8530f4f8d4f (Neo opened it in dry-run 1).
  - Dry-run 1 (slot 10, 2026-11-25 02:36-02:41 TRT): ready, SERoundtable AI Overviews link-selection doc, metin-bakis DÜZELT->YAYINLA, 5 claims verified against the article. Then added: wrapper checks stream-json for real Skill(turkce-insani-yazar) + Agent(metin-bakis) calls; roles (Cenk): headless run is Sonnet 5.5 (research + writing), metin-bakis runs with model opus as the checker; the wrapper requires Skill(turkce-insani-yazar) and Agent(metin-bakis, model opus) in the run log.
- Scope decision 2026-11-25 (Cenk): now = competitor tracking + our comments on their posts only. Follow-up on replies to our comments (0-6/6-24/24-72 h windows) is the NEXT phase, not now. Scan stays as is: Cowork scheduled task `geo-aeo-linkedin-takip` (weekdays ~17:00 TRT, `~/Claude/Scheduled/geo-aeo-linkedin-takip/SKILL.md`) writes `yorum-merkezi.md`; Hermes bridge b5fba5532233 sends drafts. Do not touch for now: SKILL.md line 80 says Claude in Chrome but runs use BrowserOS Neo (2026-11-24 report); which LinkedIn account is signed in to Neo is unchecked (YORUM-AJANI.md wants the old scan account).
- Doc mismatch RESOLVED 2026-11-25: Telegram getMe on the linkedin profile `TELEGRAM_BOT_TOKEN` returns `aifatura_bot`. The two wrapper comments in ~/.hermes/scripts (linkedin-yorum-ajani.sh, linkedin-yorum-merkezi-kopru.sh) said @bilmis1_bot; corrected to @aifatura_bot (comment only, no code change).
- Own-post approval (2026-11-25, committed edf7faa): `scripts/linkedin-post-approval.mjs` (`--request --captions <json with linkedin_personal> --image <png|jpg>` snapshots text+image into `data/post-onay/<id>/` and sends image + text with py:/pr: buttons; `--callback` publishes only the pressed snapshot once via linkedin-mcp). Day lock shared with geo-linkedin-trial.mjs through `data/geo-trial-receipts/<day>.json` (wx). Publishes outside the 30-day trial window on Cenk's per-press approval; only `expectedSub` is read from geo-trial.json. Tests: `npm run post:onay:test` (8/8).
- Hermes: post handler code lives in `~/.hermes/plugins/linkedin-yorum-onay/__init__.py` (`telegram_post_factory`, tests 11/11); it is registered ONLY by the new sibling plugin `~/.hermes/plugins/linkedin-post-onay` (enabled, wired live 2026-11-25 01:31:59 TRT without restart; reload-plugins wires newly loaded plugins only). Never register it in both.
- Codex review: fixed trial-script receipt overwrite race (posting=true after wx write) and neutral plugin error text for posts. Skipped as out of threat model or negligible: local stdin caller, local image swap between hash check and upload, midnight boundary, half-written receipt (fails closed).
- Request sending must go through a wrapper that exports the linkedin profile bot token (like ~/.hermes/scripts/linkedin-yorum-ajani.sh); the project .env engagement token is a different bot whose presses never reach the plugin.
- Own-post content: none was ready (all captions in data/ had receipts), so a new draft was written. First real request sent 2026-11-25 ~01:37 TRT: record data/post-onay/1795559808268 (draft data/post-taslak/2026-11-25, pillar egitici, format rehber, metin-bakis DÜZELT -> 4 fixes applied). Cenk pressed Yayınla; published 2026-11-25 01:37 TRT via the live gateway plugin: https://www.linkedin.com/feed/update/urn:li:share:7531123755922878464/ (public page returns the text). Day receipt 2026-11-25 written (source post-onay). Node fetch needed IPv4-first DNS on this Mac (now set in the script).
- Where it publishes from: this Mac only. The press goes to the main Hermes gateway on this Mac (bot @aifatura_bot), the plugin runs `node scripts/linkedin-post-approval.mjs --callback` in this repo, and that starts the local linkedin-mcp (`integrations/linkedin-mcp`, stdio) with the token in `data/.linkedin_token.json`. Target: Cenk's personal profile "Ömer Cenk Tokgöz" (checked against `expectedSub`), not the company page. Not the VPS/Coolify container. Needs: Mac awake, main gateway running, plugins `linkedin-yorum-onay` + `linkedin-post-onay` enabled. LinkedIn token expires 2027-01-07 11:50 TRT; renew with `npm run linkedin-auth` before then.
- Double press: on 2026-11-25 the first Yayınla press left no trace in agent.log/gateway.log/errors.log; only the second (01:37:01 TRT) reached the plugin. Cause unknown. Pressing again is safe (status/nonce check, run lock, exclusive day receipt). If it recurs, note the press time and check that minute's logs.
- Sending a new post for approval: write `captions.json` ({"linkedin_personal": ...}, pillar/format from `writing_style.ts`, max 3 hashtags) + flat 2D PNG, run `metin-bakis`, then run `scripts/linkedin-post-approval.mjs --request --captions ... --image ...` with TELEGRAM_ENGAGEMENT_BOT_TOKEN exported from `~/.hermes/profiles/linkedin/.env` (as the ~/.hermes/scripts wrappers do) and TELEGRAM_ENGAGEMENT_CHAT_ID=6030287709.
- Commits: 3057165 (comment approval, GEO trial, feedback loop), edf7faa (own-post approval). Not pushed.

## Goal
Hermes runs LinkedIn comments with Cenk's approval: drafts arrive in Telegram with buttons, a press publishes that draft via linkedin-mcp (`linkedin_comment_on_post`). Drafts come from `~/Documents/Linkedin post/yorum-merkezi.md` (daily competitor scan). Scheduled posting stays in the Coolify app (not verified this session).

## Done (committed 3057165)
- `scripts/linkedin-comment-approval.mjs` (+ test, 7/7): `handleCallback` (approver 6030287709 + chat check, nonce per record, 48 h expiry, 3 comments per TRT day, mark `publishing` before call, error -> `needs_verification`, no retry), `commentWithThreadFix` (activity URN 400 -> one call with the thread URN LinkedIn names), run lock, atomic offset, Telegram alert on run failure.
- `src/engagement_agent.ts`: exported `onayIste` (record in `data/yorum-onay/<id>.json` + buttons), `mdSafe`.
- `src/yorum_merkezi_kopru.ts` (+ test, 2/2): parses `### NNN —` entries, post age from ID (`id >> 22`), <= 12 h, validator, sends once per post.
- `~/.hermes/profiles/linkedin/SOUL.md`: comments allowed only via Cenk's button (backup `SOUL.md.bak-onayli-yorum-20261124`, relocked `uchg`).
- Hermes jobs: `acfc15be0419` "LinkedIn Yorum Onayı" (getUpdates poller) DELETED 2026-11-25. `b5fba5532233` "LinkedIn Yorum Merkezi Köprüsü" (15 min) active.
- Docs: `YORUM-AJANI.md` sections "Approved comment publishing" and "Yorum Merkezi bridge".

## Problem found (why paused)
- Project `.env` `TELEGRAM_ENGAGEMENT_BOT_TOKEN` is a "claw" bot. Cenk wants messages from the bot in `~/.hermes/profiles/linkedin/.env` `TELEGRAM_BOT_TOKEN` (he confirmed "son mesaj doğru yerden geldi"; the bot is `@aifatura_bot`, the main Mac Hermes gateway bot; ROUTING.md said `@bilmis1_bot` until 2026-11-25).
- That token is also polled by the MAIN Hermes gateway (default profile): my poller got 409 at 21:14:44 TRT and the gateway logged a polling conflict at the same second, then recovered at 21:15:19. The gateway sends `allowed_updates=ALL_TYPES` on every poll, so no lasting filter.
- So a separate getUpdates poller cannot be used with that bot.

## Next step (planned, not started)
1. Hermes plugin `~/.hermes/plugins/linkedin-yorum-onay/` using `ctx.register_telegram_handler(factory)`; PTB `CallbackQueryHandler(pattern=r"^(y|r):\d{6,25}:\d:[0-9a-f]{8}$")` registered so it wins over the core catch-all (check group/order in `plugins/platforms/telegram/adapter.py`; example entry point in `tinyfish/__init__.py`).
2. Handler: answer query first, then run `node scripts/linkedin-comment-approval.mjs --callback` (stdin = callback JSON) off the event loop with a timeout; keep from.id/chat.id check; lock busy -> "tekrar bas" reply.
3. Add `--callback` mode to the approval script; delete job `acfc15be0419` (done 2026-11-25).
4. Bridge/draft wrappers: export the linkedin profile token as `TELEGRAM_ENGAGEMENT_BOT_TOKEN` (send only, no conflict), chat/approver 6030287709. Resume `b5fba5532233`.
5. Codex review of the plugin, back up `~/.hermes/config.yaml`, enable plugin, restart main gateway with Hermes's own command (tell Cenk first).
6. Test with a "Reddet" press, then resend #116.

## Open records
- #116 PUBLISHED 2026-11-24 21:21 TRT on `urn:li:ugcPost:7530993250128568320` (comment id 7531059456537956353), Cenk approved in chat. Earlier state: `data/yorum-onay/7530993250644611073.json` (#116, Webtures SI bülteni): `needs_verification` from Cenk's press at 21:14 TRT; LinkedIn returned 400 (activity URN), so nothing was posted. Real thread URN: `urn:li:ugcPost:7530993250128568320`. Post passes 6 h around 23:00 TRT.
- `*.eski-claw-bot` files: retired pending records whose buttons were on the claw bot.
- `npm run engagement:tek` run by hand still uses the project `.env` bot.
- Draft cron `566da5a12511` stays paused: `data/yakalanan-gonderiler.json` stale since 4 Aug.

---

# HANDOFF — 21 Eylül 2026

## Tanı: X hiç paylaşım yapmıyordu, LinkedIn beklemede kalmıştı

İki ayrı, üst üste binen sorun bulundu:

1. **`isDuplicateTopicSupabase` false-positive (§47).** Eski hâli ilk-40-karakter substring
   eşleşmesini TÜM statülere (failed dahil) karşı kontrol ediyordu. Bu, HERMES sheet'teki 99
   satırın 54'ünü hiç yayınlamadan sessizce "done" işaretleyip kuyruğu boşa tüketmişti (13 gün
   boyunca fark edilmeden). Fix: `src/services/x.ts` — tam konu (normalize, ilike=exact
   case-insensitive) + yalnızca `status=eq.published` karşılaştırması.
2. **X API kredisi tükendi (X'in kendi platform sorunu, kod hatası değil).** X, Eylül 2026'da
   Free tier'ı tamamen kaldırıp Pay-Per-Use'a geçirdi; hesaba tanınan tek seferlik $10 göç
   kredisi ~09-10/09-11'de bitti. `test_x_live.ts` ile canlı test edildi → API 402 (ödeme
   gerekli) döndü, kesinleşti. Kullanıcı `console.x.com`'dan kredi/abonelik yükleyene kadar
   çözülemez.

## Yapılan değişiklikler (commitlendi + push edildi + deploy doğrulandı)

- `src/services/x.ts`:
  - `isDuplicateTopicSupabase` düzeltildi (yukarıda).
  - `isXFlowEnabled(flow)` eklendi — LinkedIn tarafındaki `isLinkedInFlowEnabled` deseninin X
    karşılığı. `X_DISABLED_FLOWS` env değişkeni (virgüllü akış listesi) okur; **ayarlanmamışsa
    varsayılan `"rss,hermes,ready-post"`** (§48) — yani Coolify'de env değişkeni HİÇ olmasa
    bile kod kendiliğinden sadece hava durumunu X'te açık bırakır. Kredi yüklenince bunu geri
    açmak için ya Coolify'de `X_DISABLED_FLOWS=""` ayarlanır ya da bu default kaldırılıp push
    edilir.
  - `createXPost(text, imagePath, topic, options?: { skipDuplicate?, flow? })` — `flow`
    verilirse `isXFlowEnabled` kapısından geçmek zorunda.
- Çağrı yerleri güncellendi: `agentFlow.ts` (`flow: "weather"`, skipDuplicate hâlâ true),
  `autonomous_agent.ts` (`flow: "hermes"`), `rss_agent.ts` (`flow: "rss"`),
  `ready_post_agent.ts` (`flow: "ready-post"`).
- Commitler: `21bf395` (§47), `10198c4` (§48).

**Neden Coolify env değişkeni değil, kod defaultu?** Kullanıcı Coolify UI'dan
`X_DISABLED_FLOWS` eklemeyi iki kez denedi, env container'a hiç yansımadı (`printenv` boş
döndü). Güvenilir olmayan bu yola bağımlı kalmak yerine, kullanıcının son talimatı
("kredi yükleyene kadar sadece hava durumu") koda gömülü default olarak kalıcılaştırıldı.

## Doğrulama (deploy sonrası, container içinde canlı çalıştırılarak)

Container `08d0369faa13` (image tag = commit `10198c4`), `npx tsx -e` ile `isXFlowEnabled`
doğrudan çağrıldı:

```
weather: true
rss: false      (⏸️ X kanalı bu akış için kapalı: rss)
hermes: false   (⏸️ X kanalı bu akış için kapalı: hermes)
ready-post: false (⏸️ X kanalı bu akış için kapalı: ready-post)
```

Beklenen davranışla birebir eşleşiyor. `X_DISABLED_FLOWS` env değişkeni container'da hâlâ
boş — yani bu tamamen kod defaultu sayesinde çalışıyor, Coolify ayarına bağımlı değil.

## Google Sheet (HERMES  X) durumu

Kullanıcı sheet'i yeniledi: 99 satır TODO, satır 2'den başlıyor. Düzeltilen duplicate-check
sayesinde bu yeni konular yanlışlıkla "zaten yayınlanmış" sayılıp tekrar boşa tüketilmeyecek.

## Sonraki adımlar / açık işler

1. **Kredi yüklenince bana haber ver** → `X_DISABLED_FLOWS_DEFAULT` içinden `"hermes"` ve
   `"rss"`/`"ready-post"` kaldırılıp (veya tamamen boşaltılıp) push edilecek, tüm akışlar X'te
   normale döner.
2. Ertesi gün 10:02 HERMES çalışmasında sheet satırlarının doğru `done`/`published` akışıyla
   ilerlediği (yanlış drenaj olmadığı) teyit edilmeli.
3. Düşük öncelik, dokunulmadı: RSS görsel üretiminde ara sıra Gemini boş-yanıt hatası
   (izole/geçici görünüyor); Supabase `linkedin+x` tablosunda literal string `"undefined"`
   topic'li tek bir eski satır (veri kalitesi sorunu, akışı etkilemiyor).

## Bilinen taşınmaz notlar

- `post_auditor.ts` kural bazlı duplicate kontrolü (`recentTopics`) hâlâ hiçbir akışta
  çalışmıyor — `auditPost` çağrıları `recentTopics` geçmiyor, default `[]`. Supabase kontrolü
  aynı işi daha güvenilir yapıyor, dokunulmadı.
- VPS'te bu repoyla aynı isme benzeyen ama alakasız bir container var:
  `botfusions-zamanlayici` (WhatsApp/kapso.ai kuyruğu) — asıl container'ı bulmak için isim
  değil, image tag = `git rev-parse HEAD` eşleşmesi kullan (bkz. memory:
  deploy-coolify-vps-access).
- Coolify GitHub webhook bu oturumda iki kez otomatik tetiklenmedi; kullanıcı manuel
  "Redeploy" tıklamak zorunda kaldı — deploy'un gerçekten yeni SHA'yı aldığını
  `docker ps`/image tag ile doğrula, webhook'a güvenme.

## Oturum durumu

- Dal: `main`, son commit `10198c4`, push edildi, deploy doğrulandı.
- Çalışma ağacında bu oturumdan önce gelen commitlenmemiş değişiklikler hâlâ duruyor
  (`engagement_agent.ts`, `comment_writer.ts`, `engagement_scout.ts`, `post_auditor.ts`,
  yeni `capture_agent.ts`/`feedback_*` dosyaları) — bu oturumun konusu değildi, dokunulmadı.

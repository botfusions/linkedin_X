# HANDOFF — 2026-11-24 (Telegram-approved LinkedIn comments)

## Update 2026-11-25 ~11:20 TRT (read this first)
- Dry-run slot 16 (Sonnet writer, Opus metin-bakis) passed the log gate: ready, metin-bakis ONAY on round 1, NotebookLM used, TechCrunch "AI Mode taps Drive and Wallet" (2026-11-23); 4 factual claims checked against the article. Kept as `data/post-taslak/2026-11-25-16-dryrun` (moved so it cannot mix with today's real run).
- Hermes jobs created with Cenk's OK, default profile (same place as b5fba5532233), no-agent, deliver local: `ec53d67c42a8` "LinkedIn Günlük GEO Post 10" (`15 9 * * *`, `linkedin_gunluk_post_10.sh`), `04dbbcd27c39` "LinkedIn Günlük GEO Post 16" (`15 15 * * *`, `linkedin_gunluk_post_16.sh`). Hermes scripts take no args, so each .sh fixes the slot and execs `/usr/bin/python3 linkedin_gunluk_post.py --slot N`. Backup: `~/.hermes/cron/jobs.json.bak-gunluk-geo-post-20261125`.
- First real run: 2026-11-25 15:15 TRT (slot 16). Check that the Telegram request arrived ~15:30-15:55 and the per-slot receipt after Cenk's press.
- Wrapper fix: worker deletes a non-sent `result.json` before the run, so a same-day dry-run result can never be sent.
- Dry-run does not mark the news link used, so a real run may pick the same story as a dry-run.

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

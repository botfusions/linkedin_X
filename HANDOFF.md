# HANDOFF — 2026-11-24 (Telegram-approved LinkedIn comments)

## Update 2026-11-25 01:12 TRT
- Approval path is now the Hermes plugin `~/.hermes/plugins/linkedin-yorum-onay` in the main gateway (bot @aifatura_bot). Reject test on record `1000000000000000002` passed at 01:07 TRT. No real "Yayınla" press through the plugin yet.
- Bridge job b5fba5532233 resumed. Poller job acfc15be0419 deleted 2026-11-25 ~01:20 TRT with Cenk's OK. Draft job stays paused (capture file stale).
- Bridge/draft wrappers in `~/.hermes/scripts/` send via the profile bot token (= @aifatura_bot).
- Cenk pasted the @aifatura_bot token in chat on 2026-11-25; recommended rotating it in BotFather and updating `~/.hermes/.env` and `~/.hermes/profiles/linkedin/.env`.
- Resolved 2026-11-25 01:16 TRT: live test passed. Main gateway received Cenk's "Selam neden gitmedi" (01:13) and "Test" (01:16) and replied to both. The earlier "ping" was lost; its send time is unknown. One likely cause is the paused poller acfc15be0419 (getUpdates with allowed_updates=callback_query, ran every 2 min until 2026-11-24 21:17), but this is not proven.
- Doc mismatch: comments in ~/.hermes/scripts/linkedin-yorum-ajani.sh and linkedin-yorum-merkezi-kopru.sh say @bilmis1_bot; HANDOFF/YORUM-AJANI/ROUTING say @aifatura_bot. Not verified which is right.
- Own-post approval (2026-11-25, not committed): `scripts/linkedin-post-approval.mjs` (`--request --captions <json with linkedin_personal> --image <png|jpg>` snapshots text+image into `data/post-onay/<id>/` and sends image + text with py:/pr: buttons; `--callback` publishes only the pressed snapshot once via linkedin-mcp). Day lock shared with geo-linkedin-trial.mjs through `data/geo-trial-receipts/<day>.json` (wx). Publishes outside the 30-day trial window on Cenk's per-press approval; only `expectedSub` is read from geo-trial.json. Tests: `npm run post:onay:test` (8/8).
- Hermes: post handler code lives in `~/.hermes/plugins/linkedin-yorum-onay/__init__.py` (`telegram_post_factory`, tests 11/11); it is registered ONLY by the new sibling plugin `~/.hermes/plugins/linkedin-post-onay` (enabled, wired live 2026-11-25 01:31:59 TRT without restart; reload-plugins wires newly loaded plugins only). Never register it in both.
- Codex review: fixed trial-script receipt overwrite race (posting=true after wx write) and neutral plugin error text for posts. Skipped as out of threat model or negligible: local stdin caller, local image swap between hash check and upload, midnight boundary, half-written receipt (fails closed).
- Request sending must go through a wrapper that exports the linkedin profile bot token (like ~/.hermes/scripts/linkedin-yorum-ajani.sh); the project .env engagement token is a different bot whose presses never reach the plugin.
- Open: no unpublished own-post content exists (all captions in data/ already have receipts; 2026-11-24 GEO package has no personal LinkedIn draft). First real request sent 2026-11-25 ~01:37 TRT: record data/post-onay/1795559808268 (draft data/post-taslak/2026-11-25, pillar egitici, format rehber, metin-bakis DÜZELT -> 4 fixes applied). Cenk pressed Yayınla; published 2026-11-25 01:37 TRT via the live gateway plugin: https://www.linkedin.com/feed/update/urn:li:share:7531123755922878464/ (public page returns the text). Day receipt 2026-11-25 written (source post-onay). Node fetch needed IPv4-first DNS on this Mac (now set in the script).
- Nothing committed.

## Goal
Hermes runs LinkedIn comments with Cenk's approval: drafts arrive in Telegram with buttons, a press publishes that draft via linkedin-mcp (`linkedin_comment_on_post`). Drafts come from `~/Documents/Linkedin post/yorum-merkezi.md` (daily competitor scan). Scheduled posting stays in the Coolify app (not verified this session).

## Done (uncommitted)
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

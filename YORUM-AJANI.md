# Yorum Fırsat Ajanı — Kurulum ve İşleyiş

**Kurulum tarihi:** 4 Ağustos 2026

## Neden var

Hesabın 83 takipçisi, 57 bağlantısı var. LinkedIn gönderileri önce ağa gösterdiği için kendi gönderilerimiz kimseye ulaşmıyor — iki günde 5 gönderi, toplam 2 etkileşim aldı.

Buna karşılık 3 Ağustos'ta rakip gönderisine yazılan **tek yorum**, 70 tepki alan bir gönderinin **en üst yorumu** oldu. Tüm gönderilerin toplamından fazla kişiye ulaştı, sıfır maliyetle.

**Ağ 500 bağlantıyı geçene kadar en verimli kanal gönderi değil yorum.**

---

## İki hesaplı yapı

| Hesap | Kim | Ne için |
|---|---|---|
| `cenk-tokgoz-82010992` | Cenk Tokgoz — "MÜDÜR", 5 bağlantı | **Tarama.** Chrome'da açık olan hesap |
| `ömer-cenk-tokgöz-0918ab373` | Ömer Cenk Tokgöz — Kurucu Ortak, 83 takipçi | **Yorum ve gönderi.** Asıl hesap |

**Neden ayrı:** Otomatik tarama LinkedIn kullanım şartlarına aykırıdır ve hesap kısıtlanabilir. Riski atıl bir hesaba yıkmak, asıl hesabı korur. Bilinçli bir tercih.

**Sınırı:** 5 bağlantılı hesabın akışı boştur. Organik keşif yapamaz; yalnızca takip listesindeki profilleri tek tek ziyaret ederek gönderi bulabilir.

---

## Üç keşif kanalı

Hiçbiri tek başına yeterli değil, üçü birlikte çalışır.

**1. Liste taraması (eski hesap, Chrome).** `data/takip-listesi.json` içindeki ~20 hesabın profil sayfaları tek tek ziyaret edilir, yeni gönderi ID'leri çıkarılır.

**2. Arama taraması.** Liste dışındaki yeni oyuncular ancak böyle bulunur. AwoScan 4 Ağustos'ta "GEO AI görünürlük" araması ile bulundu — listede yoktu, akışta da görünmezdi.

**3. Cenk'in kendi akışı (asıl hesap, elle).** Paylaşım yoluyla yayılan gönderiler taramaya girmiyor. Webtures'un SEvO gönderisi böyle yakalandı: Cenk'in ağındaki biri beğendi, akışına düştü.
Bu yolla gelen gönderiler için: `npm run engagement:tek -- <activityId> <slug> "gönderi metni"`

---

## Akış

```
Gönderi verisi  →  data/yakalanan-gonderiler.json
                        ↓
                engagement_scout.ts   (puanla, daha önce görülenleri ele)
                        ↓
                comment_writer.ts     (2 taslak üret, güvenlik bariyerinden geçir)
                        ↓
                engagement_agent.ts   (Telegram'a gönder)
                        ↓
                    CENK OKUR, BEĞENDİĞİ TASLAĞIN BUTONUNA BASAR
                        ↓
                scripts/linkedin-comment-approval.mjs   (Hermes cron, 2 dk)
                        ↓
                linkedin-mcp → linkedin_comment_on_post
```

**Butonsuz yorum yok.** Taslak ajanı LinkedIn'e yazmaz; yalnızca onay kaydı bırakır.

## Approved comment publishing (added 2026-11-24)

Cenk asked for comments to be published through the API with his approval.

- `engagement_agent.ts` writes `data/yorum-onay/<activityId>.json` (`status: pending`) and sends the drafts with inline buttons: "Taslak N'i yayınla" and "Reddet".
- Button presses on @aifatura_bot (main Mac Hermes gateway bot) are handled inside the main gateway by the Hermes plugin `~/.hermes/plugins/linkedin-yorum-onay`, which runs `node scripts/linkedin-comment-approval.mjs --callback` and publishes only the pressed draft via `linkedin_comment_on_post` (activity URN, retried once on the thread URN LinkedIn names). The old getUpdates poller job "LinkedIn Yorum Onayı" (acfc15be0419) is paused: it conflicts (409) with the gateway on the same token.
- Safeguards: only Telegram user 6030287709 in the engagement chat; only `pending` records; drafts older than 48 h are refused; status is set to `publishing` before the API call; an error sets `needs_verification` and is never retried automatically; the profile `sub` must match `data/geo-trial.json` `expectedSub`.
- Token: `data/.linkedin_token.json` (scope `w_member_social`, valid until 2027-01-07).
- If `getUpdates` returns 409, another process (for example a Hermes gateway) polls the same bot token. Give the gateway its own bot.
- Tests: `npm run yorum:onay:test`.
- Daily limit: at most 3 comments per TRT day (rule from `yorum-merkezi.md`, Cenk 16 Sep 2026). `publishing` and `needs_verification` count too. A press over the limit leaves the record `pending`, so it can be pressed again the next day.
- Not yet verified live: whether LinkedIn accepts `urn:li:activity:` for comments. The first approved press will show it; a failure lands as `needs_verification` with the API message in Telegram.

---

## Puanlama

Sahada gözlenen davranışa göre ağırlıklandırıldı:

| Sinyal | Puan | Gerekçe |
|---|---|---|
| Doğrudan soru soruyor | **+35** | "Siz ne eklerdiniz?" davetli giriş sağlıyor |
| Öncelik 1 hesap | +40 | En yüksek erişimli hesaplar |
| İlk 1 saat | +30 | Yorum görünürlüğü ilk saatlerde en yüksek |
| 1-3 saat | +20 | |
| 3-6 saat | +8 | |
| 6 saatten eski | 0 | Görünürlük ciddi düşüyor |
| 50+ tepki | +20 | Gönderi yayıldıkça yorum da yayılıyor |
| 15+ yorum | **−10** | Kalabalık yorum alanında görünmüyorsun |

Eşik: `ENGAGEMENT_MIN_SCORE` (varsayılan 40). Çalıştırma başına en fazla `ENGAGEMENT_MAX_DRAFTS` taslak (varsayılan 3).

---

## Güvenlik bariyerleri

1. **Marka adı geçen taslak otomatik reddedilir** — Botfusions, Rankie, Populon, aiizle. İstisnası yok.
2. **35-160 kelime dışındaki taslak reddedilir.**
3. Hepsi reddedilirse hata verilir, boş taslak gönderilmez.

---

## Model — Sonnet 5, yedeksiz

Taslakları **yalnızca** Anthropic API üzerinden Claude Sonnet 5 yazar. Yedek model yok.

```
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5
ANTHROPIC_EFFORT=medium
```

**Neden yedek yok:** yorumun tek değeri kalite. 4 Ağustos'ta ucuz modelle yapılan testte yanlış isimle hitap, iltifatla açış ve 110+ kelime çıktı — üçü de yorumu jenerik LinkedIn yorumuna çeviriyor. Sessizce ucuz modele düşen bir taslak, taslak üretmemekten kötü. Anahtar yoksa ya da çağrı patlarsa hata Telegram'a düşer, taslak üretilmez.

**Gönderi hattı ayrı kalır.** `llm.ts` (post + görsel) OpenRouter/Gemini kullanmaya devam eder; orada hacim yüksek, maliyet gerçek kısıt. Yorumda günde ~3 taslak var. İki hattı "tutarlılık" adına birleştirmeyin.

Kod: `src/services/comment_writer.ts` → `callModel()`. `temperature` gönderilmez (Sonnet 5 varsayılan dışı değeri reddeder) ve `max_tokens` 8000'dir (adaptive thinking bu bütçeyi metinle paylaşır).

**Effort `medium`:** varsayılan `high`. 55-90 kelimelik iki taslak için high gereksiz token yakıyor; medium kabaca Sonnet 4.6'nın high seviyesine denk. Taslaklar sığlaşırsa `.env` üzerinden `high`'a çekilebilir.

---

## Çıktılar: Telegram + Obsidian

**Telegram** — anlık bildirim (aşağıdaki bölüm).

**Obsidian** — `~/Documents/Claude-Media/linkedin/yorumlar/YYYY-MM-DD-<slug>-<id>.md`. Kalıcı arşiv ve arama. Frontmatter'da `hesap`, `skor`, `tepki`, `durum` var; yayınladığın taslağın `durum:` alanını elle `yayinlandi` yap — hangi yorumun tuttuğunu sonradan bu alanla ölçeriz. Yol `OBSIDIAN_LINKEDIN_DIR` ile değiştirilebilir.

Kasa yoksa ya da yazma başarısızsa ajan **sessizce geçer**: Telegram zaten gitmiştir, arşiv yüzünden taslağı kaybetmenin anlamı yok.

Ajanın kasa içindeki tanım sayfası: `Claude-Media/linkedin/AGENT.md`.

---

## Hermes profili

Ajan bir **Hermes profilidir**: `linkedin` (`~/.hermes/profiles/linkedin/`). Hakan'dan klonlandı çünkü ikisi aynı doktrinin ajanı — Hakan X'te, bu LinkedIn'de; ikisi de read-only tarar, taslak üretir, yayınlamaz.

- Kimlik ve yasaklar: `~/.hermes/profiles/linkedin/SOUL.md` (`uchg` kilitli; değiştirmek için önce `chflags nouchg`)
- Routing kaydı: `~/.hermes/ROUTING.md` → profil tablosu + kural #9
- Sohbet: `linkedin chat`

**İki ayrı model var, karıştırma.** Profilin sohbet modeli Hermes'in sağlayıcı zincirinden gelir (`deepseek-v4-flash` → …). Cron'un ürettiği **taslakların** modeli bundan bağımsızdır: Anthropic Sonnet 5, yedeksiz. Profil modelini değiştirmek taslak kalitesini etkilemez, taslak modelini değiştiren tek yer `.env`.

---

## Telegram

Yorum ajanı **ayrı bir bot** kullanır. `TELEGRAM_BOT_TOKEN` n8n'e bağlıdır ve hata bildirimleri oraya düşer; taslakların o kanala karışması ikisini de kullanılmaz kılar.

```
TELEGRAM_ENGAGEMENT_BOT_TOKEN=
TELEGRAM_ENGAGEMENT_CHAT_ID=
```

**Boş bırakılırsa taslaklar yalnızca konsola yazılır, n8n kanalına taşmaz.**

Bot açmak için: Telegram'da @BotFather → `/newbot` → token'ı buraya yaz. Chat ID için bota bir mesaj at, sonra
`https://api.telegram.org/bot<TOKEN>/getUpdates` adresinden `chat.id` değerini al.

---

## Komutlar

```bash
npm run engagement                                   # tarama + taslak üretimi
npm run engagement:tek -- <id> <slug> "metin"        # tek gönderi için taslak
npm run feedback:rapor                               # geri bildirim raporu üret
npm run feedback:test                                # feedback döngüsü doğrulayıcısı
npm run typecheck                                    # tsc --noEmit tip kontrolü
```

Zamanlanmış: her gün **09:00, 13:00, 18:00** — **VPS'te değil, Mac'teki Hermes cron'unda** (5 Ağustos 2026'da taşındı).

```bash
hermes cron list                      # is 566da5a12511
hermes cron run 566da5a12511          # elle tetikle
hermes cron runs 566da5a12511         # gecmis calismalar
```

Sarmalayıcı: `~/.hermes/scripts/linkedin-yorum-ajani.sh` → `npm run engagement`. `--no-agent` modunda çalışır (Hermes'in LLM katmanı devreye girmez, script'in kendisi iştir). Script normal akışta **sessizdir**; yalnızca hata olursa konuşur, çünkü taslakları ajanın kendisi zaten Telegram'a gönderiyor.

**Neden sunucuda değil:** ajanın girdisi `data/yakalanan-gonderiler.json` ve bu dosyayı Cenk'in tarayıcı oturumu besliyor. Konteynerdeki kopya imaja gömülü ve donuk kaldığı için tarama her seferinde "0 aday" veriyordu. Cron, verinin üretildiği makinede olmalı. `scheduler.ts`'e geri eklemeyin; önce besleme sorununu çözün.

---

## Yorum yazım çizgisi

Kurallar `agent.md` > "YORUM KURALLARI" bölümünde. Özet:

- Marka adı asla geçmez
- "Biz şunu yapıyoruz" değil, **"sahada şunu görüyorum"**
- 60-120 kelime
- Şablon: somut saha gözlemi → karşı tarafın tezini kısmen onayla → asıl belirleyici değişkeni koy
- Belirleyici değişken her seferinde **ölçüm/atıf** tarafında olmalı — rakiplerin retoriği var, kanıtı yok
- Rakibi çürütme, önüne bir katman ekle ("ön koşul", "eksik halka" çerçeveleri işe yarıyor)

## Yorum Merkezi bridge (added 2026-11-24)

Main feed for comment opportunities: `~/Documents/Linkedin post/yorum-merkezi.md`. The daily competitor scan (`linkedin-yorum-merkezi` skill, BrowserOS Neo) writes each opportunity as a `### NNN — <account>, <post> (<date>)` entry with a `**Kaynak:**` LinkedIn URL and reviewed drafts (`### ✅ ÖNERİLEN: Taslak A` + blockquote). Older entries and the "Gönderilen yorumlar ve sonuçları" table hold the past comments and what worked.

- `src/yorum_merkezi_kopru.ts` (`npm run yorum:merkez`, Hermes job "LinkedIn Yorum Merkezi Köprüsü", every 15 min) parses entries, keeps posts younger than `YORUM_MERKEZI_MAX_SAAT` (default 12 h; age comes from the post ID, `id >> 22` = ms since epoch), runs `validateDraft` and sends up to 2 drafts (recommended first) with buttons through the same `onayIste` used by the engagement agent.
- Each post is sent once: an existing `data/yorum-onay/<id>.json` means skip. If every draft fails the validator, Cenk gets a note without buttons and the record is stored as `rejected`.
- The bridge writes no drafts, calls no model and does not edit `yorum-merkezi.md`. The results table there is still filled by the scan or by hand.
- Tests: `npm run yorum:merkez:test`.


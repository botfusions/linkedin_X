# Botfusions Autonomous Content Engine (v2.8)

LinkedIn ve X (Twitter) icin tam otonom icerik uretim ve paylasim sistemi.

---

## Ozellikler

- **Dual-Platform:** LinkedIn (kurumsal) + X (vizyoner) icerik uretimi
- **3 Icerik Kaynagi:** Google Sheets konular, Google News AI RSS haberler, Istanbul hava durumu
- **Self-Improving Optimizer:** 14+ kurala gore skorlama, 80/100 altindakiler otomatik revize
- **Gorsel Uretim Motorlari:** Dinamik Hava Durumu ve Kurumsal Infografik motorlari
- **Canli Arastirma:** Perplexity AI ile guncel veri toplama
- **Agentic Auditor:** LLM tabanli gonderi denetim sistemi (ban riski, duplicate, kalite)
- **Supabase:** API key deposu + LinkedIn token persistence + yayin takip tablosu
- **Telegram Bildirim:** Her yayinda rapor, hatalarda alarm
- **Docker + Coolify:** VPS'te 7/24 otonom calisma
- **Ban Korumasi:** Gunluk limit, deduplication, kill switch, otomatik kilitleme algilama

---

## Gunluk Program

| Saat (TR) | Gorev                         | Kaynak              |
| :-------- | :---------------------------- | :------------------ |
| **08:00** | Istanbul Hava Durumu + Gorsel | Weather API         |
| **10:00** | Excel Konu Akisi              | Google Sheets (GEO) |
| **16:30** | RSS Haber Akisi               | Google News AI      |

---

## Proje Yapisi

```
src/
├── bootstrap.ts              # Giris noktasi (Supabase env yukler)
├── scheduler.ts              # Cron motoru (3 zamanlama)
├── autonomous_agent.ts       # Excel konu otonom akisi
├── rss_agent.ts              # RSS haber otonom akisi
├── linkedin_auth.ts          # LinkedIn OAuth token yenileme (CLI)
├── index.ts                  # Tek seferlik calistirma
└── services/
    ├── agentFlow.ts          # Hava durumu + Excel akis mantigi
    ├── llm.ts                # Perplexity arastirma + OpenRouter (Gemini 2.0 Flash) icerik + gorsel prompt
    ├── google.ts             # Google Sheets (GEO) entegrasyonu
    ├── rss.ts                # Google News RSS okuma + parse
    ├── gemini_image.ts       # Gemini ile gorsel uretim + kayit
    ├── linkedin.ts           # LinkedIn ugcPosts API + Supabase token fallback
    ├── x.ts                  # X (Twitter) API v2 + kill switch + gunluk limit + dedup
    ├── optimizer.ts          # LinkedIn skorlama + self-improve
    ├── x_optimizer.ts        # X skorlama + self-improve
    ├── post_auditor.ts       # Agentic gonderi denetim sistemi (LLM)
    ├── rules.ts              # LinkedIn algoritma kurallari
    ├── x_rules.ts            # X algoritma kurallari
    ├── weather.ts            # Istanbul hava durumu servisi
    ├── supabase.ts           # Supabase client + CRUD + LinkedIn token persistence
    ├── telegram.ts           # Telegram bildirim servisi
    └── imageHosting.ts       # ImgBB gorsel barindirma
```

---

## Supabase Tablolari

### env_config (API Key Deposu + LinkedIn Token)

| Kolon      | Tip         | Aciklama              |
| ---------- | ----------- | --------------------- |
| id         | UUID        | Primary key           |
| key_name   | TEXT        | Degisken adi (unique) |
| key_value  | TEXT        | Deger                 |
| created_at | TIMESTAMPTZ | Olusturma tarihi      |

**Ozel Kayitlar:**

- `LINKEDIN_TOKEN_JSON`: LinkedIn OAuth token JSON (access_token + expiresAt)
- API key'ler: OPENROUTER_API_KEY, GOOGLE_API_KEY, TELEGRAM_BOT_TOKEN vb.

### linkedin+x (Yayin Takibi)

| Kolon          | Tip         | Aciklama                      |
| -------------- | ----------- | ----------------------------- |
| id             | UUID        | Primary key                   |
| topic          | TEXT        | Konu/haber basligi            |
| linkedin_post  | TEXT        | LinkedIn post metni           |
| x_post         | TEXT        | X post metni                  |
| image_url      | TEXT        | Gorsel dosya yolu             |
| linkedin_score | INTEGER     | LinkedIn optimizer skoru      |
| x_score        | INTEGER     | X optimizer skoru             |
| linkedin_url   | TEXT        | LinkedIn post URL             |
| x_url          | TEXT        | X post URL                    |
| source         | TEXT        | Kaynak: excel / weather / rss |
| status         | TEXT        | published / failed            |
| published_at   | TIMESTAMPTZ | Yayin tarihi                  |

---

## LinkedIn Token Yonetimi

### Token Persistence

LinkedIn token Supabase `env_config` tablosunda saklanir. Redeploy sonrasi otomatik yuklenir.

1. `linkedin_auth.ts` token'i hem dosyaya hem Supabase'e kaydeder
2. `linkedin.ts` once dosyadan okur, yoksa Supabase'ten yukler
3. Supabase'ten yuklenen token dosyaya da yazilir (sonraki okuma hizli olur)

### Ilkez Token Alma

```bash
docker ps --format "{{.Names}}" | head -5
docker exec -it <CONTAINER_ADI> npx tsx src/linkedin_auth.ts
```

Tarayicida linki ac, LinkedIn'de onayla, yonlendirme URL'sini yapistir. Token 60 gun gecerli.

### Token Suresi Dolunca

Telegram'a bildirim gelir. Ayni komutu tekrar calistir.

```bash
docker ps --format "{{.Names}}" | head -5
docker exec -it <CONTAINER_ADI> npx tsx src/linkedin_auth.ts
```

### Token Yoksa Davranis

Token yoksa LinkedIn paylasimi sessizce atlanir (ban koruması). Hata bildirimi gonderilmez. Sadece log'a yazilir.

---

## Gorsel Uretim Motorlari (v2.6)

Sistem, yuksek etkilesimli LinkedIn paylasimlari icin iki ana gorsel motoru kullanir:

### 1. Dinamik Hava Durumu Motoru (v2.7 - Cinematic Glass Etched Style)

Istanbul hava durumuna göre her sabah yüksek sadakatli, sinematik ve modern manzaralar üretir.

- **Estetik Dil:** "Glass-Etched Projection". Bilgiler camın üzerine asitle yedirilmiş veya zarif bir dijital projeksiyon gibi doğrudan işlenir.
- **Typography (Kritik):** Yazılar ve ikonlar pencere alanının **en fazla %15'ini** kaplayacak şekilde "küçük" (discreet) ama okunabilirlik için **"Semi-Bold / Medium"** kalınlıktadır.
- **Minimalizm:** Kesinlikle kutu, çerçeve, opak arka plan veya konteyner kullanılmaz. Sadece ham metin ve ikonlar cam üzerinde yüzer.
- **Atmosferik Senkronizasyon:** 30°C ve üzeri sıcaklıklarda "Altın sarısı ışık ve masmavi gökyüzü" (Golden Hour/Bright Daylight) zorunluluğu vardır. Gri/kasvetli hava sadece yağmurlu senaryolarda izinlidir.
- **Branding:** Her görselde zarif bir `botfusions` logotype bulunur.
- **Manzara:** Boğaziçi, Kız Kulesi ve tarihi yarımada manzaralarıyla kurumsal ve sanatsal denge.

### 2. Kurumsal Infografik Motoru

Excel veya RSS konularini profesyonel teknoloji haritalarina donusturur.

- **Dinamik Stil Rotasyonu:** `blueprint`, `cyberpunk`, `minimalist` ve `3d matrix` stilleri arasinda sunucu-taraflı sıralı döngü (LLM'e bağımlı değil).
- **Yüksek Yoğunluklu Bilgi:** 6-8 farkli bilgi kutucugu ve 3-4 detayli alt madde ile "hallucination-free" teknik semalar.
- **Dil Kontrolü:** Tum basliklar, metrikler ve detaylar Turkce olarak uretilir.
- **Kurumsal Estetik:** `botfusions` watermark ve profesyonel ikonografi (guvenlik icin kalkan, AI icin cip vb.).

---

## Coolify Deployment (VPS)

### 1. GitHub'dan Deploy

Coolify Dashboard → **New Resource** → **Public Repository**

- Repository: `botfusions/linkedin_X`
- Branch: `main`

### 2. Environment Variables (Sadece 3)

```
SUPABASE_URL=https://vvssjczexbrhrqtkdhmb.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
TZ=Europe/Istanbul
```

Tum diger API key'ler Supabase `env_config` tablosundan otomatik yuklenir.

### 3. Container Adini Bul

Redeploy sonrasi container adi degisir. Her zaman once bul:

```bash
docker ps --format "{{.Names}}" | head -5
```

`dgecwxjms61k579zpew9y0rd-XXXXXXXXX` formatindaki satir senin container'in.

---

## Yerel Gelistirme

```bash
# Bagimliliklar
npm install

# .env ayarla
cp .env.example .env

# Tek seferlik calistir (Excel akisi)
npm run dev

# Sadece RSS haber akisi
npm run rss

# LinkedIn token yenile
npm run linkedin-auth

# Scheduler baslat (7/24 cron)
npm run scheduler
```

---

## Teknik Stack

| Bilesen       | Teknoloji                   |
| ------------- | --------------------------- |
| Core          | Node.js 20+, TypeScript     |
| LLM           | OpenRouter (Gemini 2.0 Flash) |
| Arastirma     | Perplexity Sonar            |
| Gorsel        | Gemini 3.1 Flash Image      |
| Veri Kaynagi  | Google Sheets API           |
| Haber Kaynagi | Google News AI RSS          |
| Veritabani    | Supabase (PostgreSQL)       |
| Bildirim      | Telegram Bot API            |
| Zamanlama     | node-cron                   |
| Deployment    | Docker + Coolify            |

---

## Icerik Formatı (LinkedIn)

```
%180 donusum artisi mumkun mu? 🚀
Kisa aciklama...

Geleneksel X → Yeni durum

📊 Rakamlar ne diyor?
→ Istatistik 1
→ Istatistik 2
→ Istatistik 3

⚙️ Stratejiler:
✅ Madde 1
✅ Madde 2
✅ Madde 3

📌 Neden simdi?
Aciklama...

👇 Yorumlarinizi bekliyorum!

#Hashtag1 #Hashtag2 #Hashtag3 #Hashtag4 #Hashtag5 #Hashtag6 #Hashtag7 #Hashtag8 #Hashtag9 #Hashtag10
```

---

## Ban Korumasi

| Senaryo                  | Koruma                                               |
| ------------------------ | ---------------------------------------------------- |
| Gunluk X post limiti     | Max 3 post/gun (hava + excel + rss)                 |
| X kill switch            | X_PAUSED=true ile tum X postlari durdurulur         |
| Duplicate konu           | Memory + Supabase kontrolu ile ayni konu engellenir |
| Otomatik kilitleme       | 403/locked hatasinda X_PAUSED otomatik true olur    |
| Scheduler tetikleme      | 0-5 dakika rastgele erteleme                        |
| Token yoksa              | LinkedIn sessizce atlanir, hata bildirimi yok        |
| Bos metin                | Post gonderilmez (guvenlik bariyeri)                |
| Gorsel uretilemezse      | Post gonderilmez, sonraki habere gecilir             |
| Agentic denetim          | Her post oncesinde LLM denetimi (ban riski, kalite) |

---

## Kurallar

- Tum infografikler **TURKCE** (basliklar, etiketler, metrikler dahil)
- LinkedIn skoru **80/100** altindaysa otomatik revize
- Bos metin veya hatali gorselle **ASLA** paylasim yapilmasin
- "Detay icin ilk yorum" gibi cumleler **YOK**
- Her yayin Supabase'e kayit + Telegram'a bildirim
- Post URL'leri (LinkedIn/X) Supabase'e kaydedilir

---

## Test ve Bilinen Sorunlar (Production Lessons)

Bu bolum, production'da karsilasilan ve cozulen sorunlari icerir. Yeni test veya debug gerektiginde referans olarak kullanilir.

### 1. Gemini Gorsel Timeout

- **Sorun:** Gemini 3.1 Flash Image API 90s icinde yanit vermiyordu
- **Neden:** API yuku saatlere gore degisiyor, testte hizli yanit vermis olabilir
- **Cozum:** Timeout 180s'ye cikarildi (`src/services/llm.ts`)
- **Not:** Gorsel uretilemezse post gonderilmez (ban riski), akis sonraki habere gecer

### 2. Excel Konu Sutunu Eslesmemesi

- **Sorun:** Satir 40'taki konu bulundugu halde "konu sutunu bulunamadi" hatasi
- **Neden:** Sutun adi sabit listeyle (`"konu"`, `"topic"`, `"title"`) eslestiriliyordu, Excel'deki gercek sutun adı listede yoktu
- **Cozum:** "Durum" harici ilk dolu sutunu konu olarak alan akilli fallback eklendi (`src/autonomous_agent.ts`)
- **Debug:** Tum sutun adlari ve degerleri loglanir

### 3. Excel Durum "Done" Yazmama

- **Sorun:** Yayinlanan satirlar tekrar tekrar isleniyordu
- **Neden:** Kod "Yayinlandi (LI X)" yaziyordu ama filtre sadece "done" ve "bitti" ariyordu
- **Cozum:** Yayin sonrasi Excel'e "Done" yazilir, filtre "done"/"bitti"/"yayinlandi\*" ile eslesir

### 4. Bos Satirlar Kritik Hata Firlatiyordu

- **Sorun:** Excel'de bos bir satir tum akisi durduruyordu
- **Neden:** Tek kayit `find()` ile bulunuyordu, hata durumunda `continue` calismiyordu
- **Cozum:** `filter()` + `for...of` dongusune cevrildi, bos/hatali satirlar atlanir

### 5. LinkedIn False Positive (v2.4)

- **Sorun:** Token yokken bile "LinkedIn yayinlandi" raporlaniyordu
- **Neden:** `createLinkedInPost()` boolean donuyordu ama cagiran taraf kontrol etmiyordu
- **Cozum:** Fonksiyon `string | null` doner (URL veya null), tum cagiranlar null check yapar

### 6. LinkedIn Token Redeploy Sonrasi Siliniyor

- **Sorun:** Her Coolify redeploy'da token dosyasi siliniyordu, tekrar auth gerekiyordu
- **Neden:** Token container dosya sisteminde saklaniyordu
- **Cozum:** Token Supabase `env_config` tablosunda saklanir, dosya yoksa otomatik yuklenir

### 7. RSS Agent Calismiyordu (v2.5)

- **Sorun:** `npx tsx src/rss_agent.ts` calismiyordu, hicbir cikti uretmiyordu
- **Neden:** `runRSSNewsWorkflow()` sadece `export` edilmisti, self-executing call yoktu
- **Cozum:** Dosya sonuna `runRSSNewsWorkflow()` cagrisi eklendi

### 8. Arka Arkaya Post Ban Riski

- **Sorun:** RSS 2 haberi 1-2 dk icinde arka arkaya atiyordu
- **Neden:** Postlar arasi bekleme yoktu
- **Cozum:** RSS haberler arasi 3-5 dakika rastgele bekleme eklendi

### 9. Hava Durumu Gorselinde Yagmur/Gunes Karisikligi

- **Sorun:** Hava acik olmasina ragmen gorselde yagmur damlalari vardi
- **Neden:** Gorsel prompt sablonunda "raindrops on glass" ornegini Gemini ornek aliyordu
- **Cozum:** Her hava durumu icin ayri kural eklendi (clear/cloudy/rainy)

### Test Onerileri

| Senaryo                  | Test Yontemi                                                             |
| ------------------------ | ------------------------------------------------------------------------ |
| Gemini timeout           | API'yi bilerek yavas promptla test et, 180s asilmasini simule et         |
| Sutun eslesme            | Farkli sutun adlari olan bir test sheet'i kullan (ornegin "Post Konusu") |
| Bos satir                | Sheet'e bos satirlar ekle, atlanip atlanmadigini kontrol et              |
| Durum guncelleme         | Yayin sonrasi Excel'de "Done" yazildigini dogrula                        |
| Gorselsiz post           | Gemini API'yi gecici olarak kapali tut, post gonderilmedigini dogrula    |
| Tekrar calisma           | Ayni satir iki kez islenmiyor mu kontrol et                              |
| Token persistence        | Redepoy sonrasi LinkedIn token Supabase'ten yukleniyor mu dogrula        |
| Ban koruması             | RSS agent calisirken postlar arasi 3-5dk bekleme var mi kontrol et       |
| LinkedIn false positive  | Token yokken "yayinlandi" raporlanmiyor mu dogrula                       |
| Hayalet Paylasim (Ghost) | Import sırasında RSS workflow tetiklenmiyor mu dogrula (v2.6.1 fix)      |
| Stil Rotasyonu           | Her postta farkli stil (3D, Cyber, vb.) uretiliyor mu dogrula            |
| Supabase late-load       | Container redeploy sonrasi API key'ler Supabase'ten geliyor mu dogrula   |
| Tek haber                | RSS agent her calismada sadece 1 haber isliyor mu dogrula                |
| X hashtag                | X postlarinda 2-3 hashtag var mi dogrula                                  |

### 10. Hayalet Paylasim (Ghost Posting) - v2.6.1

- **Sorun:** RSS haberleri bazen scheduler tetiklemeden kendi kendine (mükerrer) paylasiliyordu.
- **Neden:** `rss_agent.ts` dosyası scheduler tarafından import edildiğinde, dosya sonundaki self-executing call tetikleniyordu.
- **Cozum:** `require.main === module` kontrolü (veya TS eşdeğeri) eklenerek, sadece dosya doğrudan çalıştırıldığında (`npm run rss`) tetikleme yapılması sağlandı.

### 11. Gorsel Stil Sabitligi

- **Sorun:** AI hep ayni (minimalist) stilde gorsel uretiyordu.
- **Neden:** LLM (Gemini) her seferinde aynı stili seciyordu, Math.random() rotasyonu yeterli degildi.
- **Cozum:** `optimizer.ts`'de sunucu-taraflı sıralı stil döngüsü (blueprint → cyberpunk → minimalist → 3d) uygulandı. LLM'in stil secimine bagimlilik kaldirildi.

### 12. Supabase Late-Load API Key Bug (v2.7)

- **Sorun:** VPS'te `OPENROUTER_API_KEY eksik!` ve `Telegram: BOT_TOKEN tanimli degil` hatalari.
- **Neden:** API key'ler modül import aninda `const KEY = process.env.KEY` seklinde okunuyordu. Supabase'den env yukleme (`initEnvFromSupabase()`) daha sonra calisiyordu, bu yüzden sabitler bos kaliyordu.
- **Cozum:** Tum modül-seviye sabitler (llm, optimizer, x_optimizer, imageHosting, telegram) lazy getter fonksiyonlara cevrildi. Her cagrida `process.env`'den tekrar okunuyor.

### 13. RSS Cift Haber → Tek Haber (v2.7)

- **Sorun:** RSS her calismada 2 haber cekip paylasiyordu, spam riski.
- **Cozum:** 3 haber cek, 1 tanesini sec. Ban koruması bekleme suresi 1-2 dakikaya dusuruldu.

### 14. X Hashtag Sayisi Dusuk (v2.7)

- **Sorun:** X postlarinda sadece 1 hashtag cikiyordu.
- **Cozum:** X hashtag kurali 2-3 ideal olarak guncellendi, optimizer ve LLM prompt'lari guncellendi.

### 15. X Hesap Kilitleme - Spam Algilama (v2.8)

- **Sorun:** X hesabi 30 Nisan-1 Mayis arasi gunde 9-10 post nedeniyle kilitlendi.
- **Neden:** RSS coklu post + duplicate konu + ghost posting. 4 gunde ~21 X post.
- **Cozum:** Gunluk X post limiti (max 3), Supabase+memory deduplication, X_PAUSED kill switch, otomatik 403 algilama.

### 16. Agentic Gonderi Denetim Sistemi (v2.8)

- **Ozellik:** Her gonderi oncesinde LLM + kural tabanli denetim.
- **Denetim Kriterleri:** Ban riski, duplicate konu, spam kelimeleri, AI kaliplari, hashtag cesitliligi, icerik kalitesi.
- **Sonuc:** Risk skoru 60+ olan postlar otomatik reddedilir.
- **Entegrasyon:** RSS, Excel ve Hava Durumu akislarinda gonderi oncesi denetim.

### 17. Excel Sutun Eslestirme Fix - Meta Sutun Fallback (4 Mayis 2026)

- **Sorun:** Excel akisinda konu "undefined" olarak kaydediliyordu, 10:00 postu hic paylasilmiyordu.
- **Neden:** Google Sheets'in ilk sutun basligi `"n Görünmez Trafik Hırsızı: Proxy SEO Tehdidesi..."` seklinde uzun bir metindi. Kod `"konu"`, `"topic"`, `"başlık"` gibi sabit isimlerle eslestiriyordu, hicbiriyle eslesmiyordu.
- **Cozum:** Meta sutunlar (Status, Content, URL, Link, Image) disindaki ilk dolu sutunu otomatik konu olarak tanimayan akilli fallback eklendi (`src/autonomous_agent.ts`). 55 bekleyen kayit artik dogru topic metniyle eslesiyor.

### 18. X Gonderileri Tam Durdurma (4 Mayis 2026)

- **Sorun:** X hesap kilitleme riski nedeniyle gecici olarak tum X paylasimlarinin durdurulmesi gerekiyordu.
- **Cozum:** `X_PAUSED=true` Supabase `env_config` tablosuna eklendi. VPS'te scheduler yeniden basladiginda tum X gonderileri otomatik olarak atlanacak. `createXPost()` fonksiyonu `null` donecek, hicbir tweet gonderilmeyecek. Kaldirilmak istendiginde Supabase'ten deger silinmesi yeterli.

---

© 2026 Botfusions. MIT Lisans.

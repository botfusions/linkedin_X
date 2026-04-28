# Botfusions Autonomous Content Engine (v2.3)

LinkedIn ve X (Twitter) icin tam otonom icerik uretim ve paylasim sistemi.

---

## Ozellikler

- **Dual-Platform:** LinkedIn (kurumsal) + X (vizyoner) icerik uretimi
- **3 Icerik Kaynagi:** Google Sheets konular, Google News AI RSS haberler, Istanbul hava durumu
- **Self-Improving Optimizer:** 14+ kurala gore skorlama, 80/100 altindakiler otomatik revize
- **AI Gorsel Uretimi:** Gemini 3.1 Flash ile Turkce infografikler
- **Canli Arastirma:** Perplexity AI ile guncel veri toplama
- **Supabase:** API key deposu + yayin takip tablosu
- **Telegram Bildirim:** Her yayinda rapor, hatalarda alarm
- **Docker + Coolify:** VPS'te 7/24 otonom calisma

---

## Gunluk Program

| Saat (TR) | Gorev | Kaynak |
|:---|:---|:---|
| **08:00** | Istanbul Hava Durumu + Gorsel | Weather API |
| **10:00** | RSS Haber Akisi | Google News AI |
| **13:00** | Excel Konu Akisi | Google Sheets (GEO) |
| **16:00** | RSS Haber Akisi | Google News AI |
| **17:00** | Excel Konu Akisi | Google Sheets (GEO) |

---

## Proje Yapisi

```
src/
├── bootstrap.ts              # Giris noktasi (Supabase env yukler)
├── scheduler.ts              # Cron motoru (5 zamanlama)
├── autonomous_agent.ts       # Excel konu otonom akisi
├── rss_agent.ts              # RSS haber otonom akisi
├── linkedin_auth.ts          # LinkedIn OAuth token yenileme (CLI)
├── index.ts                  # Tek seferlik calistirma
└── services/
    ├── agentFlow.ts          # Hava durumu + Excel akis mantigi
    ├── llm.ts                # Perplexity arastirma + OpenRouter icerik
    ├── google.ts             # Google Sheets (GEO) entegrasyonu
    ├── rss.ts                # Google News RSS okuma + parse
    ├── gemini_image.ts       # Gemini ile gorsel uretim + kayit
    ├── linkedin.ts           # LinkedIn ugcPosts API
    ├── x.ts                  # X (Twitter) API v2
    ├── optimizer.ts          # LinkedIn skorlama + self-improve
    ├── x_optimizer.ts        # X skorlama + self-improve
    ├── rules.ts              # LinkedIn algoritma kurallari
    ├── x_rules.ts            # X algoritma kurallari
    ├── weather.ts            # Istanbul hava durumu servisi
    ├── supabase.ts           # Supabase client + CRUD
    ├── telegram.ts           # Telegram bildirim servisi
    └── imageHosting.ts       # ImgBB gorsel barindirma
```

---

## Supabase Tablolari

### env_config (API Key Deposu)
| Kolon | Tip | Aciklama |
|-------|-----|----------|
| id | UUID | Primary key |
| key_name | TEXT | Degisken adi (unique) |
| key_value | TEXT | Deger |
| created_at | TIMESTAMPTZ | Olusturma tarihi |

### linkedin+x (Yayin Takibi)
| Kolon | Tip | Aciklama |
|-------|-----|----------|
| id | UUID | Primary key |
| topic | TEXT | Konu/haber basligi |
| linkedin_post | TEXT | LinkedIn post metni |
| x_post | TEXT | X post metni |
| image_url | TEXT | Gorsel dosya yolu |
| linkedin_score | INTEGER | LinkedIn optimizer skoru |
| x_score | INTEGER | X optimizer skoru |
| linkedin_url | TEXT | LinkedIn post URL |
| x_url | TEXT | X post URL |
| source | TEXT | Kaynak: excel / weather / rss |
| status | TEXT | published / failed |
| published_at | TIMESTAMPTZ | Yayin tarihi |

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

### 4. LinkedIn Token Alma (Ilkez)
Container adini bulduktan sonra:
```bash
docker exec -it <CONTAINER_ADI> npx tsx src/linkedin_auth.ts
```
Tarayicida linki ac, LinkedIn'de onayla, yonlendirme URL'sini yapistir. Token 60 gun gecerli.

### 5. Token Suresi Dolunca
Telegram'a bildirim gelir. Container adini tekrar bulup:
```bash
docker ps --format "{{.Names}}" | head -5
docker exec -it <CONTAINER_ADI> npx tsx src/linkedin_auth.ts
```

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

| Bilesen | Teknoloji |
|---------|-----------|
| Core | Node.js 20+, TypeScript |
| LLM | OpenRouter (GPT-4o-mini) |
| Arastirma | Perplexity Sonar |
| Gorsel | Gemini 3.1 Flash Image |
| Veri Kaynagi | Google Sheets API |
| Haber Kaynagi | Google News AI RSS |
| Veritabani | Supabase (PostgreSQL) |
| Bildirim | Telegram Bot API |
| Zamanlama | node-cron |
| Deployment | Docker + Coolify |

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

## Kurallar

- Tum infografikler **TURKCE** (basliklar, etiketler, metrikler dahil)
- LinkedIn skoru **80/100** altindaysa otomatik revize
- Bos metin veya hatali gorselle **ASLA** paylasim yapilmasin
- "Detay icin ilk yorum" gibi cumleler **YOK**
- Her yayin Supabase'e kayit + Telegram'a bildirim

---

© 2026 Botfusions. MIT Lisans.

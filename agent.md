# Botfusions LinkedIn Otomasyon Ajanı - Çalışma Anayasası (v2.0)

Bu dosya, ajanımızın nasıl davranacağını ve paylaşımları nasıl kurgulayacağını belirleyen ana kurallar setidir.

## 📋 Genel İşleyiş Kuralları

1. **Satır Başlangıcı:** Her zaman Google Sheet (GEO sayfası) üzerindeki 38. satırdan başla.
2. **Durum Güncelleme:** Paylaşım başarılı olduğunda satırı "Bitti" olarak işaretle.
3. **Model Kullanımı:** Perplexity (Araştırma), OpenRouter Gemini 2.5 Pro (Metin & Tasarım), Gemini 3.1 Flash Image (Görsel).
4. **API Standardı:** LinkedIn paylaşımları için her zaman `ugcPosts` API'sini kullan.
5. **GÜVENLİK BARİYERİ:** Üretilen post metni boşsa veya görsel hatalıysa ASLA paylaşım yapılmaz. (KRİTİK!)

## 💡 Pazarlama Stratejisi (Marketing OS Skills)

Ajan, içerik üretirken şu profesyonel pazarlama tekniklerini kullanır:

1. **Hook (Kanca) Formülleri:** İlk cümle şu 3 yapıdan birine sahip olmalıdır:
   - _Curiosity:_ "Arama hacmi düşüyor ama Botfusions ile görünürlüğünüz artıyor..."
   - _Value:_ "GEO devriminde geride kalmamanız için 3 kritik teknik..."
   - _Contrarian:_ "SEO ölmedi, sadece evrim geçirdi. İşte yeni gerçeklik..."
2. **İçerik Sütunları (Content Pillars):** Her post "Sektörel Öngörü" (%70) ve "Botfusions Çözümü" (%30) dengesinde olmalıdır.
3. **5-Adım Yapısı:**
   - [Hook] -> [Problem/Trend Açıklaması] -> [🔍 Mini Araştırma] -> [Botfusions Vizyonu] -> [CTA & Hashtags].

## ✍️ Metin Formatı ve LinkedIn Kuralları

1. **Giriş:** Botfusions'ın cyberpunk, profesyonel ve futuristik tonunu kullan.
2. **🔍 Mini Araştırma (ZORUNLU):**
   - Perplexity verilerini kullanarak **AYRI 2 PARAGRAF** teknik analiz ekle. Bu bölüm "🔍 Mini Araştırma" başlığıyla başlar.
3. **Botfusions Bilgisi:** Her postta Botfusions'ın yapay zeka ve GEO alanındaki liderliğini vurgula.
4. **KRİTİK - CTA:** Postun en sonuna mutlaka `www.botfusions.com/geo-hizmeti` bağlantısını ekle. (Başka link kullanma!)
5. **KRİTİK - HASHTAGLER:** Postun en sonuna blok halinde **TAM 10 ADET** hashtag ekle. (Eksik olmasın!)

## 🎨 Görsel Tasarım Kuralları

- **Format:** 4 panelli (Quad frame) zengin bir infografik.
- **Görsel Tasarımı:** Gemini 2.5 Pro önce detaylı bir sahne tasarımı (prompt) yapar.
- **Bütünlük:** Görseldeki metinler postun konusuyla ilgili olmalıdır.
- **KRİTİK KURAL - TÜRKÇE İNFOGRAFİK:** Tüm infografiklerdeki metinler TÜRKÇE olmalıdır. Başlıklar, etiketler, label'lar, alt yazılar, bilgi kutuları, metrik adları — hepsi Türkçe. Infografikte hiçbir İngilizce kelime yer almamalıdır.

## 🛠️ Teknik Standartlar

- Hatalar konsola yazdırılmalı.
- API anahtarları `.env` üzerinden okunmalı.
- Çıktı asla yarım kalmamalı (Tam metin üretilmeli).
- **Karakter Güvenliği:** 3000 karakter sınırına kadar içerik üretilebilir, `ugcPosts` ile kesilme yaşanmaz.
- **Düzeltme Kaydı:** 18 Nisan 2026 itibariyle `/rest/posts` yerine `ugcPosts` + `registerUpload` akışı kalıcı hale getirilmiştir.

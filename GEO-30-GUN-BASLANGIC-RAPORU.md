# 30 günlük kişisel LinkedIn denemesi — başlangıç kaydı

Tarih: 3 Ekim 2026. Son yetkili gün: 1 Kasım 2026. Günlük otomasyon: 09.00 Europe/Istanbul.

Kullanıcı kişisel LinkedIn için yerel API sistemini onayladı. Kurumsal kanallar OmniSocials'ta kalır. X kapalıdır. Mevcut otomasyon güncellendi; ikinci otomasyon oluşturulmadı.

Hesap API userinfo ile Ömer Cenk Tokgöz olarak doğrulandı. Token kayıtlı bitişi 2 Kasım 2026. Bugünkü GEO teknik uygunluk içeriği kişisel LinkedIn'e gönderildi. API geçerli URN döndürdü: urn:li:share:7512171949561794560.

[Gönderi bağlantısı](https://www.linkedin.com/feed/update/urn:li:share:7512171949561794560/)

Durum: api_accepted. Bu kayıt API kabulünü kanıtlar. Dış platform sayfasının bağımsız erişilebilirlik kontrolü yapılmadı. Yeniden paylaşım yapılmayacak.

Kontroller: npm run typecheck, npm run geo:test (5/5), git diff --check geçti. Gerçek X ve eski LinkedIn servisleri kapatma kontrolünde API çağrısı yapmadan null döndürdü. Günlük makbuz tekrar gönderimi engeller. GEO üretim projesinin npm run check ve render doğrulamaları bugünkü ilk çalışmada geçti.

Yeni dosyalar: scripts/geo-linkedin-trial.mjs, scripts/geo-linkedin-trial.test.mjs, src/services/geo_trial_policy.ts, data/geo-trial.json, GEO-30-GUN-DENEME.md. Mevcut x.ts ve linkedin.ts eski yayın yollarına kapatma kontrolü eklendi. Kullanıcının diğer değişiklikleri korundu.

X_PAUSED=true ve eski akış için LINKEDIN_PAUSED=true yerelde ve Supabase env_config'te kaydedildi. Yeni kişisel GEO komutu ayrı deneme yetkisiyle çalışır. Coolify/VPS'e deploy veya uzak süreci yeniden başlatma yapılmadı. Uzak süreç daha önce yüklediği ayarları bellekte tutuyorsa yeni ayarı bir sonraki yüklemede alır; uzak çalışan sürecin durumu doğrulanmadı.

Komut tek PNG/JPEG destekler. Video ve carousel günlerinde kişisel metin+tek görsel türevi hazırlanacak. Kişisel gösterim/profil ziyareti/arama görünümü API'si eklenmedi. Pazar yalnızca mevcut veriler raporlanır. 2 Kasım'da komut kişisel yayın yetkisini reddeder. X ve eski akışlar kendiliğinden açılmaz.

> Güncel durum: GitHub MCP arka ucu daha sonra kuruldu. Canlı imaj artık botfusions-linkedin-geo-trial:2026-10-03-mcp. Ayrıntılar LINKEDIN-MCP-KURULUM-RAPORU.md dosyasında. Aşağıdaki kayıt ilk dağıtımı anlatır.

# GEO kişisel LinkedIn — SSH dağıtım raporu

Doğrulama zamanı: 2026-10-03T19:20:58.910903+03:00 (Türkiye).

## Canlı dağıtım

Belgelenmiş VPS: root@5.182.33.26. Hedef konteyner: dgecwxjms61k579zpew9y0rd-181546513318. Başka uygulamalar değiştirilmedi.

Eski imaj: dgecwxjms61k579zpew9y0rd:10198c4f2d82c696111687b5d5f20e47955e5dcf.
Yeni imaj: botfusions-linkedin-geo-trial:2026-10-03.
İmaj kimliği: sha256:b5f7d1043c306f436221be01501b0d0ce83a056f02a490476526ed4b293ce2aa.

Mevcut Coolify Compose dosyası yedeklendi. Aynı servis yeni imajla yeniden oluşturuldu. Coolify veritabanı değiştirilmedi. GitHub'a push yapılmadı. Kullanıcının ilgisiz yerel değişiklikleri dağıtılmadı.

Kalıcı kayıtlar: /var/lib/botfusions-geo-trial. Token ve deneme ayarları konteynere salt okunur bağlandı. Günlük makbuzlar ve metin/görseller host dizinine bağlı. Gizli anahtarlar dağıtım paketine alınmadı.

## Kontroller

- SSH bağlantısı başarılı.
- Yeni Docker imajında build, typecheck ve beş GEO testi geçti.
- Çalışan konteynerde typecheck ve beş GEO testi tekrar geçti.
- Gerçek X ve eski LinkedIn yayın servisleri API çağrısı yapmadan kapalı döndü.
- Sunucudan LinkedIn userinfo okundu: Ömer Cenk Tokgöz, beklenen hesapla eşleşti.
- Yerel geo:remote SSH/SCP/exec yolu test edildi. Bugünkü makbuz nedeniyle ikinci yayın engellendi. Yeni test gönderisi yayımlanmadı.
- Konteyner yeniden başlatıldı. Makbuz SHA-256'sı önce/sonra aynı kaldı: a8d4c8e38263252be1ce85aaa0633e04c4c2a192d91e27d9b6229eb84154898d.
- Canlı imajdaki 5 kaynak/komut dosyası dağıtım manifestiyle hash üzerinden eşleşti.
- Hedef servisin yeni imajla Running=true olduğu doğrulandı. RestartCount=0.
- Yerel bash -n, typecheck, beş test ve git diff --check geçti.

İlk build eski imajdaki src/linkedin_validator_smoke.ts nedeniyle durdu. Dosya Mac'e özgü /System/Volumes/Data/Hermes yolunu kullanıyor ve sunucudaki eski comment_writer modülünde bulunmayan export'ları istiyordu. Aktif akıştan çağrılmadığı kontrol edildi. Yeni imajda scratch/legacy-diagnostics içine arşivlendi; dosya silinmedi. Ardından build ve testler geçti.

npm ci mevcut kilit dosyasında 8 bağımlılık bulgusu bildirdi (1 düşük, 2 orta, 5 yüksek). Otomatik audit fix veya sürüm yükseltmesi uygulanmadı. Bu dağıtım güvenlik taramasının temiz olduğunu iddia etmez.

## Günlük akış

Mevcut 09.00 Europe/Istanbul Codex otomasyonu güncellendi. İçerik üretimi Codex'te, kişisel yayın SSH üzerinden VPS'te yapılır. Komut: npm run geo:remote -- --captions /mutlak/captions.json --image /mutlak/gorsel.png . İlk çağrı ön kontroldür. Ön kontrol geçtiğinde --publish eklenir. SSH veya imaj etiketi kontrolü başarısızsa yerel yayına dönülmez.

Deneme 1 Kasım dahil sürer. 2 Kasım sonrası kişisel yayın reddedilir. X ve eski akışlar kendiliğinden açılmaz. Makbuz posting/needs_verification ise otomatik retry yapılmaz. Kişisel analitik verileri bu servis tarafından sağlanmaz.

Önemli kapsam: Sunucudaki eski zamanlayıcı süreç başlatıldı fakat eski LinkedIn/X yayın yolları kapalı. Yeni GEO üretiminin tetikleyicisi Codex otomasyonudur; VPS bağımsız GEO içerik üreticisi olarak yapılandırılmadı.

## Geri alma ve yeniden dağıtım

Sunucu release dizini: /opt/botfusions-geo-trial/releases/2026-10-03. Önceki Compose dosyası compose.before.yaml olarak erişimi kısıtlı saklandı. Eski Docker imajı korunuyor. Geri alma gerekirse önce deneme yayınını durdur, eski Compose yedeğini mevcut /data/coolify/applications/dgecwxjms61k579zpew9y0rd/docker-compose.yaml yerine koy ve yalnızca hedef servisi yeniden oluştur. Kullanıcının izni olmadan X'i açma.

Coolify üzerinden GitHub'daki eski sürüme Redeploy yapılırsa GEO imajı değişebilir. geo:remote release etiketini kontrol ettiği için böyle bir durumda yayını durdurur. Gelecek dağıtımda GEO dosyaları korunmalıdır.

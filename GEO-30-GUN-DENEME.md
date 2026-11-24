# Kişisel LinkedIn — 30 günlük GEO denemesi

Kullanıcı onayı: 3 Ekim 2026. Deneme: 3 Ekim–1 Kasım 2026 dahil, Europe/Istanbul. Hesap: Ömer Cenk Tokgöz. 2 Kasım'dan sonra kişisel yayın komutu kapanır. X kapalı kalır. Eski LinkedIn akışları çakışmayı önlemek için kapalıdır; deneme sonunda kendiliğinden açılmaz.

Ana strateji: /Users/cenktk/Documents/ChatGPT/İnstegram  büyüme  @botfusions/GEO-30-gunluk-organik-buyume-plani.md . Güncel kullanıcı yetkisi kişisel LinkedIn için yalnızca OmniSocials kuralının yerine yerel API sistemini getirir. Diğer kurumsal kanallar OmniSocials üzerinden devam eder. X yayınlanmaz. Dokümanlardaki eski oranlar kanıt yerine kullanılamaz.

## Çalıştırma

1. Kaynakları doğrula. Birinci tekil GEO metnini `linkedin_personal` alanı olan JSON dosyasına yaz. En fazla 3 hashtag kullan. Uydurma deneyim veya sonuç yazma.
2. PNG/JPEG üret ve görseli incele. Video/PDF/carousel kişisel yayın komutunda desteklenmez. Bu günlerde ayrı metin+tek görsel türevi hazırla; ana medyayı destek kanalları için sakla.
3. `npm run typecheck` ve `npm run geo:test` çalıştır. GEO üretim klasöründe `npm run check` çalıştır.
4. Ön kontrol: `npm run geo:remote -- --captions /mutlak/captions.json --image /mutlak/gorsel.png`.
5. Ön kontrol geçtiğinde aynı komuta `--publish` ekle. Kullanıcı 30 günlük deneme için doğrudan yayın yetkisi verdi.

Komut hesabı, token süresini, tarih aralığını, görsel çözümlemeyi, Supabase'deki aynı gün eski LinkedIn yayınını ve yerel makbuzları kontrol eder. X servisini çağırmaz. Ağ hatasında paylaşımı otomatik tekrarlamaz. `needs_verification` varsa makbuzu silip yeniden gönderme; önce gerçekleşen yayını doğrula.

`data/geo-trial-receipts/YYYY-MM-DD.json` durumları:
- `posting`: yayın isteğinden hemen önce oluşturuldu.
- `api_accepted`: LinkedIn API geçerli gönderi URN'si döndürdü. URL bu kimlikten oluşturulur. Bağımsız canlı sayfa doğrulaması değildir.
- `needs_verification`: istek sonucu belirsiz veya geçerli kimlik yok. Otomatik retry yasaktır.

## Kapsam ve dağıtım

Denemeyi günlük 09.00 Codex otomasyonu yürütür. 3 Ekim 2026 tarihinde SSH dağıtımı tamamlandı. geo:remote metin ve görseli SCP ile sunucuya yükler, doğrulanan GEO konteynerinde geo:linkedin komutunu çalıştırır. Doğrudan yerel geo:linkedin ile yayınlama. İçerik üretimi ve günlük tetikleme Codex otomasyonunda kalır. X ve eski LinkedIn kapatma kontrolleri çalışan sunucu konteynerinde doğrulandı. Uzak bağlantı başarısızsa yerel yayına dönme.

Pazar raporunda gerçek mevcut veriyi kullan. Bu servis kişisel profil gösterimleri, profil ziyaretleri ve arama görünümünü sağlamaz. Kullanıcı verisi yoksa eksik olarak yaz. 30 günlük sonuçta yayın sayısı, hata/çakışma sayısı ve gerçekten elde edilen etkileşimleri karşılaştır. Üç karşılaştırılabilir deneme olmadan format başarısı ilan etme.

## GitHub MCP arka ucu — 3 Ekim güncellemesi

Orijinal vlpmedialtd/linkedin-mcp reposu integrations/linkedin-mcp içinde kurulu. Günlük geo:remote sunucuda bu reponun linkedin_create_post aracını stdio MCP üzerinden çağırır. backend=linkedin-mcp zorunlu. Sürüm d580c69, Node.js 22. Profil testi: npm run geo:linkedin -- --mcp-check (yalnızca okur). Kişisel gönderi için geo:remote yolunu kullan. Ayrıntılar LINKEDIN-MCP-KURULUM-RAPORU.md dosyasında.

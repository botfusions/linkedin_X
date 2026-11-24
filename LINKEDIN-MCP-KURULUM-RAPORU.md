# LinkedIn GitHub MCP kurulumu — 2026-10-03T22:37:32.728358+03:00

Önceki dağıtım klasördeki mevcut LinkedIn API sistemiydi. Bu koşuda kullanıcı tarafından belirtilen https://github.com/vlpmedialtd/linkedin-mcp.git reposu gerçekten kuruldu ve kişisel yayın arka ucu olarak bağlandı.

## Kurulum kanıtı

Yerel kaynak: integrations/linkedin-mcp. Sunucu kaynak: /opt/botfusions-geo-trial/releases/2026-10-03-mcp/integrations/linkedin-mcp. Kaynak commit d580c695995762db8d02b2f1c83c47317ef5a37e, sürüm 0.2.1. Orijinal repo kaynakları değiştirilmedi. Sunucuda git status temiz.

Canlı imaj: botfusions-linkedin-geo-trial:2026-10-03-mcp. İmaj kimliği sha256:53490868fd105a42dde1eb779e33d6a9f71a53f22ed7c45ea2b7a4c1e598f9e4. Node.js v22.23.3. Hedef konteyner dgecwxjms61k579zpew9y0rd-181546513318; Running=true.

## Yayın bağlantısı

Günlük 09.00 Codex otomasyonu -> scripts/geo-remote.sh (SSH/SCP) -> sunucuda scripts/geo-linkedin-trial.mjs -> MCP SDK stdio istemcisi -> orijinal integrations/linkedin-mcp/dist/index.js -> linkedin_create_post -> LinkedIn API.

Bu, repo klasörünün yalnızca saklanması değildir. Aktif yayın komutu gerçekten MCP araç çağrısını kullanır. data/geo-trial.json backend alanı linkedin-mcp. Yanlış backend seçilirse yayın reddedilir. SSH betiği sunucudaki GitHub commit etiketini kontrol eder. Eski doğrudan API yayınına otomatik fallback yok.

MCP servisi her çağrıda stdio alt süreci olarak açılır ve kapatılır. Ayrı açık HTTP portu veya paylaşılan gizli URL oluşturulmadı. Mevcut token alt sürece yalnızca ortam değişkeniyle verilir; komut argümanına veya log'a yazılmaz. Tarih/token/hesap/günlük makbuz kontrolleri adaptörde korunur.

## Test sonuçları

- Orijinal reponun npm test komutu: 17/17. Lokal ve VPS imaj build aşamasında geçti. LinkedIn yazma API'si bu testlerde mock kullanır.
- GEO adaptörü: 7/7 test. İki ek test gerçek arka uç yolunun linkedin_create_post kişisel çağrısı olduğunu ve yanlış profil/araç hatasının başarı sayılmadığını kontrol eder.
- Yerel ve sunucu build: typecheck geçti. Bash sözdizimi ve git diff --check geçti.
- Gerçek MCP üzerinden linkedin_get_profile çağrısı: Ömer Cenk Tokgöz doğrulandı. Lokal ve canlı VPS'te 9 araç listelendi.
- Çalışan sunucuda config backend=linkedin-mcp, X kapalı, eski LinkedIn kapalı kontrolleri geçti.
- geo:remote yeni GitHub commit etiketi kontrolünden geçti. Bugünkü mevcut makbuz ikinci paylaşımı engelledi.

Bugünkü kişisel gönderi önceki API sistemiyle zaten gönderilmişti. Yeni MCP arka ucuyla ikinci canlı yayın yapılmadı. Repo testleri ve canlı profil okuması, gelecekteki canlı yayın başarısını tek başına kanıtlamaz. Bir sonraki izinli günlük yayın gerçek yazma sonucunu gösterecek.

## Sınırlar

30 günlük yetki 3 Ekim–1 Kasım dahil geçerlidir. X kapalı. Yorum/beğeni/silme MCP araçları otomasyonda kullanılmaz. Repo tek görsel/metin/bağlantı destekler; video/PDF/carousel ve kişisel analitik kısıtları devam eder.

Orijinal repo npm ci bir orta bağımlılık bulgusu bildirdi. Orijinal kilit dosyası değiştirilmedi; audit fix yapılmadı. Önceki ana uygulamanın bağımlılık bulguları ayrıca GEO-SSH-DEPLOY-RAPORU.md içindedir.

Geri alma yedeği: sunucuda /opt/botfusions-geo-trial/releases/2026-10-03-mcp/compose.before.yaml ve config.before.json. Önceki imaj korundu. Coolify eski GitHub sürümüne Redeploy yaparsa SSH sürüm kontrolü yayını durdurur. Onaysız eski yayın yoluna dönüş veya X'i açma yapılmaz.

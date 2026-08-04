import fs from "fs/promises";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";
import type { CapturedPost, WatchedAccount } from "./engagement_scout.js";

dotenv.config();

/**
 * YORUM TASLAĞI ÜRETİCİSİ
 *
 * Ajan LinkedIn'e yorum YAZMAZ. Yalnızca taslak üretir; yayınlama kararı ve
 * eylemi Cenk'e aittir. Kurallar agent.md > "YORUM KURALLARI" bölümünden gelir.
 */

export interface CommentDraft {
  analiz: string;
  acik: string;
  taslaklar: string[];
}

/**
 * YORUM MOTORU — gönderi hattından bilinçli olarak AYRI
 *
 * Gönderi + görsel hattı Gemini/flash kullanıyor ve bu doğru: orada hacim
 * yüksek, token çok, maliyet gerçek bir kısıt (bkz. llm.ts BLOCKED_MODEL_PATTERNS).
 *
 * Yorumda durum tersi:
 *   - Hacim düşük: günde ~3 taslak x 2 varyant ≈ 3.000 token
 *   - Çıktı Cenk'in adıyla, RAKİBİN sayfasında, onun kitlesinin önünde yayınlanıyor
 *   - İş zor: rakibin argümanındaki gerçek açığı bulmak + 90 kelimede AI kalıbına
 *     düşmeden Türkçe yazmak
 *
 * Ucuz modelle yapılan testte (4 Ağu 2026) çıkan hatalar: yanlış isimle hitap
 * ("Berika hanım" — göbek adı), iltifatla açma, 110+ kelime. Üçü de yorumu
 * jenerik LinkedIn yorumuna çeviriyor.
 *
 * TEK ROTA — SONNET 5, YEDEK YOK:
 * Ucuz modele düşmek yorumun tek değerini (kalite) öldürüyor; sessizce
 * gemini'ye düşen bir taslak, taslak üretilmemesinden daha kötü. Anahtar yoksa
 * veya çağrı patlarsa hata fırlatılır; engagement_agent bunu yakalayıp
 * Telegram'a uyarı geçer.
 *
 * NOT: llm.ts'teki model yasak listesi bu dosyayı KAPSAMAZ ve kapsamamalı.
 * Ayrım bilinçlidir, "tutarlılık" adına birleştirmeyin.
 */
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const ANTHROPIC_EFFORT = process.env.ANTHROPIC_EFFORT || "medium";

async function loadRules(): Promise<{ agent: string; yazar: string }> {
  const read = async (p: string) => {
    try {
      return await fs.readFile(path.join(process.cwd(), p), "utf-8");
    } catch {
      return "";
    }
  };
  const [agent, yazar] = await Promise.all([
    read("agent.md"),
    read("skills/turkce-insani-yazar/SKILL.md"),
  ]);
  return { agent, yazar };
}

/** agent.md içinden yalnızca yorum kuralları bölümünü çeker (prompt'u şişirmemek için). */
function extractCommentRules(agentMd: string): string {
  const start = agentMd.indexOf("## 💬 YORUM KURALLARI");
  if (start === -1) return "";
  const rest = agentMd.slice(start);
  const end = rest.indexOf("\n---");
  return end === -1 ? rest : rest.slice(0, end);
}

async function callAnthropic(system: string, user: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY yok");

  const res = await axios.post(
    "https://api.anthropic.com/v1/messages",
    {
      model: ANTHROPIC_MODEL,
      // Sonnet 5'te adaptive thinking varsayılan açık ve max_tokens'ı
      // düşünce + metin PAYLAŞIR; 2000 ile cevap yarıda kesiliyordu.
      // temperature gönderilmez: Sonnet 5 varsayılan dışı değeri 400'ler.
      max_tokens: 8000,
      // effort=medium: varsayılan "high". 55-90 kelimelik iki taslak için
      // high gereksiz token yakıyor; medium ≈ Sonnet 4.6'nın high seviyesi.
      output_config: { effort: ANTHROPIC_EFFORT },
      system,
      messages: [{ role: "user", content: user }],
    },
    {
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      timeout: 60_000,
    },
  );

  const parcalar = res.data?.content ?? [];
  return parcalar
    .filter((p: any) => p.type === "text")
    .map((p: any) => p.text)
    .join("")
    .trim();
}

/** Yorum taslagi icin model cagrisi. Tek rota: Anthropic Sonnet 5. */
async function callModel(system: string, user: string): Promise<string> {
  console.log(`🧠 Yorum modeli: ${ANTHROPIC_MODEL} (Anthropic API)`);
  try {
    return await callAnthropic(system, user);
  } catch (err: any) {
    const detay =
      err.response?.data?.error?.message || err.message || String(err);
    throw new Error(`Yorum modeli çağrısı başarısız (${ANTHROPIC_MODEL}): ${detay}`);
  }
}

/**
 * GÜVENLİK BARİYERİ: Taslakta marka adı geçiyorsa reddedilir.
 * Cenk 3 Ağustos 2026'da bu kuralı "asla" olarak netleştirdi.
 */
const YASAKLI_ADLAR = [
  "botfusions",
  "rankie",
  "populon",
  "aiizle",
  "rankie.ai",
  "botfusions.com",
];

export function containsBrandName(text: string): string | null {
  const lower = text.toLocaleLowerCase("tr-TR");
  for (const ad of YASAKLI_ADLAR) {
    if (lower.includes(ad)) return ad;
  }
  return null;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export async function draftComments(
  post: CapturedPost,
  hesap: WatchedAccount,
): Promise<CommentDraft> {
  const { agent, yazar } = await loadRules();
  const yorumKurallari = extractCommentRules(agent);

  const system = `
Sen Botfusions kurucusu Ömer Cenk Tokgöz adına LinkedIn yorum TASLAĞI hazırlıyorsun.
Yazdığın metin doğrudan yayınlanmayacak; Cenk okuyup kendisi gönderecek.

${yorumKurallari}

━━━ TÜRKÇE YAZIM KURALLARI ━━━
${yazar.slice(0, 4000)}

━━━ AYRIŞMA ZEMİNİ ━━━
Bu pazarda rakiplerin retoriği var, kanıtı yok. Ayrıştığımız yer ölçüm ve atıf:
- Görünürlük skoru artıyor ama "bu bize ne kazandırdı" sorusu cevapsız kalınca bütçe kesiliyor.
- AI'dan gelen ziyaretçiyi siparişe/gelire bağlayamayan marka bu işi sürdüremiyor.
- Bir aksiyonun etkisini ölçemiyorsan öneri listesi işe yaramıyor.
- İçerik ne kadar iyi olursa olsun AI botu siteye uğramıyorsa alıntılanmıyor.
Bunları BİZİM ÜRÜNÜMÜZ olarak DEĞİL, sahada gözlenen gerçekler olarak anlat.

━━━ MUTLAK YASAKLAR (4 Ağu 2026 testinde çıkan hatalar) ━━━
1. KİŞİYE İSMİYLE HİTAP ETME. "X hanım", "Y bey", "Merhaba Z" yazma.
   Gerekçe: göbek adı/soyadı karıştırma riski var, kazancı yok. Testte
   "Atiye Berika Ertaş"a "Berika hanım" denerek göbek adıyla hitap edildi.
2. İLTİFATLA AÇMA. "Harika liste", "Emeğinize sağlık", "Çok değerli paylaşım",
   "Elinize sağlık" gibi açılışlar yasak. Bunlar jenerik LinkedIn yorumunun
   imzasıdır ve yorumu değersizleştirir. Doğrudan katkıya gir.
3. 90 KELİMEYİ GEÇME. Kısa yorum okunur, uzun yorum atlanır.
4. TEK BİR FİKİR SAVUN. İki ayrı katkıyı aynı yoruma sıkıştırma.
5. HİTAP TUTARLI OLSUN. Ya baştan sona nötr (kimseye seslenmeden) ya da
   baştan sona "siz". "Sen" ile "siz" karıştırma.
6. Em dash (—) kullanma; Türkçe akışta iki nokta veya virgül daha doğal durur.

7. ÇEKİNGEN YAZMA. Şu kalıplar YASAK:
   "belki de", "gözlemlediğim kadarıyla", "diye düşünüyorum", "sanırım",
   "gibi görünüyor", "olabilir mi acaba", "maalesef", "bir nevi", "kanaatimce".
   Cenk sahada gördüğünü anlatıyor; gördüğü şeye emin. Net konuş.
   YANLIŞ: "Belki de ilk adım olarak bot erişilebilirliği eklenmeli."
   DOĞRU:  "Listenin başına bot erişilebilirliğini koyardım."

8. ETKEN ÇATI KULLAN. Edilgen yapı kimin yaptığını gizler ve metni cansızlaştırır.
   YANLIŞ: "izlenmemesi", "kontrol edilmediğinde", "eklenmeli", "ölçülmesi gerekir"
   DOĞRU:  "izlemiyoruz", "kontrol etmeyince", "eklerdim", "ölçmek gerekiyor"

9. EN AZ BİR SOMUT ŞEY GEÇSİN. Yorumun içinde okurun tutunabileceği elle
   tutulur bir ayrıntı olmalı: bir dosya adı, bir metrik, bir araç, bir sayı,
   bir süre. Soyut yorum ("izleme mekanizması kurmak gerekir") kimsede iz bırakmaz.
   İYİ ÖRNEK: "robots.txt, site hızı, yapılandırılmış veri hazır değilse liste
   havada kalıyor." / "Sunucu log'larında bot user-agent'larını aratmak beş dakika."

10. İLK CÜMLE İDDİA OLSUN. Hazırlık cümlesiyle açma, doğrudan tezini koy.

━━━ ÇIKTI FORMATI (SADECE JSON) ━━━
{
  "analiz": "Gönderinin ana iddiası, 1-2 cümle",
  "acik": "Gönderide eksik/tartışmalı olan nokta, 1-2 cümle",
  "taslaklar": ["birinci yorum taslağı", "ikinci yorum taslağı"]
}
Başka hiçbir şey yazma. Kod bloğu kullanma.
`.trim();

  const user = `
GÖNDERİYİ YAZAN: ${hesap.ad}${hesap.unvan ? ` — ${hesap.unvan}` : ""}${hesap.kurum ? ` (${hesap.kurum})` : ""}
HESAP NOTU: ${hesap.not ?? "-"}
ETKİLEŞİM: ${post.tepki ?? 0} tepki, ${post.yorum ?? 0} yorum, ${post.paylasim ?? 0} paylaşım

GÖNDERİ METNİ:
"""
${post.metin.slice(0, 3000)}
"""

İki farklı yorum taslağı üret. İkisi de farklı bir açıdan girsin.
Her biri 55-90 kelime olsun. Hiçbir marka adı geçmesin. İsimle hitap etme, iltifatla açma.
`.trim();

  const raw = await callModel(system, user);
  const temiz = raw.replace(/```json|```/g, "").trim();

  let parsed: CommentDraft;
  try {
    parsed = JSON.parse(temiz) as CommentDraft;
  } catch {
    console.error("❌ Yorum taslağı JSON parse edilemedi. Ham çıktı:", temiz.slice(0, 300));
    throw new Error("Yorum taslağı üretilemedi (JSON hatası)");
  }

  // ── GÜVENLİK BARİYERİ ──
  parsed.taslaklar = (parsed.taslaklar ?? []).filter((t) => {
    const marka = containsBrandName(t);
    if (marka) {
      console.warn(`⛔ Taslak reddedildi — marka adı geçiyor ("${marka}").`);
      return false;
    }
    const iltifat =
      /^(harika|muhte[şs]em|\u00e7ok\s+de[ğg]erli|eme[ğg]inize|elinize\s+sa[ğg]l[ıi]k|tebrik|s[uü]per)/i.test(
        t.trim(),
      );
    if (iltifat) {
      console.warn("⛔ Taslak reddedildi — iltifatla açıyor.");
      return false;
    }
    const isimHitap = /\b\w+\s+(han[ıi]m|bey|beyefendi|han[ıi]mefendi)\b/i.test(t);
    if (isimHitap) {
      console.warn("⛔ Taslak reddedildi — isimle hitap ediyor.");
      return false;
    }
    const cekingen =
      /(belki\s+de|g[öo]zlemledi[ğg]im\s+kadar[ıi]yla|diye\s+d[üu][şs][üu]n[üu]yorum|kanaatimce|bir\s+nevi|maalesef|san[ıi]r[ıi]m\s+ki)/i.test(
        t,
      );
    if (cekingen) {
      console.warn("⛔ Taslak reddedildi — çekingen kalıp içeriyor.");
      return false;
    }
    // Sen/siz karisikligi: ayni yorumda iki hitap kullanilmamali.
    // 4 Agu 2026 testinde "izliyor musun" + "takip ediyorsunuz" ayni taslakta cikti.
    const senVar =
      /\b(sen|sana|seni|senin)\b|(m[ıi]s[ıi]n|musun|m[üu]s[üu]n|yorsun|[ıi]yorsun)\b(?!uz)/i.test(t);
    const sizVar = /\b(siz|size|sizi|sizin)\b|(m[ıi]s[ıi]n[ıi]z|musunuz|yorsunuz)\b/i.test(t);
    if (senVar && sizVar) {
      console.warn("⛔ Taslak reddedildi — sen/siz hitabı karışmış.");
      return false;
    }
    const kelime = wordCount(t);
    if (kelime < 30 || kelime > 110) {
      console.warn(`⛔ Taslak reddedildi — uzunluk dışı (${kelime} kelime).`);
      return false;
    }
    return true;
  });

  if (parsed.taslaklar.length === 0) {
    throw new Error("Tüm taslaklar güvenlik bariyerine takıldı");
  }

  return parsed;
}

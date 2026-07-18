/**
 * LinkedIn SSI Yazım Stratejisi Katmanı (linkedin-ssi-strateji.md)
 *
 * İki işi vardır:
 * 1. Her post için içerik sütununu (70-20-10) ve post formatını SİSTEM seçer
 *    ve prompta enjekte eder. Model "her seferinde farklı format seç" talimatını
 *    dinlemiyor (landmark rotasyonundaki aynı ders) — seçimi modele bırakırsak
 *    her post aynı makale şablonuna dönüyor.
 * 2. skills/turkce-insani-yazar/SKILL.md kurallarını yükleyip yazar promptuna verir.
 */

import fs from "fs/promises";
import path from "path";

// ── İçerik Sütunu: 70-20-10 kuralı (SSI Sütun 3) ──

export interface ContentPillar {
  key: "egitici" | "kisisel" | "tanitim";
  label: string;
  weight: number;
  guide: string;
}

const PILLARS: ContentPillar[] = [
  {
    key: "egitici",
    label: "Eğitici / İçgörü (%70)",
    weight: 70,
    guide:
      "Sektörel içgörü ve pratik değer ver. Araştırma verilerini doğal cümlelere yedir, başlıklı 'araştırma bölümü' açma. Botfusions'tan en fazla 1 cümleyle, doğal biçimde bahset. LİNK KOYMA.",
  },
  {
    key: "kisisel",
    label: "Kişisel / Tecrübe (%20)",
    weight: 20,
    guide:
      "Birinci tekil şahıs anlatım: bir gözlem, saha deneyimi, hata veya öğrenilen ders. 'Bence', 'fark ettim ki' gibi kişisel dil kullan. Araştırma verisi sadece deneyimi desteklemek için, en fazla 1-2 rakam. Botfusions'tan bahsetme veya tek cümleyle geç. LİNK KOYMA.",
  },
  {
    key: "tanitim",
    label: "Tanıtım / Botfusions (%10)",
    weight: 10,
    guide:
      "Botfusions çözümünü somut bir problem üzerinden anlat: önce problem ve veri, sonra çözüm. Satış dili değil, vaka dili. Postun sonuna www.botfusions.com/geo-hizmeti bağlantısını ekleyebilirsin (yalnızca bu sütunda link serbest).",
  },
];

/** Ağırlıklı rastgele sütun seçimi — uzun vadede 70/20/10 dağılımı oturur. */
export function pickContentPillar(): ContentPillar {
  const total = PILLARS.reduce((sum, p) => sum + p.weight, 0);
  let roll = Math.random() * total;
  for (const p of PILLARS) {
    roll -= p.weight;
    if (roll <= 0) return p;
  }
  return PILLARS[0]!;
}

// ── Post Formatı Rotasyonu (SSI: format çeşitliliği + dwell time) ──

export interface PostFormat {
  key: string;
  name: string;
  guide: string;
  targetLength: string;
}

const FORMATS: PostFormat[] = [
  {
    key: "deneyim",
    name: "Deneyim Hikayesi",
    guide:
      "Kısa bir sahne/olayla başla (hook = hikayenin en çarpıcı anı). Sonra ne öğrendiğini anlat. Madde işareti ve başlık KULLANMA — akıcı, konuşur gibi paragraflar.",
    targetLength: "600-1100 karakter",
  },
  {
    key: "karsit",
    name: "Karşıt Görüş (Contrarian)",
    guide:
      "Sektörde yaygın bir inanışı ilk cümlede reddet. Sonra 2-3 veriyle neden yanlış olduğunu göster. Kendi net görüşünle bitir. Başlık ve emoji-madde şablonu KULLANMA.",
    targetLength: "700-1200 karakter",
  },
  {
    key: "liste",
    name: "Pratik Liste",
    guide:
      "Hook'tan sonra 3-5 maddelik, bugün uygulanabilir pratik liste. Maddeler kısa ve somut olsun (her biri 1-2 satır). Tek liste yeter, ikinci bir başlıklı bölüm açma.",
    targetLength: "700-1300 karakter",
  },
  {
    key: "vaka",
    name: "Mini Vaka Analizi",
    guide:
      "Gerçek bir örnek/rakam üzerinden kısa analiz: durum → ne değişti → sonuç → çıkarılacak ders. Rakamları cümle içinde ver, tablo/başlık şablonu kurma.",
    targetLength: "800-1400 karakter",
  },
  {
    key: "soru",
    name: "Tartışma Başlatıcı",
    guide:
      "Kısa ve keskin: 2-3 paragraf bağlam + net bir tartışma sorusu. Kendi pozisyonunu belli et ki okuyucu katılsın veya itiraz etsin. Bu format kasıtlı olarak KISADIR.",
    targetLength: "400-800 karakter",
  },
  {
    key: "rehber",
    name: "Nasıl Yapılır",
    guide:
      "Tek bir somut problemi adım adım çöz (3-4 adım). Her adım uygulanabilir olsun. Adımları numarayla ver, süslü başlık bölümleri açma.",
    targetLength: "800-1400 karakter",
  },
];

// Rastgele başlangıç + sırayla ilerleme: aynı süreçte üst üste aynı format gelmez.
let formatIndex = Math.floor(Math.random() * FORMATS.length);

export function pickPostFormat(): PostFormat {
  const format = FORMATS[formatIndex % FORMATS.length]!;
  formatIndex++;
  console.log(`📝 Post formatı (rotasyon): ${format.name}`);
  return format;
}

// ── Türkçe İnsani Yazar skill yükleyici ──

// Skill dosyası okunamazsa (ör. Docker imajına kopyalanmamışsa) kullanılacak öz.
const FALLBACK_HUMAN_RULES = `
YASAKLI AI KALIPLARI (asla kullanma): "Günümüzde...", "önemli bir konudur", "Özetle", "Sonuç olarak", "dikkat edilmesi gereken", "yürütülmektedir", "Öte yandan", "Şüphesiz", "kuşkusuz", "Gerçekten", "hakikaten".
TDK İMLA: de/da bağlacı ayrı ("o da geldi"), ek bitişik ("Ankara'da"). ki bağlacı ayrı ("biliyorum ki"), ek bitişik ("seninki"). mi/mı/mu/mü her zaman ayrı. Özel isme ek kesme işaretiyle. Unvanlar isimden sonra küçük ("Ahmet bey").
İNSANİ YAZIM: "Bence", "sanırım" kullan; görüşünü net söyle; okuyucuyla doğrudan konuş. Kısa cümleler. Etkili olur. Ara sıra uzun cümle. Belirsizliği kabul et ("bu konuda emin değilim").
ANLATIM: "cevapsız bırakıldı" değil "cevapsız kaldı"; "en optimum" değil "optimum"; gereksiz ikileme yok ("görüş ve fikir" değil "görüş").
`.trim();

let cachedHumanRules: string | null = null;

/**
 * skills/turkce-insani-yazar/SKILL.md içeriğini yükler (frontmatter ve
 * şablon satırları temizlenmiş halde). Bir kez okunur, cache'lenir.
 */
export async function loadHumanWriterRules(): Promise<string> {
  if (cachedHumanRules) return cachedHumanRules;
  try {
    const skillPath = path.join(
      process.cwd(),
      "skills",
      "turkce-insani-yazar",
      "SKILL.md",
    );
    const raw = await fs.readFile(skillPath, "utf-8");
    cachedHumanRules = raw
      .replace(/^---[\s\S]*?---\s*/, "") // frontmatter
      .replace(/^.*\$ARGUMENTS.*$/m, "") // skill şablon satırı
      .replace(/^.*Detaylı kurallar için.*$/m, "") // dosya-içi referans linki
      .trim();
    return cachedHumanRules;
  } catch {
    console.warn(
      "⚠️ skills/turkce-insani-yazar/SKILL.md okunamadı, gömülü kurallar kullanılıyor.",
    );
    cachedHumanRules = FALLBACK_HUMAN_RULES;
    return cachedHumanRules;
  }
}

// ── SSI strateji bloğu (yazar promptuna enjekte edilir) ──

/**
 * linkedin-ssi-strateji.md'nin gönderi (Sütun 3 + algoritma katmanı)
 * kurallarını tek prompt bloğu olarak üretir.
 */
export function buildSsiPromptBlock(
  pillar: ContentPillar,
  format: PostFormat,
): string {
  return `
━━━ BUGÜNÜN POST PLANI (SİSTEM SEÇTİ — DEĞİŞTİRME) ━━━
İçerik sütunu: ${pillar.label}
Sütun talimatı: ${pillar.guide}
Post formatı: ${format.name}
Format talimatı: ${format.guide}
Hedef uzunluk: ${format.targetLength} (bu bir POST'tur, makale DEĞİL — uzunluğu formata göre ayarla)

━━━ LİNKEDİN SSI / ALGORİTMA KURALLARI (ZORUNLU) ━━━
1. HOOK: İlk satır tek başına merak uyandırmalı ("Devamını gör" tıklatmalı). Rakam, karşıt iddia veya keskin gözlemle başla. Selamlama ve "**" ile başlama YASAK.
2. DWELL TIME: Kısa paragraflar (1-3 satır), aralarında boş satır. Okuyucuyu sonuna kadar taşıyan bir akış kur — şablon bölümleri değil, tek bir düşünce hattı.
3. YORUM > LIKE: Post, net BİR tartışma sorusuyla bitmeli (okuyucunun deneyimini/görüşünü soran, "yorumlarınızı bekliyorum" gibi jenerik değil).
4. HASHTAG: En sonda 3-5 adet, konuyla birebir ilgili. 10 hashtag SPAM sinyalidir, YASAK.
5. LİNK: Sütun talimatı izin vermiyorsa post içinde link OLMAYACAK (link erişimi düşürür).
6. EMOJİ: En fazla 3-4 adet, doğal duran yerlerde. Her paragrafa/maddeye emoji serpiştirme — bu AI izi bırakır.
7. ŞABLON YASAĞI: "🔍 Mini Araştırma", "📊 Rakamlar ne diyor?", "⚙️ Stratejiler" gibi sabit başlıklı bölümler KURMA. Her post aynı iskeletle çıkmamalı; format talimatı tek yapı kaynağıdır.
`.trim();
}

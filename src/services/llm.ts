import fs from "fs/promises";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";
import { getIstanbulDayPart, type DayPart } from "./weather.js";

dotenv.config();

// API Anahtarları - her çağrıda process.env'den oku (Supabase late-load uyumlu)
function getOpenRouterKey(): string {
  return process.env.OPENROUTER_API_KEY || "";
}
function getPerplexityKey(): string {
  return process.env.PERPLEXITY_API_KEY || "";
}

// ── KESİN KURAL: Opus ve Sonnet modelleri ASLA çağrılmayacak ──
// Kullanıcı açıkça yazmadıkça yalnızca flash/free modeller kullanılır.
const BLOCKED_MODEL_PATTERNS = [
  /opus/i,
  /sonnet/i,
  /claude-4/,
  /claude-3\.5/,
  /claude-3-opus/,
  /claude-3-sonnet/,
  /gpt-4o/,
  /gpt-4-turbo/,
  /o1-/i,
  /o3-/i,
];

function isModelBlocked(model: string): boolean {
  return BLOCKED_MODEL_PATTERNS.some((p) => p.test(model));
}

// ── Retry + Delay yardımcıları ──
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 30_000; // 30 saniye
const INTER_CALL_DELAY_MS = 12_000;  // 12 saniye (OpenRouter çağrıları arası)

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openRouterPost(
  payload: any,
): Promise<any> {
  const key = getOpenRouterKey();
  if (!key) throw new Error("OPENROUTER_API_KEY eksik!");

  if (isModelBlocked(payload.model)) {
    throw new Error(
      `MODEL YASAKLI: "${payload.model}" — Opus/Sonnet modelleri kullanılamaz. Yalnızca flash/free modeller izinlidir.`,
    );
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        payload,
        {
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
        },
      );
      return response;
    } catch (error: any) {
      const status = error.response?.status;
      if (status === 429 && attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * attempt; // 30s, 60s, 90s
        console.warn(
          `⏳ OpenRouter 429 — ${delay / 1000}s bekleniyor (deneme ${attempt}/${MAX_RETRIES})...`,
        );
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
}

/**
 * 1. Adım: Perplexity ile Canlı, Güncel Online Araştırma Yapma
 */
export async function researchTopicWithPerplexity(
  topic: string,
): Promise<string> {
  const PERPLEXITY_API_KEY = getPerplexityKey();
  if (!PERPLEXITY_API_KEY) {
    console.warn("⚠️ Uyarı: PERPLEXITY_API_KEY tanimli degil.");
    return `Bilgi bulunamadı. Lütfen '${topic}' hakkında genel geçer bilgileri kullan.`;
  }

  try {
    console.log(`🔍 Perplexity Üzerinde Araştırılıyor: ${topic}`);

    const response = await axios.post(
      "https://api.perplexity.ai/chat/completions",
      {
        model: "sonar",
        messages: [
          {
            role: "system",
            content:
              "Sen son derece detaylı araştırma yapan ve güncel, kesin istatistiksel, analitik teknoloji bilgileri derleyen bir uzmansın.",
          },
          {
            role: "user",
            content: `Bana şu konu hakkında detaylı bir LinkedIn paylaşımı için ham, analitik veri ve güncel gelişmelerden bahset: ${topic}. Sadece profesyonel bilgiyi ver, selamlama yapma.`,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    const researchData = response.data.choices[0].message.content;
    console.log(`✅ Araştırma Tamamlandı.`);
    return researchData;
  } catch (error: any) {
    console.error("❌ Perplexity Araştırma Hatası:", error.message);
    throw error;
  }
}

function cleanJsonString(str: string): string {
  // Remove markdown code blocks if present
  let cleaned = str
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  // Find the first { and last }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  // Remove truly problematic control characters (0-31) except \n, \r, \t
  // A simpler approach that often works for LLM outputs:
  cleaned = cleaned.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");

  // Fix invalid Unicode escape sequences: \u not followed by exactly 4 hex digits
  // LLM sometimes generates broken escapes like \u00b (missing digit) or \uİstanbul
  cleaned = cleaned.replace(/\\u(?![0-9a-fA-F]{4})/g, "u");

  return cleaned;
}

/**
 * 2. Adım: Multi-Agent İçerik Üretimi
 * LinkedIn Ajanı ve Antigravity (X) Ajanı beraber çalışır.
 */
export async function generateContentWithGemini(
  topic: string,
  researchData: string,
  customSystemPrompt?: string,
): Promise<{
  postText: string;
  xPost: string;
  infographicData: any;
}> {
  let agentRules = "";
  try {
    const agentPath = path.join(process.cwd(), "agent.md");
    agentRules = await fs.readFile(agentPath, "utf-8");
  } catch (err) {
    console.warn("⚠️ agent.md bulunamadı.");
  }

  try {
    console.log(`🧠 Dual-Agent İçerik Motoru Tetiklendi...`);

    const defaultSystemPrompt = `
      Sen, Botfusions otonom sisteminin İÇERİK KOORDİNATÖRÜSÜN. İki farklı platform için iki farklı ajan kimliğiyle içerik üreteceksin.

      ━━━ AJAN 1: LİNKEDİN UZMANI (The Professional) ━━━
      Kişilik: Stratejik, veri odaklı, kurumsal ama samimi.
      Görev: LinkedIn için 300 kelimelik, GEO uyumlu, profesyonel makale/post hazırlar.
      Kurallar: agent.md'deki tüm kurallara uyar. TÜM METİN TÜRKÇE OLMALIDIR.

      ━━━ AJAN 2: X VİZYONERİ (Antigravity Agent) ━━━
      Kişilik: Cyberpunk, vizyoner, "Her baytta hassasiyet" felsefesini savunan teknoloji lideri.
      Görev: X (Twitter) için kısa, etkili ve merak uyandırıcı post hazırlar. Max 3 hashtag. TÜM METİN TÜRKÇE OLMALIDIR.

      ━━━ X ALGORİTMA KURALLARI (Phoenix Transformer Bulguları) ━━━
      1. REPLY RATE EN ÖNEMLİ: P(reply) en yüksek ağırlıklı prediksiyon. Her posta en az 1 soru sor.
      2. HOOK KRİTİK: İlk 70 karakter algoritmanın karar verdiği alan. Rakam, soru veya çarpıcı iddia ile başla.
      3. SHOW MORE STRATEJİSİ: 258+ karakter "Show more" tetikler, dwell time artar. 280-600 karakter ideal.
      4. MEDIA-FIRST: Her posta görsel eklenir (sistem otomatik ekler). Metinde görsel iması olsun.
      5. HASHTAG: Max 3 hashtag. 4+ spam riski ve algoritma cezası.
      6. NEGATİF SİNYALLER YASAK: "RT et", "takip et", "beğen", clickbait kelimeler P(block_author) artırır.
      7. EMOJİ: 1-3 emoji ideal. Çok fazla emoji engagement düşürür.

      ━━━ TÜRKÇE İNSANİ YAZIM KURALLARI ━━━
      1. TDK İMLA: de/da, ki, mı/mi hatasız. Unvanlar küçük harf.
      2. YASAKLI AI: "Günümüzde", "Önemli bir konudur", "Özetle", "Sonuç olarak".
      3. KESİN KURAL: Hiçbir İngilizce terim veya slogan (Precision in every byte gibi) metin içinde İngilizce olarak yer almamalıdır. Her şey Türkçe olmalıdır.

      ━━━ VISUAL STYLE ROTATION (CRITICAL) ━━━
      Her paylasimda su 4 stilden birini RASTGELE sec ve promptu ona gore hazirla:
      1. BLUEPRINT: Deep navy background, white clinical lines, engineering look.
      2. CYBERPUNK: Dark mode, neon cyan/magenta accents, glowing nodes.
      3. MINIMALIST: Clean white background, premium typography, gold connectors.
      4. 3D MATRIX: 3D floating modules, glass tubes, professional lighting.

      ━━━ ÇIKTI FORMATI (JSON) ━━━
      Cevabını SADECE şu JSON formatında ver:
      {
        "linkedinPost": "Metin",
        "xPost": "Vurucu X Metni",
        "infographicData": {
          "title": "İnfografik Başlığı (Türkçe)",
          "style": "blueprint | cyberpunk | minimalist | 3d",
          "keyStats": [
            {"label": "Etiket 1", "value": "Değer"},
            {"label": "Etiket 2", "value": "Değer"},
            {"label": "Etiket 3", "value": "Değer"},
            {"label": "Etiket 4", "value": "Değer"}
          ]
        }
      }
    `;

    const finalSystemMessage = customSystemPrompt || defaultSystemPrompt;

    const response = await openRouterPost({
      model: "google/gemini-3.5-flash",
      messages: [
        {
          role: "system",
          content:
            finalSystemMessage +
            (agentRules ? `\n\nEk Kurallar:\n${agentRules}` : ""),
        },
        {
          role: "user",
          content: `Konu: ${topic}\nAraştırma: ${researchData}\n\nCevabı sadece JSON olarak döndür.`,
        },
      ],
      max_tokens: 6000,
      temperature: 0.7,
    });

    const responseText = response.data.choices[0].message.content;
    const jsonString = cleanJsonString(responseText);

    const compiledData = JSON.parse(jsonString);
    return {
      postText: compiledData.linkedinPost,
      xPost: compiledData.xPost,
      infographicData: compiledData.infographicData,
    };
  } catch (error: any) {
    console.error("❌ OpenRouter Hatası:", error.message);
    throw error;
  }
}

export async function generateShortContentWithGemini(
  researchData: string,
  systemPrompt: string,
) {
  try {
    const finalSystemPrompt = `
      ${systemPrompt}

      ━━━ ÖNEMLİ KURALLAR ━━━
      1. LİNKEDİN VE X (TWITTER) METİNLERİ BİRE BİR AYNI OLMALIDIR.
      2. Metin kısa, öz ve etkileyici olmalıdır.
      3. Verilen hava durumu verilerini (sıcaklık, hissedilen, nem vb.) mutlaka kullan.
      4. SICAKLIK DEĞERLERİNİ ASLA ONDALIKLI YAZMA. SADECE TAM SAYI KULLAN (Örn: 13°C, 14 derece).
      5. Profesyonel ve vizyoner bir dil kullan.
      6. Tüm metin TÜRKÇE olmalıdır.

      ━━━ ÇIKTI FORMATI (JSON) ━━━
      Cevabını SADECE şu JSON formatında ver:
      {
        "linkedinPost": "Hazırlanan metin (X ile aynı olmalı)",
        "xPost": "Hazırlanan metin (LinkedIn ile aynı olmalı)"
      }
    `;

    // JSON parse hatası (Unterminated string vb.) için retry mekanizması.
    // Gemini bazen kaçışsız tırnak veya yarım string üretiyor; tek hata tüm akışı çökertmesin.
    const PARSE_MAX_RETRIES = 3;
    let lastParseError: any = null;
    let lastResponseText = "";

    for (let attempt = 1; attempt <= PARSE_MAX_RETRIES; attempt++) {
      const retryHint =
        attempt === 1
          ? ""
          : `\n\nÖNEMLİ: ÖNCEKI DENEMEDE JSON BOZUKTU (unterminated string / escape hatası). Lütfen ÇOK DİKKATLİ ol: metin içindeki çift tırnakları (") mutlaka \\" olarak kaçır (escape), string değerlerini tek satırda tut ve kaçış dizilerini (\\n, \\", \\\\) doğru kullan. linkedinPost ve xPost alanları TAMAMEN AYNI metni içermelidir.`;

      const response = await openRouterPost({
        model: "google/gemini-3.5-flash",
        messages: [
          {
            role: "system",
            content:
              finalSystemPrompt +
              "\n\nÖnemli: JSON içinde tırnak işaretlerini ve yeni satırları doğru şekilde kaçır (escape). linkedinPost ve xPost alanları TAMAMEN AYNI metni içermelidir." +
              retryHint,
          },
          {
            role: "user",
            content: `Güncel Bilgi: ${researchData}\n\nLütfen sadece istenen JSON objesini döndür.`,
          },
        ],
        // gemini-3.5-flash reasoning modelidir; düşünme token'ları max_tokens'tan düşer.
        // 2000'de reasoning bütçeyi aşıp JSON'u yarıda kesiyordu (retry boşuna 3 kez deniyordu).
        // Kök neden: retry'nin yorumundaki "token artır" niyetini burada uyguluyoruz.
        max_tokens: 6000,
        temperature: attempt === 1 ? 0.1 : 0.0, // Retry'de deterministik
      });

      const choice = response.data.choices[0];
      const responseText = choice.message.content;
      const jsonString = cleanJsonString(responseText);
      lastResponseText = responseText;

      if (choice.finish_reason !== "stop") {
        console.warn(
          `⚠️ Uyarı: LLM tamamlama sebebi: ${choice.finish_reason} (deneme ${attempt}/${PARSE_MAX_RETRIES})`,
        );
        // Truncation (length) ise token artırarak tekrar dene
        if (choice.finish_reason === "length") {
          lastParseError = new Error(
            `Yanıt kısaltıldı (finish_reason=length) — token limiti yetmedi.`,
          );
          if (attempt < PARSE_MAX_RETRIES) {
            await sleep(INTER_CALL_DELAY_MS);
            continue;
          }
        }
      }

      try {
        const parsed = JSON.parse(jsonString);
        if (attempt > 1) {
          console.log(`✅ JSON parse deneme ${attempt}/${PARSE_MAX_RETRIES}'de başarılı.`);
        }
        return parsed;
      } catch (e: any) {
        lastParseError = e;
        console.warn(
          `⚠️ JSON Parse Hatası (deneme ${attempt}/${PARSE_MAX_RETRIES}): ${e.message}`,
        );
        console.error("📄 Ham Yanıt:", responseText);
        console.error("🧼 Temizlenmiş String:", jsonString);
        if (attempt < PARSE_MAX_RETRIES) {
          console.log(`🔁 JSON yeniden üretiliyor (deneme ${attempt + 1})...`);
          await sleep(INTER_CALL_DELAY_MS);
          continue;
        }
      }
    }

    // Tüm denemeler başarısız — son hatayı fırlat
    console.error("❌ JSON Parse tüm denemelerden sonra başarısız.");
    console.error("📄 Son Ham Yanıt:", lastResponseText);
    throw lastParseError ?? new Error("JSON parse başarısız");
  } catch (error: any) {
    console.error("❌ Kısa İçerik Hatası:", error.message);
    throw error;
  }
}

export async function generateOptimizedImagePrompt(
  researchData: string,
  basePrompt: string,
) {
  try {
    await sleep(INTER_CALL_DELAY_MS); // Önceki OpenRouter çağrısıyla araya delay
    const now = new Date();
    const formattedDate = now.toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
    });

    // NOTE: Hava durumu görsel estetiği "Cinematic Glass Etched" stilindedir.
    // Metinler küçük (%15 alan), medium-weight kalınlıkta ve cam üzerine doğrudan işlenmiş (box/container olmadan) olmalıdır.
    // 30 derece üstünde gökyüzü her zaman güneşli ve altın sarısı ışıklı olmalıdır.
    const systemPrompt = `
Sen profesyonel bir görsel prompt mühendisisin. 

**GÖREV:**
A majestic, high-fidelity cinematic photograph of Istanbul. A panoramic view through a window from a premium, cozy indoor office setting, looking towards [LANDMARK] in the distance. The lighting and sky MUST strictly match: [ATMOSPHERE_DESCRIPTION]. Small, elegant, and discreet weather data overlay FLOAT directly on the window pane, displaying 'İSTANBUL', the current temperature [TEMP]°C, and a minimalist [DYNAMIC_WEATHER_ICON]. The text and icons must be SMALL and occupy NO MORE than 15% of the window area. ABSOLUTELY NO BOXES, NO RECTANGLES, NO SEMI-TRANSPARENT BACKDROPS, NO CONTAINERS. The data MUST be rendered as if individual letters are etched directly into the glass or as a very subtle, faint digital projection without any background shape. ONLY THE WEATHER DATA SPECIFIED IS ALLOWED. NO OTHER LABELS, TITLES, OR ANNOTATIONS. The UI must be medium-weight (not thin), sophisticated, and NOT obstruct the view. Professional color grading, 8k resolution, photorealistic. --ar 1:1

**KURALLAR:**
1. SADECE İNGİLİZCE PROMPT döndür.
2. [LANDMARK] kısmını İstanbul'un ikonik ve tarihi mekanlarından (Bosphorus Bridge, Maiden's Tower, Hagia Sophia, Blue Mosque, Rumeli Fortress veya Bosphorus view with ferries) birini rastgele seçerek doldur. GALATA TOWER KULLANMA. Her seferinde farklı mekanlar seçmeye çalış.
3. [DYNAMIC_WEATHER_ICON] kısmını verideki duruma göre (rain icon, sun icon, cloud icon vb.) doldur.
4. [TEMP] kısmına güncel sıcaklığı yaz.
5. [ATMOSPHERE_DESCRIPTION] kısmını hava durumuna göre detaylandır (Örn: 'bright blue sky with golden sunlight' if clear, 'bright blue sky with fluffy white aesthetic clouds and golden sunlight' if cloudy, 'cinematic dark sky with heavy rain and water droplets on glass' if rainy).
6. EĞER HAVA 'AÇIK' (CLEAR) VEYA 'GÜNEŞLİ' İSE: Kesinlikle yağmur damlaları, bulut veya kasvetli hava OLMASIN. Gökyüzü masmavi, parlak ve güneşli olsun. Pencere camı TEMİZ ve kuru olsun, asla su damlaları olmasın. Altın sarısı gün ışığı odaya süzülsün.
7. EĞER HAVA 'BULUTLU' VEYA 'PARÇALI BULUTLU' İSE: Hava hala AYDINLIK ve FERAH olsun. Gökyüzü masmavi kalsın ama üzerinde estetik beyaz bulutlar olsun. Güneş ışığı bulutların arasından parlasın (golden hour or bright daylight). Kasvetli veya gri bir hava ASLA olmasın.
8. EĞER HAVA 'YAĞMURLU' İSE: O zaman pencerede su damlaları ve yağmur efekti olsun, hava daha dramatik ve sinematik bir tonda (cool blue or moody grey) olabilir.
9. KRITIK: TUM ARAYUZ METINLERI TURKCE OLMALIDIR. "Nem", "Ruzgar Hizi", "Hissedilen" gibi Turkce terimler kullan.
10. TEK BİR PARAGRAF olarak çıktı ver.
11. Hiçbir giriş cümlesi (İşte promptunuz vb.) veya açıklama EKLEME. Sadece promptu döndür.
12. Mutlaka --ar 1:1 ifadesini koru.
13. FONT WEIGHT: Yazıların font kalınlığı "semi-bold" veya "medium" olmalıdır (çok ince olmamalıdır), ancak genel boyut hala küçük kalmalıdır. Okunabilirliği %10-20 oranında artıracak bir kalınlık tercih et.
`;

    const response = await openRouterPost({
      model: "google/gemini-3.5-flash",
      messages: [
        {
          role: "system",
          content:
            systemPrompt +
            "\n\nZORUNLU: Tüm şablonu eksiksiz doldur. Cümleyi yarım bırakma. Sonuna mutlaka Türkçe özetini ekle.",
        },
        {
          role: "user",
          content: `**Zaman:** ${formattedDate}\n**Hava Verisi:** ${researchData}\n\nLütfen promptu oluştur.`,
        },
      ],
      // gemini-3.5-flash reasoning modelidir; 1000 max_tokens promptu yarıda kesebilir.
      max_tokens: 4000,
      temperature: 0.3,
    });

    let result = response.data.choices[0].message.content.trim();
    result = result.replace(/^["']|["']$/g, "");

    // Debug için dosyaya kaydet
    const scratchDir = path.join(process.cwd(), "scratch");
    try {
      await fs.access(scratchDir);
    } catch {
      await fs.mkdir(scratchDir, { recursive: true });
    }
    await fs.writeFile(path.join(scratchDir, "last_prompt.txt"), result);

    return result;
  } catch (error: any) {
    console.error("❌ Prompt Optimizasyon Hatası:", error.message);
    return basePrompt;
  }
}

/**
 * Gün vaktine göre ışık betimi (TIME_LIGHTING). Europe/Istanbul saatinden
 * deterministik hesaplanır → gece her zaman gece ışığı, sabah her zaman şafak.
 * Model tahminine bırakılmaz; resolve edilip prompta birebir enjekte edilir.
 */
const TIME_LIGHTING_BY_PART: Record<DayPart, string> = {
  sabah:
    "soft early-morning light, gentle pink and golden dawn glow, a low warm sun casting long soft shadows, dewy fresh atmosphere",
  gündüz:
    "bright clear midday daylight, high sun, vivid blue sky, crisp sharp shadows",
  akşam:
    "warm golden-hour sunset light, deep orange and amber glow, sun low on the horizon, dramatic long shadows",
  gece:
    "nighttime, deep dark-blue sky, a glowing moon and faint stars, glittering warm city lights and bridge reflections on the Bosphorus water, cozy warm glow from an interior lamp",
};

// Landmark rotasyonu: günün tarihine göre DETERMİNİSTİK (her gün farklı, tekrar yok).
// Model "her seferinde farklı mekan" talimatını dinlemeyip sürekli Kız Kulesi üretiyordu;
// bu yüzden mekanı BİZ seçip prompta enjekte ediyoruz, modele bırakmıyoruz.
const LANDMARKS = [
  "the Bosphorus Bridge (Boğaziçi Köprüsü) with ferries crossing below",
  "Hagia Sophia and the Sultanahmet mosque skyline",
  "the Blue Mosque with its cascading domes and six slender minarets",
  "Rumeli Fortress (Rumeli Hisarı) rising on the Bosphorus shore",
  "a lively Bosphorus shoreline with ferries and wooden waterfront yalı houses",
  "the Maiden's Tower (Kız Kulesi) on its small islet",
];
function landmarkForDate(now: Date): string {
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return LANDMARKS[dayOfYear % LANDMARKS.length]!;
}

/**
 * Hava durumu görseli için YALNIZCA atmosferik arka plan promptu üretir.
 * KRİTİK: promptta hava verisi (sıcaklık rakamı, durum etiketi, ikon, overlay/UI)
 * ASLA bulunmaz — bu veriler deterministik olarak (weather_overlay.ts) görselin
 * üzerine yazılır. Böylece görsel modeli rakam/metin yanlış render edemez.
 * Saat-bilinçlidir: gün vaktine (sabah/gündüz/akşam/gece) göre ışık enjekte eder.
 */
export async function generateWeatherBackgroundPrompt(
  researchData: string,
  basePrompt: string,
): Promise<string> {
  try {
    await sleep(INTER_CALL_DELAY_MS); // Önceki OpenRouter çağrısıyla araya delay

    // Gün vaktini çöz (Europe/Istanbul) ve ışık betimini enjekte et.
    // Model seçmez, BİZ veririz → gece her zaman gece ışığı. Saat tahmine bırakılmaz.
    const { part, timeStr } = getIstanbulDayPart();
    const chosenLandmark = landmarkForDate(new Date());
    console.log(`📍 Görsel landmark (tarih-bazlı, deterministik): ${chosenLandmark}`);
    const timeLighting = TIME_LIGHTING_BY_PART[part];
    console.log(
      `🕐 Görsel gün-vakti: ${timeStr} → ${part} | ışık: "${timeLighting.slice(0, 40)}..."`,
    );

    const systemPrompt = `
Sen profesyonel bir görsel prompt mühendisisin.

**GÖREV:**
A panoramic, high-fidelity cinematic photograph looking THROUGH a large dark-wooden window from a premium, cozy indoor office in Istanbul, out at [LANDMARK] across the Bosphorus. Warm lived-in interior in the foreground: a brown leather armchair, a wooden desk with a steaming glass of Turkish tea, stacked books, and a small potted plant on the windowsill. The natural lighting and sky MUST strictly match: [TIME_LIGHTING]. [WEATHER_ELEMENT]. Pure professional photography, ultra realistic, 8k. --ar 1:1

**KURALLAR:**
1. SADECE İNGİLİZCE PROMPT döndür.
2. [LANDMARK] değerini KURAL 3'te verdiğim mekan olarak kullan (günün tarihine göre seçildi, tekrar yok). Kendi mekanını RASTGELE SEÇME. GALATA TOWER ASLA KULLANMA.
3. [TIME_LIGHTING] YERİNE birebir şunu yaz (DEĞİŞTİRME): "${timeLighting}". Bu, günün vaktini (şu an İstanbul saatiyle ${timeStr} → ${part}) belirler; gökyüzü rengi ve ışık TAMAMEN bundan gelir. [LANDMARK] YERİNE de birebir şunu yaz (DEĞİŞTİRME, BAŞKA MEKAN SEÇME, GALATA TOWER ASLA): "${chosenLandmark}". Bu mekan günün tarihine göre seçildi; modelin kendi seçimi YOK.
4. [WEATHER_ELEMENT] kısmını hava verisine göre doldur:
   - AÇIK/GÜNEŞLİ: completely clear sky, no clouds at all.
   - BULUTLU/PARÇALI BULUTLU: aesthetic fluffy white clouds drifting across the sky, light peeking through. NOT grey/gloomy.
   - YAĞMURLU: realistic rain, wet streets and water droplets on the window glass, cinematic moody tone.
   - KAR: light snow falling, white snow blanketing rooftops and the windowsill.
5. ÇELİŞKİ KURALI (ÇOK KRİTİK): gökyüzü RENGİ ve ana ışık her zaman [TIME_LIGHTING] tarafından belirlenir. Eğer vakit AKŞAM veya GECE ise gökyüzü ASLA "bright blue sky" olamaz — sırasıyla turuncu/amber gün batımı veya koyu lacivert gece gökyüzü olsun. Hava durumu yalnızca bulut/yağmur/kar ekler; gökyüzü rengini VEYA gece/gündüz olmasını ASLA değiştirmez.
6. TEK PARAGRAF. Giriş/açıklama yok. --ar 1:1 koru.

**YASAK (ÇOK KRİTİK - görsel modeli yazı çizmeye meyillidir, DİKKATLE OKU):**
- FOTOĞRAFTA HİÇBİR YAZI OLMASIN: metin, rakam, sayı, harf, logo, watermark, tabela, reklam panosu, işaret etiketi YOK.
- FİZİKSEL ahşap pencere çerçevesi VE cam VARDIR (kompozisyonun parçası) — ANCAK camda HİÇBİR dijital arayüz, HUD, overlay, bilgi kutusu, dijital ekran, grafik, ikon, düğme, UI elementi, harita, sıcaklık göstergesi OLMASIN. Cam TAMAMEN BOŞ ve şeffaf olsun.
- Hava verileri (sıcaklık vb.) sonradan AYRI ve deterministik bir katman olarak eklenecek; prompt bunu ASLA içermesin.
- Promptta "text/overlay/interface/HUD/display/UI/screen/label/number/degree/temperature/sign/widget" kelimeleri ASLA geçmesin. ("window/glass/frame/pencere/cam" SERBESTTİR — fiziksel kompozisyon için.)
`;

    const response = await openRouterPost({
      model: "google/gemini-3.5-flash",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: `**Hava Verisi:** ${researchData}\n\n**Gün Vakti (İstanbul ${timeStr}):** ${part}\n\nLütfen yalnızca atmosferik pencere-manzara arka plan promptunu oluştur (fiziksel pencere var, ama TAMAMEN METİNSİZ — hiçbir dijital hava verisi yazısı yok). [TIME_LIGHTING] yerine verdiğim betimi birebir kullan.`,
        },
      ],
      // gemini-3.5-flash reasoning modelidir; yeterli bütçe.
      max_tokens: 4000,
      temperature: 0.3,
    });

    let result = response.data.choices[0].message.content.trim();
    result = result.replace(/^["']|["']$/g, "");
    return result;
  } catch (error: any) {
    console.error("❌ Background Prompt Hatası:", error.message);
    return basePrompt;
  }
}

export async function generateImageWithGemini(
  prompt: string,
  opts: { raw?: boolean } = {},
): Promise<string> {
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  if (!GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY eksik!");

  const TURKISH_RULE = `
KRITIK KURALLAR (REFERANS STIL):
1. STIL: FOTOREALISTIK cinematic photograph (8k). ASLA vektor, flat illustration, cizgi roman, 2D illustrasyon veya dijital cizim yapma — gercek bir fotograf gibi olsun.
2. KOMPOZISYON: Agac pencere cercevesinden disari bakis. Pencere altinda/pervazinda ofis detaylari (ahsap masa, kitaplar, kahve veya cay bardagi, saksi bitkisi, deri koltuk). Arkada Istanbul landmark'i (Hagia Sophia, camiler, Kiz Kulesi, Bogaz ve feribotlar).
3. HAVA ARAYUZU: Bilgiler DOGRUDAN CAMA ISLENMIS (overlay) olsun — KUTU/CONTAINER YOK, arka plan SEKLI YOK, siyah/koyu serit YOK. Yazilar ince beyaz, camsi, yari saydam; semi-bold, okunakli. 'ISTANBUL' ve sicaklik (ornegin 20°C) BUYUK ve kalin; Nem, Ruzgar Hizi, Hissedilen bilgileri kucuk ve ince.
4. IKONLAR: sade, minimal, cizgisiz (flat vektor ikon DEGIL) — cam etching hissi veren ince beyaz ikonlar.
5. Tum metinler TURKCE. Asla yazim hatasi yapma. Turkce karakterleri dogru kullan (ş, ğ, ı, İ, ö, ü, ç).
6. Atmosfer isigi hava durumuna uysun (aciksa gunesli altin isik, yagmurluysa camda su damlalari).
`;

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-image:generateContent?key=${GOOGLE_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: opts.raw
                  ? `${prompt}\n\nOutput resolution: 1024x1024 pixels (1K).`
                  : `${prompt}\n\nOutput resolution: 1024x1024 pixels (1K).\n\n${TURKISH_RULE}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      },
      { headers: { "Content-Type": "application/json" }, timeout: 180_000 },
    );

    if (!response.data?.candidates?.[0]?.content?.parts) {
      console.error(
        "❌ Gemini API Yanıt Yapısı Hatalı:",
        JSON.stringify(response.data, null, 2),
      );
      throw new Error("Görsel verisi alınamadı.");
    }

    const part = response.data.candidates[0].content.parts.find(
      (p: any) => p.inlineData,
    );
    if (!part) {
      console.error(
        "❌ Gemini API Yanıtında inlineData bulunamadı:",
        JSON.stringify(response.data.candidates[0].content, null, 2),
      );
      throw new Error("Görsel verisi (inlineData) bulunamadı.");
    }

    const base64Image = part.inlineData.data;
    return base64Image;
  } catch (error: any) {
    console.error(
      "❌ Görsel Üretme Hatası:",
      error.response?.data || error.message,
    );
    throw error;
  }
}

export async function generateNewsContent(
  title: string,
  content: string,
): Promise<{
  linkedinPost: string;
  xPost: string;
  infographicData: any;
}> {
  const systemPrompt = `
Sen Botfusions'in otonom sistemisin. Verilen haber icin LinkedIn ve X platformlarina TURKCE icerik ureteceksin.

━━━ LINKEDIN FORMATI (ZORUNLU YAPI) ━━━

1. SATIR - HOOK: Provokatif soru + emoji (ornek: "%180 dönüşüm artışı mümkün mü? 🚀")
2. KISA ACIKLAMA: Haberi 1-2 cumleyle ozetle
3. KARSILASTIRMA OKLARI: "Geleneksel X → Yeni durum" seklinde → ok kullan
4. 📊 RAKAMLAR NE DIYOR? basligi:
   → Istatistik 1 (yuzde/rakam ile)
   → Istatistik 2
   → Istatistik 3
   → Istatistik 4
5. ⚙️ STRATEJILER basligi:
   ✅ Madde 1
   ✅ Madde 2
   ✅ Madde 3
   ✅ Madde 4
   ✅ Madde 5
6. 📌 NE ICIN SIMDI? basligi: 2-3 satir aciklama
7. 👇 Yorumlariniza bekliyorum!
8. TAM 10 ADET hashtag (blok halinde)

BOTFUIONS: Icerigin %30'unda Botfusions AI cozumlerinden bahset (dogal sekilde).
GEO ODAKLI: Istatistik, veri, rakam kullan. Halusinasyon YASAK - sadece verilen haber verisini kullan.
TDK IMLA: de/da, ki, mi kurallarina uy.
1900-2500 karakter arasi.

ORNEK FORMAT:
%180 dönüşüm artışı mümkün mü? 🚀
AEO ile 2026 itibarıyla yapay zeka platformlarında görünürlük kazanmanın yolu değişiyor.
Geleneksel SEO → Google'da üst sıra
AEO → AI yanıtlarında otorite
📊 Rakamlar ne diyor?
→ AI aramalarının %35'i doğrudan cevapla yanıtlanıyor
→ Kullanıcıların %68'i linklere değil AI snippet'lere tıklıyor
→ SEO'ya bağımlı siteler trafik kaybediyor
⚙️ Stratejiler:
✅ E-E-A-T güçlendirme
✅ Yapısal veri kullanımı
📌 Neden şimdi?
2026'da pazar payı %50'ye ulaştı.
👇 Yorumlarınızı bekliyorum!
#AEO #SEO #YapayZeka #DijitalPazarlama #Teknoloji #Pazarlama

━━━ X (TWITTER) İÇERIGI ━━━
- 258-600 karakter arasi (Show more tetiklenir → dwell time artar)
- Kisa, vurucu, merak uyandiran
- Max 3 hashtag (4+ spam riski)
- Ayni haberin Twitter versiyonu
- EN AZ 1 SORU SOR (reply rate = en guclu algoritma sinyali)
- Ilk 70 karakter hook: rakam, soru veya carpici iddia ile basla
- Spam trigger YASAK: "RT et", "takip et", "beğen" gibi kelimeler P(block_author) artirir
- 1-3 emoji ideal

━━━ GORSELIK PROMPTU (INGILIZCE) ━━━
- 4 panelli teknolojik infografik
- KRITIK KURAL: TUM METINLER TURKCE OLMALIDIR. Basliklar, etiketler, label'lar, alt yazi, bilgi kutulari HEPSI Turkce. "Humidity" yerine "Nem", "Wind" yerine "Ruzgar Hizi", "Temperature" yerine "Sicaklik" gibi. Infografikte HICBIR Ingilizce kelime OLMAMALIDIR.
- Modern, sade, profesyonel tasarim
- VISUAL STYLE ROTATION: Her seferinde su stillerden birini sec: blueprint, cyberpunk, minimalist, 3d. Prompt basina hangi stili sectigini belirt (Ornek: "Style: Blueprint...").

━━━ CIKTI FORMATI (JSON) ━━━
{
  "linkedinPost": "...",
  "xPost": "...",
  "infographicData": {
    "title": "Haber Başlığı (Türkçe)",
    "style": "blueprint | cyberpunk | minimalist | 3d",
    "keyStats": [
      {"label": "Veri 1", "value": "Değer"},
      {"label": "Veri 2", "value": "Değer"},
      {"label": "Veri 3", "value": "Değer"},
      {"label": "Veri 4", "value": "Değer"}
    ]
  }
}`;

  try {
    console.log("🧠 Haber icin icerik uretiliyor...");
    const response = await openRouterPost({
      model: "google/gemini-3.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Haber Basligi: ${title}\n\nHaber Icerigi:\n${content}\n\nSadece JSON olarak don.`,
        },
      ],
      max_tokens: 6000,
      temperature: 0.7,
    });

    const responseText = response.data.choices[0].message.content;
    const jsonString = cleanJsonString(responseText);
    const parsed = JSON.parse(jsonString);

    return {
      linkedinPost: parsed.linkedinPost || parsed.postText,
      xPost: parsed.xPost,
      infographicData: parsed.infographicData,
    };
  } catch (error: any) {
    console.error("❌ Haber icerik uretim hatasi:", error.message);
    throw error;
  }
}

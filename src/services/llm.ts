import fs from "fs/promises";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// API Anahtarları (env üzerinden)
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY || "";

/**
 * 1. Adım: Perplexity ile Canlı, Güncel Online Araştırma Yapma
 */
export async function researchTopicWithPerplexity(
  topic: string,
): Promise<string> {
  if (!PERPLEXITY_API_KEY) {
    console.warn("⚠️ Uyarı: PERPLEXITY_API_KEY tanımlı değil.");
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
            content: "Sen son derece detaylı araştırma yapan ve güncel, kesin istatistiksel, analitik teknoloji bilgileri derleyen bir uzmansın.",
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
  let cleaned = str.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  
  // Find the first { and last }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  
  // Remove truly problematic control characters (0-31) except \n, \r, \t
  // then handle potential raw newlines inside string values by escaping them
  // A simpler approach that often works for LLM outputs:
  return cleaned.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, "");
}

/**
 * 2. Adım: Multi-Agent İçerik Üretimi
 * LinkedIn Ajanı ve Antigravity (X) Ajanı beraber çalışır.
 */
export async function generateContentWithGemini(
  topic: string,
  researchData: string,
  customSystemPrompt?: string,
) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("❌ Hata: OPENROUTER_API_KEY eksik!");
  }

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
      Görev: X (Twitter) için kısa, etkili ve merak uyandırıcı post hazırlar. Max 2 hashtag. TÜM METİN TÜRKÇE OLMALIDIR.

      ━━━ TÜRKÇE İNSANİ YAZIM KURALLARI ━━━
      1. TDK İMLA: de/da, ki, mı/mi hatasız. Unvanlar küçük harf.
      2. YASAKLI AI: "Günümüzde", "Önemli bir konudur", "Özetle", "Sonuç olarak".
      3. KESİN KURAL: Hiçbir İngilizce terim veya slogan (Precision in every byte gibi) metin içinde İngilizce olarak yer almamalıdır. Her şey Türkçe olmalıdır.

      ━━━ ÇIKTI FORMATI (JSON) ━━━
      Cevabını SADECE şu JSON formatında ver:
      {
        "linkedinPost": "Metin",
        "xPost": "Vurucu X Metni",
        "imagePrompt": "Technological infographic prompt (English)"
      }
    `;

    const finalSystemMessage = customSystemPrompt || defaultSystemPrompt;

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content: finalSystemMessage + (agentRules ? `\n\nEk Kurallar:\n${agentRules}` : ""),
          },
          {
            role: "user",
            content: `Konu: ${topic}\nAraştırma: ${researchData}\n\nCevabı sadece JSON olarak döndür.`,
          },
        ],
        max_tokens: 6000,
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    const responseText = response.data.choices[0].message.content;
    const jsonString = cleanJsonString(responseText);

    const compiledData = JSON.parse(jsonString);
    return {
      postText: compiledData.linkedinPost,
      xPost: compiledData.xPost,
      imagePrompt: compiledData.imagePrompt,
    };
  } catch (error: any) {
    console.error("❌ OpenRouter Hatası:", error.message);
    throw error;
  }
}

export async function generateShortContentWithGemini(researchData: string, systemPrompt: string) {
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

    const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: finalSystemPrompt + "\n\nÖnemli: JSON içinde tırnak işaretlerini ve yeni satırları doğru şekilde kaçır (escape). linkedinPost ve xPost alanları TAMAMEN AYNI metni içermelidir." },
        { role: "user", content: `Güncel Bilgi: ${researchData}\n\nLütfen sadece istenen JSON objesini döndür.` },
      ],
      max_tokens: 2000,
      temperature: 0.1, // Daha kararlı çıktı için düşürüldü
    }, {
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    });

    const choice = response.data.choices[0];
    const responseText = choice.message.content;
    const jsonString = cleanJsonString(responseText);

    if (choice.finish_reason !== "stop") {
      console.warn(`⚠️ Uyarı: LLM tamamlama sebebi: ${choice.finish_reason}`);
    }

    try {
      return JSON.parse(jsonString);
    } catch (e: any) {
      console.error("❌ JSON Parse Hatası Detayı:", e.message);
      console.error("📄 Ham Yanıt:", responseText);
      console.error("🧼 Temizlenmiş String:", jsonString);
      throw e;
    }
  } catch (error: any) {
    console.error("❌ Kısa İçerik Hatası:", error.message);
    throw error;
  }
}

export async function generateOptimizedImagePrompt(researchData: string, basePrompt: string) {
  try {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('tr-TR', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit' });

    const systemPrompt = `
Sen profesyonel bir görsel prompt mühendisisin. 

**GÖREV:**
Aşağıdaki şablonu kullanarak, gelen hava durumu verilerine göre detaylı bir görsel üretim promptu oluştur. 

**ŞABLON (ZORUNLU YAPI):**
A minimalist 1:1 square weather infographic. A close-up view through a window from a cozy office in Istanbul, showing [LANDMARK] in the background. On the window glass, there is a simple, sleek, semi-transparent digital overlay displaying 'İSTANBUL' (in Turkish), the current temperature [TEMP]°C (NO DECIMALS, JUST INTEGER), a [DYNAMIC_WEATHER_ICON], and Humidity/Wind metrics. NO forecasts, NO bottom text. The scene is shot from a slight angle to show the depth of the window frame. The sky and lighting outside MUST strictly match the actual weather data provided: [ATMOSPHERE_DESCRIPTION]. Clean and premium aesthetic. --ar 1:1

**KURALLAR:**
1. SADECE İNGİLİZCE PROMPT döndür.
2. [LANDMARK] kısmını İstanbul'un ikonik ve tarihi mekanlarından (Bosphorus Bridge, Maiden's Tower, Hagia Sophia, Blue Mosque, Rumeli Fortress veya Bosphorus view with ferries) birini rastgele seçerek doldur. GALATA TOWER KULLANMA. Her seferinde farklı mekanlar seçmeye çalış.
3. [DYNAMIC_WEATHER_ICON] kısmını verideki duruma göre (rain icon, sun icon, cloud icon vb.) doldur.
4. [TEMP] kısmına güncel sıcaklığı yaz.
5. [ATMOSPHERE_DESCRIPTION] kısmını hava durumuna göre detaylandır (Örn: 'bright blue sky with golden sunlight' if clear, 'grey overcast sky with visible clouds' if cloudy, 'dark grey sky with heavy rain falling' if rainy).
6. EĞER HAVA 'AÇIK' (CLEAR) İSE: Kesinlikle yağmur damlaları, bulut veya kasvetli hava OLMASIN. Gökyüzü masmavi ve güneşli olsun. Pencere camı TEMIZ ve kuru olsun, asla su damlaları olmasın.
7. EĞER HAVA 'BULUTLU' (CLOUDY) İSE: Yağmur olmasın ama gökyüzü gri ve bulutlu olsun. Pencere camı kuru olsun.
8. EĞER HAVA 'YAĞMURLU' İSE: O zaman pencerede su damlaları ve yağmur efekti olsun.
9. KRITIK: TUM ARAYUZ METINLERI TURKCE OLMALIDIR. "Nem", "Ruzgar Hizi", "Hissedilen" gibi Turkce terimler kullan.
10. TEK BİR PARAGRAF olarak çıktı ver.
11. Hiçbir giriş cümlesi (İşte promptunuz vb.) veya açıklama EKLEME. Sadece promptu döndür.
12. Mutlaka --ar 1:1 ifadesini koru.
`;

    const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: systemPrompt + "\n\nZORUNLU: Tüm şablonu eksiksiz doldur. Cümleyi yarım bırakma. Sonuna mutlaka Türkçe özetini ekle." },
        { role: "user", content: `**Zaman:** ${formattedDate}\n**Hava Verisi:** ${researchData}\n\nLütfen promptu oluştur.` },
      ],
      max_tokens: 1000,
      temperature: 0.3,
    }, {
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    });
    
    let result = response.data.choices[0].message.content.trim();
    result = result.replace(/^["']|["']$/g, "");
    
    // Debug için dosyaya kaydet
    const scratchDir = path.join(process.cwd(), "scratch");
    try { await fs.access(scratchDir); } catch { await fs.mkdir(scratchDir, { recursive: true }); }
    await fs.writeFile(path.join(scratchDir, "last_prompt.txt"), result);
    
    return result;
  } catch (error: any) {
    console.error("❌ Prompt Optimizasyon Hatası:", error.message);
    return basePrompt;
  }
}

export async function generateImageWithGemini(prompt: string): Promise<string> {
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  if (!GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY eksik!");

  const TURKISH_RULE = "\n\nKRITIK KURAL: Tum basliklar, etiketler, label'lar ve metin TURKCE OLMALIDIR. Ingilizce terim kullanma.";

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${GOOGLE_API_KEY}`,
      {
        contents: [{ parts: [{ text: `Generate a technological infographic: ${prompt}${TURKISH_RULE}` }] }],
      },
      { headers: { "Content-Type": "application/json" }, timeout: 180_000 }
    );

    if (!response.data?.candidates?.[0]?.content?.parts) {
      console.error("❌ Gemini API Yanıt Yapısı Hatalı:", JSON.stringify(response.data, null, 2));
      throw new Error("Görsel verisi alınamadı.");
    }

    const part = response.data.candidates[0].content.parts.find((p: any) => p.inlineData);
    if (!part) {
      console.error("❌ Gemini API Yanıtında inlineData bulunamadı:", JSON.stringify(response.data.candidates[0].content, null, 2));
      throw new Error("Görsel verisi (inlineData) bulunamadı.");
    }

    const base64Image = part.inlineData.data;
    return base64Image;
  } catch (error: any) {
    console.error("❌ Görsel Üretme Hatası:", error.response?.data || error.message);
    throw error;
  }
}

export async function generateNewsContent(title: string, content: string): Promise<{
  linkedinPost: string;
  xPost: string;
  imagePrompt: string;
}> {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY eksik!");
  }

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
- Maksimum 280 karakter
- Kisa, vurucu, merak uyandiran
- Max 2-3 hashtag
- Ayni haberin Twitter versiyonu

━━━ GORSELIK PROMPTU (INGILIZCE) ━━━
- 4 panelli teknolojik infografik
- KRITIK KURAL: TUM METINLER TURKCE OLMALIDIR. Basliklar, etiketler, label'lar, alt yazi, bilgi kutulari HEPSI Turkce. "Humidity" yerine "Nem", "Wind" yerine "Ruzgar Hizi", "Temperature" yerine "Sicaklik" gibi. Infografikte HICBIR Ingilizce kelime OLMAMALIDIR.
- Modern, sade, profesyonel tasarim

━━━ CIKTI FORMATI (JSON) ━━━
{
  "linkedinPost": "...",
  "xPost": "...",
  "imagePrompt": "English infographic prompt..."
}`;

  try {
    console.log("🧠 Haber icin icerik uretiliyor...");
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Haber Basligi: ${title}\n\nHaber Icerigi:\n${content}\n\nSadece JSON olarak don.` },
        ],
        max_tokens: 6000,
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const responseText = response.data.choices[0].message.content;
    const jsonString = cleanJsonString(responseText);
    const parsed = JSON.parse(jsonString);

    return {
      linkedinPost: parsed.linkedinPost,
      xPost: parsed.xPost,
      imagePrompt: parsed.imagePrompt,
    };
  } catch (error: any) {
    console.error("❌ Haber icerik uretim hatasi:", error.message);
    throw error;
  }
}

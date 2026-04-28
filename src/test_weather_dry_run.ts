import { runWeatherPostFlow } from "./services/agentFlow.js";
import { researchTopicWithPerplexity, generateShortContentWithGemini, generateImageWithGemini, generateOptimizedImagePrompt } from "./services/llm.js";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const WEATHER_TEXT_PROMPT = `
Sen Botfusions'ın sosyal medya editörüsün.

**GÖREV:**
İstanbul'un bugünkü hava durumuna göre LinkedIn ve X (Twitter) için samimi, "insani" ve "Precision in every byte" felsefesine uygun paylaşımlar hazırla.

**VERİ ANALİZİ KURALLARI:**
1. Eğer araştırmada birden fazla kaynak (MGM, AccuWeather, Yandex vb.) varsa, bunları karşılaştır.
2. ORTALAMA veya ÇOĞUNLUK (consensus) olan sıcaklığı esas al. 
3. Çok sapan veriler (örneğin diğerleri 15 derken biri 30 diyorsa) varsa bunu "ilginç bir sapma" olarak not et ama ana bilgi olarak yanlış olanı kullanma.
4. "Hissedilen" sıcaklığı mutlaka vurgula.

**TÜRKÇE İNSANİ YAZIM KURALLARI:**
1. TDK İMLA: de/da, ki, mı/mi kurallarını hatasız uygula. 
2. YASAKLI AI KALIPLARI: "Günümüzde", "Önemli bir konudur", "Özetle", "Sonuç olarak".
3. İNSANİ DOKU: "Bence", "Sanırım", "Görünüşe göre" gibi ifadelerle doğal bir ton yakala.

**FORMAT:**
- Maksimum 260 karakter.
- En fazla 3 hashtag.
- 2-3 emoji.
- Mevcut sıcaklık, gökyüzü ve hissedilen bilgisi.
- Zaman tınısı (sabah ise günaydın, akşam ise iyi akşamlar tınısı).
`;

const WEATHER_IMAGE_PROMPT = `
[Shot Type: Wide Cinematic Shot], [Camera Angle: Eye Level], an ultra-realistic view of the Istanbul Bosphorus.
The scene captures the city under current weather: {{ $json.output }}.
Crucially, integrated into the air as a high-end holographic projection, there is an "ANALYTICAL WEATHER DATA" AR overlay panel.

THE PANEL MUST CONTAIN:
1. LARGE MAIN TEMP: The consensus temperature (e.g., 15°C).
2. DATA COMPARISON TABLE: A small table showing sources (MGM, AccuWeather, Yandex) and their reported values.
3. ACCURACY NOTE: A small note at the bottom identifying any data deviations (e.g., "Yandex data is a 30°C deviation").
4. VISUALS: Minimalist weather icons, current time, and a futuristic digital glow.

The AR interface must look like a professional, sleek technological tool, perfectly blended with the natural cinematic light of Istanbul. --ar 16:9
`;

async function testWeatherDryRun() {
  console.log("\n🧪 Hava Durumu TEST Akışı Başlatılıyor (YAYINLANMAYACAK)...");

  try {
    // 1. Hava durumu araştırması
    console.log("🔍 Hava durumu araştırılıyor...");
    const researchData = await researchTopicWithPerplexity(
      "İstanbul bugünkü hava durumu detayları (sıcaklık, gökyüzü durumu)"
    );
    console.log("📝 Araştırma Verisi:", researchData);

    // 2. İçerik üretimi
    console.log("✍️ Post metni üretiliyor...");
    const finalPostText = await generateShortContentWithGemini(
      researchData,
      WEATHER_TEXT_PROMPT
    );
    console.log("\n📄 Üretilen Post Metni:\n");
    console.log("------------------------------------------");
    console.log(finalPostText);
    console.log("------------------------------------------\n");

    // 3. Görsel Üretimi (Akıllı Prompt ile)
    console.log("🎨 Görsel promptu optimize ediliyor (Gemini Pro 2.5)...");
    const optimizedPrompt = await generateOptimizedImagePrompt(
      researchData,
      WEATHER_IMAGE_PROMPT
    );
    console.log(`📝 Optimize Edilmiş Prompt: ${optimizedPrompt.substring(0, 100)}...`);

    console.log("🎨 Görsel üretiliyor...");
    const base64Image = await generateImageWithGemini(optimizedPrompt);

    // 4. out klasörüne kaydetme
    const outDir = path.join(process.cwd(), "out");
    await fs.mkdir(outDir, { recursive: true });
    
    const timestamp = new Date().getTime();
    const fileName = `weather_test_${timestamp}.png`;
    const filePath = path.join(outDir, fileName);
    
    await fs.writeFile(filePath, Buffer.from(base64Image, 'base64'));
    
    console.log(`✅ Test Başarılı!`);
    console.log(`📁 Görsel kaydedildi: ${filePath}`);
    console.log(`⚠️ LinkedIn paylaşımı yapılmadı (DRY RUN).`);

  } catch (error: any) {
    console.error("🔥 Test Hatası:", error.message);
  }
}

testWeatherDryRun();

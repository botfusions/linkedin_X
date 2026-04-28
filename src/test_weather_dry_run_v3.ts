import { getIstanbulWeather } from "./services/weather.js";
import { generateShortContentWithGemini, generateOptimizedImagePrompt } from "./services/llm.js";
import { generateGeminiImage } from "./services/gemini_image.js";
import fs from "fs/promises";
import path from "path";

async function dryRun() {
    console.log("🚀 Hava Durumu DRY RUN (V3 - OpenWeatherMap) Başlatılıyor...");
    
    const weatherPrompt = `
Sen Botfusions'ın sosyal medya editörüsün.
İstanbul'un bugünkü hava durumunu LinkedIn ve X için KISA, ÖZ ve "insani" bir dille hazırla.
Çok fazla teknik detaya girmeden, sadece ana durumu ve hissedilen sıcaklığı vurgula.
Maksimum 200 karakter. 1-2 hashtag yeterli.
`;
    const imageVisualPrompt = "A minimalist 1:1 square weather infographic. A close-up view through a window from a cozy office in Istanbul, showing the Galata Tower. On the window glass, there is a simple, sleek, semi-transparent digital overlay displaying 'ISTANBUL', the current temperature, a weather icon, and Humidity/Wind metrics. NO forecasts, NO bottom text. Clean and premium. --ar 1:1";

    try {
        // 1. Data Fetching
        const weatherData = await getIstanbulWeather();
        console.log("\n📊 HAM HAVA DURUMU VERİSİ:\n", weatherData);

        // 2. Content Generation
        console.log("\n✍️ İçerik üretiliyor...");
        const generated = await generateShortContentWithGemini(weatherData, weatherPrompt);
        
        console.log("\n📱 ÜRETİLEN İÇERİK:");
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        console.log("LİNKEDİN POST:\n", generated.linkedinPost);
        console.log("\n----------------------------------------");
        console.log("X (TWITTER) POST:\n", generated.xPost);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

        if (generated.linkedinPost !== generated.xPost) {
            console.warn("⚠️ UYARI: Metinler bire bir aynı değil!");
        } else {
            console.log("✅ Metinler bire bir aynı (Kontrol edildi).");
        }

        // 3. Image Prompt Optimization
        console.log("\n🎨 Görsel promptu optimize ediliyor...");
        const optimizedPrompt = await generateOptimizedImagePrompt(weatherData, imageVisualPrompt);
        console.log("\n🖼️ OPTİMİZE EDİLMİŞ GÖRSEL PROMPTU:\n", optimizedPrompt);

        // 4. Image Generation
        console.log("\n🎨 Görsel üretiliyor (Gemini)...");
        const imagePath = await generateGeminiImage(optimizedPrompt);
        console.log("\n✅ Görsel Üretildi:", imagePath);

        // 5. Save to Markdown for user review
        const reportPath = path.join(process.cwd(), "out", `weather_preview_${Date.now()}.md`);
        const report = `
# 🌤️ Hava Durumu Paylaşım Önizlemesi (OWM v3)

**Tarih:** ${new Date().toLocaleString('tr-TR')}
**Kaynak:** OpenWeatherMap API

## 📝 Paylaşım Metni (LinkedIn & X Ortak)
\`\`\`text
${generated.linkedinPost}
\`\`\`

---

## 🎨 Görsel Promptu
\`\`\`text
${optimizedPrompt}
\`\`\`

## 🖼️ Üretilen Görsel
![Hava Durumu Görseli](${path.resolve(imagePath)})

---

## 📊 Ham Veri
\`\`\`text
${weatherData}
\`\`\`

---
**Onaylıyor musunuz?**
`;
        await fs.mkdir(path.dirname(reportPath), { recursive: true });
        await fs.writeFile(reportPath, report);
        console.log(`\n📄 Önizleme raporu oluşturuldu: ${reportPath}`);

    } catch (error: any) {
        console.error("\n❌ HATA:", error.message);
    }
}

dryRun();

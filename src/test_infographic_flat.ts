/**
 * FLAT infographic doğrulama: cyberpunk kalktı + FLAT 2D kuralı eklendi.
 * Gerçek bir infografik üretir (paylaşım YOK). Çıktıyı görsel olarak kontrol
 * edip hâlâ 3D-floating çıkıp çıkmadığını görürüz. Image #3 ile aynı konu
 * (Yapay Zeka Güvenliği) → direkt karşılaştırma.
 */
import { generateDynamicInfographicPrompt } from "./services/optimizer.js";
import { generateGeminiImage } from "./services/gemini_image.js";
import { initEnvFromSupabase } from "./services/supabase.js";

async function main() {
  await initEnvFromSupabase();

  const prompt = generateDynamicInfographicPrompt({
    title: "Yapay Zeka Güvenliğinin Temelleri",
    keyStats: [
      { label: "Tehdit Tespiti", value: "Anomali tespiti, davranış analizi, gerçek zamanlı izleme" },
      { label: "Veri Koruma", value: "Uçtan uca şifreleme, erişim kontrolü, veri maskeleme" },
      { label: "Model Güvenliği", value: "Prompt enjeksiyonu koruması, adversarial test, red-teaming" },
      { label: "Uyumluluk", value: "KVKK, GDPR uyumu, denetim izleri, şeffaflık raporları" },
      { label: "İnsan Kontroli", value: "Karar onayı, müdahale, açıklayabilirlik" },
    ],
    style: "random",
  });

  console.log("🎨 Üretilen prompt:\n" + prompt + "\n");
  console.log("🖼️ Görsel üretiliyor...");
  const img = await generateGeminiImage(prompt);
  console.log("✅ GÖRSEL: " + img);
}

main().catch((e) => {
  console.error("❌", e.message);
  process.exit(1);
});

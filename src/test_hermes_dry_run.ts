/**
 * HERMES  X DRY RUN (DEMO) — paylaşım YAPMAZ, sheet'e YAZMAZ.
 *
 * Üretim pipeline'ının (runAutonomousWorkflow) tam hattını çalıştırır:
 *   HERMES  X ilk TODO satır → Perplexity araştırma → Gemini içerik (LI+X)
 *   → optimizasyon → generateDynamicInfographicPrompt → infografik görsel.
 *
 * createLinkedInPost / createXPost ÇAĞRILMAZ → canlı post YOK.
 * updateHermesRowPublished ÇAĞRILMAZ → satır "TODO" kalır, gerçek yayına hazır.
 */
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fetchHermesXContent } from "./services/google.js";
import {
  researchTopicWithPerplexity,
  generateContentWithGemini,
} from "./services/llm.js";
import {
  optimizeWithSelfImprove,
  generateDynamicInfographicPrompt,
} from "./services/optimizer.js";
import { optimizeXWithSelfImprove } from "./services/x_optimizer.js";
import { generateGeminiImage } from "./services/gemini_image.js";
import { initEnvFromSupabase } from "./services/supabase.js";

dotenv.config();

async function main() {
  console.log("🚀 HERMES  X DRY RUN (demo) başlıyor — paylaşım ve sheet yazma YOK...\n");
  await initEnvFromSupabase();

  // 1. HERMES  X'ten bekleyen ilk satır
  const records = await fetchHermesXContent();
  const pending = records.filter((r) => {
    if (r.rowNumber < 2) return false;
    const sv = String(r.data["status"] || "").trim().toLowerCase();
    return !(sv === "done" || sv === "bitti" || sv.startsWith("yayinlandi") || sv.startsWith("yayınlandı"));
  });

  if (pending.length === 0) {
    console.log("📭 HERMES  X'te bekleyen satır yok.");
    return;
  }

  const target = pending[0]!;
  const { rowNumber, data } = target;
  const konuRaw = String(data["KONU"] ?? "").trim();

  console.log(`📋 Seçilen satır ${rowNumber}: "${konuRaw}" (status="${data["status"]}")`);

  // Temel konu doğrulaması (üretimle aynı)
  if (!konuRaw || konuRaw.length < 8) {
    console.error(`⚠️ Konu boş/aşırı kısa. Sonraki satır denenmeli (demo: durduruldu).`);
    return;
  }
  const konu = konuRaw;

  // 2. Araştırma
  console.log("\n🔍 Araştırma yapılıyor (Perplexity)...");
  const researchData = await researchTopicWithPerplexity(konu);

  // 3. İçerik üretimi
  console.log("✍️ LinkedIn + X içerikleri üretiliyor (Gemini)...");
  const generated = await generateContentWithGemini(konu, researchData);
  if (!generated.postText || !generated.xPost) {
    console.error("❌ İçerik üretimi başarısız.");
    return;
  }

  // 4. Optimizasyon
  console.log("⚖️ İçerikler optimize ediliyor...");
  const optLI = await optimizeWithSelfImprove(generated.postText, konu);
  const optX = await optimizeXWithSelfImprove(generated.xPost, konu);

  // 5. İnfografik görsel
  console.log("🎨 İnfografik üretiliyor...");
  const infographicPrompt = generateDynamicInfographicPrompt({
    ...generated.infographicData,
    style: (generated.infographicData as any).style || "random",
  });
  const imagePath = await generateGeminiImage(infographicPrompt);

  // 6. Sonuçları göster
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`📍 KONU: ${konu}`);
  console.log(`📊 LinkedIn skor: ${optLI.finalScore}/100 | X skor: ${optX.finalScore}/100`);
  console.log("\n📝 LİNKEDİN POSTU:\n" + optLI.finalPost);
  console.log("\n────────────────────────────────────────");
  console.log("\n🐦 X POSTU:\n" + optX.finalPost);
  console.log("\n────────────────────────────────────────");
  console.log("\n🖼️ İNFOGRAFİK PROMPTU:\n" + infographicPrompt);
  console.log(`\n✅ ÜRETİLEN GÖRSEL: ${imagePath}`);
  console.log("\n🔒 PAYLAŞIM YAPILMADI | SHEET GÜNCELLENMEDİ (satır hâlâ TODO)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // 7. Rapor
  const reportPath = path.join(process.cwd(), "out", `hermes_dryrun_${Date.now()}.md`);
  const report = `# HERMES  X Dry Run (Demo)

**Satır:** ${rowNumber} | **Konu:** ${konu}
**LinkedIn skor:** ${optLI.finalScore}/100 | **X skor:** ${optX.finalScore}/100
**Durum:** Paylaşım YAPILMADI, sheet GÜNCELLENMEDİ.

## 📝 LinkedIn Postu
\`\`\`text
${optLI.finalPost}
\`\`\`

## 🐦 X Postu
\`\`\`text
${optX.finalPost}
\`\`\`

## 🖼️ İnfografik
![İnfografik](${path.resolve(imagePath)})

## 🎨 İnfografik Promptu
\`\`\`text
${infographicPrompt}
\`\`\`

## 📊 Araştırma Verisi
\`\`\`text
${researchData}
\`\`\`
`;
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, report);
  console.log(`\n📄 Rapor: ${reportPath}`);
}

main().catch((e: any) => {
  console.error("❌ HATA:", e.message);
  process.exit(1);
});

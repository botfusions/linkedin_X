import { fetchContentFromSheet, updateRowStatus } from "./services/google.js";
import { researchTopicWithPerplexity, generateContentWithGemini } from "./services/llm.js";
import { generateGeminiImage } from "./services/gemini_image.js";
import { createLinkedInPost } from "./services/linkedin.js";
import { createXPost } from "./services/x.js";
import { optimizeWithSelfImprove } from "./services/optimizer.js";
import { optimizeXWithSelfImprove } from "./services/x_optimizer.js";
import { initEnvFromSupabase, insertPublishedPost } from "./services/supabase.js";
import { sendPublishNotification, sendErrorNotification } from "./services/telegram.js";

export async function runAutonomousWorkflow() {
  console.log("\n🤖 Otonom Agent Is Akisi Baslatiliyor...");

  await initEnvFromSupabase();

  try {
    const records = await fetchContentFromSheet();
    const targetRecord = records.find((r) => {
      if (r.rowNumber < 39) return false;
      const statusKey = Object.keys(r.data).find((k) => k.toLowerCase() === "durum" || k.toLowerCase() === "status") || "Durum";
      const statusValue = String(r.data[statusKey] || "").trim().toLowerCase();
      return !(statusValue === "done" || statusValue === "bitti");
    });

    if (!targetRecord) {
      console.log("📭 Paylasilacak icerik bulunamadi.");
      return;
    }

    const { rowNumber, data } = targetRecord;
    const konu = data[Object.keys(data).find(k => k.toLowerCase() === "konu" || k.toLowerCase() === "topic") || "Konu"];
    const altBaslik = data[Object.keys(data).find(k => k.toLowerCase() === "altbaslik" || k.toLowerCase() === "subtopic" || k.toLowerCase() === "description") || "AltBaslik"];
    const hedefKitle = data[Object.keys(data).find(k => k.toLowerCase() === "hedefkitle" || k.toLowerCase() === "audience" || k.toLowerCase() === "target") || "HedefKitle"];

    console.log(`\n📍 Konu Secildi [Satir ${rowNumber}]: ${konu}`);

    console.log("🔍 Arastirma yapiliyor (Perplexity)...");
    const researchData = await researchTopicWithPerplexity(konu);

    console.log("✍️ LinkedIn ve X icin icerikler uretiliyor...");
    const generated = await generateContentWithGemini(researchData, targetAudience(hedefKitle));

    if (!generated.postText || !generated.xPost) {
      throw new Error("Icerik uretimi basarisiz (LinkedIn veya X icerigi eksik).");
    }

    console.log("⚖️ Icerikler optimize ediliyor...");
    const optimizedLinkedIn = await optimizeWithSelfImprove(generated.postText, konu);
    const optimizedX = await optimizeXWithSelfImprove(generated.xPost, konu);

    console.log("🎨 Ortak gorsel uretiliyor...");
    const imagePath = await generateGeminiImage(generated.imagePrompt || konu);

    console.log("🚀 Paylasimlar yapiliyor...");
    const linkedinContent = optimizedLinkedIn.finalPost;
    const xContent = optimizedX.finalPost;

    let linkedinSuccess = false;
    let linkedinError = "";
    try {
      await createLinkedInPost(linkedinContent, imagePath);
      console.log("✅ LinkedIn paylasimi basarili.");
      linkedinSuccess = true;
    } catch (err: any) {
      linkedinError = err.message;
      console.error("❌ LinkedIn paylasim hatasi:", linkedinError);
    }

    let xSuccess = false;
    let xError = "";
    try {
      await createXPost(xContent, imagePath);
      console.log("✅ X (Twitter) paylasimi basarili.");
      xSuccess = true;
    } catch (err: any) {
      xError = err.message;
      console.error("❌ X paylasim hatasi:", xError);
    }

    if (linkedinSuccess || xSuccess) {
      const status = `Yayinlandi (${linkedinSuccess ? "LI " : ""}${xSuccess ? "X" : ""})`;
      await updateRowStatus(targetRecord._rawRow, status);
      console.log(`📊 Excel guncellendi: Satir ${rowNumber} -> ${status}`);
    }

    await insertPublishedPost({
      topic: String(konu),
      linkedin_post: linkedinContent,
      x_post: xContent,
      image_url: imagePath,
      linkedin_score: optimizedLinkedIn.finalScore,
      x_score: optimizedX.finalScore,
      source: "excel",
      status: linkedinSuccess || xSuccess ? "published" : "failed",
    });

    await sendPublishNotification({
      topic: String(konu),
      linkedinScore: optimizedLinkedIn.finalScore,
      xScore: optimizedX.finalScore,
      linkedinSuccess,
      xSuccess,
      linkedinError: linkedinError || undefined,
      xError: xError || undefined,
      source: "excel",
    });

    console.log("\n✨ Otonom is akisi basariyla tamamlandi.");

  } catch (error: any) {
    console.error("\n💥 Otonom akista kritik hata:", error.message);
    await sendErrorNotification("Otonom Agent", error.message);
  }
}

function targetAudience(kitle: string): string {
  if (!kitle || kitle === "-") return "Yapay zeka meraklilari, gelistiriciler ve teknoloji liderleri";
  return kitle;
}

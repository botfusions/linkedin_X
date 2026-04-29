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

    // Debug: Mevcut sütun adlarını logla
    const columnNames = Object.keys(data);
    console.log(`📋 Satir ${rowNumber} sutunlari: ${columnNames.join(", ")}`);

    const konuKey = Object.keys(data).find(k => {
      const lower = k.toLowerCase().replace(/\s+/g, "").replace(/[-_]/g, "");
      return lower === "konu" || lower === "topic" || lower === "başlık" || lower === "baslik" || lower === "konubaslik" || lower === "title" || lower === "başliklar" || lower === "basliklar" || lower === "içerik" || lower === "icerik" || lower === "subject" || lower === "content" || lower === "başlık(türkçe)" || lower === "postkonu";
    });
    const firstCol = columnNames[0];
    const konu: string | undefined = konuKey ? String(data[konuKey]) : (firstCol ? String(data[firstCol]) : undefined);

    const altBaslikKey = Object.keys(data).find(k => {
      const lower = k.toLowerCase().replace(/\s+/g, "").replace(/[-_]/g, "");
      return lower === "altbaslik" || lower === "subtopic" || lower === "description" || lower === "altbaşlık" || lower === "açıklama" || lower === "aciklama" || lower === "detay" || lower === "subtitle";
    });
    const altBaslik: string | undefined = altBaslikKey ? String(data[altBaslikKey]) : undefined;

    const hedefKitleKey = Object.keys(data).find(k => {
      const lower = k.toLowerCase().replace(/\s+/g, "").replace(/[-_]/g, "");
      return lower === "hedefkitle" || lower === "audience" || lower === "target" || lower === "hedef" || lower === "kitle";
    });
    const hedefKitle: string | undefined = hedefKitleKey ? String(data[hedefKitleKey]) : undefined;

    if (!konu) {
      console.error(`❌ HATA: Satir ${rowNumber}'da konu bulunamadi! Sutunlar: ${columnNames.join(", ")}`);
      throw new Error(`Satir ${rowNumber}'da konu sutunu bulunamadi.`);
    }

    console.log(`\n📍 Konu Secildi [Satir ${rowNumber}]: ${konu}`);
    if (altBaslik) console.log(`📎 Alt Baslik: ${altBaslik}`);
    if (hedefKitle) console.log(`🎯 Hedef Kitle: ${hedefKitle}`);

    const topicStr = String(konu);
    console.log("🔍 Arastirma yapiliyor (Perplexity)...");
    const researchData = await researchTopicWithPerplexity(topicStr);

    console.log("✍️ LinkedIn ve X icin icerikler uretiliyor...");
    const generated = await generateContentWithGemini(topicStr, researchData);

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
      const liResult = await createLinkedInPost(linkedinContent, imagePath);
      if (liResult) {
        console.log("✅ LinkedIn paylasimi basarili.");
        linkedinSuccess = true;
      } else {
        linkedinError = "createLinkedInPost false dondu (token hatasi veya gorsel hatasi)";
        console.error("❌ LinkedIn paylasimi basarisiz (false dondu).");
      }
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

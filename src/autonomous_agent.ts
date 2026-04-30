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
    const pending = records.filter((r) => {
      if (r.rowNumber < 39) return false;
      const statusKey = Object.keys(r.data).find((k) => k.toLowerCase() === "durum" || k.toLowerCase() === "status") || "Durum";
      const statusValue = String(r.data[statusKey] || "").trim().toLowerCase();
      return !(statusValue === "done" || statusValue === "bitti" || statusValue.startsWith("yayinlandi"));
    });

    if (pending.length === 0) {
      console.log("📭 Paylasilacak icerik bulunamadi.");
      return;
    }

    let published = false;

    for (const targetRecord of pending) {
      const { rowNumber, data } = targetRecord;

      const columnNames = Object.keys(data);
      console.log(`\n📋 Satir ${rowNumber} sutunlari: ${columnNames.join(", ")}`);
      for (const col of columnNames) {
        console.log(`   → ${col}: "${String(data[col]).substring(0, 80)}"`);
      }

      const statusColKey = columnNames.find((k) => k.toLowerCase() === "durum" || k.toLowerCase() === "status");

      const konuKey = Object.keys(data).find(k => {
        const lower = k.toLowerCase().replace(/\s+/g, "").replace(/[-_]/g, "");
        return lower === "konu" || lower === "topic" || lower === "başlık" || lower === "baslik" || lower === "konubaslik" || lower === "title" || lower === "başliklar" || lower === "basliklar" || lower === "içerik" || lower === "icerik" || lower === "subject" || lower === "content" || lower === "başlık(türkçe)" || lower === "postkonu";
      });

      let konuRaw: string | undefined;
      if (konuKey) {
        konuRaw = String(data[konuKey]);
      } else {
        const firstNonStatusCol = columnNames.find(k => k !== statusColKey && String(data[k] || "").trim().length > 0);
        konuRaw = firstNonStatusCol ? String(data[firstNonStatusCol]) : undefined;
      }

      if (!konuRaw || !konuRaw.trim()) {
        console.error(`⚠️ Satir ${rowNumber}'da konu bulunamadi, atlanıyor.`);
        continue;
      }

      const konu = konuRaw.trim();

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

      console.log(`📍 Konu Secildi [Satir ${rowNumber}]: ${konu}`);
      if (altBaslik) console.log(`📎 Alt Baslik: ${altBaslik}`);
      if (hedefKitle) console.log(`🎯 Hedef Kitle: ${hedefKitle}`);

      try {
        console.log("🔍 Arastirma yapiliyor (Perplexity)...");
        const researchData = await researchTopicWithPerplexity(konu);

        console.log("✍️ LinkedIn ve X icin icerikler uretiliyor...");
        const generated = await generateContentWithGemini(konu, researchData);

        if (!generated.postText || !generated.xPost) {
          console.error("❌ Icerik uretimi basarisiz, atlanıyor.");
          continue;
        }

        console.log("⚖️ Icerikler optimize ediliyor...");
        const optimizedLinkedIn = await optimizeWithSelfImprove(generated.postText, konu);
        const optimizedX = await optimizeXWithSelfImprove(generated.xPost, konu);

        console.log("🎨 Ortak gorsel uretiliyor...");
        let imagePath: string | undefined;
        try {
          imagePath = await generateGeminiImage(generated.imagePrompt || konu);
        } catch (imgErr: any) {
          console.error("⚠️ Görsel üretilemedi, bu haber atlanıyor:", imgErr.message);
          continue;
        }

        console.log("🚀 Paylasimlar yapiliyor...");

        let linkedinSuccess = false;
        let linkedinError = "";
        let linkedinUrl = "";
        try {
          const liResult = await createLinkedInPost(optimizedLinkedIn.finalPost, imagePath);
          if (liResult) {
            console.log("✅ LinkedIn paylasimi basarili.");
            linkedinSuccess = true;
            linkedinUrl = liResult;
          } else {
            linkedinError = "createLinkedInPost null dondu (token hatasi veya gorsel hatasi)";
            console.error("❌ LinkedIn paylasimi basarisiz (null dondu).");
          }
        } catch (err: any) {
          if (err.message === "SKIP_LINKEDIN") {
            console.log("⏭️ LinkedIn atlanıyor (token yok, ban koruması).");
          } else {
            linkedinError = err.message;
            console.error("❌ LinkedIn paylasim hatasi:", linkedinError);
          }
        }

        let xSuccess = false;
        let xError = "";
        let xUrl = "";
        try {
          const xResult = await createXPost(optimizedX.finalPost, imagePath);
          if (xResult) {
            console.log("✅ X (Twitter) paylasimi basarili.");
            xSuccess = true;
            xUrl = xResult;
          } else {
            xError = "createXPost null dondu";
            console.error("❌ X paylasimi basarisiz (null dondu).");
          }
        } catch (err: any) {
          xError = err.message;
          console.error("❌ X paylasim hatasi:", xError);
        }

        if (linkedinSuccess || xSuccess) {
          await updateRowStatus(targetRecord._rawRow, "Done");
          console.log(`📊 Excel guncellendi: Satir ${rowNumber} -> Done`);
        }

        await insertPublishedPost({
          topic: konu,
          linkedin_post: optimizedLinkedIn.finalPost,
          x_post: optimizedX.finalPost,
          image_url: imagePath,
          linkedin_score: optimizedLinkedIn.finalScore,
          x_score: optimizedX.finalScore,
          linkedin_url: linkedinUrl || undefined,
          x_url: xUrl || undefined,
          source: "excel",
          status: linkedinSuccess || xSuccess ? "published" : "failed",
        });

        await sendPublishNotification({
          topic: konu,
          linkedinScore: optimizedLinkedIn.finalScore,
          xScore: optimizedX.finalScore,
          linkedinSuccess,
          xSuccess,
          linkedinError: linkedinError || undefined,
          xError: xError || undefined,
          source: "excel",
        });

        published = true;
        break;
      } catch (err: any) {
        console.error(`⚠️ Satir ${rowNumber} islenirken hata, atlanıyor: ${err.message}`);
        continue;
      }
    }

    if (published) {
      console.log("\n✨ Otonom is akisi basariyla tamamlandi.");
    } else {
      console.log("\n📭 Islenilebilir kayit bulunamadi.");
    }

  } catch (error: any) {
    console.error("\n💥 Otonom akista kritik hata:", error.message);
    await sendErrorNotification("Otonom Agent", error.message);
  }
}

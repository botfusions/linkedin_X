import { fetchContentFromSheet, updateRowStatus } from "./services/google.js";
import {
  researchTopicWithPerplexity,
  generateContentWithGemini,
} from "./services/llm.js";
import { generateGeminiImage } from "./services/gemini_image.js";
import { createLinkedInPost } from "./services/linkedin.js";
import { createXPost } from "./services/x.js";
import {
  optimizeWithSelfImprove,
  generateDynamicInfographicPrompt,
} from "./services/optimizer.js";
import { optimizeXWithSelfImprove } from "./services/x_optimizer.js";
import {
  initEnvFromSupabase,
  insertPublishedPost,
} from "./services/supabase.js";
import {
  sendPublishNotification,
  sendErrorNotification,
} from "./services/telegram.js";
import { auditPost } from "./services/post_auditor.js";

export async function runAutonomousWorkflow() {
  console.log("\n🤖 Otonom Agent Is Akisi Baslatiliyor...");

  await initEnvFromSupabase();

  try {
    const records = await fetchContentFromSheet();
    const pending = records.filter((r) => {
      if (r.rowNumber < 39) return false;
      const statusKey =
        Object.keys(r.data).find(
          (k) => k.toLowerCase() === "durum" || k.toLowerCase() === "status",
        ) || "Durum";
      const statusValue = String(r.data[statusKey] || "")
        .trim()
        .toLowerCase();
      return !(
        statusValue === "done" ||
        statusValue === "bitti" ||
        statusValue.startsWith("yayinlandi")
      );
    });

    if (pending.length === 0) {
      console.log("📭 Paylasilacak icerik bulunamadi.");
      return;
    }

    let published = false;

    for (const targetRecord of pending) {
      const { rowNumber, data } = targetRecord;

      const columnNames = Object.keys(data);
      console.log(
        `\n📋 Satir ${rowNumber} sutunlari: ${columnNames.join(", ")}`,
      );
      for (const col of columnNames) {
        console.log(`   → ${col}: "${String(data[col]).substring(0, 80)}"`);
      }

      const statusColKey = columnNames.find(
        (k) => k.toLowerCase() === "durum" || k.toLowerCase() === "status",
      );

      // Meta sütunlar (bunlar konu değil)
      const metaCols = new Set([
        (statusColKey || "").toLowerCase(),
        "content", "url", "link", "image", "görsel", "resim",
      ]);

      // Önce bilinen isimlerle ara, bulamazsa ilk non-meta sütunu kullan
      const konuKey = columnNames.find((k) => {
        const lower = k.toLowerCase().replace(/\s+/g, "").replace(/[-_]/g, "");
        return (
          lower === "konu" ||
          lower === "topic" ||
          lower === "başlık" ||
          lower === "baslik" ||
          lower === "title" ||
          lower === "subject" ||
          lower === "postkonu"
        );
      });

      let konuRaw: string | undefined;
      if (konuKey) {
        konuRaw = String(data[konuKey]);
      } else {
        // İlk non-meta sütunu konu olarak kullan
        const firstTopicCol = columnNames.find(
          (k) => !metaCols.has(k.toLowerCase()) && String(data[k] || "").trim().length > 0,
        );
        konuRaw = firstTopicCol
          ? String(data[firstTopicCol])
          : undefined;
      }

      if (!konuRaw || !konuRaw.trim()) {
        console.error(`⚠️ Satir ${rowNumber}'da konu bulunamadi, atlanıyor.`);
        continue;
      }

      const konu = konuRaw.trim();

      const altBaslikKey = Object.keys(data).find((k) => {
        const lower = k.toLowerCase().replace(/\s+/g, "").replace(/[-_]/g, "");
        return (
          lower === "altbaslik" ||
          lower === "subtopic" ||
          lower === "description" ||
          lower === "altbaşlık" ||
          lower === "açıklama" ||
          lower === "aciklama" ||
          lower === "detay" ||
          lower === "subtitle"
        );
      });
      const altBaslik: string | undefined = altBaslikKey
        ? String(data[altBaslikKey])
        : undefined;

      const hedefKitleKey = Object.keys(data).find((k) => {
        const lower = k.toLowerCase().replace(/\s+/g, "").replace(/[-_]/g, "");
        return (
          lower === "hedefkitle" ||
          lower === "audience" ||
          lower === "target" ||
          lower === "hedef" ||
          lower === "kitle"
        );
      });
      const hedefKitle: string | undefined = hedefKitleKey
        ? String(data[hedefKitleKey])
        : undefined;

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
        const optimizedLinkedIn = await optimizeWithSelfImprove(
          generated.postText,
          konu,
        );
        const optimizedX = await optimizeXWithSelfImprove(
          generated.xPost,
          konu,
        );

        console.log("🎨 Ortak gorsel uretiliyor...");
        let imagePath: string | undefined;
        try {
          const infographicPrompt = generateDynamicInfographicPrompt({
            ...generated.infographicData,
            style: (generated.infographicData as any).style || "random",
          });
          imagePath = await generateGeminiImage(infographicPrompt);
        } catch (imgErr: any) {
          console.error(
            "⚠️ Görsel üretilemedi, bu haber atlanıyor:",
            imgErr.message,
          );
          continue;
        }

        // ─── AGENTIC DENETIM ───
        console.log("🔍 Agentic denetim yapılıyor...");
        const liAudit = await auditPost({
          text: optimizedLinkedIn.finalPost,
          platform: "linkedin",
          topic: konu,
          source: "excel",
        });
        const xAudit = await auditPost({
          text: optimizedX.finalPost,
          platform: "x",
          topic: konu,
          source: "excel",
        });

        if (liAudit.riskScore > 0 || xAudit.riskScore > 0) {
          console.log(`🔍 Denetim Skorları — LinkedIn risk: ${liAudit.riskScore}/100, X risk: ${xAudit.riskScore}/100`);
          for (const reason of [...liAudit.reasons, ...xAudit.reasons]) {
            console.log(`   ⚠️ ${reason}`);
          }
        }

        if (!liAudit.approved && !xAudit.approved) {
          console.error("🚫 Her iki platform da DENETİM RED: Post atlanıyor.");
          for (const s of [...liAudit.suggestions, ...xAudit.suggestions]) {
            console.log(`   💡 ${s}`);
          }
          continue;
        }
        // ─── DENETIM SONU ───

        console.log("🚀 Paylasimlar yapiliyor...");

        let linkedinSuccess = false;
        let linkedinError = "";
        let linkedinUrl = "";
        try {
          const liResult = await createLinkedInPost(
            optimizedLinkedIn.finalPost,
            imagePath,
          );
          if (liResult) {
            console.log("✅ LinkedIn paylasimi basarili.");
            linkedinSuccess = true;
            linkedinUrl = liResult;
          } else {
            linkedinError =
              "createLinkedInPost null dondu (token hatasi veya gorsel hatasi)";
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
          const xResult = await createXPost(optimizedX.finalPost, imagePath, konu);
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
        console.error(
          `⚠️ Satir ${rowNumber} islenirken hata, atlanıyor: ${err.message}`,
        );
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

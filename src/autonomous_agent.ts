import { fetchHermesXContent, updateHermesRowPublished } from "./services/google.js";
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
    const records = await fetchHermesXContent();
    const pending = records.filter((r) => {
      if (r.rowNumber < 2) return false;
      const statusValue = String(r.data["status"] || "")
        .trim()
        .toLowerCase();
      return !(
        statusValue === "done" ||
        statusValue === "bitti" ||
        statusValue.startsWith("yayinlandi") ||
        statusValue.startsWith("yayınlandı")
      );
    });

    if (pending.length === 0) {
      console.log("📭 HERMES  X'te paylaşılacak içerik bulunamadı.");
      return;
    }

    let published = false;

    for (const targetRecord of pending) {
      const { rowNumber, data } = targetRecord;

      // HERMES  X: konu doğrudan KONU kolonunda.
      const konuRaw = String(data["KONU"] ?? "").trim();
      const statusValue = String(data["status"] ?? "").trim();
      console.log(
        `\n📋 HERMES  X satır ${rowNumber}: KONU="${konuRaw.slice(0, 80)}" (status="${statusValue}")`,
      );

      // Temel konu doğrulaması: boş veya çok kısa → sonraki satıra atla.
      if (!konuRaw || konuRaw.length < 8) {
        console.error(`⚠️ Satır ${rowNumber}: konu boş/aşırı kısa, atlanıyor.`);
        continue;
      }

      const konu = konuRaw;
      console.log(`📍 Konu Seçildi [Satır ${rowNumber}]: ${konu}`);

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

        const skipLinkedIn = !liAudit.approved;
        const skipX = !xAudit.approved;

        if (skipLinkedIn && skipX) {
          console.error("🚫 Her iki platform da DENETİM RED: Post atlanıyor.");
          for (const s of [...liAudit.suggestions, ...xAudit.suggestions]) {
            console.log(`   💡 ${s}`);
          }
          continue;
        }
        if (skipLinkedIn) {
          console.error("🚫 LinkedIn DENETİM RED: Sadece X paylaşılacak.");
        }
        if (skipX) {
          console.error("🚫 X DENETİM RED: Sadece LinkedIn paylaşılacak.");
        }
        // ─── DENETIM SONU ───

        console.log("🚀 Paylasimlar yapiliyor...");

        let linkedinSuccess = false;
        let linkedinError = "";
        let linkedinUrl = "";
        if (skipLinkedIn) {
          linkedinError = "Denetim reddi";
          console.log("⏭️ LinkedIn atlanıyor (denetim reddi).");
        } else {
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
              linkedinError = "Token yok";
              console.log("⏭️ LinkedIn atlanıyor (token yok, ban koruması).");
            } else {
              linkedinError = err.message;
              console.error("❌ LinkedIn paylasim hatasi:", linkedinError);
            }
          }
        }

        let xSuccess = false;
        let xError = "";
        let xUrl = "";
        if (skipX) {
          xError = "Denetim reddi";
          console.log("⏭️ X atlanıyor (denetim reddi).");
        } else {
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
        }

        if (linkedinSuccess || xSuccess) {
          // HERMES  X: status -> "done" + "YAYIN URLSİ" -> LinkedIn linki (X yedek)
          const publishUrlForSheet = linkedinUrl || xUrl || "";
          await updateHermesRowPublished(
            targetRecord._rawRow,
            publishUrlForSheet,
          );
          console.log(
            `📊 HERMES  X güncellendi: Satır ${rowNumber} -> done (URL: ${publishUrlForSheet || "yok"})`,
          );
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

        // Not: temp görseller artık silinmiyor — debug ve arşiv için kalıcı tutuluyor

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

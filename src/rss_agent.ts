import {
  fetchNewsFromRSS,
  fetchArticleContent,
  pickRandom,
} from "./services/rss.js";
import { generateNewsContent } from "./services/llm.js";
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

export async function runRSSNewsWorkflow() {
  console.log("\n📰 RSS Haber Akisi Baslatiliyor...");

  await initEnvFromSupabase();

  try {
    const news = await fetchNewsFromRSS(3);
    const selected = pickRandom(news, 1);

    for (const article of selected) {
      console.log(`\n📍 Isleniyor: ${article.title}`);

      let content = article.contentSnippet;
      if (article.link) {
        const fetched = await fetchArticleContent(article.link);
        if (fetched.length > 200) content = fetched;
      }

      const generated = await generateNewsContent(article.title, content);

      if (!generated.linkedinPost || !generated.xPost) {
        console.error("❌ Icerik uretimi basarisiz, atlanıyor.");
        continue;
      }

      console.log("⚖️ Icerikler optimize ediliyor...");
      const optimizedLI = await optimizeWithSelfImprove(
        generated.linkedinPost,
        article.title,
      );
      const optimizedX = await optimizeXWithSelfImprove(
        generated.xPost,
        article.title,
      );

      // ─── AGENTIC DENETIM ───
      console.log("🔍 Agentic denetim yapılıyor...");
      const liAudit = await auditPost({
        text: optimizedLI.finalPost,
        platform: "linkedin",
        topic: article.title,
        source: "rss",
      });
      const xAudit = await auditPost({
        text: optimizedX.finalPost,
        platform: "x",
        topic: article.title,
        source: "rss",
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

      console.log("🎨 Dinamik Infografik Motoru Calistiriliyor...");
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

      let linkedinSuccess = false;
      let linkedinError = "";
      let linkedinUrl = "";
      try {
        const liResult = await createLinkedInPost(
          optimizedLI.finalPost,
          imagePath,
        );
        if (liResult) {
          console.log("✅ LinkedIn haber paylasimi basarili.");
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
          console.error("❌ LinkedIn hatasi:", linkedinError);
        }
      }

      let xSuccess = false;
      let xError = "";
      let xUrl = "";
      try {
        const xResult = await createXPost(optimizedX.finalPost, imagePath, article.title);
        if (xResult) {
          console.log("✅ X haber paylasimi basarili.");
          xSuccess = true;
          xUrl = xResult;
        } else {
          xError = "createXPost null dondu";
          console.error("❌ X paylasimi basarisiz (null dondu).");
        }
      } catch (err: any) {
        xError = err.message;
        console.error("❌ X hatasi:", xError);
      }

      await insertPublishedPost({
        topic: article.title,
        linkedin_post: optimizedLI.finalPost,
        x_post: optimizedX.finalPost,
        image_url: imagePath,
        linkedin_score: optimizedLI.finalScore,
        x_score: optimizedX.finalScore,
        linkedin_url: linkedinUrl || undefined,
        x_url: xUrl || undefined,
        source: "rss",
        status: linkedinSuccess || xSuccess ? "published" : "failed",
      });

      await sendPublishNotification({
        topic: article.title,
        linkedinScore: optimizedLI.finalScore,
        xScore: optimizedX.finalScore,
        linkedinSuccess,
        xSuccess,
        linkedinError: linkedinError || undefined,
        xError: xError || undefined,
        source: "rss",
      });

      // Ban koruması: tek haber, bekleme gerekmez
      const delayMin = 1;
      const delayMax = 2;
      const delayMinutes = delayMin + Math.random() * (delayMax - delayMin);
      const delayMs = Math.round(delayMinutes * 60 * 1000);
      console.log(
        `⏳ Ban koruması: ${Math.round(delayMinutes)} dakika bekleniyor...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    console.log("\n✨ RSS haber akisi tamamlandi.");
  } catch (error: any) {
    console.error("\n💥 RSS haber akisinda kritik hata:", error.message);
    await sendErrorNotification("RSS Haber Akisi", error.message);
  }
}

// Sadece bu dosya doğrudan çalıştırıldığında (npm run rss) tetiklenir.
// Scheduler import ettiğinde otomatik çalışmaz.
if (
  process.argv[1] &&
  (process.argv[1].endsWith("rss_agent.ts") ||
    process.argv[1].endsWith("rss_agent.js"))
) {
  runRSSNewsWorkflow();
}

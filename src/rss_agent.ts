import { fetchNewsFromRSS, fetchArticleContent, pickRandom } from "./services/rss.js";
import { generateNewsContent } from "./services/llm.js";
import { generateGeminiImage } from "./services/gemini_image.js";
import { createLinkedInPost } from "./services/linkedin.js";
import { createXPost } from "./services/x.js";
import { optimizeWithSelfImprove } from "./services/optimizer.js";
import { optimizeXWithSelfImprove } from "./services/x_optimizer.js";
import { initEnvFromSupabase, insertPublishedPost } from "./services/supabase.js";
import { sendPublishNotification, sendErrorNotification } from "./services/telegram.js";

export async function runRSSNewsWorkflow() {
  console.log("\n📰 RSS Haber Akisi Baslatiliyor...");

  await initEnvFromSupabase();

  try {
    const news = await fetchNewsFromRSS(5);
    const selected = pickRandom(news, 2);

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
      const optimizedLI = await optimizeWithSelfImprove(generated.linkedinPost, article.title);
      const optimizedX = await optimizeXWithSelfImprove(generated.xPost, article.title);

      console.log("🎨 Turkce infografik uretiliyor...");
      let imagePath: string | undefined;
      try {
        imagePath = await generateGeminiImage(generated.imagePrompt);
      } catch (imgErr: any) {
        console.error("⚠️ Görsel üretilemedi, bu haber atlanıyor:", imgErr.message);
        continue;
      }

      let linkedinSuccess = false;
      let linkedinError = "";
      try {
        const liResult = await createLinkedInPost(optimizedLI.finalPost, imagePath);
        if (liResult) {
          console.log("✅ LinkedIn haber paylasimi basarili.");
          linkedinSuccess = true;
        } else {
          linkedinError = "createLinkedInPost false dondu (token hatasi veya gorsel hatasi)";
          console.error("❌ LinkedIn paylasimi basarisiz (false dondu).");
        }
      } catch (err: any) {
        linkedinError = err.message;
        console.error("❌ LinkedIn hatasi:", linkedinError);
      }

      let xSuccess = false;
      let xError = "";
      try {
        await createXPost(optimizedX.finalPost, imagePath);
        console.log("✅ X haber paylasimi basarili.");
        xSuccess = true;
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
    }

    console.log("\n✨ RSS haber akisi tamamlandi.");
  } catch (error: any) {
    console.error("\n💥 RSS haber akisinda kritik hata:", error.message);
    await sendErrorNotification("RSS Haber Akisi", error.message);
  }
}

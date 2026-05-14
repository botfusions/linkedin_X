import {
  generateShortContentWithGemini,
  generateOptimizedImagePrompt,
} from "./llm.js";
import { createLinkedInPost } from "./linkedin.js";
import { createXPost } from "./x.js";
import { generateGeminiImage } from "./gemini_image.js";
import { getIstanbulWeather } from "./weather.js";
import { initEnvFromSupabase, insertPublishedPost } from "./supabase.js";
import { sendPublishNotification, sendErrorNotification } from "./telegram.js";
import { auditPost } from "./post_auditor.js";

export async function runWeatherPostFlow(
  weatherPrompt: string,
  imageVisualPrompt: string,
) {
  console.log("\n🌤️ Hava Durumu Akışı Başlatılıyor...");

  await initEnvFromSupabase();

  try {
    // 1. Hava durumu araştırması (OpenWeatherMap ile)
    const researchData = await getIstanbulWeather();

    // 2. İçerik üretimi (Özel kısa weather promptu ile LinkedIn + X)
    const generated = await generateShortContentWithGemini(
      researchData,
      weatherPrompt,
    );

    const { linkedinPost, xPost } = generated;

    // 3. Görsel Üretimi
    console.log(
      "\n🎨 Görsel promptu optimize ediliyor (Gemini 2.5 Pro - OpenRouter)...",
    );
    const optimizedPrompt = await generateOptimizedImagePrompt(
      researchData,
      imageVisualPrompt,
    );

    console.log("\n🎨 Hava durumu görseli üretiliyor...");
    const imagePath = await generateGeminiImage(optimizedPrompt);

    // --- GÜVENLİK BARİYERİ ---
    if (!linkedinPost || linkedinPost.length < 10) {
      console.error("❌ HATA: LinkedIn hava durumu metni boş!");
      return;
    }
    // -------------------------

    // ─── AGENTIC DENETIM ───
    console.log("🔍 Agentic denetim yapılıyor...");
    const weatherAudit = await auditPost({
      text: linkedinPost,
      platform: "linkedin",
      topic: "İstanbul Hava Durumu",
      source: "weather",
      useLlm: false,
    });
    const xWeatherAudit = await auditPost({
      text: xPost,
      platform: "x",
      topic: "İstanbul Hava Durumu",
      source: "weather",
      useLlm: false,
    });

    if (weatherAudit.riskScore > 0 || xWeatherAudit.riskScore > 0) {
      console.log(`🔍 Denetim Skorları — LinkedIn risk: ${weatherAudit.riskScore}/100, X risk: ${xWeatherAudit.riskScore}/100`);
      for (const reason of [...weatherAudit.reasons, ...xWeatherAudit.reasons]) {
        console.log(`   ⚠️ ${reason}`);
      }
    }

    if (!weatherAudit.approved) {
      console.error("🚫 LinkedIn hava durumu DENETİM RED: Atlanıyor.");
    }
    if (!xWeatherAudit.approved) {
      console.error("🚫 X hava durumu DENETİM RED: Atlanıyor.");
    }
    // ─── DENETIM SONU ───

    // 4. Paylaşımlar
    console.log("🚀 Hava durumu paylaşımları yapılıyor...");

    // LinkedIn Paylaşımı
    let linkedinSuccess = false;
    let linkedinError = "";
    let linkedinUrl = "";
    try {
      const liResult = await createLinkedInPost(linkedinPost, imagePath);
      if (liResult) {
        console.log("✅ LinkedIn hava durumu postu yayınlandı.");
        linkedinSuccess = true;
        linkedinUrl = liResult;
      } else {
        linkedinError =
          "createLinkedInPost null dondu (token hatasi veya gorsel hatasi)";
        console.error("❌ LinkedIn hava durumu postu basarisiz (null dondu).");
      }
    } catch (err: any) {
      if (err.message === "SKIP_LINKEDIN") {
        console.log("⏭️ LinkedIn atlanıyor (token yok, ban koruması).");
      } else {
        linkedinError = err.message;
        console.error("❌ LinkedIn paylaşım hatası:", linkedinError);
      }
    }

    // X Paylaşımı
    let xSuccess = false;
    let xError = "";
    let xUrl = "";
    try {
      const xResult = await createXPost(xPost, imagePath, "İstanbul Hava Durumu");
      if (xResult) {
        console.log("✅ X (Twitter) hava durumu postu yayınlandı.");
        xSuccess = true;
        xUrl = xResult;
      } else {
        xError = "createXPost null dondu";
        console.error("❌ X hava durumu postu basarisiz (null dondu).");
      }
    } catch (err: any) {
      xError = err.message;
      console.error("❌ X paylaşım hatası:", xError);
    }

    // Supabase kayıt
    await insertPublishedPost({
      topic: "İstanbul Hava Durumu",
      linkedin_post: linkedinPost,
      x_post: xPost,
      image_url: imagePath,
      linkedin_url: linkedinUrl || undefined,
      x_url: xUrl || undefined,
      source: "weather",
      status: linkedinSuccess || xSuccess ? "published" : "failed",
    });

    // Telegram bildirim
    await sendPublishNotification({
      topic: "İstanbul Hava Durumu",
      linkedinSuccess,
      xSuccess,
      linkedinError: linkedinError || undefined,
      xError: xError || undefined,
      source: "weather",
    });
  } catch (error: any) {
    console.error("🔥 Hava Durumu Akış Hatası:", error.message);
    await sendErrorNotification("Hava Durumu Akışı", error.message);
  }
}

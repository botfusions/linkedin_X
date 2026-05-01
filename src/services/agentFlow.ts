import { fetchContentFromSheet, updateRowStatus } from "./google.js";
import {
  researchTopicWithPerplexity,
  generateContentWithGemini,
  generateImageWithGemini,
  generateShortContentWithGemini,
  generateOptimizedImagePrompt,
} from "./llm.js";
import { createLinkedInPost } from "./linkedin.js";
import { createXPost } from "./x.js";
import {
  scorePost,
  optimizeWithSelfImprove,
  generateDynamicInfographicPrompt,
} from "./optimizer.js";
import { generateGeminiImage } from "./gemini_image.js";
import { getIstanbulWeather } from "./weather.js";
import { initEnvFromSupabase, insertPublishedPost } from "./supabase.js";
import { sendPublishNotification, sendErrorNotification } from "./telegram.js";
import fs from "fs/promises";

const SCORE_THRESHOLD = 80;

export async function runExcelPostFlow() {
  console.log("\n📊 Excel İçerik Akışı Başlatılıyor...");

  try {
    const records = await fetchContentFromSheet();
    const targetRecord = records.find((r) => {
      if (r.rowNumber < 38) return false;
      const statusKey =
        Object.keys(r.data).find((k) => k.toLowerCase() === "status") ||
        "Status";
      const statusValue = String(r.data[statusKey] || "")
        .trim()
        .toLowerCase();
      return !(statusValue === "done" || statusValue === "bitti");
    });

    if (!targetRecord) {
      console.log("✅ İşlenecek Excel konusu kalmadı!");
      return;
    }

    const topicKey =
      Object.keys(targetRecord.data).find((k) => k.toLowerCase() === "topic") ||
      "Topic";
    const topic = targetRecord.data[topicKey];

    console.log(`\n🎯 Konu (Satır ${targetRecord.rowNumber}): "${topic}"\n`);

    const researchData = await researchTopicWithPerplexity(topic);
    const processedContent = await generateContentWithGemini(
      topic,
      researchData,
    );

    let finalPostText = processedContent.postText;
    let infographicData = processedContent.infographicData;

    // Dinamik İnfografik Motorunu Kullan
    let imagePrompt = "";
    if (infographicData) {
      console.log("🛠️ Dinamik İnfografik Motoru Çalıştırılıyor...");
      imagePrompt = generateDynamicInfographicPrompt({
        ...infographicData,
        style: infographicData.style || "random",
      });
    } else {
      console.warn(
        "⚠️ Uyarı: infographicData bulunamadı, varsayılan prompt kullanılıyor.",
      );
      imagePrompt =
        "Clean professional technology infographic, 4 panels, Turkish text.";
    }

    const initialScore = scorePost(finalPostText);
    if (initialScore.percentage < SCORE_THRESHOLD) {
      console.log(
        `\n🔄 Skor: ${initialScore.percentage}/100. İyileştiriliyor...`,
      );
      const optimized = await optimizeWithSelfImprove(
        finalPostText,
        String(topic),
      );
      finalPostText = optimized.finalPost;
    }

    console.log("\n🎨 Görsel üretiliyor...");
    const base64Image = await generateImageWithGemini(imagePrompt);

    // --- GÜVENLİK BARİYERİ ---
    if (!finalPostText || finalPostText.trim().length < 10) {
      console.error(
        "❌ HATA: Post metni boş veya çok kısa! Paylaşım iptal edildi.",
      );
      return;
    }
    if (!base64Image || base64Image.length < 100) {
      console.error("❌ HATA: Görsel üretilemedi! Paylaşım iptal edildi.");
      return;
    }
    // -------------------------

    const isSuccess = await createLinkedInPost(finalPostText, base64Image);

    if (isSuccess) {
      console.log(`\n🎉 "${topic}" yayınlandı!`);
      await updateRowStatus(targetRecord._rawRow, "Done");
    }
  } catch (error: any) {
    console.error("🔥 Excel Akış Hatası:", error.message);
  }
}

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
      const xResult = await createXPost(xPost, imagePath);
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

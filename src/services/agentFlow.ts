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
import { scorePost, optimizeWithSelfImprove } from "./optimizer.js";
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
    let imagePrompt = processedContent.imagePrompt;

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
      console.error("❌ HATA: Post metni boş veya çok kısa! Paylaşım iptal edildi.");
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
    console.log("\n🎨 Görsel promptu optimize ediliyor (Gemini Pro 2.5)...");
    const optimizedPrompt = await generateOptimizedImagePrompt(
      researchData,
      imageVisualPrompt
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
    try {
      await createLinkedInPost(linkedinPost, imagePath);
      console.log("✅ LinkedIn hava durumu postu yayınlandı.");
      linkedinSuccess = true;
    } catch (err: any) {
      linkedinError = err.message;
      console.error("❌ LinkedIn paylaşım hatası:", linkedinError);
    }

    // X Paylaşımı
    let xSuccess = false;
    let xError = "";
    try {
      await createXPost(xPost, imagePath);
      console.log("✅ X (Twitter) hava durumu postu yayınlandı.");
      xSuccess = true;
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

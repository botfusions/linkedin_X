import { TwitterApi } from "twitter-api-v2";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

/**
 * X (Twitter) API v2 kullanarak paylaşım yapar.
 * X Ban Koruması ve Güvenlik Bariyerleri İçerir.
 */
export async function createXPost(
  text: string,
  imagePath?: string,
): Promise<string | null> {
  // --- GÜVENLİK BARİYERİ ---
  if (!text || text.trim().length < 10) {
    console.error("❌ BAN KORUMASI: Boş veya çok kısa metin X'te paylaşılamaz!");
    return null;
  }

  // Aynı içeriği üst üste paylaşmayı engellemek için basit bir kontrol (geçici hafıza gerekebilir)
  // Şimdilik sadece metin validasyonu yapıyoruz.
  // -------------------------

  try {
    const client = new TwitterApi({
      appKey: process.env.X_API_KEY || "",
      appSecret: process.env.X_API_SECRET || "",
      accessToken: process.env.X_ACCESS_TOKEN || "",
      accessSecret: process.env.X_ACCESS_SECRET || "",
    });

    const rwClient = client.readWrite;
    let mediaId: string | undefined;

    // Eğer görsel varsa (Dosya Yolu olarak gelir)
    if (imagePath && fs.existsSync(imagePath)) {
      console.log("🖼️ X sunucusuna görsel yükleniyor...");
      mediaId = await client.v1.uploadMedia(imagePath);
      console.log("✅ Görsel X'e yüklendi. MediaID:", mediaId);
    }

    console.log(`📡 X Paylaşımı Yapılıyor. Metin: ${text.substring(0, 50)}...`);

    const tweetPayload: any = { text };
    if (mediaId) {
      tweetPayload.media = { media_ids: [mediaId] };
    }

    const tweet = await rwClient.v2.tweet(tweetPayload);

    console.log("🚀 X Gönderisi Başarıyla Yayına Alındı! Tweet ID:", tweet.data.id);
    return `https://x.com/i/status/${tweet.data.id}`;
  } catch (error: any) {
    console.error("❌ X Paylaşım Hatası:", error.data || error.message);
    return null;
  }
}

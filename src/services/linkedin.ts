import fs from "fs/promises";
import path from "path";
import axios from "axios";
import dotenv from "dotenv";
import { sendErrorNotification } from "./telegram.js";

dotenv.config();

const TOKEN_PATH = path.join(process.cwd(), "data", ".linkedin_token.json");

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI || "http://localhost:8080/callback";

/**
 * LinkedIn'de metin + Gerçek Görsel (Upload edilmiş) olan bir paylaşım oluşturur.
 * Güvenlik bariyerleri ve dosya yolu desteği içerir.
 */
export async function createLinkedInPost(
  text: string,
  imagePath: string,
): Promise<boolean> {
  // --- GÜVENLİK BARİYERİ ---
  if (!text || text.trim().length < 10) {
    console.error("❌ GÜVENLİK BARİYERİ: Boş veya çok kısa LinkedIn metni paylaşılamaz!");
    return false;
  }
  // -------------------------
  try {
    const accessToken = await getAccessToken();

    // 1. Kullanıcı URN sorgula
    const profileResponse = await axios.get(
      "https://api.linkedin.com/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );
    const personUrn = `urn:li:person:${profileResponse.data.sub}`;

    console.log(`👤 İşlem Yapan Profil: ${personUrn}`);

    // 2. Görüntü Yükleme Süreci (v2 Assets API - ugc için gerekli)
    console.log("🖼️ LinkedIn sunucusuna görsel yükleniyor...");

    const registerResponse = await axios.post(
      "https://api.linkedin.com/v2/assets?action=registerUpload",
      {
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-image"],
          owner: personUrn,
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      },
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    const uploadUrl =
      registerResponse.data.value.uploadMechanism[
        "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
      ].uploadUrl;
    const assetUrn = registerResponse.data.value.asset;

    const imageBuffer = await fs.readFile(imagePath);
    await axios.put(uploadUrl, imageBuffer, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "image/png",
      },
    });

    console.log("✅ Görsel LinkedIn'e yüklendi.");

    // 3. UGC Postu Oluştur (En stabil uzun metin metodu)
    console.log(
      `📡 LinkedIn Paylaşımı Hazırlanıyor (UGC): Metin Uzunluğu: ${text.length}`,
    );
    const ugcBody = {
      author: personUrn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text: text,
          },
          shareMediaCategory: "IMAGE",
          media: [
            {
              status: "READY",
              description: { text: "Botfusions AI" },
              media: assetUrn,
              title: { text: "Botfusions" },
            },
          ],
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    };

    await axios.post("https://api.linkedin.com/v2/ugcPosts", ugcBody, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Restli-Protocol-Version": "2.0.0",
      },
    });

    console.log("🚀 LinkedIn UGC Gönderisi Başarıyla Yayına Alındı!");
    return true;
  } catch (error: any) {
    console.error(
      "❌ LinkedIn Paylaşım Hatası (UGC):",
      error.response?.data || error.message,
    );
    return false;
  }
}

/**
 * Mevcut veya Yeni bir Access Token Alır
 */
async function getAccessToken(): Promise<string> {
  try {
    // 1. Token dosyasında var mı kontrol et
    const data = await fs.readFile(TOKEN_PATH, "utf-8");
    const tokenInfo = JSON.parse(data);

    if (tokenInfo.expiresAt && Date.now() > tokenInfo.expiresAt) {
      console.log("⚠️ LinkedIn Token suresi dolmus.");
      await sendErrorNotification("LinkedIn Token", "Token suresi doldu! Yenileme gerekli. VPS'te 'npm run linkedin-auth' calistirin.");
      throw new Error("LinkedIn token suresi dolmus. Yenileyin.");
    }
    return tokenInfo.access_token;
  } catch (error) {
    console.log("ℹ️ LinkedIn Token bulunamadi.");
    await sendErrorNotification("LinkedIn Token", "Token dosyasi bulunamadi! VPS'te 'npm run linkedin-auth' calistirin.");
    throw new Error("LinkedIn token bulunamadi. Once yetkilendirme yapin.");
  }
}

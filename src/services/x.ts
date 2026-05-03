import { TwitterApi } from "twitter-api-v2";
import dotenv from "dotenv";
import fs from "fs";

dotenv.config();

// ─── X POST KILL SWITCH ───
// X_PAUSED=true ise tüm X gönderileri durdurulur
function isXPaused(): boolean {
  if (process.env.X_PAUSED === "true") {
    console.log("⏸️ X GÖNDERİLERİ DURDURULDU (X_PAUSED=true)");
    return true;
  }
  return false;
}

// ─── GÜNLÜK POST LIMITİ ───
const MAX_DAILY_X_POSTS = 3;
let dailyXPostCount = 0;
let dailyXPostDate = "";

function checkDailyLimit(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (dailyXPostDate !== today) {
    dailyXPostCount = 0;
    dailyXPostDate = today;
  }
  if (dailyXPostCount >= MAX_DAILY_X_POSTS) {
    console.log(
      `⏸️ X GÜNLÜK LİMİT: ${dailyXPostCount}/${MAX_DAILY_X_POSTS} — bugünlük gönderi yapılmaz.`,
    );
    return true;
  }
  return false;
}

// ─── DUPLICATE KORUMA (In-Memory + Supabase) ───
const recentXTopics: string[] = [];
const MAX_RECENT_TOPICS = 20;

function isDuplicateTopicLocal(topic: string): boolean {
  const normalized = topic.toLowerCase().trim().substring(0, 60);
  for (const recent of recentXTopics) {
    if (recent.includes(normalized) || normalized.includes(recent)) {
      console.log(`🔁 X DUPLICATE (memory): "${normalized.substring(0, 40)}..." atlandı.`);
      return true;
    }
  }
  recentXTopics.push(normalized);
  if (recentXTopics.length > MAX_RECENT_TOPICS) recentXTopics.shift();
  return false;
}

async function isDuplicateTopicSupabase(topic: string): Promise<boolean> {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) return false;

    const keyword = topic.toLowerCase().trim().substring(0, 40);
    const url = `${supabaseUrl}/rest/v1/linkedin+x?select=topic&topic=ilike.*${encodeURIComponent(keyword)}*&order=published_at.desc&limit=5`;
    const res = await fetch(url, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      console.log(`🔁 X DUPLICATE (Supabase): "${keyword}..." daha önce paylaşılmış.`);
      return true;
    }
  } catch {
    // Supabase kontrolü başarısız olursa devam et
  }
  return false;
}

/**
 * X (Twitter) API v2 kullanarak paylaşım yapar.
 * X Ban Koruması ve Güvenlik Bariyerleri İçerir.
 */
export async function createXPost(
  text: string,
  imagePath?: string,
  topic?: string,
): Promise<string | null> {
  // --- GÜVENLİK BARİYERLERİ ---
  if (isXPaused()) return null;

  if (!text || text.trim().length < 10) {
    console.error(
      "❌ BAN KORUMASI: Boş veya çok kısa metin X'te paylaşılamaz!",
    );
    return null;
  }

  if (checkDailyLimit()) return null;

  if (topic) {
    if (isDuplicateTopicLocal(topic)) return null;
    if (await isDuplicateTopicSupabase(topic)) return null;
  }
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

    dailyXPostCount++;
    console.log(
      `🚀 X Gönderisi Başarıyla Yayına Alındı! Tweet ID: ${tweet.data.id} (${dailyXPostCount}/${MAX_DAILY_X_POSTS} günlük)`,
    );
    return `https://x.com/i/status/${tweet.data.id}`;
  } catch (error: any) {
    const errData = error.data || {};
    if (errData?.status === 403 || errData?.detail?.includes("locked")) {
      console.error("🔒 X HESAP KİLİTLİ! X_PAUSED=true olarak işaretleniyor.");
      process.env.X_PAUSED = "true";
    }
    console.error("❌ X Paylaşım Hatası:", errData || error.message);
    return null;
  }
}

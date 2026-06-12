import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { fetchReadyPosts } from "./services/google.js";
import { updateRowStatus } from "./services/google.js";
import { createLinkedInPost } from "./services/linkedin.js";
import { createXPost } from "./services/x.js";
import { initEnvFromSupabase, insertPublishedPost } from "./services/supabase.js";
import {
  sendPublishNotification,
  sendErrorNotification,
} from "./services/telegram.js";

function toDirectDownloadUrl(url: string): string {
  // Google Drive /file/d/ID/view → doğrudan indirme URL'sine çevir
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  if (driveMatch) {
    const fileId = driveMatch[1];
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }
  // Zaten direct download linki ise dokunma
  if (url.includes("drive.google.com/uc?")) return url;
  return url;
}

async function downloadImageToTemp(imageUrl: string): Promise<string> {
  const directUrl = toDirectDownloadUrl(imageUrl);
  console.log(`📥 Görsel indiriliyor: ${directUrl.substring(0, 80)}...`);

  const response = await axios.get(directUrl, {
    responseType: "arraybuffer",
    timeout: 60_000,
    maxRedirects: 5,
  });

  const tempDir = path.join(process.cwd(), "temp_images");
  try {
    await fs.access(tempDir);
  } catch {
    await fs.mkdir(tempDir, { recursive: true });
  }

  const contentType = String(response.headers["content-type"] || "image/png");
  const ext =
    contentType.includes("jpeg") || contentType.includes("jpg")
      ? ".jpg"
      : contentType.includes("webp")
        ? ".webp"
        : ".png";

  const fileName = `ready_post_${Date.now()}${ext}`;
  const filePath = path.join(tempDir, fileName);

  await fs.writeFile(filePath, response.data);
  console.log(`✅ Görsel kaydedildi: ${filePath}`);
  return filePath;
}

function detectColumn(
  data: Record<string, any>,
  candidates: string[],
): string | undefined {
  const normalizedCandidates = candidates.map((c) =>
    c.toLowerCase().replace(/[\s_-]/g, ""),
  );
  return Object.keys(data).find((k) => {
    const normalized = k.toLowerCase().replace(/[\s_-]/g, "");
    return normalizedCandidates.includes(normalized);
  });
}

export async function runReadyPostWorkflow() {
  console.log("\n📋 Hazır Post Akışı Başlatılıyor (linkedin excel)...");

  await initEnvFromSupabase();

  try {
    const records = await fetchReadyPosts();
    if (records.length === 0) {
      console.log("📭 Hiç kayıt bulunamadı.");
      return;
    }

    // İlk bekleyen kaydı bul
    const pending = records.find((r) => {
      const statusKey = detectColumn(r.data, [
        "durum", "status", "state", "yayın", "paylasim",
      ]);
      if (!statusKey) {
        console.warn(`⚠️ Satır ${r.rowNumber}: Durum sütunu bulunamadı, atlanıyor.`);
        return false;
      }
      const val = String(r.data[statusKey] || "")
        .trim()
        .toLowerCase();
      return !(
        val === "done" ||
        val === "bitti" ||
        val === "yayınlandı" ||
        val.startsWith("yayinlandi") ||
        val === "published"
      );
    });

    if (!pending) {
      console.log("✅ Paylaşılacak hazır post kalmadı!");
      return;
    }

    const { rowNumber, data } = pending;
    console.log(`\n🎯 Satır ${rowNumber} seçildi.`);

    // --- Sütun Keşfi ---
    // Bilinen sütun adları: "linkedin post", "url", "status"
    const columns = Object.keys(data);
    console.log(`📋 Sütunlar: ${columns.join(", ")}`);

    const postKey =
      columns.find((k) => k.toLowerCase() === "linkedin post") ||
      detectColumn(data, [
        "post", "linkedin", "linkedinpost", "metin", "text",
        "content", "icerik", "paylasim", "caption", "aciklama",
        "yazi",
      ]) ||
      columns.find((k) => String(data[k] || "").length > 50);

    if (!postKey) {
      console.error(`❌ Satır ${rowNumber}'da post metni bulunamadı.`);
      return;
    }

    const postText = String(data[postKey]).trim();
    console.log(
      `📝 Post metni bulundu (${postText.length} karakter, sütun: "${postKey}")`,
    );

    const imageKey =
      columns.find((k) => k.toLowerCase() === "url") ||
      detectColumn(data, [
        "image", "görsel", "resim", "gorsel", "foto", "photo",
        "media", "görselurl", "resimurl", "imageurl",
        "görsellink", "fotolink", "photourl", "link",
      ]);

    if (!imageKey) {
      console.error(`❌ Satır ${rowNumber}'da görsel URL sütunu bulunamadı.`);
      console.error(`   Mevcut sütunlar: ${columns.join(", ")}`);
      return;
    }

    const imageUrl = String(data[imageKey]).trim();
    console.log(`🖼️ Görsel URL bulundu (sütun: "${imageKey}")`);

    // --- Güvenlik Kontrolleri ---
    if (!postText || postText.length < 10) {
      console.error("❌ Post metni boş veya çok kısa! Paylaşım iptal.");
      return;
    }

    if (!imageUrl || (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://"))) {
      console.error("❌ Görsel URL geçersiz! Paylaşım iptal.");
      return;
    }

    // --- Görseli İndir ---
    let imagePath: string;
    try {
      imagePath = await downloadImageToTemp(imageUrl);
    } catch (err: any) {
      console.error(`❌ Görsel indirilemedi: ${err.message}`);
      await sendErrorNotification("Hazır Post Akışı", `Görsel indirme hatası: ${err.message}`);
      return;
    }

    // --- Konu Belirle (Supabase ve X için) ---
    const topicKey =
      detectColumn(data, [
        "konu", "topic", "başlık", "baslik", "title", "subject",
      ]) || postKey;
    const topic = String(data[topicKey]).substring(0, 100);

    // --- LinkedIn Paylaşımı ---
    let linkedinSuccess = false;
    let linkedinError = "";
    let linkedinUrl = "";

    try {
      const liResult = await createLinkedInPost(postText, imagePath);
      if (liResult) {
        console.log("✅ LinkedIn hazır post yayınlandı!");
        linkedinSuccess = true;
        linkedinUrl = liResult;
      } else {
        linkedinError = "createLinkedInPost null döndü";
        console.error("❌ LinkedIn paylaşımı başarısız (null döndü).");
      }
    } catch (err: any) {
      if (err.message === "SKIP_LINKEDIN") {
        console.log("⏭️ LinkedIn atlanıyor (token yok).");
        linkedinError = "Token yok, atlandı";
      } else {
        linkedinError = err.message;
        console.error("❌ LinkedIn paylaşım hatası:", linkedinError);
      }
    }

    // --- X Paylaşımı ---
    let xSuccess = false;
    let xError = "";
    let xUrl = "";

    try {
      const xResult = await createXPost(postText, imagePath, topic || `Hazır Post (Satır ${rowNumber})`);
      if (xResult) {
        console.log("✅ X hazır post yayınlandı!");
        xSuccess = true;
        xUrl = xResult;
      } else {
        xError = "createXPost null döndü";
        console.error("❌ X paylaşımı başarısız (null döndü).");
      }
    } catch (err: any) {
      xError = err.message;
      console.error("❌ X paylaşım hatası:", xError);
    }

    // --- Durum Güncelle ---
    if (linkedinSuccess || xSuccess) {
      await updateRowStatus(pending._rawRow, "Done");
      console.log(`📊 Sheet güncellendi: Satır ${rowNumber} → Done`);
    }

    // --- Supabase Kayıt ---
    await insertPublishedPost({
      topic: topic || `Hazır Post (Satır ${rowNumber})`,
      linkedin_post: postText,
      x_post: postText,
      image_url: imagePath,
      linkedin_url: linkedinUrl || undefined,
      x_url: xUrl || undefined,
      source: "excel",
      status: linkedinSuccess || xSuccess ? "published" : "failed",
    });

    // --- Telegram Bildirim ---
    await sendPublishNotification({
      topic: topic || `Hazır Post (Satır ${rowNumber})`,
      linkedinSuccess,
      xSuccess,
      linkedinError: linkedinError || undefined,
      xError: xError || undefined,
      source: "ready_post",
    });

    // Not: temp görseller artık silinmiyor — debug ve arşiv için kalıcı tutuluyor

    if (linkedinSuccess || xSuccess) {
      console.log("\n✨ Hazır post akışı başarıyla tamamlandı.");
    } else {
      console.log("\n❌ Hazır post akışı başarısız.");
    }
  } catch (error: any) {
    console.error("\n💥 Hazır Post Akış Hatası:", error.message);
    await sendErrorNotification("Hazır Post Akışı", error.message);
  }
}

// Doğrudan çalıştırma desteği (npm run ready-post)
const isMainModule =
  process.argv[1]?.includes("ready_post_agent");
if (isMainModule) {
  runReadyPostWorkflow();
}

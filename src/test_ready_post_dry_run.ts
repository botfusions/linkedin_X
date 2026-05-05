import axios from "axios";
import fs from "fs/promises";
import path from "path";
import { fetchReadyPosts } from "./services/google.js";
import { initEnvFromSupabase } from "./services/supabase.js";

function toDirectDownloadUrl(url: string): string {
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  if (driveMatch) {
    const fileId = driveMatch[1];
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }
  if (url.includes("drive.google.com/uc?")) return url;
  return url;
}

async function downloadImageToTemp(imageUrl: string): Promise<string> {
  const directUrl = toDirectDownloadUrl(imageUrl);
  console.log(`  📥 Görsel indirme testi yapılıyor (direct URL)...`);
  const response = await axios.get(directUrl, {
    responseType: "arraybuffer",
    timeout: 60_000,
    maxRedirects: 5,
  });

  const tempDir = path.join(process.cwd(), "temp_images");
  try { await fs.access(tempDir); } catch { await fs.mkdir(tempDir, { recursive: true }); }

  const contentType = String(response.headers["content-type"] || "image/png");
  const ext = contentType.includes("jpeg") || contentType.includes("jpg")
    ? ".jpg" : contentType.includes("webp") ? ".webp" : ".png";

  const fileName = `dryrun_${Date.now()}${ext}`;
  const filePath = path.join(tempDir, fileName);
  await fs.writeFile(filePath, response.data);
  return filePath;
}

export async function runReadyPostDryRun() {
  console.log("\n🧪 === DRY-RUN TEST: Hazır Post Akışı ===\n");
  console.log("⚠️ LinkedIn'e GÖNDERİLMEYECEK — sadece veri okuma ve kontrol\n");

  await initEnvFromSupabase();

  try {
    const records = await fetchReadyPosts();
    if (records.length === 0) {
      console.log("📭 Hiç kayıt bulunamadı.");
      return;
    }

    console.log(`📊 Toplam ${records.length} kayıt bulundu.\n`);

    // Bekleyen kaydı bul
    const pending = records.find((r) => {
      const statusKey =
        Object.keys(r.data).find(
          (k) => k.toLowerCase() === "status" || k.toLowerCase() === "durum",
        ) || Object.keys(r.data)[0] || "";
      const val = String(r.data[statusKey] || "").trim().toLowerCase();
      return !(val === "done" || val === "bitti" || val.startsWith("yayinlandi") || val === "published");
    });

    if (!pending) {
      console.log("✅ Paylaşılacak hazır post kalmadı — tümü yayınlanmış!");
      return;
    }

    const { rowNumber, data } = pending;
    const columns = Object.keys(data);

    // ─── SONUÇ RAPORU ───
    console.log("═══════════════════════════════════════════");
    console.log(`  SATIR ${rowNumber} — BEKLEYEN KAYIT`);
    console.log("═══════════════════════════════════════════\n");

    // Tüm sütunları göster
    for (const col of columns) {
      const val = String(data[col] || "(boş)");
      console.log(`  📌 "${col}":`);
      console.log(`     ${val.length > 200 ? val.substring(0, 200) + "..." : val}`);
      console.log();
    }

    // Sütun eşleşme testi
    const postKey = columns.find((k) => k.toLowerCase() === "linkedin post");
    const imageKey = columns.find((k) => k.toLowerCase() === "url");
    const statusKey = columns.find((k) => k.toLowerCase() === "status");

    console.log("───────────────────────────────────────────");
    console.log("  SÜTUN EŞLEŞTİRME SONUÇLARI");
    console.log("───────────────────────────────────────────");
    console.log(`  Post sütunu:  ${postKey ? `✅ "${postKey}"` : "❌ BULUNAMADI"}`);
    console.log(`  Görsel sütunu: ${imageKey ? `✅ "${imageKey}"` : "❌ BULUNAMADI"}`);
    console.log(`  Durum sütunu:  ${statusKey ? `✅ "${statusKey}"` : "❌ BULUNAMADI"}`);
    console.log();

    // Post metni kontrolü
    if (postKey) {
      const postText = String(data[postKey]).trim();
      console.log("───────────────────────────────────────────");
      console.log("  POST METNİ KONTROLÜ");
      console.log("───────────────────────────────────────────");
      console.log(`  Uzunluk: ${postText.length} karakter ${postText.length >= 10 ? "✅" : "❌ (çok kısa)"}`);
      console.log(`  İçerik:\n${postText}\n`);
    }

    // Görsel URL kontrolü
    if (imageKey) {
      const imageUrl = String(data[imageKey]).trim();
      console.log("───────────────────────────────────────────");
      console.log("  GÖRSEL URL KONTROLÜ");
      console.log("───────────────────────────────────────────");
      console.log(`  URL: ${imageUrl}`);
      console.log(`  Format: ${imageUrl.startsWith("http") ? "✅ Geçerli URL" : "❌ Geçersiz URL"}`);
      console.log(`  Google Drive: ${imageUrl.includes("drive.google.com") ? "✅ Direct download URL'e çevrilecek" : "Normal URL"}`);

      // Görseli indirmeyi dene
      try {
        console.log("\n  📥 Görsel indirme testi yapılıyor...");
        const filePath = await downloadImageToTemp(imageUrl);
        const stats = await fs.stat(filePath);
        console.log(`  ✅ Görsel başarıyla indirildi: ${filePath}`);
        console.log(`  📦 Dosya boyutu: ${(stats.size / 1024).toFixed(1)} KB`);

        // Dosya boyutu kontrolü
        if (stats.size < 1000) {
          console.log("  ⚠️ UYARI: Dosya çok küçük, gerçek bir görsel olmayabilir!");
        }

        // Temizlik
        await fs.unlink(filePath);
        console.log("  🗑️ Test dosyası silindi.");
      } catch (err: any) {
        console.log(`  ❌ Görsel indirme başarısız: ${err.message}`);
      }
    }

    console.log("\n═══════════════════════════════════════════");
    console.log("  DRY-RUN TAMAMLANDI");
    console.log("  LinkedIn'e hiçbir şey gönderilmedi.");
    console.log("═══════════════════════════════════════════\n");

  } catch (error: any) {
    console.error("\n💥 Dry-Run Hatası:", error.message);
  }
}

runReadyPostDryRun();

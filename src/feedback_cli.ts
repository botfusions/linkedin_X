/**
 * GERİ BİLDİRİM RAPORU CLI
 *
 *   npm run feedback:rapor
 *
 * Okur:  OBSIDIAN_LINKEDIN_DIR (varsayılan ~/Documents/Claude-Media/linkedin/yorumlar)
 * Yazar: <kasa>/feedback/feedback-raporu.md  (sabit isim, üzerine yazar — deterministik)
 *
 * Notları ASLA değiştirmez; yalnızca okur ve rapor üretir.
 * Dizin yoksa veya okunamazsa çıkış kodu 1 ile biter (fail-closed).
 */

import dotenv from "dotenv";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { buildFeedbackReport, loadNotes } from "./services/feedback_loop.js";

dotenv.config();

const YORUMLAR_DIR =
  process.env.OBSIDIAN_LINKEDIN_DIR ||
  path.join(os.homedir(), "Documents", "Claude-Media", "linkedin", "yorumlar");

async function main(): Promise<void> {
  const stat = await fs.stat(YORUMLAR_DIR).catch(() => null);
  if (!stat?.isDirectory()) {
    console.error(`❌ Yorumlar dizini bulunamadı: ${YORUMLAR_DIR}`);
    console.error("   OBSIDIAN_LINKEDIN_DIR ayarla veya kasa yolunu kontrol et.");
    process.exit(1);
  }

  const notlar = await loadNotes(YORUMLAR_DIR);
  const rapor = buildFeedbackReport(notlar, YORUMLAR_DIR);

  const kasaKok = path.dirname(YORUMLAR_DIR);
  const raporDizini = path.join(kasaKok, "feedback");
  await fs.mkdir(raporDizini, { recursive: true });
  const raporYolu = path.join(raporDizini, "feedback-raporu.md");
  await fs.writeFile(raporYolu, rapor, "utf-8");

  const yayinlanan = notlar.filter((n) => n.durum === "yayinlandi").length;
  const metrikli = notlar.filter(
    (n) =>
      n.durum === "yayinlandi" &&
      (n.tepki24 !== null || n.yorum24 !== null || n.tepki7 !== null || n.yorum7 !== null),
  ).length;
  console.log(`📊 ${notlar.length} not okundu → ${raporYolu}`);
  console.log(`   Yayınlanmış: ${yayinlanan} | Metrikli: ${metrikli} | Metriksiz (fail-closed): ${yayinlanan - metrikli}`);
}

main().catch((err: any) => {
  console.error("❌ Geri bildirim raporu üretilemedi:", err?.message ?? String(err));
  process.exit(1);
});

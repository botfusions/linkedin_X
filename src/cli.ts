#!/usr/bin/env node
/**
 * LinkedIn Post Optimizer CLI
 * Bağımsız komut satırı aracı.
 *
 * Kullanım:
 *   npx tsx src/cli.ts analyze  <dosya.txt>
 *   npx tsx src/cli.ts score    <dosya.txt>
 *   npx tsx src/cli.ts link-guard <dosya.txt>
 *   npx tsx src/cli.ts schedule
 *   npx tsx src/cli.ts optimize <dosya.txt>   (AI revize ile)
 */

import fs from "fs";
import path from "path";
import {
  scorePost,
  checkLinkGuard,
  getOptimalSchedule,
  formatResult,
  optimizeWithSelfImprove,
} from "./services/optimizer.js";

const args = process.argv.slice(2);
const command = args[0];
const filePath = args[1];

function readPostFile(fp: string): string {
  const resolved = path.resolve(fp);
  if (!fs.existsSync(resolved)) {
    console.error(`❌ Dosya bulunamadı: ${resolved}`);
    process.exit(1);
  }
  return fs.readFileSync(resolved, "utf-8").trim();
}

function showHelp() {
  console.log(`
LinkedIn Post Optimizer CLI
━━━━━━━━━━━━━━━━━━━━━━━━━━

KOMUTLAR:
  analyze    <dosya>    Metrik kontrol (karakter, satır, hashtag, hook)
  score      <dosya>    0-100 algoritma uyum skoru + öneriler
  link-guard <dosya>    Link tespiti + ilk yorum şablonu
  schedule              Optimal gönderim zamanı önerisi
  optimize   <dosya>    AI destekli otomatik revize (skor <80 ise)

ÖRNEK:
  npx tsx src/cli.ts score examples/sample_post.txt
  npx tsx src/cli.ts optimize examples/sample_post.txt
`);
}

async function main() {
  if (!command || command === "help" || command === "--help") {
    showHelp();
    return;
  }

  switch (command) {
    case "analyze":
    case "score": {
      if (!filePath) {
        console.error("❌ Dosya yolu gerekli.");
        process.exit(1);
      }
      const post = readPostFile(filePath);
      const result = scorePost(post);
      console.log(formatResult(result));
      break;
    }

    case "link-guard": {
      if (!filePath) {
        console.error("❌ Dosya yolu gerekli.");
        process.exit(1);
      }
      const post = readPostFile(filePath);
      const guard = checkLinkGuard(post);
      if (!guard.hasLinks) {
        console.log("✅ Post içinde link yok — erişim sorunu yok.");
      } else {
        console.log(`⚠️  ${guard.links.length} link tespit edildi:\n`);
        guard.links.forEach((l: string, i: number) =>
          console.log(`  ${i + 1}. ${l}`),
        );
        console.log("\n📝 İlk Yorum Şablonu:");
        console.log("─".repeat(40));
        console.log(guard.firstCommentTemplate);
        console.log("─".repeat(40));
        console.log("\n📄 Temizlenmiş Post:");
        console.log("─".repeat(40));
        console.log(guard.cleanedPost);
      }
      break;
    }

    case "schedule": {
      const sched = getOptimalSchedule();
      console.log(`\n📅 Bugün: ${sched.today}`);
      console.log("─".repeat(35));
      sched.times.forEach((t: string) => console.log(`  ⏰ ${t}`));
      console.log("");
      break;
    }

    case "optimize": {
      if (!filePath) {
        console.error("❌ Dosya yolu gerekli.");
        process.exit(1);
      }
      const post = readPostFile(filePath);
      console.log("🚀 AI Destekli Optimizasyon Başlatılıyor...\n");

      const firstResult = scorePost(post);
      console.log("📊 Mevcut Post Analizi:");
      console.log(formatResult(firstResult));

      if (firstResult.percentage >= 80) {
        console.log(
          `\n✅ Skor ${firstResult.percentage}/100 — revize gerekmez!`,
        );
        return;
      }

      console.log(
        `\n⚠️  Skor ${firstResult.percentage}/100 — AI revize başlatılıyor...`,
      );
      const optimized = await optimizeWithSelfImprove(post, "CLI Manuel");

      console.log("\n" + "═".repeat(50));
      console.log("📊 FİNAL SONUÇLAR");
      console.log("═".repeat(50));
      console.log(
        `Skor:      ${firstResult.percentage} → ${optimized.finalScore}`,
      );
      console.log(`Revize:    ${optimized.revisionCount} deneme`);
      console.log(
        `Durum:     ${optimized.finalScore >= 80 ? "✅ Yayınlanabilir" : "⚠️ Düşük skor — manuel kontrol gerekli"}`,
      );
      console.log("─".repeat(50));
      console.log("\n📝 Optimize Edilmiş Post:");
      console.log("─".repeat(50));
      console.log(optimized.finalPost);
      console.log("─".repeat(50));
      break;
    }

    default:
      console.error(`❌ Bilinmeyen komut: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main().catch(console.error);

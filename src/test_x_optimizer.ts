import {
  scoreXPost,
  optimizeXWithSelfImprove,
} from "./services/x_optimizer.js";
import dotenv from "dotenv";

dotenv.config();

async function testXOptimizer() {
  console.log("\n🧪 X Optimizer TEST Akışı Başlatılıyor...");

  const badXPost = `SEO bitti arkadaşlar. Herkes GEO konuşuyor. Biz Botfusions olarak bu işin içindeyiz. www.botfusions.com/geo-hizmeti linkinden bakın. #SEO #GEO #AI #Marketing #Digital #Tech #Future #Success`;

  console.log("\n📝 Orijinal (Zayıf) Post:");
  console.log("------------------------------------------");
  console.log(badXPost);
  console.log("------------------------------------------");

  const initialScore = scoreXPost(badXPost);
  console.log(`\n📊 İlk Skor: ${initialScore.percentage}/100`);
  console.log(
    "❌ Başarısız Kurallar:",
    initialScore.ruleResults
      .filter((r) => !r.result.passed)
      .map((r) => r.rule)
      .join(", "),
  );

  console.log("\n🚀 AI Optimizasyon Başlatılıyor...");
  const { finalPost, finalScore, revisionCount } =
    await optimizeXWithSelfImprove(badXPost, "GEO Devrimi");

  console.log("\n✅ Optimize Edilmiş Post:");
  console.log("------------------------------------------");
  console.log(finalPost);
  console.log("------------------------------------------");
  console.log(`\n🏆 Final Skor: ${finalScore}/100`);
  console.log(`🔄 Revizyon Sayısı: ${revisionCount}`);
}

testXOptimizer();

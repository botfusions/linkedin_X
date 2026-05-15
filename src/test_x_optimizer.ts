import {
  scoreXPost,
  buildXThread,
} from "./services/x_optimizer.js";
import dotenv from "dotenv";

dotenv.config();

function testScoreXPost() {
  console.log("\n═══════════════════════════════════════");
  console.log("🧪 TEST 1: X Skorlama (10 Kural)");
  console.log("═══════════════════════════════════════");

  // Kötü post — birçok kuralı başarısız etmeli
  const badPost = `SEO bitti arkadaşlar. Herkes GEO konuşuyor. Biz Botfusions olarak bu işin içindeyiz. www.botfusions.com/geo-hizmeti linkinden bakın. #SEO #GEO #AI #Marketing #Digital #Tech #Future #Success`;

  console.log("\n📝 Test Postu (Zayıf):");
  console.log(badPost);

  const result = scoreXPost(badPost);
  console.log(`\n📊 Toplam Skor: ${result.percentage}/100`);
  console.log(`📐 Analiz: ${result.analysis.charCount} char, ${result.analysis.wordCount} kelime, ${result.analysis.hashtagCount} hashtag`);
  console.log(`🔍 Show more: ${result.analysis.showMoreTrigger ? "Evet" : "Hayır"} (${result.analysis.charCount} char)`);
  console.log(`🔍 Reply bait: ${result.analysis.replyBaitScore}/100`);
  console.log(`🔍 Dwell score: ${result.analysis.dwellScore}/100`);

  console.log("\n📋 Kural Sonuçları:");
  for (const { rule, result: r } of result.ruleResults) {
    const icon = r.passed ? "✅" : "❌";
    console.log(`  ${icon} ${rule}: ${r.score}/100 — ${r.message}`);
    if (r.suggestion) console.log(`     💡 ${r.suggestion}`);
  }

  // İyi post — yüksek skor almalı
  console.log("\n\n═══════════════════════════════════════");
  console.log("🧪 TEST 2: İyi Post Skorlaması");
  console.log("═══════════════════════════════════════");

  const goodPost = `%68'lik artış tesadüf değil! 🔥

Yapay zeka aramalarında görünürlük, artık SEO ile değil GEO ile sağlanıyor.

→ Geleneksel SEO: Google'da üst sıra
→ Yeni nesil GEO: AI yanıtlarında otorite

Bu geçiş şirketlerin %45'ini hazırlıksız yakaladı.

Siz bu dönüşüme hazır mısınız? #GEO #SEO #YapayZeka`;

  console.log("\n📝 Test Postu (İyi):");
  console.log(goodPost);

  const goodResult = scoreXPost(goodPost);
  console.log(`\n📊 Toplam Skor: ${goodResult.percentage}/100`);
  console.log(`📐 Analiz: ${goodResult.analysis.charCount} char, ${goodResult.analysis.wordCount} kelime, ${goodResult.analysis.hashtagCount} hashtag`);
  console.log(`🔍 Show more: ${goodResult.analysis.showMoreTrigger ? "Evet" : "Hayır"}`);
  console.log(`🔍 Reply bait: ${goodResult.analysis.replyBaitScore}/100`);
  console.log(`🔍 Dwell score: ${goodResult.analysis.dwellScore}/100`);

  console.log("\n📋 Kural Sonuçları:");
  for (const { rule, result: r } of goodResult.ruleResults) {
    const icon = r.passed ? "✅" : "❌";
    console.log(`  ${icon} ${rule}: ${r.score}/100 — ${r.message}`);
  }
}

function testThreadBuilder() {
  console.log("\n\n═══════════════════════════════════════");
  console.log("🧪 TEST 3: Thread Builder");
  console.log("═══════════════════════════════════════");

  const longText = `Yapay zeka artık sadece bir teknoloji değil, bir yaşam biçimi haline geldi. 2026 itibarıyla küresel AI pazarı 500 milyar doları aştı.

Bu büyüme beraberinde yeni meslekler ve fırsatlar getirdi. Prompt mühendisliği, AI etik uzmanlığı ve veri küratörlüğü gibi alanlar hızla büyüyor.

Türkiye'de durum nasıl? Son verilere göre Türkiye AI yatırımlarında Avrupa'da 7. sırada yer alıyor. Özellikle fintech ve healthtech alanlarında ciddi atılımlar var.

Botfusions olarak bu dönüşümün merkezinde duruyoruz. GEO (Generative Engine Optimization) yaklaşımımızla şirketlerin AI çağına hazırlanmasına yardımcı oluyoruz.

Sizce Türkiye AI yarışında nereye gidecek? Yorumlarda tartışalım! 🚀 #YapayZeka #Teknoloji #Botfusions`;

  console.log(`\n📝 Uzun metin: ${longText.length} karakter`);
  const thread = buildXThread(longText);

  console.log(`\n🧵 Thread: ${thread.length} tweet`);
  thread.forEach((tweet, i) => {
    console.log(`\n── Tweet ${i + 1}/${thread.length} (${tweet.length} char) ──`);
    console.log(tweet);
  });

  // Kısa metin — thread'e bölünmemeli
  const shortText = `Kısa bir post 🚀`;
  const shortThread = buildXThread(shortText);
  console.log(`\n📝 Kısa metin: "${shortText}" → ${shortThread.length} tweet (1 olmalı)`);
}

// Çalıştır
testScoreXPost();
testThreadBuilder();

import { readdirSync } from "node:fs";
import { validateDraft, VALIDATOR_BARRIERS } from "./services/comment_writer.js";
import { detectReaderQuestion } from "./services/engagement_scout.js";
import { isLinkedInFlowEnabled } from "./services/linkedin.js";

// §44: weather LinkedIn'e asla gitmemeli — env silinse bile hardcoded kapalı kalmali.
delete process.env.LINKEDIN_DISABLED_FLOWS;
if (isLinkedInFlowEnabled("weather") !== false) {
  throw new Error("weather hardcoded disabled degil (LINKEDIN_ALWAYS_DISABLED)");
}

const drafts = [
  "Saha verisi burada kritik ayrımı gösteriyor: içerik üretmek tek başına görünürlük getirmiyor. robots.txt erişimi, GPTBot ve ClaudeBot istekleriyle sunucu logları birlikte okunmadığında hangi sayfanın gerçekten alıntılandığını bilmiyoruz. Bu kontrol beş dakikada yapılabilir ve listenin sonraki adımını somutlaştırır. Siz bu erişilebilirlik kontrolünü ölçüm planına nasıl bağlıyorsunuz?",
  "Bu yaklaşımın güçlü tarafı içerik ile dağıtımı aynı çerçevede ele alması. Eksik halka ise görünürlük skorunun hangi ziyaretçiyi getirdiğini ve o ziyaretçinin gelir ürettiğini izlemek. UTM kaydı, bot user-agent taraması ve yedi günlük dönüşüm penceresi olmadan artış yalnızca bir sayı olarak kalıyor. Bu üç ölçümü aynı kartta takip ediyor musunuz?",
];

const before = readdirSync("/System/Volumes/Data/Hermes/Hermes_Agent/Linkedin/outputs");
const results = drafts.map((draft) => validateDraft(draft));
if (VALIDATOR_BARRIERS.length !== 6) throw new Error("6 validator bariyeri yok");
if (results.length !== 2 || results.some((r) => !r.ok)) {
  throw new Error(`İki taslak 6 bariyerden geçmedi: ${JSON.stringify(results)}`);
}
const question = detectReaderQuestion("Siz bu listeye hangi maddeyi eklerdiniz?");
if (!question.davet) throw new Error("Soru detection örneği yakalanmadı");
const after = readdirSync("/System/Volumes/Data/Hermes/Hermes_Agent/Linkedin/outputs");
if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("No-write testi başarısız: outputs değişti");

console.log(JSON.stringify({
  status: "GEÇTİ",
  draft_count: results.length,
  validator_barriers: VALIDATOR_BARRIERS,
  results,
  question_detection: question,
  no_write: before.length === after.length && JSON.stringify(before) === JSON.stringify(after),
}, null, 2));

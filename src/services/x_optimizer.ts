import { X_RULES, analyzeXPostText } from "./x_rules.js";
import type { RuleResult, PostAnalysis } from "./rules.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

function getOpenRouterKey(): string {
  return process.env.OPENROUTER_API_KEY || "";
}

export interface XOptimizationResult {
  totalScore: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  analysis: PostAnalysis;
  ruleResults: { rule: string; result: RuleResult }[];
  suggestions: string[];
}

export function scoreXPost(post: string): XOptimizationResult {
  const analysis = analyzeXPostText(post);
  const ruleResults: { rule: string; result: RuleResult }[] = [];
  const suggestions: string[] = [];
  let totalScore = 0;
  let maxScore = 0;

  for (const rule of X_RULES) {
    const result = rule.check(post);
    ruleResults.push({ rule: rule.name, result });
    totalScore += result.score * rule.weight;
    maxScore += 100 * rule.weight;
    if (result.suggestion)
      suggestions.push(`[${rule.name}] ${result.suggestion}`);
  }

  const percentage = Math.round((totalScore / maxScore) * 100);

  return {
    totalScore,
    maxScore,
    percentage,
    passed: percentage >= 80,
    analysis,
    ruleResults,
    suggestions,
  };
}

// ═══════════════════════════════════════
// THREAD BUILDER
// ═══════════════════════════════════════

const TWEET_CHAR_LIMIT = 280;

export function buildXThread(longText: string): string[] {
  const cleanText = longText.trim();
  if (cleanText.length <= TWEET_CHAR_LIMIT) return [cleanText];

  const tweets: string[] = [];
  const paragraphs = cleanText.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  let currentTweet = "";

  for (const para of paragraphs) {
    const trimmedPara = para.trim();

    // Paragraf tek başına sığmıyorsa cümle cümle böl
    if (trimmedPara.length > TWEET_CHAR_LIMIT - 10) {
      const sentences = trimmedPara.split(/(?<=[.!?。])\s+/);
      for (const sentence of sentences) {
        const candidate = currentTweet ? `${currentTweet}\n${sentence}` : sentence;
        if (candidate.length <= TWEET_CHAR_LIMIT - 10) {
          currentTweet = candidate;
        } else {
          if (currentTweet.trim()) tweets.push(currentTweet.trim());
          // Tek cümle çok uzunsa zorla böl
          if (sentence.length > TWEET_CHAR_LIMIT - 10) {
            const chunks = splitByLength(sentence, TWEET_CHAR_LIMIT - 10);
            currentTweet = chunks.pop() || "";
            tweets.push(...chunks);
          } else {
            currentTweet = sentence;
          }
        }
      }
    } else {
      const candidate = currentTweet ? `${currentTweet}\n\n${trimmedPara}` : trimmedPara;
      if (candidate.length <= TWEET_CHAR_LIMIT - 10) {
        currentTweet = candidate;
      } else {
        if (currentTweet.trim()) tweets.push(currentTweet.trim());
        currentTweet = trimmedPara;
      }
    }
  }

  if (currentTweet.trim()) tweets.push(currentTweet.trim());

  // Thread numaralandırma ekle
  const total = tweets.length;
  if (total > 1) {
    return tweets.map((t, i) => {
      const numbering = `${i + 1}/${total} `;
      // İlk tweet'e numara ekle
      if (i === 0) return `${numbering}${t}`;
      // Son tweet'e numara ekle
      if (i === total - 1) return `${numbering}${t}`;
      return `${numbering}${t}`;
    });
  }

  return tweets;
}

function splitByLength(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxLen) {
    const splitAt = remaining.lastIndexOf(" ", maxLen);
    const cutPoint = splitAt > maxLen * 0.5 ? splitAt : maxLen;
    chunks.push(remaining.substring(0, cutPoint).trim());
    remaining = remaining.substring(cutPoint).trim();
  }
  if (remaining.trim()) chunks.push(remaining.trim());
  return chunks;
}

// ═══════════════════════════════════════
// AI-POWERED SELF-IMPROVEMENT
// ═══════════════════════════════════════

export async function optimizeXWithSelfImprove(
  post: string,
  topic: string,
): Promise<{
  finalPost: string;
  finalScore: number;
  revisionCount: number;
}> {
  let currentPost = post;
  let currentResult = scoreXPost(currentPost);
  let attempts = 0;
  const MAX_ATTEMPTS = 3;

  console.log(`\n📊 X İlk skor: ${currentResult.percentage}/100`);

  while (currentResult.percentage < 80 && attempts < MAX_ATTEMPTS) {
    attempts++;
    console.log(`\n🔄 X Revize denemesi ${attempts}/${MAX_ATTEMPTS}...`);

    const failedRules = currentResult.ruleResults
      .filter((r) => !r.result.passed)
      .map((r) => `- ${r.rule}: ${r.result.message} → ${r.result.suggestion}`)
      .join("\n");

    const prompt = `Sen bir X (Twitter) içerik editörüsün. X'in açık kaynak algoritmasından (Phoenix transformer) elde edilen içgörülere göre bu postu optimize et.

SKOR: ${currentResult.percentage}/100 (Hedef: 80+)

BAŞARISIZ KURALLAR:
${failedRules}

MEVCUT POST:
"""
${currentPost}
"""

━━━ X ALGORİTMA İÇGÖRÜLERİ (Phoenix Model) ━━━
1. REPLY RATE EN ÖNEMLİ SİNYAL: P(reply) en yüksek ağırlıklı prediksiyon. Her posta en az 1 soru ekle.
2. HOOK KRİTİK: İlk 70 karakter algoritmanın karar verdiği alan. Rakam, soru veya çarpıcı iddia ile başla.
3. SHOW MORE = DWELL TIME: 258+ karakter "Show more" tetikler, dwell time artar.
4. MEDIA-FIRST: P(photo_expand) ayrı tracked. Her posta görsel eklenmeli (sistem otomatik ekler).
5. NEGATİF SİNYALLERDEN KAÇIN: RT isteği, takip çağrısı, clickbait → P(block_author) artar.
6. HASHTAG: 2-3 ideal, 4+ spam riski.
7. AUTHOR DIVERSITY: Aynı yazar çok sık post → score azaltma.

━━━ DÜZELTME TALİMATLARI ━━━
1. Başarısız kuralları düzelt.
2. Klişelerden KAÇIN: "Günümüzde", "Yapay zeka sayesinde", "X Premium gücüyle" gibi ifadeleri asla kullanma.
3. İlk satırda (Hook) çok iddialı ol — rakam, soru veya şaşırtıcı iddia.
4. 258-600 karakter arası hedefle (Show more + kısa kalite).
5. En az 1 soru sor (reply rate için).
6. Max 2-3 hashtag.
7. Emoji ile metin oranı dengeli olsun (1-3 emoji).
8. Eğer içerik 1000+ karakter ise thread formatına dönüştür.

SADECE düzeltilmiş post metnini döndür.`;

    try {
      const OPENROUTER_API_KEY = getOpenRouterKey();
      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 4000,
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
          },
        },
      );

      const revised = response.data.choices[0].message.content?.trim();
      if (revised) {
        currentPost = revised;
        currentResult = scoreXPost(currentPost);
        console.log(`📊 Yeni X skoru: ${currentResult.percentage}/100`);
      }
    } catch (error) {
      console.error("❌ X Auto-Revize Hatası:", error);
      break;
    }
  }

  return {
    finalPost: currentPost,
    finalScore: currentResult.percentage,
    revisionCount: attempts,
  };
}

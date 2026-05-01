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

    const prompt = `Sen bir X (Twitter) içerik editörüsün. X Premium kurallarına göre bu postu optimize et.
Skor: ${currentResult.percentage}/100 (Hedef: 80+).

BAŞARISIZ KURALLAR:
${failedRules}

MEVCUT POST:
"""
${currentPost}
"""

GÖREV:
1. Kuralları düzelt.
2. Botfusions## 🎨 Görsel Tasarım (Cyberpunk Infographic)
![GEO Future Infographic](geo_future_infographic_1777147489401.jpg)
3. Klişelerden KAÇIN: "X Premium gücüyle", "Günümüzde", "Yapay zeka sayesinde" gibi ifadeleri asla kullanma.
4. "Precision in every byte" felsefesini hissettir.
5. X Premium avantajını (uzun metin) kaliteyi artırmak için kullan (280-1000 karakter), ama boş laf kalabalığı yapma.
6. İlk satırda (Hook) çok iddialı ol.
7. Hashtag sayısını 2-3 yap.

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

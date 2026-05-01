import type { Rule, RuleResult, PostAnalysis } from "./rules.js";
import {
  extractHashtags,
  extractLinks,
  countEmojis,
  countBulletPoints,
  detectCTA,
} from "./rules.js";

/**
 * X (Twitter) Algoritma Kuralları (2025-2026)
 * X Premium hesaplar için optimize edilmiştir.
 */

export function analyzeXPostText(text: string): PostAnalysis {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const firstLine = lines[0] || "";
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  return {
    charCount: text.length,
    wordCount: text.split(/\s+/).filter((w) => w.length > 0).length,
    lineBreaks: (text.match(/\n/g) || []).length,
    hashtagCount: extractHashtags(text).length,
    hashtags: extractHashtags(text),
    hasLink: extractLinks(text).length > 0,
    links: extractLinks(text),
    firstLine,
    paragraphs,
    emojiCount: countEmojis(text),
    questionCount: (text.match(/\?/g) || []).length,
    ctaDetected: detectCTA(text),
    bulletPoints: countBulletPoints(text),
  };
}

export const X_RULES: Rule[] = [
  {
    id: "x_char_limit",
    name: "X Karakter Sınırı",
    category: "structure",
    description: "Premium için ideal 280-1000 karakter arası",
    weight: 9,
    check: (post: string): RuleResult => {
      const len = post.length;
      if (len < 50)
        return {
          passed: false,
          score: 10,
          message: `Çok kısa: ${len} karakter`,
          suggestion: "Daha fazla detay ekleyin.",
        };
      if (len > 25000)
        return {
          passed: false,
          score: 20,
          message: "Karakter sınırı aşıldı (25k+)",
          suggestion: "İçeriği kısaltın.",
        };
      // 258 karakterden sonrası "Show more" olur.
      // 280-1000 arası X Premium için profesyonel durur.
      if (len >= 200 && len <= 600)
        return {
          passed: true,
          score: 100,
          message: `İdeal Premium uzunluğu: ${len} karakter`,
        };
      return {
        passed: true,
        score: 80,
        message: `Kabul edilebilir: ${len} karakter`,
      };
    },
  },
  {
    id: "x_hook_strength",
    name: "X Hook Gücü",
    category: "engagement",
    description: "X'te ilk 100 karakter hayati önem taşır",
    weight: 10,
    check: (post: string): RuleResult => {
      const analysis = analyzeXPostText(post);
      const hook = analysis.firstLine;
      let score = 50;

      if (hook.length < 10) score -= 40;
      if (hook.length > 100) score -= 20; // Çok uzun kanca X'te bölünür
      if (/\d+%|!|\?/.test(hook)) score += 25;
      if (/ölmedi|devrim|gerçek|sırrı|fark|kayb|dikkat/i.test(hook))
        score += 25;

      score = Math.max(0, Math.min(100, score));

      return {
        passed: score >= 70,
        score,
        message: `X Hook: ${score >= 85 ? "Mükemmel" : score >= 70 ? "İyi" : "Zayıf"}`,
        suggestion:
          score < 70 ? "İlk satırı daha kısa ve çarpıcı yapın." : undefined,
      };
    },
  },
  {
    id: "x_hashtag_limit",
    name: "X Hashtag Sayısı",
    category: "algorithm",
    description: "X'te 1-2 hashtag idealdir",
    weight: 8,
    check: (post: string): RuleResult => {
      const count = extractHashtags(post).length;
      if (count === 0)
        return {
          passed: false,
          score: 40,
          message: "Hashtag yok",
          suggestion: "En az 1-2 hashtag ekleyin.",
        };
      if (count > 3)
        return {
          passed: false,
          score: 20,
          message: `${count} hashtag — spam riski!`,
          suggestion: "Hashtag sayısını 2-3 ile sınırlayın.",
        };
      if (count >= 1 && count <= 2)
        return { passed: true, score: 100, message: "İdeal hashtag sayısı" };
      return { passed: true, score: 80, message: `${count} hashtag` };
    },
  },
  {
    id: "x_visual_readability",
    name: "Görsel Okunabilirlik",
    category: "structure",
    description: "Boşluklar ve kısa paragraflar",
    weight: 6,
    check: (post: string): RuleResult => {
      const analysis = analyzeXPostText(post);
      const avgParaLen =
        analysis.charCount / Math.max(1, analysis.paragraphs.length);

      if (analysis.paragraphs.length < 2)
        return {
          passed: false,
          score: 30,
          message: "Tek blok metin",
          suggestion: "Paragraflara bölün.",
        };

      if (avgParaLen > 280)
        return {
          passed: false,
          score: 40,
          message: "Paragraflar çok uzun",
          suggestion: "Daha fazla boşluk bırakın.",
        };

      return { passed: true, score: 100, message: "Okunabilirlik yüksek" };
    },
  },
];

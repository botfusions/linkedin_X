/**
 * LinkedIn Algoritma Kuralları (2025-2026)
 * Skorlama motoru bu kurallara göre değerlendirme yapar.
 */

export interface Rule {
  id: string;
  name: string;
  category: "structure" | "engagement" | "algorithm" | "timing";
  description: string;
  weight: number;
  check: (post: string) => RuleResult;
}

export interface RuleResult {
  passed: boolean;
  score: number;
  message: string;
  suggestion?: string | undefined;
}

export interface PostAnalysis {
  charCount: number;
  wordCount: number;
  lineBreaks: number;
  hashtagCount: number;
  hashtags: string[];
  hasLink: boolean;
  links: string[];
  firstLine: string;
  paragraphs: string[];
  emojiCount: number;
  questionCount: number;
  ctaDetected: boolean;
  bulletPoints: number;
}

export function extractHashtags(text: string): string[] {
  return text.match(/#[\wçğıöşüÇĞİÖŞÜ]+/g) || [];
}

export function extractLinks(text: string): string[] {
  return text.match(/https?:\/\/[^\s]+|www\.[^\s]+/gi) || [];
}

export function countEmojis(text: string): number {
  return (
    text.match(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu) || []
  ).length;
}

export function countBulletPoints(text: string): number {
  return (text.match(/^[•\-*]\s/m) || []).length;
}

export function detectCTA(text: string): boolean {
  const patterns = [
    /yorum\s*yap/i,
    /yorumlarınızı/i,
    /ne düşün/i,
    /deneyim/i,
    /katıl/i,
    /link/i,
    /bilgi/i,
    /iletişim/i,
    /yazın/i,
    /botfusions\.com/i,
    /info@/i,
    /\d{3}\s*\d{3}\s*\d{2}\s*\d{2}/,
  ];
  return patterns.some((p) => p.test(text));
}

export function analyzePostText(text: string): PostAnalysis {
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

export const RULES: Rule[] = [
  {
    id: "char_limit",
    name: "Karakter Sınırı",
    category: "structure",
    description: "Post 300-3000 karakter arası olmalı",
    weight: 8,
    check: (post: string): RuleResult => {
      const len = post.length;
      if (len < 300)
        return {
          passed: false,
          score: 20,
          message: `Çok kısa: ${len} karakter (min 300)`,
          suggestion: "İçeriği genişletin.",
        };
      if (len > 3000)
        return {
          passed: false,
          score: 40,
          message: `Çok uzun: ${len} karakter (max 3000)`,
          suggestion: "İçeriği kısaltın.",
        };
      if (len >= 800 && len <= 1500)
        return {
          passed: true,
          score: 100,
          message: `İdeal uzunluk: ${len} karakter`,
        };
      return {
        passed: true,
        score: 75,
        message: `Kabul edilebilir: ${len} karakter`,
      };
    },
  },
  {
    id: "hook_strength",
    name: "Hook Gücü",
    category: "engagement",
    description: "İlk satır dikkat çekici olmalı",
    weight: 10,
    check: (post: string): RuleResult => {
      const analysis = analyzePostText(post);
      const hook = analysis.firstLine;
      const hookWords = hook.split(/\s+/).length;
      let score = 50;

      if (/\d+%|\d+ kat|%\d+/.test(hook)) score += 20;
      if (hook.includes("?")) score += 15;
      if (hookWords <= 15) score += 10;
      else score -= 10;
      if (/^\*\*/.test(hook.trim())) score -= 20;
      if (/^(selam|merhaba|hey|günaydın)/i.test(hook.trim())) score -= 30;
      if (/ölmedi|devrim|yanlış|gerçek|sırrı|fark|kayb/i.test(hook))
        score += 15;

      score = Math.max(0, Math.min(100, score));

      return {
        passed: score >= 60,
        score,
        message: `Hook: ${score >= 80 ? "Güçlü" : score >= 60 ? "Orta" : "Zayıf"} (${hookWords} kelime)`,
        suggestion:
          score < 60
            ? "İlk satırı rakam, soru veya şaşırtıcı iddia ile başlatın."
            : undefined,
      };
    },
  },
  {
    id: "line_breaks",
    name: "Satır Kırılma",
    category: "structure",
    description: "Okunabilirlik için yeterli satır kırılma",
    weight: 6,
    check: (post: string): RuleResult => {
      const analysis = analyzePostText(post);
      const wordsPerBreak =
        analysis.wordCount / Math.max(1, analysis.lineBreaks);
      if (analysis.lineBreaks < 3)
        return {
          passed: false,
          score: 20,
          message: `Çok az kırılma: ${analysis.lineBreaks}`,
          suggestion: "Her 2-3 cümlede boşluk bırakın.",
        };
      if (wordsPerBreak > 30)
        return {
          passed: false,
          score: 40,
          message: `Paragraflar uzun (ort. ${Math.round(wordsPerBreak)} kelime)`,
          suggestion: "Paragrafları max 2-3 satır yapın.",
        };
      return {
        passed: true,
        score: 100,
        message: `İdeal kırılma: ${analysis.lineBreaks}`,
      };
    },
  },
  {
    id: "hashtag_count",
    name: "Hashtag Sayısı",
    category: "algorithm",
    description: "3-8 hashtag ideal, 10+ spam sinyali",
    weight: 7,
    check: (post: string): RuleResult => {
      const count = extractHashtags(post).length;
      if (count === 0)
        return {
          passed: false,
          score: 30,
          message: "Hashtag yok",
          suggestion: "En az 3 hashtag ekleyin.",
        };
      if (count > 10)
        return {
          passed: false,
          score: 20,
          message: `${count} hashtag — spam sinyali!`,
          suggestion: "Max 8 hashtag kullanın.",
        };
      if (count >= 3 && count <= 8)
        return { passed: true, score: 100, message: `İdeal: ${count} hashtag` };
      return {
        passed: false,
        score: 50,
        message: `${count} hashtag`,
        suggestion: "3-8 arası hedefleyin.",
      };
    },
  },
  {
    id: "link_in_post",
    name: "Link Kontrolü",
    category: "algorithm",
    description: "Post içinde link erişimi %40 düşürür",
    weight: 9,
    check: (post: string): RuleResult => {
      const links = extractLinks(post);
      if (links.length === 0)
        return {
          passed: true,
          score: 100,
          message: "Link yok — erişim sorunu yok",
        };
      return {
        passed: false,
        score: 30,
        message: `${links.length} link — erişim düşüşü riski`,
        suggestion: "Linki ilk yoruma taşıyın.",
      };
    },
  },
  {
    id: "emoji_usage",
    name: "Emoji Kullanımı",
    category: "engagement",
    description: "Her bölümde en az 1 emoji",
    weight: 4,
    check: (post: string): RuleResult => {
      const analysis = analyzePostText(post);
      const pWithEmoji = analysis.paragraphs.filter(
        (p) => countEmojis(p) > 0,
      ).length;
      const ratio =
        analysis.paragraphs.length > 0
          ? pWithEmoji / analysis.paragraphs.length
          : 0;
      if (analysis.emojiCount === 0)
        return {
          passed: false,
          score: 20,
          message: "Emoji yok",
          suggestion: "Her bölümde en az 1 emoji.",
        };
      if (ratio >= 0.6)
        return {
          passed: true,
          score: 100,
          message: `${analysis.emojiCount} emoji, ${pWithEmoji}/${analysis.paragraphs.length} bölümde`,
        };
      return {
        passed: true,
        score: 60,
        message: `${analysis.emojiCount} emoji — bazı bölümlerde eksik`,
      };
    },
  },
  {
    id: "cta_presence",
    name: "CTA",
    category: "engagement",
    description: "Etkileşim için CTA olmalı",
    weight: 6,
    check: (post: string): RuleResult => {
      if (!detectCTA(post))
        return {
          passed: false,
          score: 30,
          message: "CTA yok",
          suggestion: "Soru sorun veya iletişim bilgisi ekleyin.",
        };
      return { passed: true, score: 100, message: "CTA mevcut" };
    },
  },
  {
    id: "word_count",
    name: "Kelime Sayısı",
    category: "structure",
    description: "280-320 kelime ideal",
    weight: 5,
    check: (post: string): RuleResult => {
      const wc = post.split(/\s+/).filter((w) => w.length > 0).length;
      if (wc < 100)
        return { passed: false, score: 20, message: `Çok kısa: ${wc} kelime` };
      if (wc >= 250 && wc <= 350)
        return { passed: true, score: 100, message: `İdeal: ${wc} kelime` };
      return { passed: true, score: 65, message: `${wc} kelime` };
    },
  },
  {
    id: "bullets",
    name: "Bullet Point",
    category: "structure",
    description: "Liste formatı okunabilirliği artırır",
    weight: 3,
    check: (post: string): RuleResult => {
      const count = countBulletPoints(post);
      if (count === 0)
        return {
          passed: false,
          score: 40,
          message: "Bullet point yok",
          suggestion: "En az 2 bullet ekleyin (•).",
        };
      if (count >= 2 && count <= 5)
        return { passed: true, score: 100, message: `${count} bullet — ideal` };
      return { passed: true, score: 70, message: `${count} bullet` };
    },
  },
  {
    id: "paragraph_length",
    name: "Paragraf Uzunluğu",
    category: "structure",
    description: "Her paragraf max 2-3 satır",
    weight: 5,
    check: (post: string): RuleResult => {
      const analysis = analyzePostText(post);
      const long = analysis.paragraphs.filter(
        (p) => p.split(/\s+/).length > 50,
      );
      if (long.length === 0)
        return { passed: true, score: 100, message: "Tüm paragraflar kısa" };
      if (long.length <= 1)
        return {
          passed: true,
          score: 60,
          message: `${long.length} uzun paragraf`,
        };
      return {
        passed: false,
        score: 30,
        message: `${long.length} uzun paragraf`,
        suggestion: "Her paragrafı max 2-3 satır yapın.",
      };
    },
  },
];

export const OPTIMAL_POSTING_TIMES = {
  turkey: {
    weekday: [
      { hour: 8, minute: 30, label: "08:30 — İş başlangıcı" },
      { hour: 12, minute: 0, label: "12:00 — Öğle arası" },
      { hour: 17, minute: 30, label: "17:30 — İş çıkışı" },
    ],
    weekend: [
      { hour: 10, minute: 0, label: "10:00 — Hafta sonu sabah" },
      { hour: 20, minute: 0, label: "20:00 — Akşam" },
    ],
  },
};

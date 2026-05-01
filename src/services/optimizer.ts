/**
 * LinkedIn Post Optimizer
 * Algoritma kurallarına göre post analiz eder, skorlar ve öneri üretir.
 * Hem ajan içi hem CLI kullanımı için tasarlanmıştır.
 */

import {
  RULES,
  analyzePostText,
  extractLinks,
  OPTIMAL_POSTING_TIMES,
  type PostAnalysis,
  type RuleResult,
} from "./rules.js";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

function getOpenRouterKey(): string {
  return process.env.OPENROUTER_API_KEY || "";
}

// ─── Skorlama Motoru ───

export interface OptimizationResult {
  totalScore: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  analysis: PostAnalysis;
  ruleResults: { rule: string; result: RuleResult }[];
  suggestions: string[];
  linkGuard: LinkGuardResult | null;
}

export interface LinkGuardResult {
  hasLinks: boolean;
  links: string[];
  firstCommentTemplate: string;
  cleanedPost: string;
}

export function scorePost(post: string): OptimizationResult {
  const analysis = analyzePostText(post);
  const ruleResults: { rule: string; result: RuleResult }[] = [];
  const suggestions: string[] = [];
  let totalScore = 0;
  let maxScore = 0;

  for (const rule of RULES) {
    const result = rule.check(post);
    ruleResults.push({ rule: rule.name, result });
    totalScore += result.score * rule.weight;
    maxScore += 100 * rule.weight;
    if (result.suggestion)
      suggestions.push(`[${rule.name}] ${result.suggestion}`);
  }

  const percentage = Math.round((totalScore / maxScore) * 100);

  const linkGuard = checkLinkGuard(post);

  return {
    totalScore,
    maxScore,
    percentage,
    passed: percentage >= 80,
    analysis,
    ruleResults,
    suggestions,
    linkGuard,
  };
}

export function checkLinkGuard(post: string): LinkGuardResult {
  const links = extractLinks(post);
  const hasLinks = links.length > 0;

  if (!hasLinks) {
    return {
      hasLinks: false,
      links: [],
      firstCommentTemplate: "",
      cleanedPost: post,
    };
  }

  const cleanedPost = post
    .replace(/https?:\/\/[^\s]+|www\.[^\s]+/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const firstCommentTemplate = [
    `🔗 Paylaşımda bahsedilen kaynaklar:`,
    ...links.map((l: string, i: number) => `${i + 1}. ${l}`),
  ].join("\n");

  return { hasLinks: true, links, firstCommentTemplate, cleanedPost };
}

export function getOptimalSchedule(): { today: string; times: string[] } {
  const now = new Date();
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;
  const dayNames = [
    "Pazar",
    "Pazartesi",
    "Salı",
    "Çarşamba",
    "Perşembe",
    "Cuma",
    "Cumartesi",
  ];

  const times = isWeekend
    ? OPTIMAL_POSTING_TIMES.turkey.weekend
    : OPTIMAL_POSTING_TIMES.turkey.weekday;

  return {
    today: dayNames[day] || "Bilinmiyor",
    times: times.map((t: { label: string }) => t.label),
  };
}

// ─── AI Destekli Auto-Revize (Self-Improvement) ───

export async function autoRevisePost(
  post: string,
  result: OptimizationResult,
): Promise<string> {
  if (result.percentage >= 80) return post;

  const OPENROUTER_API_KEY = getOpenRouterKey();
  if (!OPENROUTER_API_KEY) {
    console.warn(
      "OPENROUTER_API_KEY yok, AI revize atlanıyor. Manuel düzeltme gerekli.",
    );
    return post;
  }

  const failedRules = result.ruleResults
    .filter((r: { rule: string; result: RuleResult }) => !r.result.passed)
    .map(
      (r: { rule: string; result: RuleResult }) =>
        `- ${r.rule}: ${r.result.message} → ${r.result.suggestion || "Düzeltme gerekli"}`,
    )
    .join("\n");

  const prompt = `Sen bir LinkedIn içerik editörüsün. Aşağıdaki post LinkedIn algoritma kurallarına göre analiz edildi ve ${result.percentage}/100 skor aldı (hedef: 80+).

BAŞARISIZ KURALLAR:
${failedRules}

MEVCUT POST:
"""
${post}
"""

GÖREV:
1. Yukarıdaki başarısız kuralları düzelt
2. Orijinal mesajı ve tonu koru
3. Hook'u güçlendir (ilk satır rakam/soru/şaşırtıcı iddia ile başlamalı)
4. Link varsa çıkar
5. Hashtag'leri 3-8 arasına ayarla
6. Her bölümde emoji olsun
7. Sonunda CTA olsun

SADECE düzeltilmiş post metnini döndür. Açıklama ekleme.`;

  try {
    console.log(
      `🔄 AI Auto-Revize başlatılıyor (mevcut skor: ${result.percentage}/100)...`,
    );

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 4000,
        temperature: 0.6,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    const revised = response.data.choices[0].message.content?.trim();
    if (!revised) throw new Error("AI boş yanıt döndürdü");

    // Revize sonrası tekrar skorla
    const newScore = scorePost(revised);
    console.log(
      `📊 Revize sonrası skor: ${newScore.percentage}/100 (${newScore.percentage >= 80 ? "✅ BAŞARILI" : "⚠️ Hâlâ düşük"})`,
    );

    return revised;
  } catch (error: any) {
    console.error(
      "❌ AI Revize Hatası:",
      error.response?.data || error.message,
    );
    return post;
  }
}

// ─── Self-Improvement Döngüsü ───

interface LearningEntry {
  date: string;
  topic: string;
  scoreBefore: number;
  scoreAfter: number;
  wasPublished: boolean;
  failedRules: string[];
  revisionCount: number;
}

const MAX_REVISION_ATTEMPTS = 3;
const SCORE_THRESHOLD = 80;

export async function optimizeWithSelfImprove(
  post: string,
  topic: string,
): Promise<{
  finalPost: string;
  finalScore: number;
  revisionCount: number;
  history: LearningEntry;
}> {
  let currentPost = post;
  let currentResult = scorePost(currentPost);
  let attempts = 0;

  const history: LearningEntry = {
    date: new Date().toISOString(),
    topic,
    scoreBefore: currentResult.percentage,
    scoreAfter: currentResult.percentage,
    wasPublished: false,
    failedRules: currentResult.ruleResults
      .filter((r) => !r.result.passed)
      .map((r) => r.rule),
    revisionCount: 0,
  };

  console.log(`\n📊 İlk skor: ${currentResult.percentage}/100`);

  while (
    currentResult.percentage < SCORE_THRESHOLD &&
    attempts < MAX_REVISION_ATTEMPTS
  ) {
    attempts++;
    console.log(`\n🔄 Revize denemesi ${attempts}/${MAX_REVISION_ATTEMPTS}...`);

    currentPost = await autoRevisePost(currentPost, currentResult);
    currentResult = scorePost(currentPost);

    history.revisionCount = attempts;
    history.scoreAfter = currentResult.percentage;
    history.failedRules = currentResult.ruleResults
      .filter((r) => !r.result.passed)
      .map((r) => r.rule);

    console.log(`📊 Skor: ${currentResult.percentage}/100`);

    if (currentResult.percentage >= SCORE_THRESHOLD) break;
  }

  history.wasPublished = currentResult.percentage >= SCORE_THRESHOLD;

  if (!history.wasPublished) {
    console.log(
      `\n⚠️ ${MAX_REVISION_ATTEMPTS} deneme sonrası skor ${currentResult.percentage}/100 — hedef ${SCORE_THRESHOLD} altında.`,
    );
    console.log("📋 Başarısız kurallar:", history.failedRules.join(", "));
    console.log(
      "💡 Manuel düzenleme gerekebilir veya düşük skorla yayınlanabilir.",
    );
  }

  return {
    finalPost: currentPost,
    finalScore: currentResult.percentage,
    revisionCount: attempts,
    history,
  };
}

// ─── Havadurumu Görseli Motoru ───

export interface WeatherInfo {
  temp: number;
  condition: string; // 'yağmurlu', 'güneşli', 'parçalı bulutlu' vb.
  time: string; // '20:15', '08:00'
}

/**
 * Havadurumu Görseli için dinamik prompt üretir.
 */
export function generateHavadurumuGorseliPrompt(data: WeatherInfo): string {
  const baseComposition =
    "A professional wide-angle cinematic horizontal shot from an indoor perspective looking out of a rustic wooden window in Istanbul. The wooden frame perfectly frames the scene. On the wooden windowsill, there is a glass of hot Turkish tea and an open notebook with a pen. In the background, a panoramic and breathtaking Bosphorus view is visible along with iconic historical landmarks such as the Maiden's Tower, Hagia Sophia, or the Blue Mosque.";

  let atmosphere = "";
  const condition = data.condition.toLowerCase();
  if (condition.includes("yağmur")) {
    atmosphere =
      "The window pane is covered with realistic raindrops and slight mist. The sky is a moody, deep gray.";
  } else if (condition.includes("güneş") || condition.includes("açık")) {
    atmosphere =
      "The sky is crystal clear with a vibrant golden hour glow reflecting off the Bosphorus.";
  } else if (condition.includes("kar")) {
    atmosphere =
      "Light snow is falling outside, and white snow blankets the rooftops and the windowsill.";
  } else {
    atmosphere =
      "Soft, diffused daylight with balanced clouds and high visibility of the city skyline.";
  }

  const steamEffect =
    data.temp < 15
      ? "Thick, heavy steam rising noticeably from the tea glass, suggesting a cold exterior."
      : "Light, gentle steam rising from the tea glass.";

  const hour = parseInt(data.time.split(":")[0] || "12");
  const isNight = hour > 18 || hour < 6;

  const lighting = isNight
    ? "Night scene. A warm, glowing lantern on the sill casts long, cozy shadows. The city lights of Istanbul and distant ship lights on the Bosphorus are glowing."
    : "Daylight scene. Natural light highlights the texture of the wood and the shimmering water of the Bosphorus.";

  const uiPanel = `A modern, translucent floating glass UI panel displays information in Turkish language: 'HAVA DURUMU' as the title, followed by '${data.temp}°C', '${data.condition.toUpperCase()}', and 'NEM', 'RÜZGAR' stats. All text on the panel must be in Turkish. Branding: Place a subtle, elegant 'botfusions' logotype in the bottom right corner of the image.`;

  return [
    baseComposition,
    atmosphere,
    steamEffect,
    lighting,
    uiPanel,
    "Photorealistic, 8k, cinematic color grading.",
  ].join(" ");
}

// ─── Dinamik İnfografik Motoru ───

export function formatResult(result: OptimizationResult): string {
  const lines: string[] = [];
  const w = 50;

  lines.push("┌─ LinkedIn Post Analizi " + "─".repeat(w - 25) + "┐");

  const a = result.analysis;
  lines.push(`│ Karakter:    ${a.charCount} / 3000`.padEnd(w) + "│");
  lines.push(`│ Kelime:      ${a.wordCount}`.padEnd(w) + "│");
  lines.push(`│ Satır kırılma: ${a.lineBreaks}`.padEnd(w) + "│");
  lines.push(`│ Hashtag:     ${a.hashtagCount} / 8`.padEnd(w) + "│");
  lines.push(
    `│ Hook:        ${a.firstLine.substring(0, 30)}...`.padEnd(w) + "│",
  );
  lines.push(
    `│ Link:        ${a.hasLink ? "⚠ EVET (" + a.links.length + ")" : "✓ Yok"}`.padEnd(
      w,
    ) + "│",
  );
  lines.push(`│ Emoji:       ${a.emojiCount}`.padEnd(w) + "│");
  lines.push(
    `│ CTA:         ${a.ctaDetected ? "✓ Var" : "✗ Yok"}`.padEnd(w) + "│",
  );
  lines.push("│" + " ".repeat(w) + "│");

  const scoreColor =
    result.percentage >= 80 ? "✓" : result.percentage >= 60 ? "⚠" : "✗";
  lines.push(
    `│ Algoritma Skoru: ${result.percentage} / 100  ${scoreColor}`.padEnd(w) +
      "│",
  );

  if (result.suggestions.length > 0) {
    lines.push("│" + " ".repeat(w) + "│");
    lines.push("│ Öneriler:".padEnd(w) + "│");
    for (const s of result.suggestions.slice(0, 5)) {
      const trimmed = s.length > w - 3 ? s.substring(0, w - 6) + "..." : s;
      lines.push(`│ • ${trimmed}`.padEnd(w) + "│");
    }
  }

  if (result.linkGuard?.hasLinks) {
    lines.push("│" + " ".repeat(w) + "│");
    lines.push("│ 🔗 Link → İlk Yorum Şablonu:".padEnd(w) + "│");
    for (const line of result.linkGuard.firstCommentTemplate
      .split("\n")
      .slice(0, 4)) {
      const trimmed =
        line.length > w - 3 ? line.substring(0, w - 6) + "..." : line;
      lines.push(`│   ${trimmed}`.padEnd(w) + "│");
    }
  }

  lines.push("└" + "─".repeat(w) + "┘");
  return lines.join("\n");
}

// ─── Dinamik İnfografik Motoru (Günde 4 Paylaşım Rotasyonu) ───

export interface InfographicData {
  title: string;
  keyStats: { label: string; value: string }[];
  style?: "blueprint" | "cyberpunk" | "minimalist" | "3d" | "random";
}

/**
 * Verilen verilere göre 'Enterprise Technology Map' (Kurumsal Teknoloji Haritası) yapısında,
 * yüksek yoğunluklu ve profesyonel bir şema promptu üretir.
 */
export function generateDynamicInfographicPrompt(
  data: InfographicData,
): string {
  const stylePool = {
    blueprint:
      "Visual Style: 'Corporate Engineering Blueprint'. Deep navy background, clinical white architectural lines, precise technical measurements.",
    cyberpunk:
      "Visual Style: 'Futuristic Command Center'. Dark mode with glowing data modules, vibrant cyan/magenta neon accents, interconnected glass UI nodes.",
    minimalist:
      "Visual Style: 'Modern Enterprise Board'. Clean white/grey background, structured grid layout, premium typography, gold accent connectors.",
    "3d": "Visual Style: '3D Infrastructure Matrix'. Realistic 3D floating modules connected by glass fiber-optic tubes, professional studio lighting.",
  };

  const keys = Object.keys(stylePool) as (keyof typeof stylePool)[];
  const selectedStyleKey: keyof typeof stylePool =
    data.style === "random" || !data.style
      ? keys[Math.floor(Math.random() * keys.length)]!
      : (data.style as any); // Cast because we know style is valid or handled by the check above

  // Veri Bölümü: Her başlığın altına teknik alt maddeler (hallucination-free) eklemesi için talimat
  const dataDetails = data.keyStats
    .map(
      (s) =>
        `[MODÜL: ${s.label.toUpperCase()}] -> Alt maddeler: ${s.value} ve ilgili teknik detaylar.`,
    )
    .join("\n");

  return [
    `SYSTEM ROLE: Master Visual Architect and Technical Illustrator.`,
    `TASK: Create a professional, high-density 'Enterprise Technology Map' for '${data.title}'.`,
    `LAYOUT: Multi-modular grid layout. 6-8 distinct information boxes interconnected by logical flow arrows.`,
    `STRICT RULE: All text, headers, and detailed bullet points MUST be in TURKISH language.`,
    stylePool[selectedStyleKey],
    `CONTENT STRUCTURE:`,
    dataDetails,
    `DESIGN SPECIFICATIONS:`,
    `1. Each module box must contain a header and 3-4 detailed bullet points in Turkish.`,
    `2. Central node: Place a symbolic icon representing '${data.title}' in the center, with connections radiating outwards.`,
    `3. Corporate aesthetics: Use professional iconography for each module (e.g., shield for security, chip for AI).`,
    `5. BRANDING: Place a subtle 'botfusions' corporate logo in the bottom right corner.`,
    `6. TYPOGRAPHY: Use bold, clean, sans-serif fonts. Main headers MUST be large (32pt+) and highly readable on mobile devices.`,
    `7. NO SLOP: Clean, sharp lines. No blurry or messy elements.`,
    `8k resolution, ultra-detailed, professional corporate presentation quality.`,
  ].join("\n");
}

import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

function getOpenRouterKey(): string {
  return process.env.OPENROUTER_API_KEY || "";
}

export interface AuditResult {
  approved: boolean;
  riskScore: number;
  reasons: string[];
  suggestions: string[];
}

interface AuditContext {
  text: string;
  platform: "linkedin" | "x";
  topic: string;
  source: "weather" | "excel" | "rss";
  recentTopics: string[];
}

// ─── KURAL TABANLI KONTROL ───

function ruleBasedAudit(ctx: AuditContext): AuditResult {
  const reasons: string[] = [];
  const suggestions: string[] = [];
  let risk = 0;

  // 1. Duplicate topic kontrol
  const normalizedTopic = ctx.topic.toLowerCase().trim().substring(0, 40);
  for (const recent of ctx.recentTopics) {
    if (recent.includes(normalizedTopic) || normalizedTopic.includes(recent)) {
      reasons.push(`Duplicate konu: "${normalizedTopic.substring(0, 30)}..." daha önce paylaşıldı`);
      risk += 40;
      break;
    }
  }

  // 2. Çok kısa metin
  if (ctx.text.length < 50) {
    reasons.push(`Metin çok kısa: ${ctx.text.length} karakter`);
    risk += 30;
  }

  // 3. X için hashtag kontrol
  if (ctx.platform === "x") {
    const hashtags = ctx.text.match(/#\w+/g) || [];
    if (hashtags.length === 0) {
      reasons.push("X postunda hashtag yok");
      risk += 15;
      suggestions.push("2-3 hashtag ekle");
    }
    if (hashtags.length > 4) {
      reasons.push(`X postunda ${hashtags.length} hashtag (spam riski)`);
      risk += 20;
      suggestions.push("Hashtag sayısını 2-3'e düşür");
    }
  }

  // 4. LinkedIn için hashtag kontrol
  if (ctx.platform === "linkedin") {
    const hashtags = ctx.text.match(/#\w+/g) || [];
    if (hashtags.length < 3) {
      reasons.push(`LinkedIn postunda sadece ${hashtags.length} hashtag`);
      risk += 10;
      suggestions.push("5-10 hashtag arası ideal");
    }
  }

  // 5. Spam kelimeler
  const spamWords = ["hemen tıkla", "kazan", "ücretsiz", "bedava", "click here"];
  const lowerText = ctx.text.toLowerCase();
  for (const word of spamWords) {
    if (lowerText.includes(word)) {
      reasons.push(`Spam kelime tespit: "${word}"`);
      risk += 25;
    }
  }

  // 6. AI tespit edilebilir kalıplar
  const aiPatterns = ["günümüzde", "önemli bir konudur", "özetle", "sonuç olarak", "bu makalede"];
  for (const pattern of aiPatterns) {
    if (lowerText.includes(pattern)) {
      reasons.push(`AI kalıbı tespit: "${pattern}"`);
      risk += 10;
      suggestions.push(`"${pattern}" ifadesini doğal bir alternatifle değiştir`);
    }
  }

  // 7. Tekrarlanan emoji
  const emojiCounts: Record<string, number> = {};
  const emojis = ctx.text.match(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || [];
  for (const e of emojis) {
    emojiCounts[e] = (emojiCounts[e] || 0) + 1;
    if (emojiCounts[e] > 2) {
      reasons.push(`Tekrarlayan emoji: "${e}" (${emojiCounts[e]} kez)`);
      risk += 5;
    }
  }

  // 8. Görsel prompt yoksa uyarı (metin bazlı kontrol)
  if (ctx.platform === "linkedin" && ctx.text.length > 500 && emojis.length === 0) {
    reasons.push("Uzun LinkedIn postunda hiç emoji yok");
    risk += 5;
    suggestions.push("Okunabilirliği artırmak için emoji ekle");
  }

  return {
    approved: risk < 50,
    riskScore: Math.min(100, risk),
    reasons,
    suggestions,
  };
}

// ─── LLM TABANLI DENETIM ───

async function llmAudit(ctx: AuditContext, ruleResult: AuditResult): Promise<AuditResult> {
  const OPENROUTER_API_KEY = getOpenRouterKey();
  if (!OPENROUTER_API_KEY) {
    console.warn("⚠️ Auditor: OPENROUTER_API_KEY yok, sadece kural denetimi yapılıyor.");
    return ruleResult;
  }

  const prompt = `Sen bir sosyal medya GÜVENLİK DENETÇİSİ sin. Gönderi gönderilmeden önce ban riskini değerlendiriyorsun.

PLATFORM: ${ctx.platform === "x" ? "X (Twitter)" : "LinkedIn"}
KAYNAK: ${ctx.source}
KONU: ${ctx.topic}

GÖNDERİ METNİ:
"""
${ctx.text}
"""

SON 10 KONU: ${ctx.recentTopics.join(" | ")}

KURAL DENETİM SONUÇLARI:
Risk Skoru: ${ruleResult.riskScore}/100
${ruleResult.reasons.length > 0 ? "Sorunlar:\n" + ruleResult.reasons.map((r) => `- ${r}`).join("\n") : "Sorun yok"}

DEĞERLENDİR (JSON formatında):
{
  "approved": true/false,
  "riskScore": 0-100,
  "reasons": ["neden1", "neden2"],
  "suggestions": ["öneri1", "öneri2"],
  "banRiskLevel": "low/medium/high/critical",
  "contentQuality": "poor/average/good/excellent"
}

KRİTERLER:
1. Ban riski: Tekrarlayan kalıp, spam sinyali, platform kuralları ihlali
2. İçerik kalitesi: Orijinallik, Türkçe dil kalitesi, hook gücü
3. Platform uyumu: X için kısa ve vurucu, LinkedIn için profesyonel
4. Çeşitlilik: Son konulardan farklı mı?
5. AI izi: Makine üretimi belli olan ifadeler var mı?

SADECE JSON döndür.`;

  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "google/gemini-2.0-flash-001",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1000,
        temperature: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 30_000,
      },
    );

    const text = response.data.choices[0].message.content.trim();
    const jsonStr = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(jsonStr);

    const llmRisk = parsed.riskScore || 0;
    const combinedRisk = Math.round((ruleResult.riskScore * 0.4) + (llmRisk * 0.6));

    const reasons = [...ruleResult.reasons, ...(parsed.reasons || [])];
    const suggestions = [...ruleResult.suggestions, ...(parsed.suggestions || [])];

    if (parsed.banRiskLevel) {
      reasons.unshift(`Ban risk seviyesi: ${parsed.banRiskLevel}`);
    }
    if (parsed.contentQuality) {
      reasons.unshift(`İçerik kalitesi: ${parsed.contentQuality}`);
    }

    return {
      approved: combinedRisk < 60 && parsed.approved !== false,
      riskScore: combinedRisk,
      reasons,
      suggestions,
    };
  } catch (error: any) {
    console.warn(`⚠️ Auditor LLM hatası, kural denetimi kullanılıyor: ${error.message}`);
    return ruleResult;
  }
}

// ─── ANA DENETİM FONKSİYONU ───

export async function auditPost(options: {
  text: string;
  platform: "linkedin" | "x";
  topic: string;
  source: "weather" | "excel" | "rss";
  recentTopics?: string[];
  useLlm?: boolean;
}): Promise<AuditResult> {
  const recentTopics = options.recentTopics || [];

  const ruleResult = ruleBasedAudit({
    text: options.text,
    platform: options.platform,
    topic: options.topic,
    source: options.source,
    recentTopics,
  });

  if (options.useLlm === false) {
    return ruleResult;
  }

  return llmAudit(
    {
      text: options.text,
      platform: options.platform,
      topic: options.topic,
      source: options.source,
      recentTopics,
    },
    ruleResult,
  );
}

// ─── TOPLU SAĞLIK KONTROLÜ ───

export async function runHealthCheck(): Promise<{
  healthy: boolean;
  checks: { name: string; status: "ok" | "warn" | "error"; detail: string }[];
}> {
  const checks: { name: string; status: "ok" | "warn" | "error"; detail: string }[] = [];

  // X paused kontrol
  checks.push({
    name: "X Durumu",
    status: process.env.X_PAUSED === "true" ? "warn" : "ok",
    detail: process.env.X_PAUSED === "true" ? "X postları durdurulmuş (X_PAUSED=true)" : "Aktif",
  });

  // API key kontrolleri
  const requiredKeys = ["OPENROUTER_API_KEY", "GOOGLE_API_KEY", "SUPABASE_URL"];
  for (const key of requiredKeys) {
    const hasValue = !!process.env[key];
    checks.push({
      name: key,
      status: hasValue ? "ok" : "error",
      detail: hasValue ? "Yüklü" : "EKSİK!",
    });
  }

  // X API key kontrolleri
  const xKeys = ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET"];
  const xKeysOk = xKeys.every((k) => !!process.env[k]);
  checks.push({
    name: "X API Keys",
    status: xKeysOk ? "ok" : "warn",
    detail: xKeysOk ? "Tam set" : "Eksik key var",
  });

  const healthy = checks.every((c) => c.status !== "error");
  return { healthy, checks };
}

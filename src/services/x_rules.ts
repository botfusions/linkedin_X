import type { Rule, RuleResult, PostAnalysis } from "./rules.js";
import {
  extractHashtags,
  extractLinks,
  countEmojis,
  countBulletPoints,
  detectCTA,
  detectMediaReference,
  detectPoll,
} from "./rules.js";

export function analyzeXPostText(text: string): PostAnalysis {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const firstLine = lines[0] || "";
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const questionCount = (text.match(/\?/g) || []).length;

  const hasMedia = detectMediaReference(text);
  const hasPoll = detectPoll(text);
  const hasMention = /@[\w]{1,15}/.test(text);
  const showMoreTrigger = text.length > 258;

  let replyBaitScore = 0;
  if (questionCount > 0) replyBaitScore += 30;
  if (/ne\s*düşün|yorum|katkı|deneyim|fikir|görüş/i.test(text)) replyBaitScore += 25;
  if (hasPoll) replyBaitScore += 20;
  if (hasMention) replyBaitScore += 10;
  if (/katıl|paylaş|yazın|cevap/i.test(text)) replyBaitScore += 15;
  replyBaitScore = Math.min(100, replyBaitScore);

  let dwellScore = 0;
  if (showMoreTrigger) dwellScore += 30;
  if (paragraphs.length >= 3) dwellScore += 25;
  if (countBulletPoints(text) >= 2) dwellScore += 15;
  const avgParaLen = text.length / Math.max(1, paragraphs.length);
  if (avgParaLen >= 60 && avgParaLen <= 180) dwellScore += 20;
  dwellScore = Math.min(100, dwellScore);

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
    questionCount,
    ctaDetected: detectCTA(text),
    bulletPoints: countBulletPoints(text),
    hasMedia,
    hasQuestion: questionCount > 0,
    hasPoll,
    hasMention,
    threadReady: text.length > 1000,
    dwellScore,
    showMoreTrigger,
    replyBaitScore,
  };
}

export const X_RULES: Rule[] = [
  // ═══════════════════════════════════════
  // MEVCUT KURALLAR (GÜNCELLENDİ)
  // ═══════════════════════════════════════

  {
    id: "x_char_limit",
    name: "X Karakter Sınırı",
    category: "structure",
    description: "Premium için ideal 280-600 karakter. 258+ = Show more (dwell artar)",
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
          suggestion: "İçeriği kısaltın veya thread yapın.",
        };
      if (len >= 258 && len <= 600)
        return {
          passed: true,
          score: 100,
          message: `İdeal Premium uzunluğu: ${len} karakter (Show more tetiklenir → dwell artar)`,
        };
      if (len >= 200 && len < 258)
        return {
          passed: true,
          score: 80,
          message: `İyi ama Show more tetiklenmez: ${len} karakter (258+ hedefle)`,
          suggestion: "258+ karaktere çıkararak dwell time'ı artırın.",
        };
      return {
        passed: true,
        score: 75,
        message: `Kabul edilebilir: ${len} karakter`,
      };
    },
  },
  {
    id: "x_hook_strength",
    name: "X Hook Gücü",
    category: "engagement",
    description: "İlk 70 karakter algoritmanın karar verdiği alan",
    weight: 10,
    check: (post: string): RuleResult => {
      const analysis = analyzeXPostText(post);
      const hook = analysis.firstLine;
      let score = 50;

      if (hook.length < 10) score -= 40;
      if (hook.length > 100) score -= 20;
      if (/\d+%|\d+\s*kat|%?\d+/.test(hook)) score += 20;
      if (hook.includes("?")) score += 20;
      if (/!/.test(hook)) score += 10;
      if (/ölmedi|devrim|gerçek|sırrı|fark|kayb|dikkat|şok|ilk\s*kez|son\s*dakika/i.test(hook))
        score += 20;
      if (/^(selam|merhaba|hey|günaydın)/i.test(hook.trim())) score -= 25;
      if (/^\*\*/.test(hook.trim())) score -= 15;

      score = Math.max(0, Math.min(100, score));

      return {
        passed: score >= 70,
        score,
        message: `X Hook: ${score >= 85 ? "Mükemmel" : score >= 70 ? "İyi" : "Zayıf"} (${hook.length} char)`,
        suggestion:
          score < 70 ? "İlk satırı rakam, soru veya çarpıcı iddia ile başlatın (max 70 char)." : undefined,
      };
    },
  },
  {
    id: "x_hashtag_limit",
    name: "X Hashtag Sayısı",
    category: "algorithm",
    description: "X'te 2-3 hashtag idealdir. 4+ spam riski",
    weight: 8,
    check: (post: string): RuleResult => {
      const count = extractHashtags(post).length;
      if (count === 0)
        return {
          passed: false,
          score: 40,
          message: "Hashtag yok",
          suggestion: "En az 2-3 hashtag ekleyin.",
        };
      if (count > 4)
        return {
          passed: false,
          score: 20,
          message: `${count} hashtag — spam riski!`,
          suggestion: "Hashtag sayısını 2-3 ile sınırlayın.",
        };
      if (count >= 2 && count <= 3)
        return { passed: true, score: 100, message: "İdeal hashtag sayısı" };
      return { passed: true, score: 80, message: `${count} hashtag` };
    },
  },
  {
    id: "x_visual_readability",
    name: "Görsel Okunabilirlik",
    category: "structure",
    description: "Boşluklar ve kısa paragraflar dwell time artırır",
    weight: 6,
    check: (post: string): RuleResult => {
      const analysis = analyzeXPostText(post);
      const avgParaLen =
        analysis.charCount / Math.max(1, analysis.paragraphs.length);

      if (analysis.paragraphs.length < 2)
        return {
          passed: false,
          score: 30,
          message: "Tek blok metin — okuma bırakma riski",
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

  // ═══════════════════════════════════════
  // YENİ KURALLAR (X-ALGORITHM SİNYALLERİ)
  // ═══════════════════════════════════════

  {
    id: "x_media_presence",
    name: "Görsel/Video Varlığı",
    category: "algorithm",
    description: "Phoenix modeli P(photo_expand) ve P(video_view) ayrı skorlar. Görselsiz post görünmezlik riski taşır.",
    weight: 9,
    check: (post: string): RuleResult => {
      const analysis = analyzeXPostText(post);

      if (analysis.hasMedia)
        return { passed: true, score: 100, message: "Görsel referansı mevcut" };

      // Metin bazlı ipucu: emoji, link vs. görsel olasılığı
      const hasImageIndicators =
        /fotoğraf|görsel|infografik|grafik|ekran|video|izle|watch|image/i.test(post);

      if (hasImageIndicators)
        return {
          passed: true,
          score: 70,
          message: "Görsel ima ediliyor ama referans yok",
          suggestion: "Post ile birlikte görsel eklendiğinden emin olun.",
        };

      return {
        passed: false,
        score: 30,
        message: "Görsel yok — algoritma görünürlüğü düşürür",
        suggestion: "Her X post'una en az 1 görsel veya video ekleyin.",
      };
    },
  },
  {
    id: "x_reply_bait",
    name: "Reply Tetikleyicisi",
    category: "engagement",
    description: "P(reply) en yüksek ağırlıklı sinyaldir. Soru ve etkileşim çağrısı reply rate'i artırır.",
    weight: 10,
    check: (post: string): RuleResult => {
      const analysis = analyzeXPostText(post);
      let replyScore = 0;

      if (analysis.hasQuestion) replyScore += 30;
      if (analysis.questionCount >= 2) replyScore += 15;
      if (/ne\s*düşün|yorumlar|deneyimlerin|fikrin|görüşün|ekleyin|sizce|bence/i.test(post))
        replyScore += 25;
      if (analysis.hasPoll) replyScore += 20;
      if (/@\w+/.test(post)) replyScore += 5;
      if (/katıl|paylaş|yazın|cevap|yanıt/i.test(post)) replyScore += 10;

      replyScore = Math.min(100, replyScore);

      if (replyScore >= 50)
        return {
          passed: true,
          score: replyScore,
          message: `Reply bait güçlü: ${replyScore}/100`,
        };
      if (replyScore >= 25)
        return {
          passed: true,
          score: replyScore,
          message: `Reply bait orta: ${replyScore}/100`,
          suggestion: "Soru veya 'ne düşünüyorsun?' tarzı CTA ekleyin.",
        };

      return {
        passed: false,
        score: replyScore,
        message: `Reply bait zayıf: ${replyScore}/100 — reply rate düşük olacak`,
        suggestion: "En az 1 soru sorun veya okuyucuyu yanıta davet edin.",
      };
    },
  },
  {
    id: "x_dwell_time",
    name: "Dwell Time Potansiyeli",
    category: "algorithm",
    description: "258+ karakter = Show more → dwell artar. P(dwell) Phoenix'te tracked.",
    weight: 8,
    check: (post: string): RuleResult => {
      const analysis = analyzeXPostText(post);
      let score = 0;

      // Show more tetiklendi mi
      if (analysis.showMoreTrigger) score += 35;
      else
        return {
          passed: false,
          score: 30,
          message: `258 karakter altında (${analysis.charCount}) — Show more tetiklenmez`,
          suggestion: "258+ karaktere çıkarın, dwell time artar.",
        };

      // Paragraf yapısı
      if (analysis.paragraphs.length >= 3) score += 25;
      else if (analysis.paragraphs.length >= 2) score += 15;

      // Bullet points
      if (analysis.bulletPoints >= 2) score += 15;

      // Ortalama paragraf uzunluğu (çok uzun = bırakma)
      const avgParaLen = analysis.charCount / Math.max(1, analysis.paragraphs.length);
      if (avgParaLen >= 60 && avgParaLen <= 200) score += 15;
      else if (avgParaLen > 200) score -= 10;

      // Okunabilirlik: kısa satırlar
      if (analysis.lineBreaks >= 3) score += 10;

      score = Math.max(0, Math.min(100, score));

      return {
        passed: score >= 60,
        score,
        message: `Dwell potansiyeli: ${score}/100 (${analysis.paragraphs.length} paragraf, ${analysis.lineBreaks} kırılma)`,
        suggestion:
          score < 60
            ? "Daha fazla paragraf ve boşluk ekleyin. 258+ karakter hedefleyin."
            : undefined,
      };
    },
  },
  {
    id: "x_thread_potential",
    name: "Thread Uygunluğu",
    category: "structure",
    description: "1000+ karakter = thread'e bölünmeli. Thread'ler feed'de ayrı görünür.",
    weight: 6,
    check: (post: string): RuleResult => {
      if (post.length <= 1000)
        return {
          passed: true,
          score: 100,
          message: `Tek post yeterli: ${post.length} karakter`,
        };

      // 1000-2500 arası: thread öner
      if (post.length <= 2500) {
        const estimatedTweets = Math.ceil(post.length / 280);
        return {
          passed: false,
          score: 50,
          message: `Thread önerisi: ${post.length} karakter (~${estimatedTweets} tweet)`,
          suggestion: `Bu içerik ${estimatedTweets} tweet'lik thread olarak daha etkili olur.`,
        };
      }

      return {
        passed: false,
        score: 20,
        message: `Çok uzun tek post: ${post.length} karakter`,
        suggestion: "Thread'e bölün veya ciddi şekilde kısaltın.",
      };
    },
  },
  {
    id: "x_engagement_ratio",
    name: "Etkileşim Oranı",
    category: "engagement",
    description: "Emoji, soru, CTA dengesi engagement prediction'ı etkiler",
    weight: 7,
    check: (post: string): RuleResult => {
      const analysis = analyzeXPostText(post);
      let score = 40;

      // Soru varsa
      if (analysis.hasQuestion) score += 15;

      // CTA varsa
      if (analysis.ctaDetected) score += 15;

      // Emoji dengesi (çok az veya çok fazla değil)
      if (analysis.emojiCount >= 1 && analysis.emojiCount <= 5) score += 15;
      else if (analysis.emojiCount > 5) score -= 10;

      // Link yoksa (link engagement düşürür)
      if (!analysis.hasLink) score += 10;

      // İçerik bilgi yoğunluğu (kelime/paragraf oranı)
      const wordsPerPara = analysis.wordCount / Math.max(1, analysis.paragraphs.length);
      if (wordsPerPara >= 15 && wordsPerPara <= 50) score += 5;

      score = Math.max(0, Math.min(100, score));

      return {
        passed: score >= 60,
        score,
        message: `Etkileşim oranı: ${score}/100`,
        suggestion:
          score < 60
            ? "Soru, CTA ve 1-3 emoji ekleyin. Link varsa çıkarın."
            : undefined,
      };
    },
  },
  {
    id: "x_negative_signal_guard",
    name: "Negatif Sinyal Koruması",
    category: "algorithm",
    description: "Spam kalıpları P(block_author), P(mute_author) artırır. Algoritma cezası uygular.",
    weight: 9,
    check: (post: string): RuleResult => {
      const analysis = analyzeXPostText(post);
      const warnings: string[] = [];
      let penalty = 0;

      // Spam kelimeler
      const spamPatterns = [
        { pattern: /RT\s+et|retweet/i, reason: "RT isteği = spam sinyali" },
        { pattern: /takip\s*et|follow\s*me/i, reason: "Takip isteği = spam sinyali" },
        { pattern: /beğen|like\s*at/i, reason: "Beğeni isteği = spam sinyali" },
        { pattern: /bedava|ücretsiz.*kazan|kazanıyor/i, reason: "Clickbait = spam sinyali" },
        { pattern: /DM\s*at|özel\s*mesaj/i, reason: "DM isteği = spam sinyali" },
      ];

      for (const { pattern, reason } of spamPatterns) {
        if (pattern.test(post)) {
          warnings.push(reason);
          penalty += 20;
        }
      }

      // Çok fazla mention
      const mentionCount = (post.match(/@[\w]{1,15}/g) || []).length;
      if (mentionCount > 3) {
        warnings.push(`${mentionCount} mention — spam riski`);
        penalty += 15;
      }

      // Link + hashtag spam
      if (analysis.hasLink && analysis.hashtagCount > 3) {
        warnings.push("Link + 3+ hashtag = spam kombinasyonu");
        penalty += 10;
      }

      // Büyük harf spam
      const capsRatio = (post.match(/[A-ZÇĞİÖŞÜ]/g) || []).length / Math.max(1, post.length);
      if (capsRatio > 0.4) {
        warnings.push("Çok fazla büyük harf — bağırmak gibi");
        penalty += 15;
      }

      const finalScore = Math.max(0, 100 - penalty);

      if (penalty === 0)
        return { passed: true, score: 100, message: "Temiz — spam sinyali yok" };

      return {
        passed: finalScore >= 60,
        score: finalScore,
        message: `${warnings.length} negatif sinyal: ${warnings.join(", ")}`,
        suggestion: "Spam kalıplarını kaldırın: RT isteği, takip çağrısı, clickbait.",
      };
    },
  },
];

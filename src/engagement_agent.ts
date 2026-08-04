import dotenv from "dotenv";
import {
  findOpportunities,
  markPostSeen,
  postUrl,
  loadWatchlist,
  type Opportunity,
  type CapturedPost,
} from "./services/engagement_scout.js";
import { draftComments } from "./services/comment_writer.js";
import { sendEngagementMessage } from "./services/telegram.js";

dotenv.config();

/**
 * YORUM FIRSAT AJANI
 *
 * Akış: yakalanan gönderiler → puanla → en iyi N tanesine taslak üret →
 * Telegram'a gönder → Cenk onaylar ve KENDİSİ yayınlar.
 *
 * Ajan hiçbir koşulda LinkedIn'e yorum yazmaz.
 */

const MAX_FIRSAT = Number(process.env.ENGAGEMENT_MAX_DRAFTS || 3);
const MIN_SKOR = Number(process.env.ENGAGEMENT_MIN_SCORE || 40);

function kisalt(text: string, n: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

/** Telegram Markdown'ı bozan karakterleri temizler. */
function mdSafe(text: string): string {
  return text.replace(/[_*`\[\]]/g, "");
}

async function bildir(firsat: Opportunity, taslaklar: string[], analiz: string, acik: string) {
  const satirlar = [
    "💬 *Yorum Fırsatı*",
    "",
    `👤 *${mdSafe(firsat.hesap.ad)}*${firsat.hesap.kurum ? ` — ${mdSafe(firsat.hesap.kurum)}` : ""}`,
    `⭐ Skor: ${firsat.skor}  |  ${firsat.post.tepki ?? 0} tepki, ${firsat.post.paylasim ?? 0} paylaşım`,
    `📌 ${firsat.gerekce.join(" · ")}`,
    "",
    `🔗 ${firsat.url}`,
    "",
    `📝 *Gönderi:* ${mdSafe(kisalt(firsat.post.metin, 260))}`,
    "",
    `🔍 *Analiz:* ${mdSafe(analiz)}`,
    `🎯 *Açık:* ${mdSafe(acik)}`,
    "",
    "━━━━━━━━━━━━━━",
  ];

  taslaklar.forEach((t, i) => {
    satirlar.push("", `*TASLAK ${i + 1}*`, "", mdSafe(t));
  });

  satirlar.push("", "_Beğendiğini kopyala ve sen gönder. Ajan yorum yazmaz._");

  await sendEngagementMessage(satirlar.join("\n"));
}

export async function runEngagementWorkflow(): Promise<void> {
  console.log("\n💬 Yorum Firsat Ajani calisiyor...");

  try {
    const firsatlar = await findOpportunities();

    if (firsatlar.length === 0) {
      console.log("📭 Yeni yorum firsati yok.");
      return;
    }

    const secilen = firsatlar
      .filter((f) => f.skor >= MIN_SKOR)
      .slice(0, MAX_FIRSAT);

    console.log(
      `🔎 ${firsatlar.length} aday bulundu, ${secilen.length} tanesi esigi (${MIN_SKOR}) gecti.`,
    );

    if (secilen.length === 0) {
      console.log("📭 Esigi gecen firsat yok.");
      return;
    }

    for (const firsat of secilen) {
      try {
        console.log(`✍️  Taslak uretiliyor: ${firsat.hesap.ad} (skor ${firsat.skor})`);
        const draft = await draftComments(firsat.post, firsat.hesap);
        await bildir(firsat, draft.taslaklar, draft.analiz, draft.acik);
        await markPostSeen(firsat.hesap.slug, firsat.post.id);
        console.log(`✅ ${firsat.hesap.ad} icin ${draft.taslaklar.length} taslak gonderildi.`);
      } catch (err: any) {
        console.error(`❌ ${firsat.hesap.ad} taslagi uretilemedi:`, err?.message || err);
        await sendEngagementMessage(
          `⚠️ *Yorum taslagi uretilemedi*\n\n${firsat.hesap.ad}\n${err?.message || String(err)}`,
        );
      }
    }
  } catch (err: any) {
    console.error("❌ Yorum firsat ajani hatasi:", err?.message || err);
    await sendEngagementMessage(
      `⚠️ *Yorum Firsat Ajani hatasi*\n\n${err?.message || String(err)}`,
    );
  }
}

/**
 * ELLE KULLANIM: Tek bir gönderi için taslak üretir.
 * Cenk akışında bir gönderi görüp ilettiğinde bu yol kullanılır.
 *
 *   npx tsx src/engagement_agent.ts --tek <activityId> <slug> "<gönderi metni>"
 */
export async function draftForSinglePost(
  activityId: string,
  slug: string,
  metin: string,
  tepki?: number,
): Promise<void> {
  const hesaplar = await loadWatchlist();
  const hesap =
    hesaplar.find((h) => h.slug === slug) ??
    ({
      ad: slug,
      slug,
      tip: "kisi" as const,
      oncelik: 2,
      not: "Takip listesinde yok — elle girildi",
    });

  const post: CapturedPost = { id: activityId, slug, yazar: hesap.ad, metin };
  if (typeof tepki === "number") post.tepki = tepki;

  const draft = await draftComments(post, hesap);
  const firsat: Opportunity = {
    post,
    hesap,
    url: postUrl(activityId),
    skor: 100,
    gerekce: ["Elle iletildi"],
  };
  await bildir(firsat, draft.taslaklar, draft.analiz, draft.acik);
  console.log("✅ Taslaklar Telegram'a gonderildi.");
}

// CLI girisi
const isDirect = process.argv[1]?.includes("engagement_agent");
if (isDirect) {
  const args = process.argv.slice(2);
  if (args[0] === "--tek" && args[1] && args[2] && args[3]) {
    draftForSinglePost(args[1], args[2], args[3], args[4] ? Number(args[4]) : undefined);
  } else {
    runEngagementWorkflow();
  }
}

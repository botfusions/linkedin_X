/**
 * DEPRECATED parallel engagement surface: retained for Telegram/Obsidian
 * compatibility, but replaced as the canonical producer by the LinkedIn vault
 * plus profile-backed Hermes flow. It never writes to LinkedIn itself; a draft
 * is published only when Cenk presses its Telegram button
 * (scripts/linkedin-comment-approval.mjs).
 */
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import os from "os";
import { randomBytes } from "crypto";
import {
  findOpportunities,
  markPostSeen,
  postUrl,
  loadWatchlist,
  type Opportunity,
  type CapturedPost,
} from "./services/engagement_scout.js";
import {
  draftComments,
  validateDraft,
  VALIDATOR_BARRIERS,
  CANONICAL_SOURCE_PATH,
  type CommentDraft,
} from "./services/comment_writer.js";
import { sendEngagementMessage } from "./services/telegram.js";

dotenv.config();

/**
 * YORUM FIRSAT AJANI
 *
 * Akış: yakalanan gönderiler → puanla → en iyi N tanesine taslak üret →
 * Telegram'a butonlu gönder → Cenk butona basarsa onay script'i yayınlar.
 *
 * Bu dosya LinkedIn'e yazmaz; yalnızca onay kaydı (data/yorum-onay/) bırakır.
 */

const MAX_FIRSAT = Number(process.env.ENGAGEMENT_MAX_DRAFTS || 3);
const MIN_SKOR = Number(process.env.ENGAGEMENT_MIN_SCORE || 40);

function kisalt(text: string, n: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

/** Telegram Markdown'ı bozan karakterleri temizler. */
export function mdSafe(text: string): string {
  return text.replace(/[_*`\[\]]/g, "");
}

async function bildir(
  firsat: Opportunity,
  taslaklar: string[],
  analiz: string,
  acik: string,
  runtime?: CommentDraft["runtime"],
) {
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

  await onayIste({
    id: firsat.post.id,
    postUrn: `urn:li:activity:${firsat.post.id}`,
    url: firsat.url,
    hesap: firsat.hesap.ad,
    taslaklar,
    mesaj: satirlar,
  });
  await prdKartiYaz(firsat, {
    analiz,
    acik,
    taslaklar,
    ...(runtime ? { runtime } : {}),
  });
  await obsidianaYaz(firsat, taslaklar, analiz, acik);
}

/**
 * Taslakları Obsidian kasasına da yazar (Claude-Media / Botfusions Social
 * Autopilot). Telegram anlık bildirim; Obsidian kalıcı arşiv ve arama.
 *
 * Kasa yoksa ya da yazma başarısızsa SESSİZCE geçilir: Telegram zaten
 * gitti, arşiv yüzünden taslağı kaybetmenin anlamı yok.
 */
const OBSIDIAN_DIR =
  process.env.OBSIDIAN_LINKEDIN_DIR ||
  path.join(os.homedir(), "Documents", "Claude-Media", "linkedin", "yorumlar");
const LINKEDIN_OUTPUTS_ROOT =
  process.env.LINKEDIN_OUTPUTS_ROOT ||
  path.join(
    process.env.LINKEDIN_VAULT_ROOT || "/System/Volumes/Data/Hermes/Hermes_Agent/Linkedin",
    "outputs",
  );

function bugun(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
}

async function obsidianaYaz(
  firsat: Opportunity,
  taslaklar: string[],
  analiz: string,
  acik: string,
): Promise<void> {
  try {
    await fs.mkdir(OBSIDIAN_DIR, { recursive: true });
    const dosya = path.join(
      OBSIDIAN_DIR,
      `${bugun()}-${firsat.hesap.slug}-${firsat.post.id}.md`,
    );

    const govde = [
      "---",
      `hesap: "${firsat.hesap.ad}"`,
      `kurum: "${firsat.hesap.kurum ?? ""}"`,
      `slug: ${firsat.hesap.slug}`,
      `gonderi_id: "${firsat.post.id}"`,
      `skor: ${firsat.skor}`,
      `tepki: ${firsat.post.tepki ?? 0}`,
      `paylasim: ${firsat.post.paylasim ?? 0}`,
      `tarih: ${bugun()}`,
      "durum: taslak", // Cenk yayınlayınca elle "yayinlandi" yapılır
      // Geri bildirim döngüsü alanları (opsiyonel, elle doldurulur — bkz. docs/linkedin-feedback-loop-plan.md)
      'secili_taslak: ""', // yayınlanan taslağın numarası: 1 veya 2
      'yayin_url: ""', // yayınlandıysa LinkedIn URL'si
      'yayin_tarih: ""', // YYYY-MM-DD
      "tepki_24s:", // 24 saat sonra tepki sayısı (elle)
      "yorum_24s:", // 24 saat sonra yorum sayısı (elle)
      "tepki_7g:", // 7 gün sonra tepki sayısı (elle)
      "yorum_7g:", // 7 gün sonra yorum sayısı (elle)
      'metrik_not: ""', // serbest not, opsiyonel
      'ders: ""', // damıtılmış ders, opsiyonel
      "tags: [linkedin, yorum-firsati, geo]",
      "---",
      "",
      `# Yorum fırsatı — ${firsat.hesap.ad}`,
      "",
      `🔗 [Gönderiye git](${firsat.url})`,
      "",
      `**Puanlama:** ${firsat.gerekce.join(" · ")}`,
      "",
      "## Gönderi",
      "",
      "> " + firsat.post.metin.replace(/\n+/g, "\n> "),
      "",
      "## Analiz",
      "",
      analiz,
      "",
      "## Açık",
      "",
      acik,
      "",
      "## Taslaklar",
      "",
    ];

    taslaklar.forEach((t, i) => {
      govde.push(`### Taslak ${i + 1} (${t.trim().split(/\s+/).length} kelime)`, "", t, "");
    });

    // Yol bazli wikilink: kasada bircok AGENT.md var, cip
    // "[[AGENT]]" belirsiz kalirdi.
    govde.push(
      "",
      "## Ölçüm (elle)",
      "",
      "Yayınladıktan sonra frontmatter'ı doldur: `durum: yayinlandi`, `secili_taslak: 1|2`,",
      "`yayin_url`, `yayin_tarih`; 24 saat sonra `tepki_24s`/`yorum_24s`, 7 gün sonra",
      "`tepki_7g`/`yorum_7g`. İstersen `ders` alanına tek cümle damıtma yaz.",
      "Ajan LinkedIn'i kazımaz; ölçüler LinkedIn'den elle bakılır.",
      "Rapor: `npm run feedback:rapor` → `<kasa>/feedback/feedback-raporu.md`.",
      "",
      "---",
      "",
      "Ajan yorum yazmaz; yayın kararı Cenk'e aittir.",
      "",
      "[[linkedin/AGENT|LinkedIn Ajanı]]",
    );

    await fs.writeFile(dosya, govde.join("\n"), "utf-8");
    console.log(`🗂️  Obsidian: ${dosya}`);
  } catch (err: any) {
    console.warn(`⚠️ Obsidian'a yazilamadi (Telegram gonderildi): ${err?.message || err}`);
  }
}

/**
 * Pending approval record read by scripts/linkedin-comment-approval.mjs.
 * Nothing is published until Cenk presses a Telegram button for it.
 */
export const ONAY_DIR = path.resolve("data", "yorum-onay");

export interface OnayIstegi {
  /** Numeric part of the post URN; also the record file name. */
  id: string;
  postUrn: string;
  url: string;
  hesap: string;
  taslaklar: string[];
  /** Message lines above the buttons (Markdown, already escaped). */
  mesaj: string[];
  /** Optional lane tag stored in the record (e.g. "ertunc"); the daily limit skips the Ertunç lane. */
  lane?: string;
}

/** Writes the pending record, then sends the drafts with publish/reject buttons. */
export async function onayIste(o: OnayIstegi): Promise<void> {
  // Record first, then buttons: a press must always find its record.
  // The nonce ties each button to this exact record: an old message can never publish a newer draft.
  const nonce = await onayKaydiYaz(o);
  const butonlar = {
    inline_keyboard: [
      o.taslaklar.map((_, i) => ({ text: `✅ Taslak ${i + 1}'i yayınla`, callback_data: `y:${o.id}:${i + 1}:${nonce}` })),
      [{ text: "❌ Reddet", callback_data: `r:${o.id}:0:${nonce}` }],
    ],
  };
  const metin = [...o.mesaj, "", "_Butona basarsan o taslak senin hesabından yorum olarak gider. Basmazsan hiçbir şey gitmez._"];
  if (!(await sendEngagementMessage(metin.join("\n"), butonlar))) {
    throw new Error("Onay mesajı Telegram'a gitmedi; gönderi görüldü sayılmadı.");
  }
}

async function onayKaydiYaz(o: OnayIstegi): Promise<string> {
  if (!/^\d{6,25}$/.test(o.id)) throw new Error(`Geçersiz gönderi kimliği: ${o.id}`);
  if (!/^urn:li:(activity|share|ugcPost):\d+$/.test(o.postUrn)) throw new Error(`Geçersiz URN: ${o.postUrn}`);
  await fs.mkdir(ONAY_DIR, { recursive: true });
  const dosya = path.join(ONAY_DIR, `${o.id}.json`);
  const eski = await fs.readFile(dosya, "utf-8").then(JSON.parse).catch(() => null);
  if (eski && !["pending", "rejected", "expired"].includes(eski.status)) {
    throw new Error(`Bu gönderi için onay kaydı zaten '${eski.status}' durumunda; ikinci yorum açılmadı.`);
  }
  const nonce = randomBytes(4).toString("hex");
  const kayit = {
    schema: "linkedin-comment-approval/v1",
    status: "pending",
    nonce,
    created_at: new Date().toISOString(),
    post_urn: o.postUrn,
    url: o.url,
    account: o.hesap,
    drafts: o.taslaklar,
    ...(o.lane ? { lane: o.lane } : {}),
  };
  const tmp = `${dosya}.tmp-${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(kayit, null, 2) + "\n", "utf-8");
  await fs.rename(tmp, dosya);
  return nonce;
}

/** Canonical PRD card; draft-only and atomic. */
async function prdKartiYaz(firsat: Opportunity, draft: CommentDraft): Promise<void> {
  const dir = path.join(LINKEDIN_OUTPUTS_ROOT, `linkedin_yorum_kartlari_${bugun()}`);
  const dosya = path.join(dir, `${firsat.hesap.slug}-${firsat.post.id}.json`);
  const payload = {
    schema: "linkedin-comment-card/v1",
    created_at: new Date().toISOString(),
    draft_only: true,
    published: false,
    source: {
      url: firsat.url,
      post_id: firsat.post.id,
      author: firsat.post.yazar,
      text: firsat.post.metin,
      engagement: {
        reactions: firsat.post.tepki ?? 0,
        comments: firsat.post.yorum ?? 0,
        shares: firsat.post.paylasim ?? 0,
      },
    },
    score: firsat.skor,
    reasons: firsat.gerekce,
    analysis: draft.analiz,
    gap: draft.acik,
    drafts: draft.taslaklar,
    validator: {
      status: "passed",
      barriers: VALIDATOR_BARRIERS,
      results: draft.taslaklar.map(validateDraft),
    },
    canonical_source_path: CANONICAL_SOURCE_PATH,
    runtime: draft.runtime ?? null,
    external_linkedin_write: false,
  };
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${dosya}.tmp-${process.pid}`;
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2) + "\n", "utf-8");
  await fs.rename(tmp, dosya);
  console.log(`🗃️  LinkedIn PRD kartı: ${dosya}`);
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
        await bildir(firsat, draft.taslaklar, draft.analiz, draft.acik, draft.runtime);
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
  await bildir(firsat, draft.taslaklar, draft.analiz, draft.acik, draft.runtime);
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

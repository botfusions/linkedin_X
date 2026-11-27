/**
 * Competitor lane: one request file -> Telegram approval buttons (same flow as the Yorum Merkezi bridge).
 *   tsx src/rakip_onay_gonder.ts <istek.json>
 * Request: {id, urn, url, author, headline, age_h, drafts: [A, B]}. Never writes to LinkedIn and never
 * calls a model; a press on a button is handled by the existing gateway plugin (linkedin-yorum-onay).
 */
import fs from "fs/promises";
import dotenv from "dotenv";
import { onayIste, mdSafe } from "./engagement_agent.js";
import { validateDraft } from "./services/comment_writer.js";

dotenv.config();

export interface RakipIstegi {
  id: string;
  urn: string;
  url: string;
  author: string;
  headline: string;
  age_h: number;
  drafts: string[];
}

/** Drafts that pass the brand/tone barrier, at most two. */
export function gecenTaslaklar(drafts: string[]): { gecen: string[]; neden: string } {
  const gecen = drafts.filter((t) => validateDraft(t).ok).slice(0, 2);
  const neden = drafts.map((t) => validateDraft(t).failures.join(",")).join(" | ");
  return { gecen, neden };
}

export function mesajSatirlari(r: RakipIstegi, gecen: string[]): string[] {
  const m = [
    `💬 *Rakip gönderisi: ${mdSafe(r.author)}*`,
    "",
    `📝 ${mdSafe(r.headline)}`,
    `🔗 ${r.url}`,
    `⏱️ Gönderi yaşı: ${r.age_h.toFixed(1)} saat`,
    "",
    "━━━━━━━━━━━━━━",
  ];
  gecen.forEach((t, i) => m.push("", `*TASLAK ${i + 1}*${i === 0 ? " (önerilen)" : ""}`, "", mdSafe(t)));
  return m;
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) throw new Error("usage: tsx src/rakip_onay_gonder.ts <istek.json>");
  const r = JSON.parse(await fs.readFile(file, "utf-8")) as RakipIstegi;
  const { gecen, neden } = gecenTaslaklar(r.drafts || []);
  if (!gecen.length) {
    console.log(JSON.stringify({ status: "rejected", reason: `validator:${neden}` }));
    process.exitCode = 3; // the wrapper marks the post seen and tells Cenk
    return;
  }
  await onayIste({ id: r.id, postUrn: r.urn, url: r.url, hesap: r.author, taslaklar: gecen, mesaj: mesajSatirlari(r, gecen) });
  console.log(JSON.stringify({ status: "sent", drafts: gecen.length }));
}

if (process.argv[1]?.includes("rakip_onay_gonder") && !process.argv[1]?.includes(".test.")) {
  main().catch((e) => {
    console.error(`❌ ${e?.message || e}`);
    process.exitCode = 1;
  });
}

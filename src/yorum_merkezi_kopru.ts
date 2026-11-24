/**
 * Bridge: ~/Documents/Linkedin post/yorum-merkezi.md -> Telegram approval buttons.
 *
 * The daily competitor scan (linkedin-yorum-merkezi skill) already finds fresh
 * competitor posts and writes reviewed drafts as "### NNN — ..." entries. This
 * bridge sends each fresh entry's drafts with publish/reject buttons. It does
 * not write drafts, does not call a model and never writes to LinkedIn; the
 * approval script publishes only a pressed draft.
 */
import fs from "fs/promises";
import os from "os";
import path from "path";
import dotenv from "dotenv";
import { onayIste, ONAY_DIR, mdSafe } from "./engagement_agent.js";
import { validateDraft } from "./services/comment_writer.js";
import { sendEngagementMessage } from "./services/telegram.js";

dotenv.config();

export const YORUM_MERKEZI_PATH =
  process.env.YORUM_MERKEZI_PATH ||
  path.join(os.homedir(), "Documents", "Linkedin post", "yorum-merkezi.md");

const AYLAR: Record<string, string> = {
  ocak: "01", şubat: "02", mart: "03", nisan: "04", mayıs: "05", haziran: "06",
  temmuz: "07", ağustos: "08", eylül: "09", ekim: "10", kasım: "11", aralık: "12",
};

export interface MerkezGirdisi {
  no: number;
  baslik: string;
  /** YYYY-MM-DD from the "(24 Kasım 2026)" suffix; "" if missing. */
  tarih: string;
  urn: string;
  id: string;
  url: string;
  /** Recommended draft first. */
  taslaklar: string[];
}

export function parseYorumMerkezi(md: string): MerkezGirdisi[] {
  const lines = md.split("\n");
  const out: MerkezGirdisi[] = [];
  let cur: { no: number; baslik: string; body: string[] } | null = null;
  const bitir = () => {
    if (!cur) return;
    const body = cur.body.join("\n");
    const kaynak = /\*\*Kaynak:\*\*\s*(https:\/\/www\.linkedin\.com\/feed\/update\/(urn:li:(?:activity|share|ugcPost):(\d+))\/?)/.exec(body);
    const t = /\((\d{1,2})\s+(\p{L}+)\s+(\d{4})\)\s*$/u.exec(cur.baslik);
    const ay = t ? AYLAR[t[2]!.toLocaleLowerCase("tr")] : undefined;
    const taslaklar: { oneri: boolean; metin: string }[] = [];
    for (let i = 0; i < cur.body.length; i++) {
      const h = cur.body[i]!;
      if (!/^###\s.*Taslak/i.test(h)) continue;
      let j = i + 1;
      while (j < cur.body.length && cur.body[j]!.trim() === "") j++;
      const q: string[] = [];
      while (j < cur.body.length && cur.body[j]!.startsWith(">")) q.push(cur.body[j++]!.replace(/^>\s?/, ""));
      const metin = q.join("\n").trim();
      if (metin) taslaklar.push({ oneri: /ÖNERİLEN/.test(h), metin });
    }
    taslaklar.sort((a, b) => Number(b.oneri) - Number(a.oneri));
    if (kaynak && taslaklar.length) {
      out.push({
        no: cur.no,
        baslik: cur.baslik,
        tarih: t && ay ? `${t[3]}-${ay}-${t[1]!.padStart(2, "0")}` : "",
        url: kaynak[1]!,
        urn: kaynak[2]!,
        id: kaynak[3]!,
        taslaklar: taslaklar.slice(0, 2).map((x) => x.metin),
      });
    }
    cur = null;
  };
  for (const line of lines) {
    const m = /^###\s+(\d+)\s+[—-]\s+(.+)$/.exec(line);
    if (m) { bitir(); cur = { no: Number(m[1]), baslik: m[2]!.trim(), body: [] }; continue; }
    if (/^##\s/.test(line)) { bitir(); continue; }
    cur?.body.push(line);
  }
  bitir();
  return out;
}

/** LinkedIn post IDs carry their creation time in the top bits (ms since epoch). */
export function postZamani(id: string): number {
  return Number(BigInt(id) >> 22n);
}

// Comment visibility drops sharply after ~6 h (yorum-merkezi.md); older posts get no buttons.
const MAX_SAAT = Number(process.env.YORUM_MERKEZI_MAX_SAAT || 12);

async function main(): Promise<void> {
  const md = await fs.readFile(YORUM_MERKEZI_PATH, "utf-8");
  const simdi = Date.now();
  const taze = parseYorumMerkezi(md).filter((g) => simdi - postZamani(g.id) <= MAX_SAAT * 3600e3);
  let gonderilen = 0;
  for (const g of taze) {
    const kayit = path.join(ONAY_DIR, `${g.id}.json`);
    if (await fs.stat(kayit).then(() => true, () => false)) continue; // already sent once
    const gecen = g.taslaklar.filter((t) => validateDraft(t).ok);
    if (!gecen.length) {
      const neden = g.taslaklar.map((t) => validateDraft(t).failures.join(",")).join(" | ");
      await sendEngagementMessage(`⚠️ Yorum Merkezi #${g.no} taslağı bariyerden geçmedi, buton açmadım: ${mdSafe(neden)}\n${g.url}`);
      await fs.mkdir(ONAY_DIR, { recursive: true });
      await fs.writeFile(kayit, JSON.stringify({ schema: "linkedin-comment-approval/v1", status: "rejected", reason: `validator:${neden}`, post_urn: g.urn, url: g.url }, null, 2) + "\n");
      continue;
    }
    const mesaj = [
      `💬 *Yorum Merkezi #${g.no}*`,
      "",
      `📝 ${mdSafe(g.baslik)}`,
      `🔗 ${g.url}`,
      `⏱️ Gönderi yaşı: ${((simdi - postZamani(g.id)) / 3600e3).toFixed(1)} saat`,
      "",
      "━━━━━━━━━━━━━━",
    ];
    gecen.forEach((t, i) => mesaj.push("", `*TASLAK ${i + 1}*${i === 0 ? " (önerilen)" : ""}`, "", mdSafe(t)));
    await onayIste({ id: g.id, postUrn: g.urn, url: g.url, hesap: g.baslik.split(",")[0]!, taslaklar: gecen, mesaj });
    gonderilen++;
  }
  console.log(JSON.stringify({ schema: "yorum-merkezi-kopru-run/v1", status: gonderilen ? "sent" : "no_work", taze: taze.length, gonderilen }));
}

const isDirect = process.argv[1]?.includes("yorum_merkezi_kopru");
if (isDirect && !process.argv[1]?.includes(".test.")) {
  main().catch(async (e) => {
    console.error(`❌ ${e?.message || e}`);
    process.exitCode = 1;
    // Hermes delivers this job locally; tell Cenk here so a broken bridge is not silent.
    await sendEngagementMessage(`⚠️ Yorum Merkezi köprüsü hata verdi: ${mdSafe(String(e?.message || e))}`).catch(() => {});
  });
}

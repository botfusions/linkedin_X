/**
 * GERİ BİLDİRİM DÖNGÜSÜ — Obsidian notlarından deterministik özet/rapor üretir.
 *
 * Okuma-yazma sınırı:
 *  - OKUR:  <kasa>/yorumlar/*.md  (yalnızca okuma, notlar ASLA değiştirilmez)
 *  - YAZAR: <kasa>/feedback/feedback-raporu.md  (yalnızca feedback_cli üzerinden)
 *
 * Fail-closed: metrik girilmemiş yayınlar sıralamaya KATILMAZ; eksik veri "—"
 * olarak gösterilir; hiçbir değer uydurulmaz. Aynı girdi → birebir aynı çıktı
 * (deterministik: zaman damgası yok, kararlı sıralama, sabit dosya adı).
 */

import fs from "fs/promises";
import path from "path";

export type YayinDurumu = "taslak" | "yayinlandi" | "vazgecildi";

export interface FeedbackNote {
  relPath: string;
  ad: string;
  hesap: string | null;
  gonderiId: string | null;
  tarih: string | null;
  durum: YayinDurumu | null;
  seciliTaslak: number | null;
  yayinUrl: string | null;
  yayinTarih: string | null;
  tepki24: number | null;
  yorum24: number | null;
  tepki7: number | null;
  yorum7: number | null;
  metrikNot: string | null;
  ders: string | null;
  taslakMetni: string | null;
  parseHata: string | null;
}

const DURUMLAR: ReadonlySet<string> = new Set(["taslak", "yayinlandi", "vazgecildi"]);

function karsilastir(a: string, b: string): number {
  // UTF-16 code unit sırası — locale'den bağımsız, tamamen deterministik.
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function temizle(value: string | undefined): string | null {
  if (value === undefined) return null;
  const v = value.trim().replace(/^["']|["']$/g, "").trim();
  return v === "" ? null : v;
}

function sayi(value: string | undefined): number | null {
  const v = temizle(value);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * "## Taslaklar" bölümündeki "### Taslak N" başlığının metnini çeker.
 * Sonraki başlık (###/##) veya "---" ayracına kadar. Bulunamazsa null.
 */
export function extractDraftText(content: string, numara: number): string | null {
  const baslikRe = new RegExp(`^###\\s*Taslak\\s+${numara}\\b`, "m");
  const match = baslikRe.exec(content);
  if (!match) return null;
  const bas = match.index + match[0].length;
  const geriKalan = content.slice(bas);
  const baslikSiniri = /^#{2,3}\s/m;
  const ayracSiniri = /^---\s*$/m;
  let son = geriKalan.length;
  const kes1 = geriKalan.search(baslikSiniri);
  if (kes1 !== -1) son = Math.min(son, kes1);
  const kes2 = geriKalan.search(ayracSiniri);
  if (kes2 !== -1) son = Math.min(son, kes2);
  const metin = geriKalan.slice(0, son).trim();
  return metin === "" ? null : metin;
}

/** Tek bir Markdown notunu ayrıştırır. Bozuk/eksik alanlar null kalır — asla varsayılan değer atanmaz. */
export function parseNote(relPath: string, content: string): FeedbackNote {
  const ad = path.basename(relPath);
  const not: FeedbackNote = {
    relPath,
    ad,
    hesap: null,
    gonderiId: null,
    tarih: null,
    durum: null,
    seciliTaslak: null,
    yayinUrl: null,
    yayinTarih: null,
    tepki24: null,
    yorum24: null,
    tepki7: null,
    yorum7: null,
    metrikNot: null,
    ders: null,
    taslakMetni: null,
    parseHata: null,
  };

  const satirlar = content.split(/\r?\n/);
  if (satirlar.length < 2 || satirlar[0]?.trim() !== "---") {
    not.parseHata = "frontmatter yok (--- ile başlamıyor)";
    return not;
  }
  const bitis = satirlar.findIndex((s, i) => i > 0 && s.trim() === "---");
  if (bitis === -1) {
    not.parseHata = "frontmatter kapanışı yok";
    return not;
  }

  const fm = new Map<string, string>();
  for (let i = 1; i < bitis; i++) {
    const satir = satirlar[i] ?? "";
    const idx = satir.indexOf(":");
    if (idx === -1) continue;
    fm.set(satir.slice(0, idx).trim(), satir.slice(idx + 1).trim());
  }

  not.hesap = temizle(fm.get("hesap"));
  not.gonderiId = temizle(fm.get("gonderi_id"));
  not.tarih = temizle(fm.get("tarih"));
  const durum = temizle(fm.get("durum"));
  not.durum = durum !== null && DURUMLAR.has(durum) ? (durum as YayinDurumu) : null;
  if (durum !== null && not.durum === null) not.parseHata = `bilinmeyen durum: ${durum}`;
  not.seciliTaslak = sayi(fm.get("secili_taslak"));
  not.yayinUrl = temizle(fm.get("yayin_url"));
  not.yayinTarih = temizle(fm.get("yayin_tarih"));
  not.tepki24 = sayi(fm.get("tepki_24s"));
  not.yorum24 = sayi(fm.get("yorum_24s"));
  not.tepki7 = sayi(fm.get("tepki_7g"));
  not.yorum7 = sayi(fm.get("yorum_7g"));
  not.metrikNot = temizle(fm.get("metrik_not"));
  not.ders = temizle(fm.get("ders"));

  if (not.seciliTaslak !== null) {
    not.taslakMetni = extractDraftText(content, not.seciliTaslak);
  }
  return not;
}

function metrikVar(n: FeedbackNote): boolean {
  return (
    n.tepki24 !== null || n.yorum24 !== null || n.tepki7 !== null || n.yorum7 !== null
  );
}

/** Deterministik: aynı notlar → birebir aynı rapor. Zaman damgası YOK. */
export function buildFeedbackReport(notes: FeedbackNote[], kaynakDir: string): string {
  const toplam = notes.length;
  const taslak = notes.filter((n) => n.durum === "taslak").length;
  const yayinlanan = notes.filter((n) => n.durum === "yayinlandi");
  const vazgecilen = notes.filter((n) => n.durum === "vazgecildi");
  const bilinmeyen = notes.filter((n) => n.durum === null);

  const metrikli = yayinlanan.filter(metrikVar);
  const metriksiz = yayinlanan.filter((n) => !metrikVar(n));

  const siralama = [...metrikli].sort((a, b) => {
    const ta = a.tepki24 ?? -1;
    const tb = b.tepki24 ?? -1;
    if (ta !== tb) return tb - ta;
    const t7a = a.tepki7 ?? -1;
    const t7b = b.tepki7 ?? -1;
    if (t7a !== t7b) return t7b - t7a;
    return karsilastir(a.gonderiId ?? a.ad, b.gonderiId ?? b.ad);
  });

  const kirp = (s: string): string => (s.length > 400 ? `${s.slice(0, 400)}…` : s);

  const satirlar: string[] = [];
  satirlar.push("# Geri Bildirim Raporu", "");
  satirlar.push("> Otomatik üretildi: `npm run feedback:rapor` (üretici proje). Elle düzenlenmez.", "");
  satirlar.push(`> Kaynak: ${kaynakDir}`, "");
  satirlar.push("> Deterministik: aynı notlar için birebir aynı çıktı üretilir.", "");
  satirlar.push("> Kural (fail-closed): metrik girilmemiş yayınlar sıralamaya KATILMAZ;", "");
  satirlar.push('> eksik veri "—" gösterilir; hiçbir değer uydurulmaz.', "");
  satirlar.push("---", "", "## Özet", "");
  satirlar.push(`- Toplam not: ${toplam}`);
  satirlar.push(`- Taslak: ${taslak}`);
  satirlar.push(`- Yayınlanmış: ${yayinlanan.length}`);
  satirlar.push(`- Vazgeçilmiş: ${vazgecilen.length}`);
  satirlar.push(`- Durumu bilinmeyen/bozuk: ${bilinmeyen.length}`);
  satirlar.push(`- Yayınlanmış ama metrik girilmemiş (fail-closed): ${metriksiz.length}`);
  satirlar.push("", "---", "", "## KAZANAN DESENLER", "");
  satirlar.push(
    "Sıralama: 24 saat tepkisi (azalan) → 7 gün tepkisi (azalan) → gönderi ID. " +
      "Bu bölüm gelecek taslak üretiminin girdisidir.",
    "",
  );

  if (siralama.length === 0) {
    satirlar.push(
      "Henüz metrikli yayın kaydı yok. İlk yayını `durum: yayinlandi` yapıp ölçüleri " +
        "girdiğinde burası dolacak.",
      "",
    );
  }
  siralama.forEach((n, i) => {
    const g24 = n.tepki24 !== null ? `${n.tepki24} tepki` : "—";
    const y24 = n.yorum24 !== null ? `${n.yorum24} yorum` : "—";
    const g7 = n.tepki7 !== null ? `${n.tepki7} tepki` : "—";
    const y7 = n.yorum7 !== null ? `${n.yorum7} yorum` : "—";
    satirlar.push(
      `${i + 1}. ${n.hesap ?? n.ad} — ${n.tarih ?? "tarih yok"} (gönderi ${n.gonderiId ?? n.ad})`,
      "",
    );
    satirlar.push(`   24s: ${g24}, ${y24}  |  7g: ${g7}, ${y7}`);
    satirlar.push(`   URL: ${n.yayinUrl ?? "kayıtlı değil"}`);
    satirlar.push(
      `   Seçilen taslak: ${n.seciliTaslak !== null ? `Taslak ${n.seciliTaslak}` : "kayıtlı değil"}`,
    );
    if (n.seciliTaslak !== null) {
      satirlar.push(
        `   Taslak metni: ${n.taslakMetni !== null ? kirp(n.taslakMetni) : "(metin çözülemedi)"}`,
      );
    }
    satirlar.push(`   Ders: ${n.ders ?? "(ders yazılmamış)"}`);
    satirlar.push("");
  });

  satirlar.push("---", "", "## METRİK BEKLEYEN (fail-closed)", "");
  if (metriksiz.length === 0) {
    satirlar.push("Yok — tüm yayınların ölçüsü girilmiş.", "");
  } else {
    satirlar.push(
      "Yayınlandı işaretli ama hiçbir metrik girilmemiş. Sıralamaya KATILMADI; değer uydurulmadı:",
      "",
    );
    for (const n of metriksiz) {
      satirlar.push(
        `- ${n.ad} (${n.hesap ?? "hesap yok"}, ${n.tarih ?? "tarih yok"}) — ` +
          `secili_taslak: ${n.seciliTaslak ?? "—"}, yayin_url: ${n.yayinUrl ?? "—"}`,
      );
    }
    satirlar.push("");
  }

  if (vazgecilen.length > 0) {
    satirlar.push("---", "", "## Vazgeçilenler", "");
    for (const n of vazgecilen) {
      satirlar.push(`- ${n.ad} (${n.hesap ?? "hesap yok"})`);
    }
    satirlar.push("");
  }

  const hatali = notes.filter((n) => n.parseHata !== null);
  if (hatali.length > 0) {
    satirlar.push("---", "", "## Notlar / ayrıştırma hataları", "");
    for (const n of hatali) {
      satirlar.push(`- ${n.ad}: ${n.parseHata}`);
    }
    satirlar.push("");
  }

  return satirlar.join("\n") + "\n";
}

/** Dizindeki tüm Markdown notlarını yükler; "_" ile başlayanlar (şablon vb.) atlanır. */
export async function loadNotes(dir: string): Promise<FeedbackNote[]> {
  const girdiler = await fs.readdir(dir, { withFileTypes: true });
  const mdDosyalari = girdiler
    .filter((g) => g.isFile() && g.name.endsWith(".md") && !g.name.startsWith("_"))
    .map((g) => g.name)
    .sort(karsilastir);

  const notlar: FeedbackNote[] = [];
  for (const ad of mdDosyalari) {
    const tamYol = path.join(dir, ad);
    try {
      const icerik = await fs.readFile(tamYol, "utf-8");
      notlar.push(parseNote(ad, icerik));
    } catch (err: any) {
      notlar.push({
        relPath: ad,
        ad,
        hesap: null,
        gonderiId: null,
        tarih: null,
        durum: null,
        seciliTaslak: null,
        yayinUrl: null,
        yayinTarih: null,
        tepki24: null,
        yorum24: null,
        tepki7: null,
        yorum7: null,
        metrikNot: null,
        ders: null,
        taslakMetni: null,
        parseHata: `okunamadı: ${err?.message ?? String(err)}`,
      });
    }
  }
  return notlar;
}

/**
 * GERİ BİLDİRİM DÖNGÜSÜ DOĞRULAYICISI (deterministik)
 *
 *   npm run feedback:test
 *
 * Projenin test konvansiyonu: framework yok — tsx ile çalıştırılan, node:assert
 * kullanan kendi kendine yeten senaryo dosyası. Herhangi bir assert başarısız
 * olursa süreç sıfır olmayan çıkış koduyla biter (tsx varsayılanı).
 *
 * Kapsanan senaryolar:
 *  - Geriye dönük uyum: eski format (yalnızca hesap/skor/durum) sorunsuz ayrışır
 *  - Yeni alanlar (secili_taslak, yayin_url, metrikler, ders) doğru okunur
 *  - Seçili taslak metni "## Taslaklar" bölümünden çözülür
 *  - Fail-closed: metriksiz yayın sıralamaya girmez, "METRİK BEKLEYEN"e düşer,
 *    uydurulmuş sayı yoktur
 *  - Determinizm: aynı girdi → birebir aynı rapor
 *  - loadNotes: dosya sistemi üzerinde, "_" ile başlayan dosyalar atlanır
 *  - Bozuk not (frontmatter yok) rapora hata olarak taşınır, süreç çökmez
 */

import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import {
  buildFeedbackReport,
  extractDraftText,
  loadNotes,
  parseNote,
  type FeedbackNote,
} from "./services/feedback_loop.js";

let gecen = 0;
function ok(mesaj: string): void {
  gecen++;
  console.log(`  ✅ ${mesaj}`);
}

// ── Fixture'lar ──────────────────────────────────────────────────────────────

/** Gerçek kasada bulunan eski formatın birebir benzeri (geriye dönük uyum). */
const ESKI_FORMAT = `---
hesap: "Atiye Berika Ertas"
kurum: "Webtures / Brantial"
slug: atiyeberikaertas
gonderi_id: "7490360134762946560"
skor: 100
tepki: 17
paylasim: 0
tarih: 2026-08-05
durum: taslak
tags: [linkedin, yorum-firsati, geo]
---

# Yorum fırsatı — Atiye Berika Ertas

## Taslaklar

### Taslak 1 (53 kelime)

İçerik ve itibar tarafı doğru ama bir ön koşul var: bot siteye uğramıyorsa hiçbiri işlemiyor.

### Taslak 2 (53 kelime)

15 madde iyi bir çerçeve ama listenin sonunda eksik kalan halka ölçüm.
`;

/** Yeni format: yayınlanmış + tam metrikli + seçili taslak + ders. */
const YAYIN_METRIKLI = `---
hesap: "Deneme Hesap A"
gonderi_id: "1111111111111111111"
tarih: 2026-08-01
durum: yayinlandi
secili_taslak: 2
yayin_url: "https://www.linkedin.com/feed/update/urn:li:activity:1111111111111111111/"
yayin_tarih: 2026-08-01
tepki_24s: 12
yorum_24s: 3
tepki_7g: 20
yorum_7g: 5
metrik_not: "yorum en üstte kaldı"
ders: "Soruyla biten gönderilerde ölçüm açığı vurgusu işe yarıyor"
---

# Yorum fırsatı — Deneme Hesap A

## Gönderi

> Deneme gönderi metni.

## Taslaklar

### Taslak 1 (60 kelime)

Birinci taslak metni burada yer alır ve test amacıyla yazılmıştır.

### Taslak 2 (61 kelime)

İkinci taslak metni burada yer alır ve test amacıyla yazılmıştır.
`;

/** Yayınlanmış ama HİÇ metrik girilmemiş — fail-closed senaryosu. */
const YAYIN_METRIKSIZ = `---
hesap: "Deneme Hesap B"
gonderi_id: "2222222222222222222"
tarih: 2026-08-02
durum: yayinlandi
---

# Yorum fırsatı — Deneme Hesap B

## Taslaklar

### Taslak 1 (55 kelime)

Ölçüsü hiç girilmemiş yayının taslağı.
`;

/** Vazgeçilmiş. */
const VAZGECILDI = `---
hesap: "Deneme Hesap C"
gonderi_id: "3333333333333333333"
tarih: 2026-08-03
durum: vazgecildi
---

# Yorum fırsatı — Deneme Hesap C
`;

/** Frontmatter'ı olmayan bozuk not. */
const BOZUK = `# Başlıksız not

Frontmatter yok.
`;

async function main(): Promise<void> {
  console.log("\n🔬 feedback_loop doğrulayıcısı başlıyor\n");

  // 1) Eski format geriye dönük uyum
  const eski = parseNote("eski.md", ESKI_FORMAT);
  assert.equal(eski.durum, "taslak");
  assert.equal(eski.hesap, "Atiye Berika Ertas");
  assert.equal(eski.tepki24, null);
  assert.equal(eski.seciliTaslak, null);
  assert.equal(eski.parseHata, null);
  ok("eski format ayrışır: durum=taslak, yeni alanlar null, hata yok");

  // 2) Yeni format alanları
  const yeni = parseNote("yeni.md", YAYIN_METRIKLI);
  assert.equal(yeni.durum, "yayinlandi");
  assert.equal(yeni.seciliTaslak, 2);
  assert.equal(yeni.yayinUrl?.startsWith("https://www.linkedin.com"), true);
  assert.equal(yeni.tepki24, 12);
  assert.equal(yeni.yorum24, 3);
  assert.equal(yeni.tepki7, 20);
  assert.equal(yeni.yorum7, 5);
  assert.equal(yeni.ders?.includes("ölçüm açığı"), true);
  ok("yeni format alanları doğru okunur (secili_taslak, URL, 24s/7g metrikler, ders)");

  // 3) Seçili taslak metni çözümü (Taslak 2 seçilmiş)
  assert.notEqual(yeni.taslakMetni, null);
  assert.equal(yeni.taslakMetni?.includes("İkinci taslak metni"), true);
  assert.equal(yeni.taslakMetni?.includes("Birinci taslak"), false);
  ok("secili_taslak=2 → 'Taslak 2' metni doğru bölümden çözülür, Taslak 1 karışmaz");

  // 4) extractDraftText birim testi
  const parca = extractDraftText(ESKI_FORMAT, 1);
  assert.equal(parca?.includes("ön koşul var"), true);
  assert.equal(parca?.includes("Taslak 2"), false);
  assert.equal(extractDraftText(ESKI_FORMAT, 9), null);
  ok("extractDraftText: var olan taslağı çözer, olmayan numara için null döner");

  // 5) Fail-closed: metriksiz yayın sıralamaya girmez
  const sadeceB = buildFeedbackReport([parseNote("b.md", YAYIN_METRIKSIZ)], "/tmp/kasa");
  assert.equal(sadeceB.includes("Deneme Hesap B"), true);
  assert.equal(sadeceB.includes("## KAZANAN DESENLER"), true);
  assert.equal(sadeceB.includes("Henüz metrikli yayın kaydı yok"), true);
  assert.equal(sadeceB.includes("## METRİK BEKLEYEN (fail-closed)"), true);
  assert.equal(sadeceB.includes("24s:"), false, "uydurulmuş metrik satırı olmamalı");
  assert.equal(sadeceB.includes("tepki"), true); // yalnızca durum bildirimi
  ok("fail-closed: metriksiz yayın 'METRİK BEKLEYEN'de, sıralamada yok, sayı uydurulmamış");

  // 6) Tam rapor: metrikli yayın sıralamada, ders ve taslak metni raporda
  const tam = buildFeedbackReport(
    [
      parseNote("b.md", YAYIN_METRIKSIZ),
      parseNote("a.md", YAYIN_METRIKLI),
      parseNote("eski.md", ESKI_FORMAT),
      parseNote("c.md", VAZGECILDI),
      parseNote("bozuk.md", BOZUK),
    ],
    "/tmp/kasa",
  );
  assert.equal(tam.includes("1. Deneme Hesap A — 2026-08-01"), true, "sıralama başı A");
  assert.equal(tam.includes("24s: 12 tepki, 3 yorum"), true);
  assert.equal(tam.includes("7g: 20 tepki, 5 yorum"), true);
  assert.equal(tam.includes("İkinci taslak metni"), true, "seçilen taslak metni raporda");
  assert.equal(tam.includes("ölçüm açığı vurgusu"), true, "ders raporda");
  assert.equal(tam.includes("Taslak: 1"), true);
  assert.equal(tam.includes("Vazgeçilmiş: 1"), true);
  assert.equal(tam.includes("## Vazgeçilenler"), true);
  assert.equal(tam.includes("frontmatter yok"), true, "bozuk not hata bölümünde");
  assert.equal(tam.includes("Deneme Hesap B"), true, "B, METRİK BEKLEYEN'de");
  const kazananBolum = tam.slice(tam.indexOf("## KAZANAN DESENLER"), tam.indexOf("## METRİK BEKLEYEN"));
  assert.equal(kazananBolum.includes("Deneme Hesap B"), false, "B sıralamada YOK");
  ok("tam rapor: sıralama, ders, taslak metni, özet sayıları, vazgeçilenler, bozuk not hatası doğru");

  // 7) Determinizm: iki üretim birebir aynı
  const notlar = [
    parseNote("b.md", YAYIN_METRIKSIZ),
    parseNote("a.md", YAYIN_METRIKLI),
    parseNote("eski.md", ESKI_FORMAT),
  ];
  const r1 = buildFeedbackReport(notlar, "/tmp/kasa");
  const r2 = buildFeedbackReport(notlar, "/tmp/kasa");
  assert.equal(r1, r2);
  assert.equal(r1.includes(new Date().toISOString().slice(0, 10)), false, "zaman damgası yok");
  ok("determinizm: aynı girdi → birebir aynı çıktı, zaman damgası yok");

  // 8) loadNotes dosya sistemi üzerinde ("_" ile başlayan atlanır)
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "feedback-loop-test-"));
  try {
    await fs.writeFile(path.join(tmp, "a.md"), YAYIN_METRIKLI, "utf-8");
    await fs.writeFile(path.join(tmp, "b.md"), YAYIN_METRIKSIZ, "utf-8");
    await fs.writeFile(path.join(tmp, "_TEMPLATE.md"), "---\ndurum: taslak\n---\n", "utf-8");
    const yuklenen = await loadNotes(tmp);
    assert.equal(yuklenen.length, 2);
    assert.equal(yuklenen.some((n: FeedbackNote) => n.ad === "_TEMPLATE.md"), false);
    ok("loadNotes: 2 not yükler, '_' ile başlayan şablonu atlar");
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }

  console.log(`\n🎉 TÜM DOĞRULAMALAR GEÇTİ (${gecen} kontrol)\n`);
}

main().catch((err: any) => {
  console.error("\n❌ DOĞRULAMA BAŞARISIZ:", err?.message ?? String(err));
  process.exit(1);
});

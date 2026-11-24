import test from "node:test";
import assert from "node:assert/strict";
import { parseYorumMerkezi, postZamani } from "./yorum_merkezi_kopru.js";

const md = `# Yorum Merkezi

### 115 — Webtures, "buzdağı" gönderisi (23 Kasım 2026)

**Kaynak:** https://www.linkedin.com/feed/update/urn:li:share:7530594368143908865/ (2 saatlik)

### Taslak B, ikinci açı

> İkinci taslak.

### ✅ ÖNERİLEN: Taslak A, ölçüm

> Birinci satır
> ikinci satır.

*(~95 kelime)*

### 116 — Webtures SI bülteni (4 Aralık 2026)

**Kaynak:** https://www.linkedin.com/feed/update/urn:li:activity:7530993250644611073/

### 117 — Kaynaksız giriş (24 Kasım 2026)

### ✅ ÖNERİLEN: Taslak A

> Metin.

## Gönderilen yorumlar
`;

test("parses entries, recommended draft first, skips entries without source or draft", () => {
  const g = parseYorumMerkezi(md);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0], {
    no: 115,
    baslik: 'Webtures, "buzdağı" gönderisi (23 Kasım 2026)',
    tarih: "2026-11-23",
    url: "https://www.linkedin.com/feed/update/urn:li:share:7530594368143908865/",
    urn: "urn:li:share:7530594368143908865",
    id: "7530594368143908865",
    taslaklar: ["Birinci satır\nikinci satır.", "İkinci taslak."],
  });
});

test("post time is decoded from the LinkedIn ID", () => {
  assert.equal(new Date(postZamani("7530594368143908865")).toISOString(), "2026-11-23T11:33:29.043Z");
});

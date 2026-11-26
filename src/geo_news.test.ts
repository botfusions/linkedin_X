import test from "node:test";
import assert from "node:assert/strict";
import { pickFresh } from "./geo_news.js";

const NOW = Date.parse("2026-11-25T09:00:00Z");
const a = (title: string, link: string, hoursAgo = 1, snippet = "") =>
  ({ title, link, pubDate: new Date(NOW - hoursAgo * 3600e3).toUTCString(), contentSnippet: snippet, content: "" });

test("pickFresh keeps fresh GEO items, drops used, old, off-topic and duplicate titles", () => {
  const out = pickFresh([
    a("Google expands AI Mode to Europe - The Verge", "https://x/1"),
    a("Google expands AI Mode to Europe - Reuters", "https://x/2"),
    a("ChatGPT search adds shopping", "https://x/3", 50),
    a("Core update finished rolling out", "https://x/4"),
    a("Perplexity cites brand pages", "https://x/5"),
  ], ["https://x/5"], NOW);
  assert.deepEqual(out.map((o) => o.link), ["https://x/1"]);
});

test("pickFresh drops agency lists, awards and vendor press releases", () => {
  const out = pickFresh([
    a("The 10 Best AEO Providers in 2026 - Inter Press Service", "https://x/6"),
    a("8 AI SEO Agencies Helping Brands Get Mentioned in ChatGPT - Business Matters", "https://x/7"),
    a("Finseo Achieves ISO 27001 Certification to Bring Security to AEO and GEO", "https://x/8"),
    a("Google AI Mode adds image collections", "https://x/9"),
    a("Google launches AI Mode in Turkey - The Verge", "https://x/10"),
  ], [], NOW);
  assert.deepEqual(out.map((o) => o.link), ["https://x/9", "https://x/10"]);
});

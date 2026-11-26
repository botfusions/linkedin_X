// GEO news candidates for the 10:00/16:00 own posts (Cenk 2026-11-25).
//   npx tsx src/geo_news.ts            -> JSON list of fresh, unused candidates on stdout
//   npx tsx src/geo_news.ts --mark URL -> record URL as used so no later slot repeats it
// Independent industry sources only; competitor posts are not a news source.
import fs from "node:fs";
import path from "node:path";
import { fetchNewsFromRSS, type NewsArticle } from "./services/rss.js";

const gn = (q: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}+when:2d&ceid=US:en&hl=en-US&gl=US`;

// Order matters: the top 10 are taken in feed order, so trade press goes first (2026-11-26: the
// GEO/AEO query alone filled all 10 slots with agency lists and press releases).
export const FEEDS = [
  "https://www.searchenginejournal.com/feed/",
  "http://feeds.seroundtable.com/SearchEngineRoundtable1", // its https host fails TLS
  gn('"AI Overviews" OR "AI Mode" Google search'),
  gn('"ChatGPT search" OR "Perplexity" OR "AI search" visibility brands'),
  gn('"generative engine optimization" OR "answer engine optimization"'),
];

// Agency rankings, awards and vendor press releases are never our news.
// Not "launches"/"announces": they also match real news ("Google launches AI Mode in ...").
const JUNK = /\b(best|top \d+|\d+ (best|top)|agenc(y|ies)|providers?|recognized|award|certification|certified|press release)\b/i;

// Trade-press feeds carry all SEO news; keep only items about AI answers/search.
const GEO_WORDS = /\b(GEO|AEO|generative engine|answer engine|AI Overview|AI Mode|ChatGPT|Perplexity|Gemini|Copilot|LLM|AI search|citation|AI visibility)\b/i;
const MAX_AGE_MS = 48 * 3600 * 1000;
const USED = path.resolve("data/geo-news-used.json");

const readUsed = (): string[] => (fs.existsSync(USED) ? JSON.parse(fs.readFileSync(USED, "utf8")) : []);

export function pickFresh(items: NewsArticle[], used: string[], now = Date.now()) {
  const seen = new Set(used);
  const titles = new Set<string>();
  return items.filter((a) => {
    const t = Date.parse(a.pubDate);
    const key = a.title.toLowerCase().replace(/\s+-\s+[^-]+$/, "").trim(); // Google News appends " - Source"
    if (!a.link || seen.has(a.link) || titles.has(key)) return false;
    if (!Number.isFinite(t) || now - t > MAX_AGE_MS) return false;
    if (!GEO_WORDS.test(`${a.title} ${a.contentSnippet}`)) return false;
    if (JUNK.test(a.title.replace(/\s+-\s+[^-]+$/, ""))) return false;
    titles.add(key);
    return true;
  });
}

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--mark");
  if (i >= 0) {
    const url = args[i + 1];
    if (!url?.startsWith("http")) throw new Error("--mark <url> gerekli");
    const used = readUsed();
    if (!used.includes(url)) fs.writeFileSync(USED, JSON.stringify([...used, url].slice(-500), null, 2) + "\n");
    console.log(JSON.stringify({ marked: url }));
    return;
  }
  const all: NewsArticle[] = [];
  for (const f of FEEDS) {
    try { all.push(...(await fetchNewsFromRSS(30, f))); }
    catch (e: any) { console.error(`⚠️ kaynak atlandı: ${f} (${e.message})`); }
  }
  const fresh = pickFresh(all, readUsed()).slice(0, 10)
    .map(({ title, link, pubDate, contentSnippet }) => ({ title, link, pubDate, snippet: contentSnippet.replace(/<[^>]+>/g, " ").slice(0, 400) }));
  console.log(JSON.stringify({ count: fresh.length, candidates: fresh }, null, 2));
}

if (process.argv[1]?.endsWith("geo_news.ts")) main().catch((e) => { console.error(`❌ ${e.message}`); process.exit(1); });

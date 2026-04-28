import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import dotenv from "dotenv";

dotenv.config();

const RSS_URL =
  "https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pWVXlnQVAB/sections/CAQiQ0NCQVNMQW9JTDIwdk1EZGpNWFlTQW1WdUdnSlZVeUlOQ0FRYUNRb0hMMjB2TUcxcmVpb0pFZ2N2YlM4d2JXdDZLQUEqKggAKiYICiIgQ0JBU0Vnb0lMMjB2TURkak1YWVNBbVZ1R2dKVlV5Z0FQAVAB?ceid=US:en&oc=3";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml",
};

export interface NewsArticle {
  title: string;
  link: string;
  pubDate: string;
  contentSnippet: string;
  content: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

export async function fetchNewsFromRSS(maxItems: number = 5): Promise<NewsArticle[]> {
  try {
    console.log("📡 Google News AI RSS çekiliyor...");
    const response = await axios.get(RSS_URL, {
      headers: HEADERS,
      timeout: 15000,
    });

    const parsed = parser.parse(response.data);
    const items = parsed?.rss?.channel?.item || [];

    const articles: NewsArticle[] = (Array.isArray(items) ? items : [items])
      .slice(0, maxItems)
      .map((item: any) => ({
        title: item.title || "",
        link: item.link || "",
        pubDate: item.pubDate || "",
        contentSnippet: item.description || "",
        content: item["content:encoded"] || item.description || "",
      }));

    console.log(`✅ ${articles.length} haber çekildi.`);
    return articles;
  } catch (error: any) {
    console.error("❌ RSS çekme hatası:", error.message);
    throw error;
  }
}

export async function fetchArticleContent(url: string): Promise<string> {
  try {
    const response = await axios.get(url, {
      headers: HEADERS,
      timeout: 15000,
      maxRedirects: 5,
    });

    const html = response.data as string;

    const bodyMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const rawText = bodyMatch
      ? bodyMatch[1]
      : html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const text = rawText || "";

    return text.substring(0, 4000);
  } catch (error: any) {
    console.error("❌ Haber içeriği çekme hatası:", error.message);
    return "";
  }
}

export function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

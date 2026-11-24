/**
 * CAPTURE AGENT — BrowserOS Read-Only Single-Account Adapter
 *
 * Tek bir hesabın LinkedIn feed'ini BrowserOS MCP üzerinden read-only
 * tarar. Hiçbir write işlemi yapmaz (act, download, upload kullanılmaz).
 *
 * KIRMIZI ÇİZGİ:
 * - Login/cookie injection/headless scraping YOK
 * - Yorum, like, follow, connection, DM, post, repost YOK
 * - Detection/rate-limit atlatma YOK
 * - Sadece navigate + read/grep + evaluate (read-only BrowserOS araçları)
 *
 * Transport: BrowserOS MCP gerçek transportu (http://127.0.0.1:9000/mcp)
 * TypeScript'ten doğrudan çağrılabilmeli, ancak bu modül somut HTTP transport
 * yazmak yerine bir adapter boundary (interface) sunar. Somut transport
 * dependency injection ile verilir; gerçek MCP HTTP çağrısı yapılmadan
 * fail-closed davranır.
 *
 * BLOCKER: BrowserOS MCP HTTP transportu için @modelcontextprotocol/sdk
 * paketi gerekiyor. Repo'da kurulu değil. Bu modül adapter boundary ve
 * test double ile çalışabilir; gerçek MCP transport entegrasyonu ayrı
 * bir task'ta yapılmalı.
 */
import {
  buildReceipt,
  dedupeAgainstSeen,
  postIdToUrn,
  type CaptureReceipt,
  type CapturedPostV1,
  type PageSessionProof,
  type ReceiptError,
  type Freshness,
} from "./services/capture_receipt.js";
import type { WatchedAccount } from "./services/engagement_scout.js";
import { createHash } from "crypto";

// ─── BrowserOS MCP Adapter Boundary ───────────────────────────────

/**
 * BrowserOS MCP read-only tool yüzeyi.
 * Sadece okuma amaçlı araçlar — write araçları (act, download, upload) yok.
 */
export interface BrowserOSReadAdapter {
  /**
   * Bir URL'ye navigate eder. Sayfanın yüklenmesini bekler.
   * Read-only: sayfa durumunu değiştirmez (URL değişimi navigation'dur,
   * LinkedIn write işlemi değildir).
   */
  navigate(url: string): Promise<{ ok: boolean; title?: string }>;

  /**
   * Sayfa içeriğini okur. Markdown, text veya HTML olarak çıkarır.
   * CSS selector ile subtree seçilebilir.
   */
  read(options: {
    format?: "markdown" | "text" | "html";
    selector?: string;
  }): Promise<{ content: string }>;

  /**
   * Sayfa içeriğinde regex arar.
   */
  grep(pattern: string): Promise<{ matches: string[] }>;

  /**
   * Sayfa context'inde JavaScript çalıştırır ve değer döndürür.
   * Sadece read amaçlı evaluate — DOM mutation yapmaz.
   */
  evaluate<T>(script: string): Promise<{ result: T }>;

  /**
   * Bağlantı durumu — BrowserOS MCP server erişilebilir mi?
   */
  isAvailable(): Promise<boolean>;
}

/**
 * Adapter'ın bulunamaması veya erişilemez olması durumunda
 * fail-closed davranış için kullanılan sentinel adapter.
 * Hiçbir capture yapamaz — her çağrı capture_unavailable döndürür.
 */
export class FailClosedAdapter implements BrowserOSReadAdapter {
  constructor(private reason: string = "No BrowserOS adapter configured") {}

  async navigate(): Promise<{ ok: boolean }> {
    throw new Error(`BrowserOS unavailable: ${this.reason}`);
  }
  async read(): Promise<{ content: string }> {
    throw new Error(`BrowserOS unavailable: ${this.reason}`);
  }
  async grep(): Promise<{ matches: string[] }> {
    throw new Error(`BrowserOS unavailable: ${this.reason}`);
  }
  async evaluate(): Promise<{ result: never }> {
    throw new Error(`BrowserOS unavailable: ${this.reason}`);
  }
  async isAvailable(): Promise<boolean> {
    return false;
  }
}

// ─── Capture Result ───────────────────────────────────────────────

export interface CaptureResult {
  receipt: CaptureReceipt;
  /** Capture başarılı mı? (freshness !== capture_unavailable) */
  success: boolean;
}

// ─── Capture Agent ────────────────────────────────────────────────

/**
 * Tek hesabın LinkedIn activity feed'ini BrowserOS üzerinden read-only
 * tarar ve bir CaptureReceipt üretir.
 *
 * Akış:
 * 1. Adapter erişilebilir mi? → değilse capture_unavailable
 * 2. Hesabın feed URL'ine navigate
 * 3. Sayfada urn:li:activity:NNN pattern'lerini grep/evaluate ile çıkar
 * 4. CapturedPostV1'lere dönüştür
 * 5. son_gonderi_id'ye karşı dedupe
 * 6. Receipt üret (buildReceipt)
 */
export class CaptureAgent {
  constructor(
    private adapter: BrowserOSReadAdapter,
    private options?: {
      /** Capture timeout (ms). Varsayılan: 30000 */
      timeoutMs?: number;
    },
  ) {}

  /**
   * Tek hesabı tarar.
   */
  async captureAccount(
    account: Pick<WatchedAccount, "slug" | "ad" | "tip" | "oncelik">,
  ): Promise<CaptureResult> {
    const errors: ReceiptError[] = [];
    let freshness: Freshness = "fresh";
    const timestamp = new Date().toISOString();

    // 1. Adapter available?
    const available = await this.adapter.isAvailable();
    if (!available) {
      const receipt = buildReceipt({
        account,
        proof: this.emptyProof(timestamp),
        posts: [],
        errors: [
          { slug: account.slug, error: "BrowserOS adapter unavailable", timestamp },
        ],
        freshness: "capture_unavailable",
        lastSeenId: null,
      });
      return { receipt, success: false };
    }

    // 2. Navigate to account's recent activity feed
    const feedUrl = this.buildFeedUrl(account.slug, account.tip);
    let scrapeId = `${account.slug}-${timestamp}`;
    let domHashPrefix = "";

    try {
      const navResult = await this.withTimeout(
        this.adapter.navigate(feedUrl),
        this.options?.timeoutMs ?? 30000,
      );
      if (!navResult.ok) {
        errors.push({
          slug: account.slug,
          error: `navigate failed for ${feedUrl}`,
          timestamp,
        });
        freshness = "capture_unavailable";
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ slug: account.slug, error: `navigate error: ${msg}`, timestamp });
      freshness = "capture_unavailable";
    }

    // 3. Extract activity URNs from page content
    let posts: CapturedPostV1[] = [];
    if (freshness !== "capture_unavailable") {
      try {
        const urns = await this.extractActivityUrns();
        posts = urns.map((urn) => this.urnToPost(urn, account));
        domHashPrefix = await this.computeDomHash();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({
          slug: account.slug,
          error: `extract error: ${msg}`,
          timestamp,
        });
        freshness = "source_stale";
      }
    }

    // 4. Build proof
    const proof: PageSessionProof = {
      scrape_id: scrapeId,
      url: feedUrl,
      dom_hash_prefix: domHashPrefix || "unavailable",
    };

    // 5. Build receipt (dedupe applied inside buildReceipt)
    const receipt = buildReceipt({
      account,
      proof,
      posts,
      errors,
      freshness,
      lastSeenId: null, // WatchedAccount'tan gelir — caller sağlar
    });

    return { receipt, success: freshness !== "capture_unavailable" };
  }

  // ─── Internal Helpers ──────────────────────────────────────

  /**
   * Hesabın LinkedIn feed URL'ini oluşturur.
   * Kisi: /in/{slug}/recent-activity/shares/
   * Sirket: /company/{slug}/posts/
   */
  private buildFeedUrl(slug: string, tip: WatchedAccount["tip"]): string {
    if (tip === "sirket") {
      return `https://www.linkedin.com/company/${slug}/posts/`;
    }
    return `https://www.linkedin.com/in/${slug}/recent-activity/shares/`;
  }

  /**
   * Sayfadan urn:li:activity:NNN pattern'lerini çıkarır.
   * Önce grep ile dener; başarısız olursa evaluate ile DOM'dan okur.
   */
  private async extractActivityUrns(): Promise<string[]> {
    // Yöntem 1: grep ile regex arama
    try {
      const grepResult = await this.adapter.grep(
        "urn:li:activity:\\d+",
      );
      if (grepResult.matches.length > 0) {
        return this.normalizeUrns(grepResult.matches);
      }
    } catch {
      // grep başarısız — evaluate'e düş
    }

    // Yöntem 2: evaluate ile DOM'dan activity URN'lerini çıkar
    try {
      const script = `
        (function() {
          var urns = [];
          var links = document.querySelectorAll('a[href*="urn:li:activity:"]');
          for (var i = 0; i < links.length; i++) {
            var m = links[i].href.match(/urn:li:activity:(\\d+)/);
            if (m) urns.push('urn:li:activity:' + m[1]);
          }
          // Also check data attributes
          var elems = document.querySelectorAll('[data-urn*="urn:li:activity:"]');
          for (var j = 0; j < elems.length; j++) {
            var d = elems[j].getAttribute('data-urn');
            var m2 = d.match(/urn:li:activity:(\\d+)/);
            if (m2) urns.push('urn:li:activity:' + m2[1]);
          }
          return Array.from(new Set(urns)).slice(0, 20);
        })()
      `;
      const evalResult = await this.adapter.evaluate<string[]>(script);
      if (Array.isArray(evalResult.result) && evalResult.result.length > 0) {
        return this.normalizeUrns(evalResult.result);
      }
    } catch {
      // evaluate de başarısız
    }

    return [];
  }

  /**
   * Ham match'leri normalize eder, geçersizleri eler.
   */
  private normalizeUrns(matches: string[]): string[] {
    const urnSet = new Set<string>();
    for (const m of matches) {
      const match = m.match(/urn:li:activity:(\d+)/);
      if (match?.[1]) {
        urnSet.add(`urn:li:activity:${match[1]}`);
      }
    }
    return Array.from(urnSet);
  }

  /**
   * activity_urn'yi CapturedPostV1'e dönüştürür.
   * Metin ve engagement metrikleri extract aşamasında doldurulmadıysa
   * opsiyonel alanlar boş kalır (backward-compatible).
   */
  private urnToPost(
    urn: string,
    account: Pick<WatchedAccount, "slug" | "ad" | "tip" | "oncelik">,
  ): CapturedPostV1 {
    return {
      activity_urn: urn,
      id: urn.match(/urn:li:activity:(\d+)/)?.[1] ?? urn,
      slug: account.slug,
      yazar: account.ad,
      metin: "",
    };
  }

  /**
   * DOM içeriğinden hash prefix üretir (provenance için).
   */
  private async computeDomHash(): Promise<string> {
    try {
      const readResult = await this.adapter.read({ format: "text" });
      const content = readResult.content.slice(0, 256);
      return createHash("sha256").update(content).digest("hex").slice(0, 16);
    } catch {
      return "unavailable";
    }
  }

  private emptyProof(timestamp: string): PageSessionProof {
    return {
      scrape_id: `unavailable-${timestamp}`,
      url: "",
      dom_hash_prefix: "unavailable",
    };
  }

  /**
   * Promise'i timeout ile sarar.
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    ms: number,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms),
      ),
    ]);
  }
}

// ─── CLI Entry Point ──────────────────────────────────────────────

/**
 * CLI: npx tsx src/capture_agent.ts --slug <slug>
 *
 * Fail-closed: gerçek BrowserOS transport olmadan hiçbir capture yapmaz.
 * Sadece adapter boundary test edilir.
 */
export async function runCaptureCli(args: string[]): Promise<void> {
  const slugArg = args.find((a) => a.startsWith("--slug="));
  const slug = slugArg?.split("=")[1];

  if (!slug) {
    console.error("Usage: npx tsx src/capture_agent.ts --slug=<account-slug>");
    console.error("");
    console.error("BLOCKER: Gerçek BrowserOS MCP transport entegrasyonu gerekli.");
    console.error("Bu modül adapter boundary sunar; somut HTTP transport ayrı task'ta.");
    process.exit(1);
  }

  // Fail-closed adapter — gerçek transport yok
  const adapter = new FailClosedAdapter(
    "BrowserOS MCP HTTP transport not implemented in TypeScript (see BLOCKER)",
  );
  const agent = new CaptureAgent(adapter);

  console.log(`[capture_agent] Attempting capture for slug="${slug}"...`);
  console.log("[capture_agent] FAIL-CLOSED: no real BrowserOS transport configured.");

  // Bu her zaman capture_unavailable dönecek — fail-closed davranış
  const result = await agent.captureAccount({
    slug,
    ad: slug,
    tip: "kisi",
    oncelik: 3,
  });

  console.log("[capture_agent] Result:");
  console.log(JSON.stringify(result.receipt, null, 2));
  console.log(`[capture_agent] Success: ${result.success}`);
  console.log(`[capture_agent] Freshness: ${result.receipt.freshness}`);

  if (!result.success) {
    console.error("[capture_agent] BLOCKER: Capture failed — see receipt errors.");
    console.error("[capture_agent] BLOCKER: BrowserOS MCP HTTP transport required.");
    process.exit(1);
  }
}

// CLI olarak çağrıldığında çalışır
if (
  process.argv[1]?.endsWith("capture_agent.ts") ||
  process.argv[1]?.endsWith("capture_agent")
) {
  runCaptureCli(process.argv.slice(2)).catch((err) => {
    console.error("[capture_agent] Fatal:", err);
    process.exit(1);
  });
}

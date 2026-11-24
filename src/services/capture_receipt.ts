/**
 * CAPTURE RECEIPT — Schema v1 Contract
 *
 * Tek hesabın veya bir grup hesabın BrowserOS üzerinden read-only
 * taranması sonucunda üretilen kanıt kaydı (receipt). Her capture
 * döngüsü bir CaptureReceipt üretir; receipt'ler atomic olarak
 * data/yakalanan-gonderiler.json dosyasına merge edilir.
 *
 * Güvenlik: Bu modül hiçbir zaman LinkedIn'e write yapmaz.
 * Receipt yalnızca okunan veriyi ve capture sürecinin kanıtlarını içerir.
 */
import fs from "fs/promises";
import { constants as fsConstants } from "fs";
import path from "path";
import os from "os";
import type { CapturedPost, WatchedAccount } from "./engagement_scout.js";

// ─── Schema v1 Types ─────────────────────────────────────────────

export const RECEIPT_SCHEMA = "linkedin-capture-receipt/v1" as const;

export type Freshness = "fresh" | "source_stale" | "capture_unavailable";

export type GroupLabel = "A" | "B" | "C";

export interface GroupWindow {
  /** Europe/Istanbul — "HH:MM" format */
  start: string;
  /** Europe/Istanbul — "HH:MM" format */
  end: string;
}

export interface PageSessionProof {
  /** BrowserOS capture oturumunu tanımlayan benzersiz ID */
  scrape_id: string;
  /** Taranan sayfanın URL'i */
  url: string;
  /** DOM içeriğinin ilk 16 karakterinin hash prefix'i (provenance) */
  dom_hash_prefix: string;
}

/**
 * CapturedPost'un backward-compatible genişletilmiş hali.
 * Mevcut pipeline CapturedPost şeklini bekler; bu tip onun üst kümesidir
 * (structural typing) ve ek activity_urn alanı ekler.
 */
export interface CapturedPostV1 extends CapturedPost {
  /** "urn:li:activity:NNNN" — LinkedIn activity URN */
  activity_urn: string;
}

export interface ReceiptError {
  slug: string;
  error: string;
  timestamp: string;
}

export interface CaptureReceipt {
  schema: typeof RECEIPT_SCHEMA;
  captured_at: string;
  account: {
    slug: string;
    ad: string;
    tip: WatchedAccount["tip"];
    group: GroupLabel;
  };
  group_window: GroupWindow;
  source: "browseros";
  page_session_proof: PageSessionProof;
  posts: CapturedPostV1[];
  freshness: Freshness;
  errors: ReceiptError[];
  /** true ise hiç yeni gönderi yakalanmadı (dedupe sonrası boş) */
  no_work: boolean;
}

// ─── Group Schedule Model ─────────────────────────────────────────

export const GROUP_WINDOWS: Record<GroupLabel, GroupWindow> = {
  A: { start: "11:00", end: "11:30" },
  B: { start: "11:30", end: "12:00" },
  C: { start: "12:00", end: "12:30" },
};

/**
 * Öncelik bazlı grup ataması.
 * A: öncelik 1-2 (yüksek), B: öncelik 3 (orta), C: öncelik 4 (düşük)
 */
export function assignGroup(oncelik: number): GroupLabel {
  if (oncelik <= 2) return "A";
  if (oncelik === 3) return "B";
  return "C";
}

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * activity_urn'den sayısal post ID'sini çıkarır.
 * "urn:li:activity:7490360134762946560" → "7490360134762946560"
 */
export function urnToPostId(activityUrn: string): string {
  const match = activityUrn.match(/urn:li:activity:(\d+)/);
  return match?.[1] ?? activityUrn;
}

/**
 * Sayısal post ID'den activity_urn üretir.
 */
export function postIdToUrn(postId: string): string {
  return `urn:li:activity:${postId}`;
}

/**
 * activity_urn'yi son_gonderi_id'ye karşı dedupe eder.
 * Eğer post ID <= son_gonderi_id ise zaten görülmüş sayılır.
 *
 * Not: LinkedIn activity ID'leri monotonik artmaz; bu nedenle
 * strict equality kontrolü yapılır (===), büyüktür karşılaştırması değil.
 */
export function isAlreadySeen(
  activityUrn: string,
  lastSeenId?: string | null,
): boolean {
  if (!lastSeenId) return false;
  const postId = urnToPostId(activityUrn);
  return postId === lastSeenId;
}

/**
 * Receipt'in posts dizisini son_gonderi_id'ye göre filtreler.
 * Sadece yeni (görülmemiş) gönderileri döndürür.
 */
export function dedupeAgainstSeen(
  posts: CapturedPostV1[],
  lastSeenId?: string | null,
): CapturedPostV1[] {
  if (!lastSeenId) return posts;
  return posts.filter((p) => !isAlreadySeen(p.activity_urn, lastSeenId));
}

// ─── Receipt Builder ──────────────────────────────────────────────

export interface ReceiptBuildContext {
  account: Pick<WatchedAccount, "slug" | "ad" | "tip" | "oncelik">;
  proof: PageSessionProof;
  posts: CapturedPostV1[];
  errors?: ReceiptError[];
  freshness?: Freshness;
  lastSeenId?: string | null;
}

/**
 * Bir CaptureReceipt üretir. Dedupe uygulanır ve no_work flag'i set edilir.
 */
export function buildReceipt(ctx: ReceiptBuildContext): CaptureReceipt {
  const group = assignGroup(ctx.account.oncelik);
  const deduped = dedupeAgainstSeen(ctx.posts, ctx.lastSeenId);
  const freshness: Freshness = ctx.freshness ?? "fresh";

  return {
    schema: RECEIPT_SCHEMA,
    captured_at: new Date().toISOString(),
    account: {
      slug: ctx.account.slug,
      ad: ctx.account.ad,
      tip: ctx.account.tip,
      group,
    },
    group_window: GROUP_WINDOWS[group],
    source: "browseros",
    page_session_proof: ctx.proof,
    posts: deduped,
    freshness,
    errors: ctx.errors ?? [],
    no_work: deduped.length === 0,
  };
}

// ─── Atomic File Operations ───────────────────────────────────────

/**
 * O_EXCL ile dosya kilidi alır. Aynı anda yalnızca bir capture döngüsü
 * dosyaya yazabilir. Kilitleyemezse hata fırlatır (fail-closed).
 */
export async function acquireLock(lockPath: string): Promise<string> {
  const tmpDir = os.tmpdir();
  const resolvedLock = path.isAbsolute(lockPath)
    ? lockPath
    : path.join(tmpDir, lockPath);

  try {
    const handle = await fs.open(
      resolvedLock,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY,
    );
    await handle.writeFile(String(process.pid));
    await handle.close();
    return resolvedLock;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EEXIST") {
      // Stale lock kontrolü: 5 dakikadan eskiyse sil ve tekrar dene
      try {
        const stat = await fs.stat(resolvedLock);
        const ageMs = Date.now() - stat.mtimeMs;
        if (ageMs > 5 * 60 * 1000) {
          await fs.unlink(resolvedLock);
          return acquireLock(lockPath);
        }
      } catch {
        // stat başarısız — fall through
      }
      throw new Error(`Lock busy: ${resolvedLock} (held by another process or stale)`);
    }
    throw err;
  }
}

/** Kilidi serbest bırakır. */
export async function releaseLock(lockPath: string): Promise<void> {
  try {
    await fs.unlink(lockPath);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }
}

/**
 * Lock'lı scoped işlem. Lock alır, işlemi çalıştırır, sonunda lock'u bırakır.
 * İşlem hata fırlatsa bile lock serbest bırakılır.
 */
export async function withLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
): Promise<T> {
  const resolved = await acquireLock(lockPath);
  try {
    return await fn();
  } finally {
    await releaseLock(resolved);
  }
}

/**
 * Mevcut yakalanan-gonderiler.json dosyasını güvenli şekilde okur.
 * Dosya yoksa boş başlangıç yapısı döndürür.
 */
export interface CapturedPostsFile {
  _aciklama?: string;
  _guncelleme?: string;
  gonderiler: CapturedPost[];
}

export async function readCapturedPostsFile(
  filePath: string,
): Promise<CapturedPostsFile> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<CapturedPostsFile>;
    const result: CapturedPostsFile = {
      gonderiler: parsed.gonderiler ?? [],
    };
    if (parsed._aciklama !== undefined) result._aciklama = parsed._aciklama;
    if (parsed._guncelleme !== undefined) result._guncelleme = parsed._guncelleme;
    return result;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return {
        _aciklama:
          "Yorum firsati taramasinin girdisi. Bu dosyayi Cenk'in kendi tarayici oturumundan calisan tarama besler; sunucudan LinkedIn kazinmaz.",
        _guncelleme: new Date().toISOString().slice(0, 10),
        gonderiler: [],
      };
    }
    throw err;
  }
}

/**
 * Bir receipt'in posts'unu yakalanan-gonderiler.json'a atomic merge eder.
 *
 * Atomic pattern: tmp-{pid} dosyasına yaz → rename ile değiştir.
 * O_EXCL lock ile eşzamanlı yazım koruması.
 *
 * Backward-compatible: receipt'in CapturedPostV1[] posts'u CapturedPost[]
 * olarak yazılır (activity_urn dahil, eski alanlar korunur).
 *
 * Idempotent: aynı activity_urn'ye sahip post'lar tekrar eklenmez.
 */
export async function mergeReceipt(
  receipt: CaptureReceipt,
  targetPath: string,
  lockDir?: string,
): Promise<{ merged: number; skipped: number; total: number }> {
  const lockFile =
    lockDir != null
      ? path.join(lockDir, "yakalanan-gonderiler.lock")
      : path.join(path.dirname(targetPath), ".yakalanan-gonderiler.lock");

  return withLock(lockFile, async () => {
    const file = await readCapturedPostsFile(targetPath);
    const existingUrns = new Set(
      file.gonderiler.map((p) => {
        const urn = (p as CapturedPost & { activity_urn?: string }).activity_urn;
        return urn ?? postIdToUrn(p.id);
      }),
    );

    let merged = 0;
    let skipped = 0;

    for (const post of receipt.posts) {
      if (existingUrns.has(post.activity_urn)) {
        skipped++;
        continue;
      }
      // CapturedPostV1 → CapturedPost (activity_urn dahil — backward-compatible)
      file.gonderiler.push(post);
      existingUrns.add(post.activity_urn);
      merged++;
    }

    file._guncelleme = new Date().toISOString().slice(0, 10);

    // Atomic write: tmp → rename
    const tmpPath = `${targetPath}.tmp-${process.pid}`;
    await fs.writeFile(tmpPath, JSON.stringify(file, null, 2), "utf-8");
    await fs.rename(tmpPath, targetPath);

    return { merged, skipped, total: file.gonderiler.length };
  });
}

// ─── Partial Failure / Resume Helpers ─────────────────────────────

/**
 * Bir grup receipt'yi tek dosyaya sıralı merge eder.
 * Her receipt ayrı merge edilir; biri başarısız olursa diğerleri devam eder.
 * Başarısız olanlar sonuçta raporlanır.
 */
export interface GroupMergeResult {
  group: GroupLabel;
  results: Array<{
    slug: string;
    merged: number;
    skipped: number;
    error?: string;
  }>;
  total_merged: number;
  total_skipped: number;
  failed_count: number;
}

export async function mergeGroupReceipts(
  receipts: CaptureReceipt[],
  targetPath: string,
  lockDir?: string,
): Promise<GroupMergeResult> {
  const group = receipts[0]?.account.group ?? "C";
  const results: GroupMergeResult["results"] = [];
  let totalMerged = 0;
  let totalSkipped = 0;
  let failedCount = 0;

  for (const receipt of receipts) {
    try {
      const r = await mergeReceipt(receipt, targetPath, lockDir);
      results.push({
        slug: receipt.account.slug,
        merged: r.merged,
        skipped: r.skipped,
      });
      totalMerged += r.merged;
      totalSkipped += r.skipped;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        slug: receipt.account.slug,
        merged: 0,
        skipped: 0,
        error: msg,
      });
      failedCount++;
    }
  }

  return {
    group,
    results,
    total_merged: totalMerged,
    total_skipped: totalSkipped,
    failed_count: failedCount,
  };
}

/**
 * Resume için: bir grup içindeki başarısız hesapların slug'larını döndürür.
 * Cron yeniden deneme veya manuel müdahale için kullanılır.
 */
export function extractFailedSlugs(
  receipts: CaptureReceipt[],
): Array<{ slug: string; error: string }> {
  const failed: Array<{ slug: string; error: string }> = [];
  for (const r of receipts) {
    for (const e of r.errors) {
      failed.push({ slug: e.slug, error: e.error });
    }
    if (r.freshness === "capture_unavailable") {
      failed.push({
        slug: r.account.slug,
        error: `capture_unavailable for ${r.account.slug}`,
      });
    }
  }
  return failed;
}

// ─── Validation ───────────────────────────────────────────────────

/**
 * Bir nesnenin CaptureReceipt schema v1'e uygunluğunu doğrular.
 * Runtime guard — JSON'dan okunan receipt'ler için kullanılır.
 */
export function isCaptureReceipt(obj: unknown): obj is CaptureReceipt {
  if (typeof obj !== "object" || obj === null) return false;
  const r = obj as Record<string, unknown>;
  return (
    r["schema"] === RECEIPT_SCHEMA &&
    typeof r["captured_at"] === "string" &&
    typeof r["source"] === "string" &&
    Array.isArray(r["posts"]) &&
    Array.isArray(r["errors"]) &&
    typeof r["no_work"] === "boolean"
  );
}

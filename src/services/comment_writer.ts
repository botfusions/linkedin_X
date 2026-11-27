/**
 * Canonical LinkedIn draft generator.
 *
 * The old parallel generator is retired. Generation is profile-backed only:
 * the child Hermes process uses the linkedin profile's effective
 * openai-codex/gpt-5.6-luna runtime. This module never calls a vendor API
 * directly and never performs a LinkedIn write.
 *
 * validateDraft() and VALIDATOR_BARRIERS are the canonical eight-barrier
 * post-generation validator and intentionally remain in this module.
 */
import { execFile } from "node:child_process";
import fs from "fs/promises";
import os from "node:os";
import path from "path";
import type { CapturedPost, WatchedAccount } from "./engagement_scout.js";

export interface CommentDraft {
  analiz: string;
  acik: string;
  taslaklar: string[];
  runtime?: {
    profile: "linkedin";
    provider: string;
    model: string;
    attempts: number;
  };
}

const HERMES_BIN = process.env.LINKEDIN_HERMES_BIN || "hermes";
const HERMES_HOME =
  process.env.LINKEDIN_HERMES_HOME || path.join(os.homedir(), ".hermes", "profiles", "linkedin");
const HERMES_PROFILE = "linkedin";
const EXPECTED_PROVIDER = "openai-codex";
const EXPECTED_MODEL = "gpt-5.6-luna";
const HERMES_TIMEOUT_MS = 180_000;
const MAX_RETRIES = 2;
const CANONICAL_ROOT =
  process.env.LINKEDIN_VAULT_ROOT || "/System/Volumes/Data/Hermes/Hermes_Agent/Linkedin";
const WATCHLIST_PATH = path.join(CANONICAL_ROOT, "configs", "takip_listesi.json");
const SCORING_PATH = path.join(CANONICAL_ROOT, "configs", "puanlama_esikleri.json");
const DEFAULT_PROJECT_ROOT = "/Users/cenktk/Documents/LİNKEDİN  PAYLAŞIM";
const CAPTURED_INPUT_PATH =
  process.env.LINKEDIN_CAPTURED_PATH || path.join(DEFAULT_PROJECT_ROOT, "data", "yakalanan-gonderiler.json");
export const CANONICAL_SOURCE_PATH = CAPTURED_INPUT_PATH;

const YASAKLI_ADLAR = [
  "botfusions",
  "rankie",
  "populon",
  "aiizle",
  "rankie.ai",
  "botfusions.com",
];

export function containsBrandName(text: string): string | null {
  const lower = text.toLocaleLowerCase("tr-TR");
  for (const ad of YASAKLI_ADLAR) {
    if (lower.includes(ad)) return ad;
  }
  return null;
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export const VALIDATOR_BARRIERS = [
  "brand-name",
  "compliment-opening",
  "name-address",
  "hedging-phrase",
  "sen-siz-mix",
  "length",
  "question-ending",
  "banned-opening",
] as const;

export interface DraftValidation {
  ok: boolean;
  failures: string[];
  wordCount: number;
}

/** Canonical eight post-generation barriers; safe to use without an LLM call. */
export function validateDraft(text: string): DraftValidation {
  const failures: string[] = [];
  const t = text.trim();
  const marka = containsBrandName(t);
  if (marka) failures.push(`brand-name:${marka}`);
  if (/^(harika|muhte[şs]em|çok\s+değerli|emeğinize|elinize\s+sağlık|tebrik|süper)/i.test(t)) {
    failures.push("compliment-opening");
  }
  if (/\b\w+\s+(hanım|bey|beyefendi|hanımefendi)\b/i.test(t)) {
    failures.push("name-address");
  }
  if (/(belki\s+de|gözlemlediğim\s+kadarıyla|diye\s+düşünüyorum|kanaatimce|bir\s+nevi|maalesef)/i.test(t)) {
    failures.push("hedging-phrase");
  }
  const senVar = /\b(sen|sana|seni|senin)\b|(mısın|musun| müsün|yorsun|ıyorsun)\b(?!uz)/i.test(t);
  const sizVar = /\b(siz|size|sizi|sizin)\b|(mısınız|musunuz|yorsunuz)\b/i.test(t);
  if (senVar && sizVar) failures.push("sen-siz-mix");
  const words = wordCount(t);
  if (words < 30 || words > 110) failures.push(`length:${words}`);
  // Cenk 2026-11-27: a comment never ends with a question.
  if (/\?["'”’)\s]*$/.test(t)) failures.push("question-ending");
  // Cenk 2026-11-27: a comment does not open with "Sahada" (too narrow); use a broader opener.
  if (/^["'“]?\s*sahada\b/i.test(t)) failures.push("banned-opening");
  return { ok: failures.length === 0, failures, wordCount: words };
}

interface HermesUsage {
  provider?: string;
  model?: string;
  api_calls?: number;
}

interface HermesRun {
  stdout: string;
  stderr: string;
  usage: HermesUsage;
}

function scrubbedChildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, HERMES_HOME };
  // Do not let a parent shell's vendor variables or model override affect the
  // profile-backed call. Values are never read or logged.
  const blockedEnvPrefix = [65, 78, 84, 72, 82, 79, 80, 73, 67, 95]
    .map((code) => String.fromCharCode(code))
    .join("");
  for (const key of Object.keys(env)) {
    if (key.startsWith(blockedEnvPrefix) || key === "HERMES_INFERENCE_MODEL") delete env[key];
  }
  return env;
}

async function runHermes(prompt: string): Promise<HermesRun> {
  const usagePath = path.join(os.tmpdir(), `linkedin-hermes-usage-${process.pid}-${Date.now()}.json`);
  const args = [
    "--skills",
    "linkedin-geo-comment-draft,turkce-insani-yazar",
    "--usage-file",
    usagePath,
    "-z",
    prompt,
  ];

  try {
    const result = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFile(
        HERMES_BIN,
        args,
        {
          cwd: process.cwd(),
          env: scrubbedChildEnv(),
          timeout: HERMES_TIMEOUT_MS,
          maxBuffer: 1_000_000,
        },
        (error, stdout, stderr) => {
          if (error) {
            const timedOut = (error as NodeJS.ErrnoException & { killed?: boolean }).killed;
            reject(new Error(timedOut ? "Hermes profile çağrısı zaman aşımına uğradı" : "Hermes profile çağrısı nonzero döndü"));
            return;
          }
          resolve({ stdout, stderr });
        },
      );
    });

    let usage: HermesUsage;
    try {
      usage = JSON.parse(await fs.readFile(usagePath, "utf-8")) as HermesUsage;
    } catch {
      throw new Error("Hermes usage JSON parse edilemedi");
    }
    if (!usage.provider || !usage.model) throw new Error("Hermes usage runtime alanları eksik");
    return { ...result, usage };
  } finally {
    await fs.rm(usagePath, { force: true }).catch(() => undefined);
  }
}

function parseStrictDraft(raw: string): CommentDraft {
  const trimmed = raw.trim();
  const unfenced = trimmed.startsWith("```json") && trimmed.endsWith("```")
    ? trimmed.slice(7, -3).trim()
    : trimmed;
  if (!unfenced) throw new Error("Hermes boş çıktı döndürdü");

  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced);
  } catch {
    throw new Error("Hermes çıktısı JSON parse edilemedi");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Hermes çıktısı JSON nesnesi değil");
  const candidate = parsed as Partial<CommentDraft>;
  if (
    typeof candidate.analiz !== "string" ||
    typeof candidate.acik !== "string" ||
    !Array.isArray(candidate.taslaklar) ||
    candidate.taslaklar.length !== 2 ||
    candidate.taslaklar.some((t) => typeof t !== "string" || !t.trim())
  ) {
    throw new Error("Hermes çıktısı iki geçerli taslak içermiyor");
  }
  return {
    analiz: candidate.analiz.trim(),
    acik: candidate.acik.trim(),
    taslaklar: candidate.taslaklar.map((t) => (t as string).trim()),
  };
}

function buildPrompt(post: CapturedPost, hesap: WatchedAccount, feedback: string): string {
  return `
LinkedIn profil-backed one-shot üretim görevi. Bu çağrı yalnızca taslak üretir; hiçbir dış API'ye, LinkedIn'e, Telegram'a, Obsidian'a, kanbana veya dosyaya yazma.

Profil-local skill'leri mutlaka yükle ve uygula: linkedin-geo-comment-draft ve turkce-insani-yazar. Üretim Hermes'in linkedin profilinin effective runtime'ı üzerinden yapılır; provider/model override kullanma ve fallback provider kullanma.

Kanonik kaynaklar:
- watchlist: ${WATCHLIST_PATH}
- puanlama: ${SCORING_PATH}
- input: ${CAPTURED_INPUT_PATH}
- çıktı sözleşmesi: Linkedin/outputs/linkedin_yorum_kartlari_YYYY-MM-DD/ altında draft-only PRD kartı; bu one-shot'ta kart yazma, üst süreç yazacak.

Tam olarak iki farklı Türkçe yorum taslağı üret. Her ikisini de üretim sonrası şu altı canonical validator bariyerinden geçir: brand-name, compliment-opening, name-address, hedging-phrase, sen-siz-mix, length (30-110 kelime). Herhangi biri takılırsa yeniden yaz; geçmeyen taslağı başarı sayma. LinkedIn'e hiçbir koşulda yazma.

Gönderi yazarı: ${hesap.ad}${hesap.unvan ? ` — ${hesap.unvan}` : ""}${hesap.kurum ? ` (${hesap.kurum})` : ""}
Hesap notu: ${hesap.not ?? "-"}
Etkileşim: ${post.tepki ?? 0} tepki, ${post.yorum ?? 0} yorum, ${post.paylasim ?? 0} paylaşım
Gönderi metni:
"""
${post.metin.slice(0, 3000)}
"""

${feedback ? `Önceki deneme reddedildi. Bu sorunları düzelt: ${feedback}` : ""}

Yalnızca şu JSON nesnesini döndür, markdown veya açıklama ekleme:
{"analiz":"...","acik":"...","taslaklar":["...","..."]}
`.trim();
}

export async function draftComments(post: CapturedPost, hesap: WatchedAccount): Promise<CommentDraft> {
  let lastError = "bilinmeyen hata";
  let feedback = "";
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt += 1) {
    try {
      const result = await runHermes(buildPrompt(post, hesap, feedback));
      if (result.usage.provider !== EXPECTED_PROVIDER || result.usage.model !== EXPECTED_MODEL) {
        throw new Error("Hermes effective runtime beklenen profile/provider/model değil");
      }
      const parsed = parseStrictDraft(result.stdout);
      const validations = parsed.taslaklar.map(validateDraft);
      const failures = validations.flatMap((r, index) =>
        r.ok ? [] : [`taslak-${index + 1}:${r.failures.join(",")}`],
      );
      if (failures.length > 0) {
        lastError = `validator reddi (${failures.join("; ")})`;
        feedback = failures.join("; ");
        continue;
      }
      console.log(`🧠 LinkedIn Hermes runtime: profile=${HERMES_PROFILE} provider=${result.usage.provider} model=${result.usage.model} attempts=${attempt}`);
      return { ...parsed, runtime: { profile: "linkedin", provider: result.usage.provider, model: result.usage.model, attempts: attempt } };
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Hermes profile çağrısı başarısız";
      feedback = lastError;
    }
  }
  throw new Error(`Profile-backed taslak üretimi fail-closed: ${lastError}`);
}

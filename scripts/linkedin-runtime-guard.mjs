import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const activeFiles = [
  "src/services/comment_writer.ts",
  "src/engagement_agent.ts",
  "src/services/engagement_scout.ts",
  ".hermes-runtime-trace-placeholder",
].filter((name) => !name.includes("placeholder"));
const forbidden = [/callAnthropic/i, /ANTHROPIC_API_KEY/i, /ANTHROPIC_MODEL/i, /claude-sonnet-5/i, /api\.anthropic\.com/i];
const hits = [];
for (const relative of activeFiles) {
  const file = path.join(root, relative);
  const text = await readFile(file, "utf8");
  for (const pattern of forbidden) if (pattern.test(text)) hits.push({ file: relative, pattern: pattern.source });
}
const agent = await readFile(path.join(root, "src/engagement_agent.ts"), "utf8");
const writer = await readFile(path.join(root, "src/services/comment_writer.ts"), "utf8");
if (!agent.includes('from "./services/comment_writer.js"')) throw new Error("active import trace: comment_writer yok");
if (!agent.includes("draftComments")) throw new Error("active import trace: draftComments yok");
if (!writer.includes("execFile") || !writer.includes("HERMES_HOME")) throw new Error("active runtime trace: profile-backed Hermes subprocess yok");
if (!writer.includes("validateDraft") || !writer.includes("VALIDATOR_BARRIERS")) throw new Error("canonical validator trace yok");
if (hits.length) throw new Error(`forbidden active runtime references: ${JSON.stringify(hits)}`);
console.log(JSON.stringify({
  status: "GEÇTİ",
  active_import_trace: ["engagement_agent.ts -> comment_writer.ts -> execFile(hermes -z)"],
  canonical_validator: "comment_writer.ts: validateDraft + VALIDATOR_BARRIERS",
  forbidden_active_references: [],
  deprecated_direct_generator: "not present in active source",
}, null, 2));

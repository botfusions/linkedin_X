import fs from "node:fs";
import path from "node:path";
export function trialChannelPaused(channel: "x" | "legacy-linkedin"): boolean {
  const file = path.join(process.cwd(), "data", "geo-trial.json");
  if (!fs.existsSync(file)) return false;
  try {
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    return channel === "x" ? config.xPaused === true : config.legacyLinkedInPaused === true;
  } catch { return true; }
}

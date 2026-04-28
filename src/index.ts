import { runAutonomousWorkflow } from "./autonomous_agent.js";
import dotenv from "dotenv";

dotenv.config();

async function main() {
  console.log("🤖 Botfusions Otonom İçerik Motoru Başlatılıyor...");
  await runAutonomousWorkflow();
  console.log("🏁 Akış sonlandırıldı.");
}

main();

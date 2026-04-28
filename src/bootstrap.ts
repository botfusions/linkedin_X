import dotenv from "dotenv";
import { initEnvFromSupabase } from "./services/supabase.js";

dotenv.config();
console.log("🚀 Botfusions Engine Baslatiliyor...");
console.log("📦 Supabase'den cevre degiskenleri yukleniyor...");

await initEnvFromSupabase();

console.log("⏰ Scheduler baslatiliyor...\n");
await import("./scheduler.js");

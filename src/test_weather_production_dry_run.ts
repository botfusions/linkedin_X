/**
 * ÜRETİM YOLU DRY RUN — paylaşım YAPMAZ.
 *
 * Gerçek publish akışının (scheduler 08:00 / trigger_weather_now) görsel
 * hattını uçtan uca çalıştırır: getIstanbulWeatherData →
 * generateWeatherBackgroundPrompt (saat-bilinçli) → generateGeminiImage
 * (metinsiz raw) → overlayWeatherData (deterministik Türkçe overlay).
 *
 * runWeatherPostFlow ÇAĞRILMAZ → LinkedIn/X/Supabase'ye DOKUNULMAZ.
 *
 * Saat varyasyonu doğrulamak için: FORCE_HOUR=18 npx tsx ...
 * (İstanbul duvar saatindeki saate kilitler; üretim kodunu etkilemez.)
 */
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import {
  getIstanbulWeatherData,
  getIstanbulDayPart,
  dayPartFromHour,
} from "./services/weather.js";
import { generateWeatherBackgroundPrompt } from "./services/llm.js";
import { generateGeminiImage } from "./services/gemini_image.js";
import { overlayWeatherData } from "./services/weather_overlay.js";
import { initEnvFromSupabase } from "./services/supabase.js";

dotenv.config();

// ── FORCE_HOUR: yalnızca bu testte new Date()'i belirli bir İstanbul saatine
//    kilitler. Böylece sabah/öğle/akşam/gece bantları için görsel üretilebilir.
//    Üretim kodunu ASLA etkilemez (env verilmezse devre dışı).
const forceHourRaw = process.env.FORCE_HOUR;
if (forceHourRaw !== undefined && forceHourRaw !== "") {
  const forceHour = parseInt(forceHourRaw, 10);
  if (!Number.isNaN(forceHour)) {
    const RealDate = Date;
    const base = new RealDate();
    // İstenen İstanbul duvar saati (saat:dakika). İstanbul = UTC+3.
    const forcedMs = Date.UTC(
      base.getUTCFullYear(),
      base.getUTCMonth(),
      base.getUTCDate(),
      forceHour - 3,
      30,
      0,
      0,
    );
    const Fake: any = function (...args: any[]) {
      return args.length === 0 ? new RealDate(forcedMs) : new (RealDate as any)(...args);
    };
    Fake.prototype = RealDate.prototype;
    Fake.now = () => forcedMs;
    Fake.parse = RealDate.parse;
    Fake.UTC = RealDate.UTC;
    (globalThis as any).Date = Fake;
    console.log(`⏱️  FORCE_HOUR=${forceHour} → İstanbul saati kilitlendi (test amaçlı)\n`);
  }
}

async function main() {
  console.log("🚀 ÜRETİM YOLU DRY RUN başlıyor (paylaşım YOK)...\n");

  // 0. Üretim gibi en yeni anahtarları Supabase'ten yükle (Google key özellikle).
  await initEnvFromSupabase();

  // 1. Hava verisi (artık içine Mevcut Saat + Gün Vakti gömülü)
  const weather = await getIstanbulWeatherData();
  const dp = getIstanbulDayPart();
  console.log(`🕐 İstanbul saati: ${dp.timeStr} → ${dp.part}`);
  console.log("\n📊 HAVA VERİSİ:\n" + weather.text);

  // 2. Arka plan promptu (üretim fonksiyonu — saat-bilinçli)
  const basePrompt = "[window-view weather background]";
  const bgPrompt = await generateWeatherBackgroundPrompt(weather.text, basePrompt);
  console.log("\n🖼️ ÜRETİLEN ARKA PLAN PROMPTU:\n" + bgPrompt + "\n");

  // 3. Görsel üretimi (metinsiz raw arka plan)
  console.log("🎨 Görsel üretiliyor (Gemini, metinsiz raw)...");
  const bgPath = await generateGeminiImage(bgPrompt, { raw: true });

  // 4. Deterministik overlay (Türkçe hava verisi görselin üzerine yazılır)
  console.log("🖌️ Deterministik overlay uygulanıyor...");
  const finalPath = await overlayWeatherData(bgPath, weather);
  console.log("\n✅ FİNAL GÖRSEL (overlay'li): " + finalPath);

  // 5. Gün-vakti → bant eşlemesi (doğrulama için tüm bantlar)
  console.log("\n📋 GÜN-VAKTİ EŞLEMESİ (tüm bantlar):");
  for (const h of [7, 13, 18, 23, 0, 3]) {
    console.log(`   ${String(h).padStart(2, "0")}:00 → ${dayPartFromHour(h)}`);
  }

  // 6. Rapor
  const reportPath = path.join(
    process.cwd(),
    "out",
    `weather_production_dryrun_${Date.now()}.md`,
  );
  const report = `# Üretim Yolu Dry Run

**İstanbul saati:** ${dp.timeStr} → **${dp.part}**

## 🖼️ Üretilen Arka Plan Promptu
\`\`\`text
${bgPrompt}
\`\`\`

## 📊 Hava Verisi
\`\`\`text
${weather.text}
\`\`\`

## ✅ Final Görsel
![Hava Durumu Görseli](${path.resolve(finalPath)})
`;
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, report);
  console.log("\n📄 Rapor kaydedildi: " + reportPath);
}

main().catch((e: any) => {
  console.error("❌ HATA:", e.message);
  process.exit(1);
});

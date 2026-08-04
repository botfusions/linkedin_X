/**
 * OVERLAY RENDER TEŞHİSİ (container içi) — Gemini çağırmaz, görsel bakmaz.
 *
 * Sabit parlak zemin oluşturur → overlayWeatherData uygular → çıktı PNG'nin
 * text bölgesindeki pixel'leri sayar. Text render olduysa beyaz pixel'ler görünür;
 * sharp container'da @font-face fontunu render edemiyorsa beyaz pixel = 0.
 *
 * Çalıştır:  npx tsx src/test_overlay_render_check.ts
 * Sonuç: TEXT RENDERED ✅  veya  TEXT MISSING ❌
 */
import sharp from "sharp";
import path from "path";
import fs from "fs/promises";
import { overlayWeatherData } from "./services/weather_overlay.js";

const W = 1024;
const H = 1024;
const BG = { r: 140, g: 200, b: 245 }; // parlak gökyüzü mavisi

async function main() {
  await fs.mkdir(path.join(process.cwd(), "out"), { recursive: true });

  const bgBuf = await sharp({
    create: { width: W, height: H, channels: 3, background: BG },
  })
    .png()
    .toBuffer();
  const bgPath = path.join(process.cwd(), "out", "diag_bg.png");
  await fs.writeFile(bgPath, bgBuf);

  console.log("🖌️ overlay uygulanıyor...");
  const out = await overlayWeatherData(bgPath, {
    city: "İstanbul",
    temp: 24,
    condition: "Az Bulutlu",
    feelsLike: 25,
    humidity: 60,
    wind: 3.2,
  } as any);
  console.log(" çıktı:", out);

  // Text bölgesi: üst-sol (overlay'in yazdığı alan)
  const raw = await sharp(out).removeAlpha().raw().toBuffer();
  let brightText = 0;
  const x0 = Math.round(W * 0.05);
  const x1 = Math.round(W * 0.6);
  const y0 = Math.round(H * 0.05);
  const y1 = Math.round(H * 0.35);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * W + x) * 3;
      const r = raw[i]!;
      const g = raw[i + 1]!;
      const b = raw[i + 2]!;
      // beyaz text pixel'leri (arka plan mavisi r=140,g=200,b=245 → elenir)
      if (r > 225 && g > 225 && b > 225) brightText++;
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`TEXT_REGION_BRIGHT_PIXELS: ${brightText}`);
  if (brightText > 500) {
    console.log("VERDICT: TEXT RENDERED ✅ (container font render ediyor)");
  } else {
    console.log(
      "VERDICT: TEXT MISSING ❌ (sharp @font-face fontunu render edemiyor → Dockerfile'a font/fontconfig gerek)",
    );
  }
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main().catch((e) => {
  console.error("❌ HATA:", e.message);
  process.exit(1);
});

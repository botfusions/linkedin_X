/**
 * SADECE overlay render testi — Gemini çağırmaz.
 * Parlak gökyüzü (gündüz) ve koyu (gece) zemin oluşturur, overlayWeatherData
 * uygular, çıktıyı out/'a yazar. Text render oluyor mu + parlak zeminde
 * görünür mu diye görsel olarak kontrol etmek için.
 */
import sharp from "sharp";
import path from "path";
import fs from "fs/promises";
import { overlayWeatherData } from "./services/weather_overlay.js";

const sampleWeather = {
  city: "İstanbul",
  temp: 24,
  condition: "Az Bulutlu",
  feelsLike: 25,
  humidity: 60,
  wind: 3.2,
} as any;

async function makeBg(name: string, bg: { r: number; g: number; b: number }) {
  const W = 1024,
    H = 1024;
  const buf = await sharp({
    create: { width: W, height: H, channels: 3, background: bg },
  }).png().toBuffer();
  const p = path.join(process.cwd(), "out", `overlaytest_${name}.png`);
  await fs.writeFile(p, buf);
  return p;
}

async function main() {
  await fs.mkdir(path.join(process.cwd(), "out"), { recursive: true });

  // Parlak gündüz gökyüzü (problemli vaka)
  const dayBg = await makeBg("day", { r: 140, g: 200, b: 245 });
  console.log("🌅 gün zemin:", dayBg);
  const dayOut = await overlayWeatherData(dayBg, sampleWeather);
  console.log("✅ gün overlay:", dayOut);

  // Koyu gece zemin (kolay vaka — burada görünmeli)
  const nightBg = await makeBg("night", { r: 15, g: 18, b: 35 });
  console.log("🌙 gece zemin:", nightBg);
  const nightOut = await overlayWeatherData(nightBg, sampleWeather);
  console.log("✅ gece overlay:", nightOut);
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});

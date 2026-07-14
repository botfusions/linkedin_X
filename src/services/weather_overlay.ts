import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import type { IstanbulWeatherData } from "./weather.js";

// Roboto Bold (Türkçe karakter desteği: İ ş ç ğ ü ö ı). SVG @font-face ile
// gömülür → Mac ve Docker'da fontconfig/sistem fontu bağımlılığı olmadan
// aynı render edilir.
const FONT_PATH = path.join(process.cwd(), "src", "assets", "Roboto-Bold.ttf");
const FONT_FAMILY = "RobotoOverlay";

let fontBase64Cache: string | null = null;
async function getFontBase64(): Promise<string> {
  if (fontBase64Cache) return fontBase64Cache;
  const buf = await fs.readFile(FONT_PATH);
  fontBase64Cache = buf.toString("base64");
  return fontBase64Cache;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Hava durumu verisini (sıcaklık, koşul, nem, rüzgar, hissedilen) deterministik
 * olarak görselin üzerine yazar. "Etched glass" estetiği: küçük (%15'ten az alan),
 * yarı saydam beyaz yazı + ince gölge (okunabilirlik).
 *
 * @param bgImagePath Gemini ile üretilen, METİNSİZ atmosferik arka plan görseli
 * @param data        OpenWeatherMap'ten gelen kesin hava verisi
 * @returns Overlay uygulanmış görselin dosya yolu (arka plan silinir)
 */
export async function overlayWeatherData(
  bgImagePath: string,
  data: IstanbulWeatherData,
): Promise<string> {
  const fontB64 = await getFontBase64();

  // Arka plan gerçek boyutunu al (Gemini 1K = 1024, ama güvenli ol)
  const meta = await sharp(bgImagePath).metadata();
  const W = meta.width || 1024;
  const H = meta.height || 1024;

  // Font boyutları görsel genişliğine orantılı (responsive)
  const fCity = Math.round(W * 0.028); // ~29 @1024 (İSTANBUL)
  const fTemp = Math.round(W * 0.13); // ~133 @1024 ( büyük rakam )
  const fCond = Math.round(W * 0.03); // ~31 @1024 (koşul)
  const fMeta = Math.round(W * 0.024); // ~25 @1024 (alt satırlar)

  // Blok konumu: sol-üst bölge (gökyüzü / üst pencere alanı). Pencere+sıcak iç
  // mekan kompozisyonunda alt bölge masaya/çaya biner; üst-sol favori görselle
  // birebir uyuşur ve gökyüzü temiz arka plan sağlar. Dikey aralıklar korunur.
  const x = Math.round(W * 0.055); // sol kenar boşluğu
  const yCity = Math.round(H * 0.085);
  const yTemp = Math.round(H * 0.185);
  const yCond = Math.round(H * 0.25);
  const yDetail = Math.round(H * 0.3);

  const detailLine = `Hissedilen ${data.feelsLike}°C   ·   Nem %${data.humidity}   ·   Rüzgar ${data.wind} m/s`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <style>
      @font-face {
        font-family: '${FONT_FAMILY}';
        src: url(data:font/truetype;charset=utf-8;base64,${fontB64}) format('truetype');
      }
    </style>
    <filter id="etch" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="#000000" flood-opacity="0.55"/>
    </filter>
  </defs>
  <g font-family="'${FONT_FAMILY}', sans-serif" filter="url(#etch)" text-rendering="geometricPrecision">
    <text x="${x}" y="${yCity}" font-size="${fCity}" font-weight="700" letter-spacing="6" fill="rgba(255,255,255,0.80)">${escapeXml(data.city.toUpperCase())}</text>
    <text x="${x}" y="${yTemp}" font-size="${fTemp}" font-weight="700" fill="rgba(255,255,255,0.96)">${data.temp}°C</text>
    <text x="${x}" y="${yCond}" font-size="${fCond}" font-weight="700" fill="rgba(255,255,255,0.92)">${escapeXml(data.condition)}</text>
    <text x="${x}" y="${yDetail}" font-size="${fMeta}" font-weight="700" fill="rgba(255,255,255,0.82)">${escapeXml(detailLine)}</text>
  </g>
</svg>`;

  const outPath = bgImagePath.replace(/(\.[^.]+)?$/, (m) => `_overlay${m || ".png"}`);

  await sharp(bgImagePath)
    .composite([{ input: Buffer.from(svg), blend: "over" }])
    .png()
    .toFile(outPath);

  // Arka planı temizle
  try {
    await fs.unlink(bgImagePath);
  } catch {
    /* sorun değil */
  }

  console.log(`✅ Hava verisi deterministik olarak görselin üzerine yazıldı: ${outPath}`);
  console.log(`   → ${data.temp}°C / ${data.condition} / hissedilen ${data.feelsLike}°C`);
  return outPath;
}

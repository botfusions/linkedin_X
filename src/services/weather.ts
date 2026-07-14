import axios from "axios";

const API_KEY = "ffa46b54699fda28daadd1451271e720";

export interface IstanbulWeatherData {
  city: string;
  condition: string; // Türkçe açıklama (örn. "parçalı bulutlu")
  conditionMain: string; // ana grup (örn. "Clouds") — atmosfer/ikon eşlemesi için
  temp: number; // yuvarlanmış °C
  feelsLike: number; // yuvarlanmış °C
  humidity: number; // %
  wind: number; // m/s
  tempMin: number;
  tempMax: number;
  pressure: number;
  sunset: string;
  text: string; // LLM için biçimlendirilmiş metin
}

export type DayPart = "sabah" | "gündüz" | "akşam" | "gece";

/**
 * Saat → gün vakti eşlemesi (İstanbul yazı takvimi).
 * 05–10 sabah, 11–16 gündüz, 17–20 akşam, 21–04 gece.
 * Export'ludur: test/dry-run farklı saatleri zorlamak için kullanır.
 */
export function dayPartFromHour(hour: number): DayPart {
  if (hour >= 5 && hour < 11) return "sabah";
  if (hour >= 11 && hour < 17) return "gündüz";
  if (hour >= 17 && hour < 21) return "akşam";
  return "gece"; // 21–04
}

/**
 * İstanbul'un güncel saat ve gün vaktini döndürür. Saat HER ZAMAN
 * Europe/Istanbul diliminden okunur (Docker container UTC'dir; new
 * Date().getHours() yanlış sonuç verir). Hem metin LLM'i (günaydın /
 * iyi akşamlar tınısı) hem görsel promptu (gün-vaktine göre ışık) bunu
 * kullanır → metin ve görsel aynı vakti yansıtır, uyumsuzluk olmaz.
 */
export function getIstanbulDayPart(now: Date = new Date()): {
  hour: number;
  timeStr: string;
  part: DayPart;
} {
  const fmt = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const timeStr = fmt.format(now); // "21:45"
  const hourStr = timeStr.split(":")[0] ?? "0";
  const hour = parseInt(hourStr, 10) % 24;
  return { hour, timeStr, part: dayPartFromHour(hour) };
}

async function fetchWeatherRaw(): Promise<any> {
  const url = `https://api.openweathermap.org/data/2.5/weather?q=Istanbul&appid=${API_KEY}&units=metric&lang=tr`;
  const response = await axios.get(url);
  return response.data;
}

/**
 * Yapısal hava durumu verisi + LLM için metin.
 * Overlay (deterministik görsel) bu yapıdan gelen kesin rakamları kullanır;
 * böylece sıcaklık/koşul görselde hiçbir zaman LLM veya görsel modeli
 * tarafından yanlış render edilemez.
 */
export async function getIstanbulWeatherData(): Promise<IstanbulWeatherData> {
  console.log("🌤️ İstanbul hava durumu bilgisi alınıyor (OpenWeatherMap)...");
  const data = await fetchWeatherRaw();
  // Gün vakti (Europe/Istanbul) — metin LLM'i "günaydın / iyi akşamlar"
  // tınısını BURADAN deterministik seçer; tahmine kalmaz.
  const dp = getIstanbulDayPart();
  return {
    city: "İstanbul",
    condition: data.weather[0].description,
    conditionMain: data.weather[0].main,
    temp: Math.round(data.main.temp),
    feelsLike: Math.round(data.main.feels_like),
    humidity: data.main.humidity,
    wind: data.wind.speed,
    tempMin: Math.round(data.main.temp_min),
    tempMax: Math.round(data.main.temp_max),
    pressure: data.main.pressure,
    sunset: new Date(data.sys.sunset * 1000).toLocaleTimeString("tr-TR"),
    text: `
Şehir: İstanbul
Mevcut Saat: ${dp.timeStr}
Gün Vakti: ${dp.part}
Durum: ${data.weather[0].description}
Sıcaklık: ${Math.round(data.main.temp)}°C
Hissedilen: ${Math.round(data.main.feels_like)}°C
Nem: %${data.main.humidity}
Rüzgar: ${data.wind.speed} m/s
Min Sıcaklık: ${Math.round(data.main.temp_min)}°C
Max Sıcaklık: ${Math.round(data.main.temp_max)}°C
Basınç: ${data.main.pressure} hPa
Gün Batımı: ${new Date(data.sys.sunset * 1000).toLocaleTimeString("tr-TR")}
Veri Kaynağı: OpenWeatherMap
`,
  };
}

/**
 * Eski arayüz: yalnızca biçimlendirilmiş metni döndürür (test scriptleri uyumu).
 */
export async function getIstanbulWeather(): Promise<string> {
  try {
    return (await getIstanbulWeatherData()).text;
  } catch (error: any) {
    console.error("❌ Hava durumu bilgisi alınamadı:", error.message);
    return "Hava durumu bilgisi şu an alınamıyor, ancak İstanbul her zaman güzel!";
  }
}

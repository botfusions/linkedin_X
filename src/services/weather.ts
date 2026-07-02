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

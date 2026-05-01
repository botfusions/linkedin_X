import axios from "axios";

const API_KEY = "ffa46b54699fda28daadd1451271e720";

export async function getIstanbulWeather(): Promise<string> {
  console.log("🌤️ İstanbul hava durumu bilgisi alınıyor (OpenWeatherMap)...");
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=Istanbul&appid=${API_KEY}&units=metric&lang=tr`;
    const response = await axios.get(url);
    const data = response.data;

    // Create a structured string that LLM can use to generate post
    return `
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
`;
  } catch (error: any) {
    console.error("❌ Hava durumu bilgisi alınamadı:", error.message);
    return "Hava durumu bilgisi şu an alınamıyor, ancak İstanbul her zaman güzel!";
  }
}

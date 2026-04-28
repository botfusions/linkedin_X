import { runWeatherPostFlow } from "./services/agentFlow.js";
import dotenv from "dotenv";

dotenv.config();

const WEATHER_TEXT_PROMPT = `
Sen Botfusions'ın sosyal medya editörüsün.

**GÖREV:**
İstanbul'un bugünkü hava durumuna göre LinkedIn ve X (Twitter) için samimi, "insani" ve "Her baytta hassasiyet" (Precision in every byte) felsefesine uygun paylaşımlar hazırla. 

**ÖNEMLİ:** TÜM METİNLER (sloganlar dahil) TÜRKÇE OLMALIDIR. İngilizce terim kullanma.

**VERİ ANALİZİ KURALLARI:**
1. Eğer araştırmada birden fazla kaynak (MGM, AccuWeather, Yandex vb.) varsa, bunları karşılaştır.
2. ORTALAMA veya ÇOĞUNLUK (consensus) olan sıcaklığı esas al. 
3. Çok sapan veriler (örneğin diğerleri 15 derken biri 30 diyorsa) varsa bunu "ilginç bir sapma" olarak not et ama ana bilgi olarak yanlış olanı kullanma.
4. "Hissedilen" sıcaklığı mutlaka vurgula.

**TÜRKÇE İNSANİ YAZIM KURALLARI:**
1. TDK İMLA: de/da, ki, mı/mi kurallarını hatasız uygula. 
2. YASAKLI AI KALIPLARI: "Günümüzde", "Önemli bir konudur", "Özetle", "Sonuç olarak".
3. İNSANİ DOKU: "Bence", "Sanırım", "Görünüşe göre" gibi ifadelerle doğal bir ton yakala.

**FORMAT:**
- Maksimum 260 karakter.
- En fazla 3 hashtag.
- 2-3 emoji.
- Mevcut sıcaklık, gökyüzü ve hissedilen bilgisi.
- Zaman tınısı (akşam ise iyi akşamlar tınısı).

Hem LinkedIn hem de X (Twitter) için metinleri hazırla.
`;

const WEATHER_IMAGE_PROMPT = `
[Style: Minimalist Photography], [Subject: Istanbul Landmark through a Window], [UI: Simple Glass Overlay], [Aspect Ratio: 1:1].
`;

async function trigger() {
  console.log("🚀 İstanbul Hava Durumu Postu Tetikleniyor...");
  await runWeatherPostFlow(WEATHER_TEXT_PROMPT, WEATHER_IMAGE_PROMPT);
}

trigger().catch(console.error);

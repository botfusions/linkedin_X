import dotenv from "dotenv";
import cron from "node-cron";
import { runWeatherPostFlow } from "./services/agentFlow.js";
import { runAutonomousWorkflow } from "./autonomous_agent.js";
import { runRSSNewsWorkflow } from "./rss_agent.js";

dotenv.config();

// ─── Process-level Error Handlers (Crash Prevention) ───
process.on("unhandledRejection", (reason) => {
  console.error("⚠️ Unhandled Promise Rejection (cron callback):", reason);
});

process.on("uncaughtException", (err) => {
  console.error("⚠️ Uncaught Exception:", err.message);
});

async function randomDelay() {
  const minutes = Math.floor(Math.random() * 6);
  const ms = minutes * 60 * 1000;
  if (ms > 0) {
    console.log(
      `⏳ Ban Korumasi: Paylasim ${minutes} dakika rastgele erteleniyor...`,
    );
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function safeCron(fn: () => Promise<void>): () => void {
  return () => {
    fn().catch((err) => {
      console.error(
        "❌ Cron job hatasi (process korundu):",
        err?.message || err,
      );
    });
  };
}

console.log("⏰ Botfusions Zamanlayici Baslatildi... (v4 - erisim odakli ritim)");
console.log("📅 Program:");
console.log("   - 08:00 hergun : Istanbul Hava Durumu  → SADECE X");
console.log("   - 10:00 Sal/Per: HERMES icerik          → LinkedIn + X");
console.log("   - 10:00 diger  : HERMES icerik          → SADECE X");
console.log("   - 16:30 hergun : RSS Haber              → SADECE X");
console.log("");
console.log("ℹ️  Yorum firsati taramasi burada CALISMAZ; Hermes cron'una tasindi");
console.log("   (Mac, 09:00/13:00/18:00). Gerekce: ajanin girdisi olan");
console.log("   data/yakalanan-gonderiler.json Cenk'in tarayici oturumundan");
console.log("   besleniyor, sunucudaki kopya donuk kaliyor.");
console.log("");
console.log("ℹ️  LinkedIn haftada 2 gonderi ile sinirli (Sal/Per).");
console.log("   Gerekce: 83 takipcili hesapta gunde 4 gonderi, her sifir");
console.log("   etkilesimli gonderiyle bir sonrakinin erisimini dusuruyordu.");
console.log("   Kanal kontrolu: .env > LINKEDIN_DISABLED_FLOWS");

const WEATHER_TEXT_PROMPT = `
Sen Botfusions'in sosyal medya editorusun.

**GOREV:**
Istanbul'un bugunku hava durumuna gore LinkedIn ve X (Twitter) icin samimi, insani ve "Her baytta hassasiyet" felsefesine uygun paylasimlar hazirla.

**VERI ANALIZI KURALLARI:**
1. Eger arastirmada birden fazla kaynak (MGM, AccuWeather, Yandex vb.) varsa, bunlari karsilastir.
2. ORTALAMA veya COGUNLUK (consensus) olan sicakligi esas al.
3. Cok sapan veriler varsa bunu "ilginc bir sapma" olarak not et ama ana bilgi olarak yanlis olani kullanma.
4. "Hissedilen" sicakligi mutlaka vurgula.

**TURKCE INSANI YAZIM KURALLARI:**
1. TDK IMLA: de/da, ki, mi/mi kurallarini hatasiz uygula.
2. YASAKLI AI KALIPLARI: "Gunumuzde", "Onemli bir konudur", "Ozetle", "Sonuc olarak".
3. INSANI DOKU: "Bence", "Sanirim", "Gorunuse gore" gibi ifadelerle dogal bir ton yakala.

**FORMAT:**
- Maksimum 260 karakter.
- En fazla 3 hashtag.
- 2-3 emoji.
- Mevcut sicaklik, gokyuzu ve hissedilen bilgisi.
- Zaman tinasi (sabah ise gunaydin, aksam ise iyi aksamlar tinasi).
`;

const WEATHER_IMAGE_PROMPT = `
[Style: Minimalist Photography], [Subject: Close-up Galata Tower through a Window], [UI: Simple Glass Overlay], [Aspect Ratio: 1:1].
A clean, medium-shot view from a cozy indoor setting looking through a window at the Galata Tower in Istanbul.
Integrated onto the window glass is a MINIMALIST, semi-transparent digital weather interface.
KRITIK KURAL: TUM METİNLER, BASLIKLAR VE LABEL'LAR TURKCE OLMALIDIR.
THE INTERFACE MUST ONLY DISPLAY:
1. CITY: ISTANBUL (Turkce)
2. TEMP: Current temperature in large, elegant font (e.g., 15°C). SADECE TAM SAYI.
3. ICON: A simple weather icon (Sun, Cloud, etc.).
4. METRICS: Nem, Ruzgar Hizi, and Hissedilen sicaklik in a small, clean list (TURKCE).
NO forecasts, NO complex tables, NO text at the bottom. The look should be extremely clean, professional, and premium. --ar 1:1
`;

// 08:00 - Hava Durumu
cron.schedule(
  "0 8 * * *",
  safeCron(async () => {
    console.log("🚀 [08:00] Hava durumu postu hazirlaniyor...");
    await randomDelay();
    await runWeatherPostFlow(WEATHER_TEXT_PROMPT, WEATHER_IMAGE_PROMPT);
  }),
  { timezone: "Europe/Istanbul" },
);

// 10:00 - HERMES icerik (LinkedIn yalnizca Sali ve Persembe)
//
// LinkedIn kanali gun bazli acilip kapaniyor: hafta ici diger gunlerde ayni
// icerik yalnizca X'e gidiyor. Boylece LinkedIn'de haftada 2 gonderi kaliyor.
const LINKEDIN_POST_DAYS = [2, 4]; // 0=Pazar ... 2=Sali, 4=Persembe

function setLinkedInChannelForToday(): boolean {
  const today = new Date().toLocaleDateString("en-US", {
    timeZone: "Europe/Istanbul",
    weekday: "short",
  });
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const isPostDay = LINKEDIN_POST_DAYS.includes(map[today] ?? -1);

  const base = (process.env.LINKEDIN_DISABLED_FLOWS || "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
    .filter((x) => x !== "hermes");

  if (!isPostDay) base.push("hermes");
  process.env.LINKEDIN_DISABLED_FLOWS = base.join(",");
  return isPostDay;
}

cron.schedule(
  "0 10 * * *",
  safeCron(async () => {
    const isPostDay = setLinkedInChannelForToday();
    console.log(
      `🚀 [10:00] HERMES icerik hazirlaniyor... (LinkedIn: ${isPostDay ? "ACIK" : "kapali, sadece X"})`,
    );
    await randomDelay();
    await runAutonomousWorkflow();
  }),
  { timezone: "Europe/Istanbul" },
);

// 16:30 - RSS Haber
cron.schedule(
  "30 16 * * *",
  safeCron(async () => {
    console.log("🚀 [16:30] RSS haber postu hazirlaniyor...");
    await randomDelay();
    await runRSSNewsWorkflow();
  }),
  { timezone: "Europe/Istanbul" },
);

// ─────────────────────────────────────────────────────────────
// YORUM FIRSAT AJANI — BURADA DEGIL, HERMES CRON'UNDA (5 Agu 2026)
//
// Ajan Mac'te calisiyor: `hermes cron` isi 566da5a12511,
// ~/.hermes/scripts/linkedin-yorum-ajani.sh -> `npm run engagement`.
//
// Neden sunucuda degil: ajanin girdisi data/yakalanan-gonderiler.json ve
// bu dosyayi Cenk'in kendi tarayici oturumu besliyor. Konteynerdeki kopya
// imaja gomulu ve donuk kaldigi icin tarama her seferinde "0 aday"
// veriyordu. Cron, verinin uretildigi makinede olmali.
//
// Buraya geri eklemeyin; once besleme sorununu cozun.
// ─────────────────────────────────────────────────────────────

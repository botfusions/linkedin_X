import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

function getTelegramToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN || "";
}
function getTelegramChatId(): string {
  return process.env.TELEGRAM_CHAT_ID || "";
}

export async function sendTelegramMessage(text: string): Promise<void> {
  const TELEGRAM_BOT_TOKEN = getTelegramToken();
  const TELEGRAM_CHAT_ID = getTelegramChatId();
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn(
      "⚠️ Telegram: BOT_TOKEN veya CHAT_ID tanimli degil, bildirim atlandi.",
    );
    return;
  }

  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "Markdown",
    });
    console.log("✅ Telegram bildirimi gonderildi.");
  } catch (error: any) {
    console.error(
      "❌ Telegram bildirim hatasi:",
      error.response?.data?.description || error.message,
    );
  }
}

/**
 * YORUM AJANI ICIN AYRI BOT
 *
 * Neden ayri: TELEGRAM_BOT_TOKEN n8n'e bagli ve hata bildirimleri oraya
 * dusuyor. Yorum taslaklari gunde birkac kez gelen, okunup uzerinde islem
 * yapilan mesajlar — hata kanaliyla karismasi ikisini de kullanilmaz kilar.
 *
 * .env:
 *   TELEGRAM_ENGAGEMENT_BOT_TOKEN=...
 *   TELEGRAM_ENGAGEMENT_CHAT_ID=...
 *
 * Tanimli degilse mesaj GONDERILMEZ ve hata kanalina DUSMEZ; yalnizca
 * konsola uyari yazilir. Boylece yanlislikla n8n kanalina tasma olmaz.
 */
export async function sendEngagementMessage(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_ENGAGEMENT_BOT_TOKEN || "";
  const chatId = process.env.TELEGRAM_ENGAGEMENT_CHAT_ID || "";

  if (!token || !chatId) {
    console.warn(
      "⚠️ Yorum ajani Telegram botu tanimli degil " +
        "(TELEGRAM_ENGAGEMENT_BOT_TOKEN / TELEGRAM_ENGAGEMENT_CHAT_ID). " +
        "Mesaj gonderilmedi — hata kanalina DUSURULMEDI.",
    );
    console.log("\n──── TASLAK (konsol ciktisi) ────\n" + text + "\n─────────────────────────────\n");
    return false;
  }

  try {
    await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: false,
    });
    console.log("✅ Yorum taslagi Telegram'a gonderildi.");
    return true;
  } catch (error: any) {
    console.error(
      "❌ Yorum ajani Telegram hatasi:",
      error.response?.data?.description || error.message,
    );
    console.log("\n──── TASLAK (gonderilemedi, konsol) ────\n" + text + "\n─────────────────────────────\n");
    return false;
  }
}

export interface PublishReport {
  topic: string;
  linkedinScore?: number | undefined;
  xScore?: number | undefined;
  linkedinSuccess: boolean;
  xSuccess: boolean;
  linkedinError?: string | undefined;
  xError?: string | undefined;
  source?: string | undefined;
}

export async function sendPublishNotification(
  report: PublishReport,
): Promise<void> {
  const now = new Date().toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const lines = [
    "🚀 *Botfusions Yayin Raporu*",
    "",
    `📝 *Konu:* ${report.topic}`,
    `📊 *LinkedIn Skor:* ${report.linkedinScore ?? "-"}/100`,
    `📊 *X Skor:* ${report.xScore ?? "-"}/100`,
    `${report.linkedinSuccess ? "✅" : "❌"} *LinkedIn:* ${report.linkedinSuccess ? "Yayinlandi" : `Hata: ${report.linkedinError ?? "Bilinmiyor"}`}`,
    `${report.xSuccess ? "✅" : "❌"} *X:* ${report.xSuccess ? "Yayinlandi" : `Hata: ${report.xError ?? "Bilinmiyor"}`}`,
    `📅 ${now}`,
    `📍 Kaynak: ${report.source === "weather" ? "Hava Durumu" : report.source === "rss" ? "RSS Haber" : "Excel Konu"}`,
  ];

  await sendTelegramMessage(lines.join("\n"));
}

export async function sendErrorNotification(
  context: string,
  error: string,
): Promise<void> {
  const now = new Date().toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const lines = [
    "🚨 *Botfusions Hata Bildirimi*",
    "",
    `📍 *Baglam:* ${context}`,
    `❌ *Hata:* ${error}`,
    `📅 ${now}`,
  ];

  await sendTelegramMessage(lines.join("\n"));
}

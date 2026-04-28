import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

const BASE_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

export async function sendTelegramMessage(text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn("⚠️ Telegram: BOT_TOKEN veya CHAT_ID tanimli degil, bildirim atlandi.");
    return;
  }

  try {
    await axios.post(`${BASE_URL}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: "Markdown",
    });
    console.log("✅ Telegram bildirimi gonderildi.");
  } catch (error: any) {
    console.error("❌ Telegram bildirim hatasi:", error.response?.data?.description || error.message);
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

export async function sendPublishNotification(report: PublishReport): Promise<void> {
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
    `📍 Kaynak: ${report.source === "weather" ? "Hava Durumu" : "Excel Konu"}`,
  ];

  await sendTelegramMessage(lines.join("\n"));
}

export async function sendErrorNotification(context: string, error: string): Promise<void> {
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

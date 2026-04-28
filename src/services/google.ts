import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import dotenv from "dotenv";

dotenv.config();

// Kullanıcının bağlantısını ilettiği Spreadsheet ID'si:
const SPREADSHEET_ID = "1w-RqIicfrQlw2tM0Z9XJtuNCtrSCY9ALbbo4PEN7-B0";

const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
let formattedKey = (process.env.GOOGLE_PRIVATE_KEY || "")
  .replace(/"/g, '')
  .replace(/'/g, '')
  .replace(/\\n/gm, '\n')
  .replace(/\\\//g, '/')
  .replace(/\r/g, '');

const PRIVATE_KEY = formattedKey.trim();

/**
 * Google Sheets'ten "GEO" sayfasındaki verileri çeker.
 *
 * Botfusions n8n sürecindeki "Bağlantı Kontrolü & Veri Alma" adımına denk gelir.
 */
export async function fetchContentFromSheet() {
  if (!SERVICE_ACCOUNT_EMAIL || !PRIVATE_KEY) {
    throw new Error(
      "❌ Hata: GOOGLE_SERVICE_ACCOUNT_EMAIL veya GOOGLE_PRIVATE_KEY .env dosyasında bulunamadı!",
    );
  }

  // 1. Service Account Yetkilendirmesi oluşturma
  const serviceAccountAuth = new JWT({
    email: SERVICE_ACCOUNT_EMAIL,
    key: PRIVATE_KEY,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  try {
    console.log("📊 Google Sheets'e bağlanılıyor...");
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);

    // 2. Spreadhsheet bilgilerini çek
    await doc.loadInfo();
    console.log(`✅ Doküman bağlantısı başarılı: "${doc.title}"`);

    // 3. Kullanıcının belirttiği 'GEO' sayfasını seç
    const sheet = doc.sheetsByTitle["GEO"];

    if (!sheet) {
      throw new Error(
        `❌ "${doc.title}" içerisinde 'GEO' adında bir çalışma sayfası bulunamadı.`,
      );
    }

    // 4. Tüm satırları çek
    const rows = await sheet.getRows();

    const records = rows.map((row) => {
      return {
        rowNumber: row.rowNumber,
        data: row.toObject(),
        _rawRow: row,
      };
    });

    console.log(
      `📋 GEO sayfasından toplam ${records.length} adet veri (satır) aktarıldı.`,
    );

    // Test amaçlı verileri JSON döner
    return records;
  } catch (error: any) {
    console.error("❌ Google Sheets Okuma Hatası:", error.message);
    throw error;
  }
}

/**
 * Belirli bir satırı "Yayınlandı" olarak işaretler.
 * @param row GoogleSpreadsheetRow nesnesi
 */
export async function updateRowStatus(row: any, status: string = "Yayınlandı") {
  try {
    const data = row.toObject();
    const statusKey =
      Object.keys(data).find((k) => k.toLowerCase() === "durum" || k.toLowerCase() === "status") || "Durum";

    row.assign({ [statusKey]: status });
    await row.save();
    console.log(
      `✅ Google Sheet satırı ${row.rowNumber} "${status}" olarak güncellendi.`,
    );
  } catch (error: any) {
    console.error(
      `❌ Google Sheet Güncelleme Hatası (Satır ${row.rowNumber}):`,
      error.message,
    );
  }
}

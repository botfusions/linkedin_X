import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";
import dotenv from "dotenv";

dotenv.config();

// Kullanıcının bağlantısını ilettiği Spreadsheet ID'si:
const SPREADSHEET_ID = "1w-RqIicfrQlw2tM0Z9XJtuNCtrSCY9ALbbo4PEN7-B0";

function getGoogleCredentials() {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "")
    .replace(/"/g, "")
    .replace(/'/g, "")
    .replace(/\\n/gm, "\n")
    .replace(/\\\//g, "/")
    .replace(/\r/g, "")
    .trim();

  return { serviceAccountEmail, privateKey };
}

/**
 * Google Sheets'ten "GEO" sayfasındaki verileri çeker.
 *
 * Botfusions n8n sürecindeki "Bağlantı Kontrolü & Veri Alma" adımına denk gelir.
 */
export async function fetchContentFromSheet() {
  const { serviceAccountEmail, privateKey } = getGoogleCredentials();
  if (!serviceAccountEmail || !privateKey) {
    throw new Error(
      "❌ Hata: GOOGLE_SERVICE_ACCOUNT_EMAIL veya GOOGLE_PRIVATE_KEY .env dosyasında bulunamadı!",
    );
  }

  // 1. Service Account Yetkilendirmesi oluşturma
  const serviceAccountAuth = new JWT({
    email: serviceAccountEmail,
    key: privateKey,
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
 * "linkedin excel" sayfasından hazır post verilerini çeker.
 * Postlar önceden yazılmış, direkt yayınlanacak durumda.
 */
export async function fetchReadyPosts() {
  const { serviceAccountEmail, privateKey } = getGoogleCredentials();
  if (!serviceAccountEmail || !privateKey) {
    throw new Error(
      "❌ Hata: GOOGLE_SERVICE_ACCOUNT_EMAIL veya GOOGLE_PRIVATE_KEY .env dosyasında bulunamadı!",
    );
  }

  const serviceAccountAuth = new JWT({
    email: serviceAccountEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  try {
    console.log("📊 Google Sheets'e bağlanılıyor (linkedin excel)...");
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
    await doc.loadInfo();

    const sheet = doc.sheetsByTitle["linkedin excel"];
    if (!sheet) {
      throw new Error(
        `❌ "${doc.title}" içerisinde "linkedin excel" adında bir sayfa bulunamadı. Mevcut sayfalar: ${Object.keys(doc.sheetsByTitle).join(", ")}`,
      );
    }

    const rows = await sheet.getRows();
    const records = rows.map((row) => ({
      rowNumber: row.rowNumber,
      data: row.toObject(),
      _rawRow: row,
    }));

    console.log(
      `📋 "linkedin excel" sayfasından toplam ${records.length} kayıt aktarıldı.`,
    );

    for (const r of records) {
      const cols = Object.keys(r.data);
      console.log(`   Satır ${r.rowNumber}: [${cols.join(", ")}]`);
      for (const col of cols) {
        console.log(`     → ${col}: "${String(r.data[col]).substring(0, 100)}"`);
      }
    }

    return records;
  } catch (error: any) {
    console.error("❌ Google Sheets Okuma Hatası (linkedin excel):", error.message);
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
      Object.keys(data).find(
        (k) => k.toLowerCase() === "durum" || k.toLowerCase() === "status",
      ) || "Durum";

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

// ─── HERMES  X akışı (Excel/GEO yerine) ───

const HERMES_X_SHEET = "HERMES  X"; // sekme adında bilerek iki boşluk var

/**
 * "HERMES  X" sayfasındaki tüm içerik satırlarını (rowNumber >= 2) çeker.
 * Kolonlar: A=KONU, B=status, C=YAYIN URLSİ.
 */
export async function fetchHermesXContent() {
  const { serviceAccountEmail, privateKey } = getGoogleCredentials();
  if (!serviceAccountEmail || !privateKey) {
    throw new Error(
      "❌ Hata: GOOGLE_SERVICE_ACCOUNT_EMAIL veya GOOGLE_PRIVATE_KEY .env dosyasında bulunamadı!",
    );
  }

  const serviceAccountAuth = new JWT({
    email: serviceAccountEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  try {
    console.log("📊 Google Sheets'e bağlanılıyor (HERMES  X)...");
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    console.log(`✅ Doküman bağlantısı başarılı: "${doc.title}"`);

    const sheet = doc.sheetsByTitle[HERMES_X_SHEET];
    if (!sheet) {
      throw new Error(
        `❌ "${doc.title}" içerisinde '${HERMES_X_SHEET}' adında bir çalışma sayfası bulunamadı. Sayfalar: ${Object.keys(doc.sheetsByTitle).join(", ")}`,
      );
    }

    const rows = await sheet.getRows();
    const records = rows
      .filter((row) => row.rowNumber >= 2)
      .map((row) => ({
        rowNumber: row.rowNumber,
        data: row.toObject(),
        _rawRow: row,
      }));

    console.log(
      `📋 '${HERMES_X_SHEET}' sayfasından ${records.length} adet satır aktarıldı.`,
    );
    return records;
  } catch (error: any) {
    console.error("❌ Google Sheets Okuma Hatası (HERMES  X):", error.message);
    throw error;
  }
}

/**
 * HERMES  X satırını yayınlandı olarak işaretler: status -> "done" VE
 * "YAYIN URLSİ" kolonuna LinkedIn paylaşım linkini yazar.
 */
export async function updateHermesRowPublished(
  row: any,
  publishUrl: string,
): Promise<void> {
  try {
    const data = row.toObject();
    const keys = Object.keys(data);

    const statusKey =
      keys.find((k) => k.toLowerCase() === "status") || "status";
    // URL kolonu: başlık normalize edilerek (büyük/küçük + boşluk) bulunur.
    const urlKey =
      keys.find((k) => {
        const l = k.toLowerCase().replace(/\s+/g, "");
        return /url|yayin|yayın/.test(l);
      }) || "YAYIN URLSİ";

    row.assign({ [statusKey]: "done", [urlKey]: publishUrl });
    await row.save();
    console.log(
      `✅ HERMES  X satır ${row.rowNumber}: status -> "done", ${urlKey} -> ${publishUrl}`,
    );
  } catch (error: any) {
    console.error(
      `❌ HERMES  X Satır ${row.rowNumber} güncelleme hatası:`,
      error.message,
    );
  }
}

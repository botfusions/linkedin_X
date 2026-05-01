import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

function getImgbbKey(): string {
  return process.env.IMGBB_API_KEY || "";
}

/**
 * Gemini'den dönen Base64 piksellerini alır,
 * ücretsiz ve hızlı ImgBB servisine yükler ve public URL döner.
 * @param base64Data Resmin Base64 kodlanmış ham hali
 * @returns {Promise<string>} LinkedIn'in kullanabileceği internet adresi (URL)
 */
export async function uploadBase64ToHosting(
  base64Data: string,
): Promise<string> {
  const IMGBB_API_KEY = getImgbbKey();
  if (!IMGBB_API_KEY) {
    throw new Error(
      "❌ Hata: IMGBB_API_KEY .env dosyasında bulunamadı! Görsel internete açılamıyor.",
    );
  }

  console.log(
    "☁️ Görsel ImgBB sunucularına aktarılıyor (Public Link Oluşturuluyor)...",
  );

  // ImgBB URL Encoded Form-Data bekler, Base64 verisini encode karakter sorunu olmasın diye POST method ve Form data yapıyoruz.
  const formData = new URLSearchParams();
  formData.append("image", base64Data);

  try {
    const response = await axios.post(
      `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
      formData,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    // ImgBB Dökümanındaki örnek yanıttan 'url' değerini çekiyoruz
    const publicUrl = response.data.data.url;
    console.log(`✅ Görsel Linke Dönüştürüldü: ${publicUrl}`);

    return publicUrl;
  } catch (error: any) {
    console.error(
      "❌ Resim Yükleme Servisi Hatası (ImgBB):",
      error.response?.data || error.message,
    );
    throw error;
  }
}

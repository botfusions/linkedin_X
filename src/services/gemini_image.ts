import fs from "fs/promises";
import path from "path";
import { generateImageWithGemini } from "./llm.js";

/**
 * Gemini ile görsel üretir ve yerel bir dosyaya kaydeder.
 * @param prompt Görsel üretim promptu
 * @returns Oluşturulan görselin dosya yolu
 */
export async function generateGeminiImage(prompt: string): Promise<string> {
  try {
    console.log("🎨 Gemini ile görsel üretiliyor...");
    const base64Data = await generateImageWithGemini(prompt);

    const tempDir = path.join(process.cwd(), "temp_images");
    
    // Klasör yoksa oluştur
    try {
      await fs.access(tempDir);
    } catch {
      await fs.mkdir(tempDir, { recursive: true });
    }

    const fileName = `image_${Date.now()}.png`;
    const filePath = path.join(tempDir, fileName);

    await fs.writeFile(filePath, Buffer.from(base64Data, "base64"));
    
    console.log(`✅ Görsel başarıyla kaydedildi: ${filePath}`);
    return filePath;
  } catch (error: any) {
    console.error("❌ Görsel Üretme ve Kaydetme Hatası:", error.message);
    throw error;
  }
}

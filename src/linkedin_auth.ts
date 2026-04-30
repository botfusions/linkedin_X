import fs from "fs/promises";
import path from "path";
import readline from "readline";
import axios from "axios";
import dotenv from "dotenv";
import { initEnvFromSupabase, saveLinkedInToken } from "./services/supabase.js";

dotenv.config();
await initEnvFromSupabase();

const TOKEN_PATH = path.join(process.cwd(), "data", ".linkedin_token.json");

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID || "";
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET || "";
const REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI || "http://localhost:8080/callback";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const questionAsync = (query: string): Promise<string> =>
  new Promise((resolve) => rl.question(query, resolve));

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error("❌ .env dosyasinda LINKEDIN_CLIENT_ID ve LINKEDIN_CLIENT_SECRET eksik!");
    process.exit(1);
  }

  const scope = "w_member_social profile openid";
  const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(scope)}`;

  console.log("\n========================================");
  console.log("🔗 Bu linki tarayicida acin ve onaylayin:");
  console.log(authUrl);
  console.log("========================================\n");

  const answer = await questionAsync(
    'Yonlendirme URL\'sini veya sadece "code=" parametresini yapistirin:\n> ',
  );

  let authCode = answer.trim();
  if (authCode.includes("code=")) {
    const urlParams = new URLSearchParams(authCode.substring(authCode.indexOf("?")));
    authCode = urlParams.get("code") || authCode;
  }

  if (!authCode) {
    console.error("❌ Gecerli bir kod verilmedi.");
    rl.close();
    process.exit(1);
  }

  console.log("⏳ Token aliniyor...");

  try {
    const response = await axios.post(
      "https://www.linkedin.com/oauth/v2/accessToken",
      null,
      {
        params: {
          grant_type: "authorization_code",
          code: authCode,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
        },
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      },
    );

    const accessToken = response.data.access_token;
    const expiresIn = response.data.expires_in;

    const expiresAt = Date.now() + expiresIn * 1000;
    const expiresDate = new Date(expiresAt).toLocaleDateString("tr-TR");

    await fs.mkdir(path.dirname(TOKEN_PATH), { recursive: true });
    await fs.writeFile(TOKEN_PATH, JSON.stringify({ access_token: accessToken, expiresAt }, null, 2), "utf-8");

    await saveLinkedInToken({ access_token: accessToken, expiresAt });

    console.log(`\n✅ Token basariyla alindi ve kaydedildi!`);
    console.log(`📅 Token bitis tarihi: ${expiresDate}`);
    console.log(`📂 Dosya: ${TOKEN_PATH}`);

    rl.close();
  } catch (error: any) {
    console.error("❌ Token alma hatasi:", error.response?.data?.error_description || error.message);
    rl.close();
    process.exit(1);
  }
}

main();

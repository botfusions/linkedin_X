import axios from "axios";
import dotenv from "dotenv";
import readline from "readline";

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT_URI = process.env.LINKEDIN_REDIRECT_URI;

console.log("--- TEST CONFIG ---");
console.log("ID:", CLIENT_ID);
console.log("Secret:", CLIENT_SECRET);
console.log("Redirect:", REDIRECT_URI);
console.log("-------------------");

rl.question(
  "Please paste the FULL URL from LinkedIn redirect: ",
  async (inputUrl) => {
    try {
      const url = new URL(inputUrl);
      const code = url.searchParams.get("code");

      if (!code) {
        console.error("❌ No code found in URL!");
        process.exit(1);
      }

      console.log("🚀 Attempting token exchange with code:", code);

      // LinkedIn API expects form-urlencoded
      const params = new URLSearchParams();
      params.append("grant_type", "authorization_code");
      params.append("code", code);
      params.append("client_id", CLIENT_ID!);
      params.append("client_secret", CLIENT_SECRET!);
      params.append("redirect_uri", REDIRECT_URI!);

      try {
        console.log("\n--- Method 1 (Direct Params) ---");
        const res1 = await axios.post(
          "https://www.linkedin.com/oauth/v2/accessToken",
          null,
          {
            params: {
              grant_type: "authorization_code",
              code: code,
              client_id: CLIENT_ID,
              client_secret: CLIENT_SECRET,
              redirect_uri: REDIRECT_URI,
            },
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          },
        );
        console.log("✅ Method 1 SUCCESS!");
        console.log(res1.data);
      } catch (e: any) {
        console.error("❌ Method 1 FAILED:", e.response?.data || e.message);
      }

      try {
        console.log("\n--- Method 2 (POST Body as string) ---");
        const res2 = await axios.post(
          "https://www.linkedin.com/oauth/v2/accessToken",
          params.toString(),
          {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          },
        );
        console.log("✅ Method 2 SUCCESS!");
        console.log(res2.data);
      } catch (e: any) {
        console.error("❌ Method 2 FAILED:", e.response?.data || e.message);
      }
    } catch (err) {
      console.error("❌ Invalid URL:", err);
    } finally {
      rl.close();
    }
  },
);

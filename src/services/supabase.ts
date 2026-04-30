import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";

let supabase: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!supabase) {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      throw new Error("SUPABASE_URL ve SUPABASE_SERVICE_KEY .env'de tanimli olmali!");
    }
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  }
  return supabase;
}

export interface PublishedPostData {
  topic: string;
  linkedin_post?: string;
  x_post?: string;
  image_url?: string;
  linkedin_score?: number;
  x_score?: number;
  linkedin_url?: string | undefined;
  x_url?: string | undefined;
  source?: "excel" | "weather" | "rss";
  status?: "published" | "failed";
}

export async function initEnvFromSupabase(): Promise<void> {
  try {
    const client = getClient();
    const { data, error } = await client.from("env_config").select("key_name, key_value");

    if (error) {
      console.warn("⚠️ Supabase env_config okunamadi, .env kullaniuluyor:", error.message);
      return;
    }

    if (!data || data.length === 0) {
      console.log("📋 Supabase env_config bos, .env kullaniuluyor.");
      return;
    }

    for (const row of data) {
      if (row.key_value && !process.env[row.key_name]) {
        process.env[row.key_name] = row.key_value;
      }
    }

    console.log(`✅ Supabase'den ${data.length} adet env degiskeni yuklendi.`);
  } catch (error: any) {
    console.warn("⚠️ Supabase env hatasi, .env kullaniuluyor:", error.message);
  }
}

export async function saveLinkedInToken(tokenData: { access_token: string; expiresAt: number }): Promise<void> {
  try {
    const client = getClient();
    const json = JSON.stringify(tokenData);
    const { error } = await client.from("env_config").upsert(
      { key_name: "LINKEDIN_TOKEN_JSON", key_value: json },
      { onConflict: "key_name" },
    );
    if (error) {
      console.error("❌ Supabase token kayit hatasi:", error.message);
    } else {
      console.log("✅ LinkedIn token Supabase'e kaydedildi.");
    }
  } catch (error: any) {
    console.error("❌ Supabase token kayit hatasi:", error.message);
  }
}

export async function loadLinkedInToken(): Promise<{ access_token: string; expiresAt: number } | null> {
  try {
    const client = getClient();
    const { data, error } = await client.from("env_config").select("key_value").eq("key_name", "LINKEDIN_TOKEN_JSON").single();
    if (error || !data?.key_value) return null;
    return JSON.parse(data.key_value);
  } catch {
    return null;
  }
}

export async function insertPublishedPost(postData: PublishedPostData): Promise<void> {
  try {
    const client = getClient();
    const { error } = await client.from("linkedin+x").insert({
      topic: postData.topic,
      linkedin_post: postData.linkedin_post || null,
      x_post: postData.x_post || null,
      image_url: postData.image_url || null,
      linkedin_score: postData.linkedin_score || null,
      x_score: postData.x_score || null,
      linkedin_url: postData.linkedin_url || null,
      x_url: postData.x_url || null,
      source: postData.source || "excel",
      status: postData.status || "published",
    });

    if (error) {
      console.error("❌ Supabase kayit hatasi:", error.message);
      return;
    }

    console.log("✅ Supabase 'linkedin+x' tablosuna kayit eklendi.");
  } catch (error: any) {
    console.error("❌ Supabase insert hatasi:", error.message);
  }
}

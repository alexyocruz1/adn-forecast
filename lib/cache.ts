import { ForecastResult } from "./types";

const CACHE_KEY_PREFIX = "forecasts";
const TTL_SECONDS = 60 * 60 * 24; // 24 hours

// In-memory fallback cache for local development without Vercel KV
const memoryCache = new Map<string, string>();

/**
 * Check if Vercel KV is available (env vars are set).
 */
function isKvAvailable(): boolean {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

/**
 * Get the KV client dynamically (only imported when available).
 */
async function getKvClient() {
  const { kv } = await import("@vercel/kv");
  return kv;
}

/**
 * Retrieve cached forecasts for a given date.
 * Falls back to in-memory cache if Vercel KV is not configured.
 */
export async function getCachedForecasts(
  date: string
): Promise<ForecastResult[] | null> {
  const key = `${CACHE_KEY_PREFIX}:${date}`;

  if (isKvAvailable()) {
    try {
      const kvClient = await getKvClient();
      const data = await kvClient.get<ForecastResult[]>(key);
      return data || null;
    } catch (error) {
      console.error("[cache] KV read error:", error);
      // Fall through to memory cache
    }
  }

  // In-memory fallback
  const cached = memoryCache.get(key);
  if (cached) {
    try {
      return JSON.parse(cached) as ForecastResult[];
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Store forecasts for a given date.
 * Falls back to in-memory cache if Vercel KV is not configured.
 */
export async function setCachedForecasts(
  date: string,
  data: ForecastResult[]
): Promise<void> {
  const key = `${CACHE_KEY_PREFIX}:${date}`;

  if (isKvAvailable()) {
    try {
      const kvClient = await getKvClient();
      await kvClient.set(key, data, { ex: TTL_SECONDS });
      console.log(`[cache] Stored ${data.length} forecasts in KV for ${date}`);
      return;
    } catch (error) {
      console.error("[cache] KV write error:", error);
      // Fall through to memory cache
    }
  }

  // In-memory fallback
  memoryCache.set(key, JSON.stringify(data));
  console.log(
    `[cache] Stored ${data.length} forecasts in memory for ${date}`
  );
}

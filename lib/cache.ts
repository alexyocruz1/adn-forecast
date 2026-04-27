import { kv } from "@vercel/kv";
import { ForecastResult } from "./types";

/**
 * Gets a specific match forecast from cache
 */
export async function getMatchForecast(matchId: number): Promise<ForecastResult | null> {
  try {
    return await kv.get(`forecast:match:${matchId}`);
  } catch (error) {
    console.error(`[cache] Error getting match ${matchId}:`, error);
    return null;
  }
}

/**
 * Stores a single match forecast
 */
export async function setMatchForecast(matchId: number, forecast: ForecastResult): Promise<void> {
  try {
    // Expire match forecasts after 36 hours (enough for the game day)
    await kv.set(`forecast:match:${matchId}`, forecast, { ex: 36 * 3600 });
  } catch (error) {
    console.error(`[cache] Error setting match ${matchId}:`, error);
  }
}

/**
 * Legacy: Gets daily forecasts (updated to use the new match-level logic)
 */
export async function getCachedForecasts(date: string): Promise<ForecastResult[] | null> {
  try {
    const ids = await kv.get<number[]>(`forecasts:ids:${date}`);
    if (!ids || ids.length === 0) return null;

    const forecasts: ForecastResult[] = [];
    for (const id of ids) {
      const f = await getMatchForecast(id);
      if (f) forecasts.push(f);
    }
    
    return forecasts.length > 0 ? forecasts : null;
  } catch (error) {
    console.error("[cache] Error getting daily forecasts:", error);
    return null;
  }
}

/**
 * Legacy: Sets daily forecasts (updated to use the new match-level logic)
 */
export async function setCachedForecasts(date: string, forecasts: ForecastResult[]): Promise<void> {
  try {
    const ids = forecasts.map(f => f.matchId);
    
    // 1. Save individual matches
    for (const f of forecasts) {
      // Don't save placeholders permanently if we have a choice, 
      // but save them to prevent infinite loops during a single session
      await setMatchForecast(f.matchId, f);
    }
    
    // 2. Save the index for this day
    await kv.set(`forecasts:ids:${date}`, ids, { ex: 48 * 3600 });
  } catch (error) {
    console.error("[cache] Error setting daily forecasts:", error);
  }
}

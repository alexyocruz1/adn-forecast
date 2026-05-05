import { Match } from "./types";
import { kv } from "@vercel/kv";

/**
 * Fetches enriched matches for a specific date and league from the KV store.
 * The data is populated by the 'sync-matches.js' background scraper.
 */
export async function getEnrichedMatches(date: string, league: string): Promise<Match[]> {
  try {
    console.log(`[football] Fetching matches for ${league} on ${date} from KV Mirror...`);
    
    // We store matches in a key pattern: matches:[date]:[league]
    const matches = await kv.get<Match[]>(`matches:${date}:${league}`);
    
    if (!matches) {
      console.log(`[football] No matches found in mirror for ${league} on ${date}.`);
      return [];
    }

    return matches;
  } catch (error) {
    console.error(`[football] Error reading mirror data for ${league}:`, error);
    return [];
  }
}

/**
 * Fetches all matches for a given date across all leagues (legacy support)
 */
export async function getMatchesForDate(date: string, league?: string): Promise<Match[]> {
  if (league) return await getEnrichedMatches(date, league);
  
  // If no league specified, we'd normally aggregate, but for now we focus on the per-league cron
  return [];
}

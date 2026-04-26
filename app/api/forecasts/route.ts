import { NextResponse } from "next/server";
import { getEnrichedMatches } from "@/lib/football";
import { generateBatchForecasts } from "@/lib/gemini";
import { getCachedForecasts, setCachedForecasts } from "@/lib/cache";
import { ForecastResult } from "@/lib/types";

export const revalidate = 0; // Never cache this route at the CDN level
export const maxDuration = 60; // Allow maximum serverless execution time

export async function GET() {
  try {
    // 1. Get today's date (UTC)
    const today = new Date().toISOString().split("T")[0];

    // 2. Try to read from cache
    const cached = await getCachedForecasts(today);
    if (cached) {
      console.log(`[forecasts] Cache hit for ${today}: ${cached.length} forecasts`);
      return NextResponse.json({ forecasts: cached, fromCache: true });
    }

    // 3. Cache miss — generate forecasts
    console.log(`[forecasts] Cache miss for ${today}, generating...`);
    const matches = await getEnrichedMatches();

    if (matches.length === 0) {
      return NextResponse.json({ forecasts: [], fromCache: false });
    }

    // 4. Generate forecast for all matches in a single batch
    console.log(`[forecasts] Sending ${matches.length} matches to Gemini...`);
    const batchResults = await generateBatchForecasts(matches);

    const forecasts: ForecastResult[] = [];
    for (const match of matches) {
      const forecast = batchResults.get(match.id);
      if (forecast) {
        forecasts.push({
          matchId: match.id,
          competition: match.competition,
          competitionCode: match.competitionCode,
          utcDate: match.utcDate,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          forecast,
          generatedAt: new Date().toISOString(),
        });
      }
    }

    // 5. Store in cache
    await setCachedForecasts(today, forecasts);

    return NextResponse.json({ forecasts, fromCache: false });
  } catch (error) {
    console.error("[forecasts] Error:", error);
    return NextResponse.json(
      { error: "Failed to generate forecasts", forecasts: [] },
      { status: 500 }
    );
  }
}

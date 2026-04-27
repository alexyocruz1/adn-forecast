import { NextResponse } from "next/server";
import { getEnrichedMatches } from "@/lib/football";
import { generateBatchForecasts } from "@/lib/gemini";
import { getCachedForecasts, setCachedForecasts } from "@/lib/cache";
import { ForecastResult } from "@/lib/types";

export const revalidate = 0; // Never cache this route at the CDN level
export const maxDuration = 60; // Allow maximum serverless execution time

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("refresh") === "1";
    const secret = searchParams.get("secret");

    // 0. Security check for forced refresh or cron usage
    if (forceRefresh && secret !== process.env.CRON_SECRET) {
      console.warn("[forecasts] Unauthorized refresh attempt");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Get today's date (UTC)
    const today = new Date().toISOString().split("T")[0];

    // 2. Try to read from cache (unless forced refresh)
    if (!forceRefresh) {
      const cached = await getCachedForecasts(today);
      
      // Check if cache contains placeholders
      const isPlaceholder = cached?.some(f => f.forecast.keyFactor === "AI Temporalmente no disponible");
      
      if (cached && !isPlaceholder) {
        console.log(`[forecasts] Cache hit (Full) for ${today}`);
        return NextResponse.json({ forecasts: cached, fromCache: true });
      }
    }

    // 3. Cache miss or refresh — generate forecasts
    console.log(`[forecasts] Generating/Healing for ${today}...`);
    const matches = await getEnrichedMatches();

    if (matches.length === 0) {
      return NextResponse.json({ forecasts: [], fromCache: false });
    }

    // 4. Generate forecast for all matches
    console.log(`[forecasts] Sending ${matches.length} matches to Gemini...`);
    const batchResults = await generateBatchForecasts(matches);

    const forecasts: ForecastResult[] = [];
    for (const match of matches) {
      const forecast = batchResults.get(match.id);
      
      forecasts.push({
        matchId: match.id,
        competition: match.competition,
        competitionCode: match.competitionCode,
        utcDate: match.utcDate,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        forecast: forecast || {
          matchWinner: "DRAW",
          doubleChance: "1X",
          overUnder25: "UNDER",
          btts: "NO",
          homeCleanSheet: "NO",
          awayCleanSheet: "NO",
          confidence: "LOW",
          reasoning: "El análisis de IA se está procesando. Por favor, consulta más tarde.",
          scoreSuggestion: "0-0",
          keyFactor: "AI Temporalmente no disponible"
        },
        generatedAt: new Date().toISOString(),
      });
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

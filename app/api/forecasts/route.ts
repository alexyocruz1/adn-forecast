import { NextResponse } from "next/server";
import { getEnrichedMatches } from "@/lib/football";
import { generateBatchForecasts } from "@/lib/gemini";
import { getMatchForecast, setMatchForecast, setCachedForecasts } from "@/lib/cache";
import { ForecastResult } from "@/lib/types";

export const revalidate = 0; 
export const maxDuration = 60; 

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const forceOverwrite = searchParams.get("force") === "1";
    const refreshNeeded = searchParams.get("refresh") === "1";
    const secret = searchParams.get("secret");

    // 0. Security
    if ((refreshNeeded || forceOverwrite) && secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const today = new Date().toISOString().split("T")[0];
    const matches = await getEnrichedMatches();
    if (matches.length === 0) return NextResponse.json({ forecasts: [] });

    const finalForecasts: ForecastResult[] = [];
    const missingMatches = [];

    // 1. Check granular cache
    for (const match of matches) {
      const cached = await getMatchForecast(match.id);
      
      const isPlaceholder = 
        !cached || 
        cached.forecast.keyFactor === "AI Temporalmente no disponible" ||
        cached.forecast.reasoning.includes("procesando") ||
        cached.forecast.reasoning.includes("IA se está procesando");
      
      // If we have a real forecast and we are NOT forcing an overwrite, use it.
      if (cached && !isPlaceholder && !forceOverwrite) {
        finalForecasts.push(cached);
      } else {
        // It's either missing, a placeholder, or we are forcing a full refresh
        missingMatches.push(match);
      }
    }

    // 2. If nothing missing, return cache
    if (missingMatches.length === 0) {
      return NextResponse.json({ forecasts: finalForecasts, fromCache: true });
    }

    // 3. Generate only what is missing
    console.log(`[api] Generating ${missingMatches.length} missing forecasts...`);
    const batchResults = await generateBatchForecasts(missingMatches);

    for (const match of missingMatches) {
      const forecast = batchResults.get(match.id);
      const result: ForecastResult = {
        matchId: match.id, competition: match.competition, competitionCode: match.competitionCode,
        utcDate: match.utcDate, homeTeam: match.homeTeam, awayTeam: match.awayTeam,
        forecast: forecast || {
          matchWinner: "DRAW" as "DRAW" | "HOME" | "AWAY",
          doubleChance: "1X" as "1X" | "X2" | "12",
          overUnder25: "UNDER" as "OVER" | "UNDER",
          btts: "NO" as "YES" | "NO",
          homeCleanSheet: "NO" as "YES" | "NO",
          awayCleanSheet: "NO" as "YES" | "NO",
          confidence: "LOW" as "HIGH" | "MEDIUM" | "LOW",
          reasoning: "El análisis de IA se está procesando.",
          scoreSuggestion: "0-0",
          keyFactor: "AI Temporalmente no disponible"
        },
        generatedAt: new Date().toISOString()
      };
      
      await setMatchForecast(match.id, result);
      finalForecasts.push(result);
    }

    // 4. Update index
    await setCachedForecasts(today, finalForecasts);

    return NextResponse.json({ 
      forecasts: finalForecasts.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime()), 
      fromCache: false 
    });
  } catch (error) {
    console.error("[forecasts] Error:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

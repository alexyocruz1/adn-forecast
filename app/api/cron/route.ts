import { NextRequest, NextResponse } from "next/server";
import { getEnrichedMatches } from "@/lib/football";
import { generateForecast } from "@/lib/gemini";
import { setCachedForecasts } from "@/lib/cache";
import { ForecastResult } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // 1. Validate Authorization header
  const authHeader = request.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expectedToken) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    // 2. Run the forecast pipeline
    console.log("[cron] Starting daily forecast generation...");
    const matches = await getEnrichedMatches();

    if (matches.length === 0) {
      console.log("[cron] No matches today");
      return NextResponse.json({
        success: true,
        matchCount: 0,
        generatedAt: new Date().toISOString(),
      });
    }

    // 3. Generate forecast for each match sequentially
    const forecasts: ForecastResult[] = [];
    for (const match of matches) {
      const forecast = await generateForecast(match);
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

    // 4. Force-overwrite cache (re-generation)
    const today = new Date().toISOString().split("T")[0];
    await setCachedForecasts(today, forecasts);

    console.log(`[cron] Generated ${forecasts.length} forecasts`);

    return NextResponse.json({
      success: true,
      matchCount: forecasts.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron] Error:", error);
    return NextResponse.json(
      { error: "Cron job failed", details: String(error) },
      { status: 500 }
    );
  }
}

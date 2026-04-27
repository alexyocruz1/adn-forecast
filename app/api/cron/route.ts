import { NextRequest, NextResponse } from "next/server";
import { getEnrichedMatches } from "@/lib/football";
import { generateBatchForecasts } from "@/lib/gemini";
import { setCachedForecasts } from "@/lib/cache";
import { ForecastResult } from "@/lib/types";
import { kv } from "@vercel/kv";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// How many hours before we consider the data stale and refresh it.
const REFRESH_THRESHOLD_HOURS = 4;

export async function GET(request: NextRequest) {
  // 1. Validate Authorization header
  const authHeader = request.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().split("T")[0];
  const forceRefresh = new URL(request.url).searchParams.get("force") === "1";

  try {
    // 2. Smart Freshness Check — skip if data is recent enough
    if (!forceRefresh) {
      const lastGeneratedAt = await kv.get<string>(`forecasts:generated_at:${today}`);
      if (lastGeneratedAt) {
        const ageHours = (Date.now() - new Date(lastGeneratedAt).getTime()) / (1000 * 60 * 60);
        if (ageHours < REFRESH_THRESHOLD_HOURS) {
          console.log(`[cron] Data is fresh (${ageHours.toFixed(1)}h old). Skipping refresh.`);
          return NextResponse.json({
            success: true,
            skipped: true,
            reason: `Data is ${ageHours.toFixed(1)}h old, threshold is ${REFRESH_THRESHOLD_HOURS}h`,
            lastGeneratedAt,
          });
        }
        console.log(`[cron] Data is ${ageHours.toFixed(1)}h old — refreshing now.`);
      } else {
        console.log(`[cron] No data found for ${today} — running fresh pipeline.`);
      }
    } else {
      console.log(`[cron] Force refresh requested.`);
    }

    // 3. Run the full data pipeline
    console.log("[cron] Fetching enriched matches...");
    const matches = await getEnrichedMatches();

    if (matches.length === 0) {
      console.log("[cron] No matches found today.");
      return NextResponse.json({ success: true, matchCount: 0, generatedAt: new Date().toISOString() });
    }

    // 4. Generate forecasts via Gemini
    console.log(`[cron] Sending ${matches.length} matches to Gemini...`);
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

    // 5. Store forecasts and update the timestamp
    await setCachedForecasts(today, forecasts);
    await kv.set(`forecasts:generated_at:${today}`, new Date().toISOString(), { ex: 48 * 3600 });

    console.log(`[cron] Successfully generated ${forecasts.length} forecasts.`);

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


import { NextRequest, NextResponse } from "next/server";
import { getEnrichedMatches } from "@/lib/football";
import { generateBatchForecasts } from "@/lib/gemini";
import { setCachedForecasts } from "@/lib/cache";
import { ForecastResult } from "@/lib/types";
import { kv } from "@vercel/kv";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Hours before cached data is considered stale and needs a refresh.
const REFRESH_THRESHOLD_HOURS = 4;

/**
 * Runs the full forecast pipeline for a single date.
 * Called by the GitHub Actions workflow twice per run: once for today, once for tomorrow.
 *
 * Query params:
 *   ?date=YYYY-MM-DD   Target date. Defaults to today UTC.
 *   ?force=1           Bypass the freshness check and force a full refresh.
 */
export async function GET(request: NextRequest) {
  // 1. Validate Authorization
  const authHeader = request.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;
  if (authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("force") === "1";

  // Default to today UTC; allow override via ?date=
  const todayUtc = new Date().toISOString().split("T")[0];
  const targetDate = searchParams.get("date") || todayUtc;

  console.log(`[cron] Target date: ${targetDate}${forceRefresh ? " (forced)" : ""}`);

  try {
    // 2. Smart Freshness Check — skip if data was recently generated for this date
    if (!forceRefresh) {
      const lastGeneratedAt = await kv.get<string>(`forecasts:generated_at:${targetDate}`);
      if (lastGeneratedAt) {
        const ageHours = (Date.now() - new Date(lastGeneratedAt).getTime()) / (1000 * 60 * 60);
        if (ageHours < REFRESH_THRESHOLD_HOURS) {
          console.log(`[cron] ${targetDate} data is fresh (${ageHours.toFixed(1)}h old). Skipping.`);
          return NextResponse.json({
            success: true,
            skipped: true,
            date: targetDate,
            reason: `Data is ${ageHours.toFixed(1)}h old, threshold is ${REFRESH_THRESHOLD_HOURS}h`,
            lastGeneratedAt,
          });
        }
        console.log(`[cron] ${targetDate} data is ${ageHours.toFixed(1)}h old — refreshing.`);
      } else {
        console.log(`[cron] No data found for ${targetDate} — running fresh pipeline.`);
      }
    }

    // 3. Fetch + hydrate matches for the target date
    console.log(`[cron] Fetching enriched matches for ${targetDate}...`);
    const matches = await getEnrichedMatches(targetDate);

    if (matches.length === 0) {
      console.log(`[cron] No matches found for ${targetDate}.`);
      // Still stamp the timestamp so we don't re-scan for the next 4h
      await kv.set(`forecasts:generated_at:${targetDate}`, new Date().toISOString(), { ex: 48 * 3600 });
      return NextResponse.json({ success: true, matchCount: 0, date: targetDate, generatedAt: new Date().toISOString() });
    }

    // 4. Generate AI forecasts via Gemini
    console.log(`[cron] Sending ${matches.length} matches to Gemini for ${targetDate}...`);
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

    // 5. Store forecasts and update freshness timestamp
    await setCachedForecasts(targetDate, forecasts);
    await kv.set(`forecasts:generated_at:${targetDate}`, new Date().toISOString(), { ex: 48 * 3600 });

    console.log(`[cron] ✅ ${forecasts.length} forecasts stored for ${targetDate}.`);

    return NextResponse.json({
      success: true,
      date: targetDate,
      matchCount: forecasts.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[cron] Error for ${targetDate}:`, error);
    return NextResponse.json(
      { error: "Cron job failed", date: targetDate, details: String(error) },
      { status: 500 }
    );
  }
}

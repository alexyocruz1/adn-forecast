import { NextRequest, NextResponse } from "next/server";
import { getEnrichedMatches } from "@/lib/football";
import { generateBatchForecasts } from "@/lib/gemini";
import { setCachedForecasts, getMatchForecast } from "@/lib/cache";
import { ForecastResult } from "@/lib/types";
import { kv } from "@vercel/kv";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Hours before cached data is considered stale and needs a refresh.
const REFRESH_THRESHOLD_HOURS = 4;

/**
 * Runs the full forecast pipeline for a single date and league.
 * Called by the GitHub Actions workflow for each league separately.
 *
 * Query params:
 *   ?date=YYYY-MM-DD   Target date. Defaults to today UTC.
 *   ?league=PL         Target league code.
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
  const league = searchParams.get("league");

  if (!league) {
    return NextResponse.json({ error: "Missing 'league' parameter" }, { status: 400 });
  }

  // Default to today UTC; allow override via ?date=
  const todayUtc = new Date().toISOString().split("T")[0];
  const targetDate = searchParams.get("date") || todayUtc;

  console.log(`[cron] Target date: ${targetDate}, League: ${league}${forceRefresh ? " (forced)" : ""}`);

  try {
    // 2. Smart Freshness Check — per league
    if (!forceRefresh) {
      const lastGeneratedAt = await kv.get<string>(`forecasts:generated_at:${targetDate}:${league}`);
      if (lastGeneratedAt) {
        const ageHours = (Date.now() - new Date(lastGeneratedAt).getTime()) / (1000 * 60 * 60);
        if (ageHours < REFRESH_THRESHOLD_HOURS) {
          console.log(`[cron] ${targetDate} data for ${league} is fresh (${ageHours.toFixed(1)}h old). Skipping.`);
          return NextResponse.json({
            success: true,
            skipped: true,
            date: targetDate,
            league,
            reason: `Data is ${ageHours.toFixed(1)}h old, threshold is ${REFRESH_THRESHOLD_HOURS}h`,
            lastGeneratedAt,
          });
        }
        console.log(`[cron] ${targetDate} data for ${league} is ${ageHours.toFixed(1)}h old — refreshing.`);
      } else {
        console.log(`[cron] No data found for ${targetDate} ${league} — running fresh pipeline.`);
      }
    }

    // 3. Fetch + hydrate matches for the target date and league
    console.log(`[cron] Fetching enriched matches for ${league} on ${targetDate}...`);
    const matches = await getEnrichedMatches(targetDate, league);

    if (matches.length === 0) {
      console.log(`[cron] No matches found for ${league} on ${targetDate}.`);
      // Stamp the timestamp so we don't re-scan for the next 4h
      await kv.set(`forecasts:generated_at:${targetDate}:${league}`, new Date().toISOString(), { ex: 48 * 3600 });
      return NextResponse.json({ success: true, matchCount: 0, date: targetDate, league, generatedAt: new Date().toISOString() });
    }

    // 4. Generate AI forecasts via Gemini (only for missing matches)
    const existingForecasts: ForecastResult[] = [];
    const missingMatches = [];
    for (const match of matches) {
      const cached = await getMatchForecast(match.id);
      if (cached) {
        existingForecasts.push(cached);
      } else {
        missingMatches.push(match);
      }
    }

    let newlyGeneratedForecasts: ForecastResult[] = [];
    if (missingMatches.length > 0) {
      console.log(`[cron] Sending ${missingMatches.length} missing matches to Gemini for ${league} on ${targetDate}...`);
      const batchResults = await generateBatchForecasts(missingMatches);

      for (const match of missingMatches) {
        const forecast = batchResults.get(match.id);
        if (forecast) {
          newlyGeneratedForecasts.push({
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
    } else {
      console.log(`[cron] All ${matches.length} matches already have forecasts. Skipping Gemini.`);
    }

    const allForecasts = [...existingForecasts, ...newlyGeneratedForecasts];

    // 5. Store forecasts, appending to the day's index, and update freshness timestamp
    await setCachedForecasts(targetDate, allForecasts, true);
    await kv.set(`forecasts:generated_at:${targetDate}:${league}`, new Date().toISOString(), { ex: 48 * 3600 });

    console.log(`[cron] ✅ ${allForecasts.length} forecasts stored for ${league} on ${targetDate}.`);

    return NextResponse.json({
      success: true,
      date: targetDate,
      league,
      totalMatches: matches.length,
      newForecasts: newlyGeneratedForecasts.length,
      existingForecasts: existingForecasts.length,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[cron] Error for ${league} on ${targetDate}:`, error);
    return NextResponse.json(
      { error: "Cron job failed", date: targetDate, league, details: String(error) },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getCachedForecasts } from "@/lib/cache";

export const revalidate = 0;

/**
 * Read-only forecasts endpoint. Returns data from KV cache.
 * All data is pre-populated by the /api/cron endpoint (triggered by GitHub Actions).
 * Use ?force=1&secret=... to manually trigger a full refresh via the cron pipeline.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const forceRefresh = searchParams.get("force") === "1";
  const secret = searchParams.get("secret");

  // Allow manual admin trigger with the secret
  if (forceRefresh) {
    if (secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Delegate to the cron route for the actual work
    const baseUrl = new URL(request.url).origin;
    const cronResponse = await fetch(`${baseUrl}/api/cron?force=1`, {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const cronData = await cronResponse.json();
    return NextResponse.json(cronData);
  }

  try {
    const today = new Date().toISOString().split("T")[0];
    const forecasts = await getCachedForecasts(today);

    return NextResponse.json({
      forecasts: (forecasts ?? []).sort(
        (a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime()
      ),
      fromCache: true,
      date: today,
    });
  } catch (error) {
    console.error("[forecasts] Error:", error);
    return NextResponse.json({ error: "Internal Error" }, { status: 500 });
  }
}

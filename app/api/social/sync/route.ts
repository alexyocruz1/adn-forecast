import { NextRequest, NextResponse } from "next/server";
import { setSocialUpdates } from "@/lib/cache";

export const dynamic = "force-dynamic";

/**
 * Endpoint called by the GitHub Action scraper to sync tweets.
 */
export async function POST(request: NextRequest) {
  // 1. Validate Authorization
  const authHeader = request.headers.get("authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;
  
  if (authHeader !== expectedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { updates } = await request.json();

    if (!updates || !Array.isArray(updates)) {
      return NextResponse.json({ error: "Invalid updates format" }, { status: 400 });
    }

    // Save to KV
    await setSocialUpdates(updates);

    return NextResponse.json({ 
      success: true, 
      count: updates.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("[api/social/sync] Error:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}

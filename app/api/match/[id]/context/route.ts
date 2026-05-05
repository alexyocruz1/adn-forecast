import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
import { EliteContext } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET ELITE CONTEXT
 * Retrieves cached tactical data for a specific match.
 * Data is populated by the 'sync-matches.js' background scraper.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: matchId } = await params;

  try {
    console.log(`[api/context] Fetching Elite Context for Match ID: ${matchId}...`);
    
    // Check Cache (Match context is keyed by ID)
    const cached = await kv.get<EliteContext>(`match:context:${matchId}`);
    
    if (!cached) {
      return NextResponse.json({ 
        success: false, 
        error: "Expert data not yet available for this match." 
      }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: cached });
  } catch (error) {
    console.error(`[api/context] Failed to fetch context:`, error);
    return NextResponse.json({ error: "Server error", details: String(error) }, { status: 500 });
  }
}

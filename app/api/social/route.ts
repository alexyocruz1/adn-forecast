import { NextResponse } from "next/server";
import { getSocialUpdates } from "@/lib/cache";

export const dynamic = "force-dynamic";

/**
 * Public endpoint to fetch cached social updates for the frontend.
 */
export async function GET() {
  try {
    const updates = await getSocialUpdates();
    return NextResponse.json({ updates });
  } catch (error) {
    console.error("[api/social] Error:", error);
    return NextResponse.json({ updates: [] }, { status: 500 });
  }
}

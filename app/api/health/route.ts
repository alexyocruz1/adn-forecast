/**
 * Health check endpoint — used by GitHub Actions to warm up
 * the Vercel deployment before triggering the cron pipeline.
 * Zero external API calls, zero KV reads.
 */
export async function GET() {
  return Response.json({ status: "ok", ts: Date.now() });
}

import { Suspense } from "react";
import Header from "@/components/Header";
import ForecastGrid from "@/components/ForecastGrid";
import LoadingState from "@/components/LoadingState";
import { getMatchForecast, setMatchForecast, setCachedForecasts, getCachedForecasts } from "@/lib/cache";
import { getEnrichedMatches } from "@/lib/football";
import { generateBatchForecasts } from "@/lib/gemini";
import { ForecastResult } from "@/lib/types";
import { kv } from "@vercel/kv";

// Force dynamic
export const dynamic = "force-dynamic";

/**
 * Direct data fetcher with Granular Match-Level Caching.
 * Only asks AI for matches that don't have a "Full" forecast yet.
 */
async function getForecasts(dateStr: string): Promise<ForecastResult[]> {
  try {
    // 1. Get current matches for today
    const matches = await getEnrichedMatches();
    if (matches.length === 0) return [];

    const finalForecasts: ForecastResult[] = [];
    const missingMatches = [];

    // 2. Check each match in the cache
    for (const match of matches) {
      const cached = await getMatchForecast(match.id);
      
      // If we have a FULL forecast (not a placeholder), we use it!
      const isPlaceholder = cached?.forecast.keyFactor === "AI Temporalmente no disponible";
      
      if (cached && !isPlaceholder) {
        finalForecasts.push(cached);
      } else {
        missingMatches.push(match);
      }
    }

    // 3. If everything is in cache, return early
    if (missingMatches.length === 0) {
      console.log(`[page] All ${matches.length} matches served from granular cache.`);
      return finalForecasts;
    }

    // 4. Lock check for the missing matches
    const lockKey = `lock:forecasts:${dateStr}`;
    const isLocked = await kv.get(lockKey);
    if (isLocked) {
      console.log(`[page] Generation in progress, serving what we have...`);
      // We return the partial list + placeholders for missing to keep UI consistent
      return matches.map(m => {
        const found = finalForecasts.find(f => f.matchId === m.id);
        return found || {
          matchId: m.id, competition: m.competition, competitionCode: m.competitionCode,
          utcDate: m.utcDate, homeTeam: m.homeTeam, awayTeam: m.awayTeam,
          forecast: {
            matchWinner: "DRAW", doubleChance: "1X", overUnder25: "UNDER", btts: "NO",
            homeCleanSheet: "NO", awayCleanSheet: "NO", confidence: "LOW",
            reasoning: "Generando pronóstico...", scoreSuggestion: "0-0",
            keyFactor: "AI Temporalmente no disponible"
          },
          generatedAt: new Date().toISOString()
        };
      });
    }

    // 5. Generate forecasts ONLY for the missing ones
    await kv.set(lockKey, "generating", { ex: 60 });
    try {
      console.log(`[page] Generating forecasts for ${missingMatches.length} missing matches...`);
      const batchResults = await generateBatchForecasts(missingMatches);

      for (const match of missingMatches) {
        const forecast = batchResults.get(match.id);
        const result: ForecastResult = {
          matchId: match.id, competition: match.competition, competitionCode: match.competitionCode,
          utcDate: match.utcDate, homeTeam: match.homeTeam, awayTeam: match.awayTeam,
          forecast: forecast || {
            matchWinner: "DRAW", doubleChance: "1X", overUnder25: "UNDER", btts: "NO",
            homeCleanSheet: "NO", awayCleanSheet: "NO", confidence: "LOW",
            reasoning: "El análisis de IA se está procesando.", scoreSuggestion: "0-0",
            keyFactor: "AI Temporalmente no disponible"
          },
          generatedAt: new Date().toISOString()
        };
        
        // Save individually!
        await setMatchForecast(match.id, result);
        finalForecasts.push(result);
      }
      
      // Update the daily index
      await setCachedForecasts(dateStr, finalForecasts);
      await kv.del(lockKey);
      
      // Sort by date to keep consistent UI
      return finalForecasts.sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime());
    } catch (innerError) {
      await kv.del(lockKey);
      throw innerError;
    }
  } catch (error) {
    console.error("[page] Error loading forecasts:", error);
    return [];
  }
}

async function ForecastsWrapper({ dateStr }: { dateStr: string }) {
  const forecasts = await getForecasts(dateStr);
  return <ForecastGrid forecasts={forecasts} />;
}

function DisplayDate({ dateStr }: { dateStr: string }) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const dateOptions: Intl.DateTimeFormatOptions = { 
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'
  };
  const formattedDate = date.toLocaleDateString('es-ES', dateOptions);
  const displayDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
  return (
    <p className="font-body text-text-soft text-2xl font-light" suppressHydrationWarning>
      {displayDate}
    </p>
  );
}

export default function Home() {
  const todayUtc = new Date().toISOString().split("T")[0];
  return (
    <>
      <Header />
      <main className="flex-grow max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 bg-bg-deep rounded-xl my-4">
        <div className="mb-8">
          <h2 className="font-display tracking-widest text-text-muted text-lg mb-2">PRONÓSTICOS DE HOY</h2>
          <DisplayDate dateStr={todayUtc} />
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-2 mb-8 text-[10px] sm:text-xs font-body uppercase tracking-widest text-text-muted border-b border-border/30 pb-4">
          <span className="text-text-soft/50 mr-[-8px]">Nivel de Confianza:</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-badge-home shadow-[0_0_8px_rgba(74,222,128,0.4)]"></div>
            <span>Alta</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-badge-draw shadow-[0_0_8px_rgba(250,204,21,0.4)]"></div>
            <span>Media</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-badge-low shadow-[0_0_8px_rgba(248,113,113,0.4)]"></div>
            <span>Baja</span>
          </div>
        </div>
        <Suspense fallback={<LoadingState />}>
          <ForecastsWrapper dateStr={todayUtc} />
        </Suspense>
      </main>
      <footer className="border-t border-border bg-bg-card py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2"><span className="font-display tracking-wide text-xl text-text-primary">ADN FUTBOLERO</span></div>
          <div className="flex items-center gap-2 text-text-soft text-sm font-body">
            <span>Powered by AI</span>
            <span className="w-1 h-1 rounded-full bg-green-brand"></span>
            <a href="https://twitter.com/adn_futbolero_" target="_blank" rel="noreferrer" className="hover:text-green-glow transition-colors">@adn_futbolero_</a>
          </div>
        </div>
      </footer>
    </>
  );
}

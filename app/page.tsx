import { Suspense } from "react";
import Header from "@/components/Header";
import ForecastGrid from "@/components/ForecastGrid";
import LoadingState from "@/components/LoadingState";
import { getCachedForecasts, setCachedForecasts } from "@/lib/cache";
import { getEnrichedMatches } from "@/lib/football";
import { generateBatchForecasts } from "@/lib/gemini";
import { ForecastResult } from "@/lib/types";

// Force dynamic since we want to always get the latest data or cache logic
export const dynamic = "force-dynamic";

/**
 * Direct data fetcher for Server Components.
 */
async function getForecasts(): Promise<ForecastResult[]> {
  try {
    const today = new Date().toISOString().split("T")[0];

    // 1. Try to read from cache
    const cached = await getCachedForecasts(today);
    if (cached && cached.length > 0) {
      console.log(`[page] Cache hit for ${today}: ${cached.length} forecasts`);
      return cached;
    }

    // 2. Cache miss — generate forecasts
    console.log(`[page] Cache miss for ${today}, generating...`);
    const matches = await getEnrichedMatches();

    if (matches.length === 0) {
      return [];
    }

    // 3. Generate forecast for all matches in a single batch
    console.log(`[page] Sending ${matches.length} matches to Gemini...`);
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

    // 4. Store in cache
    if (forecasts.length > 0) {
      await setCachedForecasts(today, forecasts);
    }

    return forecasts;
  } catch (error) {
    console.error("[page] Error loading forecasts:", error);
    return [];
  }
}

async function ForecastsWrapper() {
  const forecasts = await getForecasts();
  return <ForecastGrid forecasts={forecasts} />;
}

/**
 * Client-safe date component to prevent hydration mismatches
 */
function DisplayDate() {
  const today = new Date();
  const dateOptions: Intl.DateTimeFormatOptions = { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long' 
  };
  
  // Format as Spanish
  const formattedDate = today.toLocaleDateString('es-ES', dateOptions);
  const displayDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

  return (
    <p className="font-body text-text-soft text-2xl font-light" suppressHydrationWarning>
      {displayDate}
    </p>
  );
}

export default function Home() {
  return (
    <>
      <Header />
      
      <main className="flex-grow max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 bg-bg-deep rounded-xl my-4">
        <div className="mb-8">
          <h2 className="font-display tracking-widest text-text-muted text-lg mb-2">
            PRONÓSTICOS DE HOY
          </h2>
          <DisplayDate />
        </div>

        {/* Confidence Legend */}
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
          <ForecastsWrapper />
        </Suspense>
      </main>

      <footer className="border-t border-border bg-bg-card py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-display tracking-wide text-xl text-text-primary">ADN FUTBOLERO</span>
          </div>
          
          <div className="flex items-center gap-2 text-text-soft text-sm font-body">
            <span>Powered by AI</span>
            <span className="w-1 h-1 rounded-full bg-green-brand"></span>
            <a href="https://twitter.com/adn_futbolero_" target="_blank" rel="noreferrer" className="hover:text-green-glow transition-colors">
              @adn_futbolero_
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}

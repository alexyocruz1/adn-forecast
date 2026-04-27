import { Suspense } from "react";
import Header from "@/components/Header";
import ForecastGrid from "@/components/ForecastGrid";
import LoadingState from "@/components/LoadingState";
import { getCachedForecasts } from "@/lib/cache";
import { ForecastResult } from "@/lib/types";

// Revalidate every 5 minutes at the edge — the cron job updates KV,
// so a short revalidation window is enough for freshness without user-triggered API calls.
export const revalidate = 300;

/**
 * Pure cache reader. ZERO external API calls.
 * All data is pre-populated by the GitHub Actions cron job via /api/cron.
 */
async function getForecasts(dateStr: string): Promise<ForecastResult[]> {
  try {
    const cached = await getCachedForecasts(dateStr);
    return cached ?? [];
  } catch (error) {
    console.error("[page] Error reading forecasts from cache:", error);
    return [];
  }
}


async function ForecastsWrapper({ dateStr }: { dateStr: string }) {
  const forecasts = await getForecasts(dateStr);

  if (forecasts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        <div className="text-5xl">⚽</div>
        <h3 className="font-display text-text-primary text-xl tracking-wide">
          Pronósticos en preparación
        </h3>
        <p className="font-body text-text-muted text-sm max-w-sm">
          Nuestro sistema está procesando los análisis de hoy. Vuelve en unos minutos.
        </p>
      </div>
    );
  }

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

import { Suspense } from "react";
import Header from "@/components/Header";
import SidebarNavigation from "@/components/SidebarNavigation";
import ForecastGrid from "@/components/ForecastGrid";
import LoadingState from "@/components/LoadingState";
import TwitterFeed from "@/components/TwitterFeed";
import { getCachedForecasts } from "@/lib/cache";
import { ForecastResult } from "@/lib/types";
import Link from "next/link";

// Revalidate every 5 minutes at the edge.
export const revalidate = 300;

async function getForecasts(dateStr: string): Promise<ForecastResult[]> {
  try {
    const cached = await getCachedForecasts(dateStr);
    return (cached ?? []).sort(
      (a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime()
    );
  } catch (error) {
    console.error(`[page] Error reading forecasts for ${dateStr}:`, error);
    return [];
  }
}

function getTomorrowUtc(todayUtc: string): string {
  const d = new Date(todayUtc + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split("T")[0];
}

function formatDisplayDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const formatted = date.toLocaleDateString("es-ES", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC"
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function ConfidenceLegend() {
  return (
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
  );
}

async function ForecastsSection({
  dateStr,
  label,
  displayDate,
  showLegend,
  leagueFilter,
}: {
  dateStr: string;
  label: string;
  displayDate: string;
  showLegend: boolean;
  leagueFilter?: string;
}) {
  let forecasts = await getForecasts(dateStr);
  
  if (leagueFilter) {
    forecasts = forecasts.filter(f => f.competitionCode === leagueFilter);
  }

  if (forecasts.length === 0 && leagueFilter) return null;

  return (
    <section className="mb-16 scroll-mt-24" id={label}>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h2 className="font-display tracking-widest text-text-muted text-lg uppercase">
            {label}
          </h2>
          {label === "MAÑANA" && (
            <span className="text-[10px] font-body uppercase tracking-widest px-2 py-0.5 rounded-full border border-border/40 text-text-muted/60">
              Preview
            </span>
          )}
        </div>
        <p className="font-body text-text-soft text-2xl font-light">{displayDate}</p>
      </div>

      {showLegend && <ConfidenceLegend />}

      {forecasts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3 border border-border/20 rounded-xl">
          <div className="text-4xl">⚽</div>
          <h3 className="font-display text-text-primary text-lg tracking-wide">
            {label === "HOY" ? "Pronósticos en preparación" : "Sin partidos programados"}
          </h3>
          <p className="font-body text-text-muted text-sm max-w-xs">
            {label === "HOY"
              ? "Nuestro sistema está procesando los análisis. Vuelve en unos minutos."
              : "No encontramos partidos para mañana en las ligas que seguimos."}
          </p>
        </div>
      ) : (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <ForecastGrid forecasts={forecasts} />
        </div>
      )}
    </section>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; league?: string; view?: string }>;
}) {
  const { date: filterDate, league: filterLeague, view: activeView } = await searchParams;
  const todayUtc = new Date().toISOString().split("T")[0];
  const tomorrowUtc = getTomorrowUtc(todayUtc);

  // Fetch all to extract league navigation info
  const todayForecasts = await getForecasts(todayUtc);
  const tomorrowForecasts = await getForecasts(tomorrowUtc);

  const getUniqueLeagues = (forecasts: ForecastResult[]) => {
    const leaguesMap = new Map<string, string>();
    forecasts.forEach(f => {
      if (f.competitionCode) leaguesMap.set(f.competitionCode, f.competition);
    });
    return Array.from(leaguesMap.entries()).map(([code, name]) => ({ code, name }));
  };

  const todayLeagues = getUniqueLeagues(todayForecasts);
  const tomorrowLeagues = getUniqueLeagues(tomorrowForecasts);

  // If a filter is active, we might only want to show one section
  const showToday = !filterDate || filterDate === todayUtc;
  const showTomorrow = !filterDate || filterDate === tomorrowUtc;

  return (
    <div className="flex min-h-screen">
      <SidebarNavigation 
        todayLeagues={todayLeagues}
        tomorrowLeagues={tomorrowLeagues}
        todayStr={todayUtc}
        tomorrowStr={tomorrowUtc}
      />
      
      <div className="flex-grow flex flex-col min-w-0">
        <Header />
        
        <main className="flex-grow max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 bg-bg-deep rounded-xl my-4 min-h-screen">
          {activeView === "social" ? (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
               <TwitterFeed />
            </div>
          ) : (
            <>
              {filterLeague && (
                <div className="mb-8 flex items-center justify-between border-b border-border/20 pb-4 animate-in fade-in duration-500">
                   <div>
                     <h1 className="text-text-primary font-display text-xl uppercase tracking-tighter">
                       {filterDate === tomorrowUtc ? "Mañana" : "Hoy"} — {todayLeagues.find(l => l.code === filterLeague)?.name || tomorrowLeagues.find(l => l.code === filterLeague)?.name || "Liga"}
                     </h1>
                     <p className="text-text-muted text-xs font-body mt-1 uppercase tracking-widest opacity-60">Filtrando pronósticos seleccionados</p>
                   </div>
                   <Link href="/" className="text-xs font-body text-green-glow hover:underline uppercase tracking-widest border border-green-glow/20 px-3 py-1 rounded-full transition-all hover:bg-green-glow/10">
                     Ver Todo
                   </Link>
                </div>
              )}

              {showToday && (
                <ForecastsSection
                  dateStr={todayUtc}
                  label="HOY"
                  displayDate={formatDisplayDate(todayUtc)}
                  showLegend={true}
                  leagueFilter={filterDate === todayUtc || !filterDate ? filterLeague : undefined}
                />
              )}

              {showToday && showTomorrow && !filterLeague && (
                <div className="relative my-4 mb-12 animate-in fade-in duration-1000">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border/20"></div>
                  </div>
                  <div className="relative flex justify-center">
                    <span className="px-4 bg-bg-deep text-text-muted/40 text-[10px] font-display uppercase tracking-[0.3em]">
                      Próximos partidos
                    </span>
                  </div>
                </div>
              )}

              {showTomorrow && (
                <ForecastsSection
                  dateStr={tomorrowUtc}
                  label="MAÑANA"
                  displayDate={formatDisplayDate(tomorrowUtc)}
                  showLegend={!showToday}
                  leagueFilter={filterDate === tomorrowUtc || !filterDate ? filterLeague : undefined}
                />
              )}
            </>
          )}
        </main>

        <footer className="border-t border-border bg-bg-card py-12">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex flex-col items-center md:items-start gap-2">
              <span className="font-display tracking-widest text-2xl text-text-primary uppercase">ADN FUTBOLERO</span>
              <p className="text-[10px] font-body text-text-muted uppercase tracking-[0.2em] opacity-40">Inteligencia Artificial aplicada al Deporte</p>
            </div>
            <div className="flex items-center gap-4 text-text-soft text-sm font-body">
              <span>Powered by AI</span>
              <span className="w-1 h-1 rounded-full bg-green-brand"></span>
              <a href="https://twitter.com/adn_futbolero_" target="_blank" rel="noreferrer" className="hover:text-green-glow transition-all duration-300 flex items-center gap-2 group">
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current group-hover:scale-110 transition-transform">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.008 5.961h-1.96z"></path>
                </svg>
                @adn_futbolero_
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

import { Suspense } from "react";
import Header from "@/components/Header";
import ForecastGrid from "@/components/ForecastGrid";
import LoadingState from "@/components/LoadingState";
import { getCachedForecasts } from "@/lib/cache";
import { ForecastResult } from "@/lib/types";

// Revalidate every 5 minutes at the edge.
// The cron job updates KV — no user-triggered API calls ever happen here.
export const revalidate = 300;

/**
 * Pure cache reader. ZERO external API calls.
 * All data is pre-populated by the GitHub Actions cron job via /api/cron.
 */
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

// ─── Date Helpers ────────────────────────────────────────────────────────────

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

// ─── Section Components ───────────────────────────────────────────────────────

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
}: {
  dateStr: string;
  label: string;
  displayDate: string;
  showLegend: boolean;
}) {
  const forecasts = await getForecasts(dateStr);

  return (
    <section className="mb-16">
      {/* Section Header */}
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

      {/* Legend (only shown once, under the first section) */}
      {showLegend && <ConfidenceLegend />}

      {/* Forecasts or Empty State */}
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
        <ForecastGrid forecasts={forecasts} />
      )}
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const todayUtc = new Date().toISOString().split("T")[0];
  const tomorrowUtc = getTomorrowUtc(todayUtc);

  return (
    <>
      <Header />
      <main className="flex-grow max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 bg-bg-deep rounded-xl my-4">
        <Suspense fallback={<LoadingState />}>
          <ForecastsSection
            dateStr={todayUtc}
            label="HOY"
            displayDate={formatDisplayDate(todayUtc)}
            showLegend={true}
          />
        </Suspense>

        {/* Divider */}
        <div className="relative my-4 mb-12">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border/20"></div>
          </div>
          <div className="relative flex justify-center">
            <span className="px-4 bg-bg-deep text-text-muted/40 text-xs font-body uppercase tracking-widest">
              Próximos partidos
            </span>
          </div>
        </div>

        <Suspense fallback={<LoadingState />}>
          <ForecastsSection
            dateStr={tomorrowUtc}
            label="MAÑANA"
            displayDate={formatDisplayDate(tomorrowUtc)}
            showLegend={false}
          />
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

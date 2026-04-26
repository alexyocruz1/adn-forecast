import { ForecastResult } from "@/lib/types";
import ForecastCard from "./ForecastCard";
import EmptyState from "./EmptyState";

interface Props {
  forecasts: ForecastResult[];
}

export default function ForecastGrid({ forecasts }: Props) {
  if (!forecasts || forecasts.length === 0) {
    return <EmptyState />;
  }

  // Group by competition
  const groupedForecasts = forecasts.reduce((acc, forecast) => {
    if (!acc[forecast.competition]) {
      acc[forecast.competition] = [];
    }
    acc[forecast.competition].push(forecast);
    return acc;
  }, {} as Record<string, ForecastResult[]>);

  // Sort competitions by number of matches (descending)
  const sortedCompetitions = Object.keys(groupedForecasts).sort(
    (a, b) => groupedForecasts[b].length - groupedForecasts[a].length
  );

  return (
    <div className="space-y-12 animate-in fade-in duration-500">
      {sortedCompetitions.map((competition) => (
        <section key={competition}>
          <div className="flex items-center gap-4 mb-6">
            <h2 className="font-display text-2xl tracking-wide text-text-primary m-0">
              {competition}
            </h2>
            <div className="h-px bg-border flex-grow"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {groupedForecasts[competition].map((forecast, idx) => (
              <div 
                key={forecast.matchId} 
                className="animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both"
                style={{ animationDelay: `${idx * 100}ms` }}
              >
                <ForecastCard data={forecast} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

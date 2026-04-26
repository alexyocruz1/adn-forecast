"use client";

import { useState } from "react";
import { ForecastResult } from "@/lib/types";
import ForecastCard from "./ForecastCard";
import EmptyState from "./EmptyState";

interface Props {
  forecasts: ForecastResult[];
}

export default function ForecastGrid({ forecasts }: Props) {
  const [searchQuery, setSearchQuery] = useState("");

  if (!forecasts || forecasts.length === 0) {
    return <EmptyState />;
  }

  // Filter forecasts based on search query
  const filteredForecasts = forecasts.filter((f) => {
    const query = searchQuery.toLowerCase();
    return (
      f.homeTeam.name.toLowerCase().includes(query) ||
      f.awayTeam.name.toLowerCase().includes(query) ||
      f.competition.toLowerCase().includes(query)
    );
  });

  // Group by competition
  const groupedForecasts = filteredForecasts.reduce((acc, forecast) => {
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
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Search Bar */}
      <div className="relative max-w-md mx-auto mb-12">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <svg className="w-5 h-5 text-text-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          type="text"
          placeholder="Buscar equipo o liga..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-bg-card border border-border text-text-primary pl-12 pr-4 py-4 rounded-2xl focus:outline-none focus:ring-2 focus:ring-green-neon/50 focus:border-green-neon transition-all placeholder:text-text-soft/50 shadow-lg"
        />
        {searchQuery && (
          <button 
            onClick={() => setSearchQuery("")}
            className="absolute inset-y-0 right-4 flex items-center text-text-soft hover:text-text-primary transition-colors"
          >
            <span className="text-xs font-display tracking-widest bg-border/50 px-2 py-1 rounded">ESCAPAR</span>
          </button>
        )}
      </div>

      {filteredForecasts.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-3xl">
          <p className="font-display text-text-soft tracking-widest uppercase">No se encontraron resultados</p>
          <button 
            onClick={() => setSearchQuery("")}
            className="mt-4 text-green-neon hover:underline font-body text-sm"
          >
            Limpiar búsqueda
          </button>
        </div>
      ) : (
        sortedCompetitions.map((competition) => (
          <section key={competition} className="animate-in fade-in duration-700">
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
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <ForecastCard data={forecast} />
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

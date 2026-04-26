"use client";

import Image from "next/image";
import { ForecastResult } from "@/lib/types";

interface Props {
  data: ForecastResult;
}

export default function ForecastCard({ data }: Props) {
  const { matchId, competition, utcDate, homeTeam, awayTeam, forecast } = data;
  
  // Format local time
  const date = new Date(utcDate);
  const timeString = date.toLocaleTimeString('es-ES', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false 
  });

  // Determine styles based on match winner prediction
  const isHome = forecast.matchWinner === "HOME";
  const isDraw = forecast.matchWinner === "DRAW";
  const isAway = forecast.matchWinner === "AWAY";

  const predictionClass = isHome 
    ? "prediction-bar-home glow-home" 
    : isDraw 
      ? "prediction-bar-draw glow-draw" 
      : "prediction-bar-away glow-away";

  const badgeBg = isHome 
    ? "bg-badge-home text-[#052e16]" 
    : isDraw 
      ? "bg-badge-draw text-[#422006]" 
      : "bg-badge-away text-[#0c1a2e]";

  const predictionText = isHome 
    ? "VICTORIA LOCAL" 
    : isDraw 
      ? "EMPATE" 
      : "VICTORIA VISITANTE";

  // Confidence styles
  const confidenceColor = forecast.confidence === "HIGH" 
    ? "text-badge-home border-badge-home" 
    : forecast.confidence === "MEDIUM"
      ? "text-badge-draw border-badge-draw"
      : "text-badge-low border-badge-low";

  return (
    <article className={`bg-bg-card rounded-lg overflow-hidden flex flex-col h-full border border-border transition-all duration-300 ${predictionClass}`}>
      {/* Header */}
      <div className="px-4 py-2 bg-bg-card-hover border-b border-border flex justify-between items-center">
        <span className="font-display tracking-wider text-text-soft text-sm">{competition}</span>
        <span className="font-body text-xs text-text-muted">{timeString}</span>
      </div>

      <div className="p-5 flex-grow flex flex-col">
        {/* Teams & Score Suggestion */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex flex-col items-center gap-2 w-1/3">
            <div className="relative w-12 h-12">
              <Image 
                src={homeTeam.crest || '/images/adnlogo.png'} 
                alt={homeTeam.name}
                fill
                sizes="(max-width: 768px) 32px, 48px"
                className="object-contain"
                onError={(e) => { e.currentTarget.src = '/images/adnlogo.png'; }}
              />
            </div>
            <span className="font-display text-center leading-tight truncate w-full">{homeTeam.name}</span>
          </div>

          <div className="w-1/3 text-center">
            <div className="font-display text-4xl tracking-widest text-text-primary">
              {forecast.scoreSuggestion}
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 w-1/3">
            <div className="relative w-12 h-12">
              <Image 
                src={awayTeam.crest || '/images/adnlogo.png'} 
                alt={awayTeam.name}
                fill
                sizes="(max-width: 768px) 32px, 48px"
                className="object-contain"
                onError={(e) => { e.currentTarget.src = '/images/adnlogo.png'; }}
              />
            </div>
            <span className="font-display text-center leading-tight truncate w-full">{awayTeam.name}</span>
          </div>
        </div>

        {/* Primary Badges */}
        <div className="flex justify-center gap-3 mb-5">
          <div className={`px-3 py-1 rounded-full font-display tracking-wide text-sm ${badgeBg}`}>
            {predictionText}
          </div>
          <div className={`px-3 py-1 rounded-full border text-xs font-display flex items-center ${confidenceColor}`}>
            CONF: {forecast.confidence === "HIGH" ? "ALTA" : forecast.confidence === "MEDIUM" ? "MEDIA" : "BAJA"}
          </div>
        </div>

        {/* Expanded Markets Grid */}
        <div className="grid grid-cols-2 gap-2 mb-5 text-xs">
          <div className="bg-bg-card-hover border border-border rounded p-2 flex flex-col items-center text-center">
            <span className="text-text-muted mb-1 font-body">Doble Oport.</span>
            <span className="text-text-primary font-display tracking-wide">{forecast.doubleChance}</span>
          </div>
          <div className="bg-bg-card-hover border border-border rounded p-2 flex flex-col items-center text-center">
            <span className="text-text-muted mb-1 font-body">Goles 2.5</span>
            <span className="text-text-primary font-display tracking-wide">{forecast.overUnder25 === "OVER" ? "MÁS" : "MENOS"}</span>
          </div>
          <div className="bg-bg-card-hover border border-border rounded p-2 flex flex-col items-center text-center">
            <span className="text-text-muted mb-1 font-body">Ambos Anotan</span>
            <span className="text-text-primary font-display tracking-wide">{forecast.btts === "YES" ? "SÍ" : "NO"}</span>
          </div>
          <div className="bg-bg-card-hover border border-border rounded p-2 flex flex-col items-center text-center">
            <span className="text-text-muted mb-1 font-body">Arco Cero</span>
            <span className="text-text-primary font-display tracking-wide">
              {forecast.homeCleanSheet === "YES" ? "L " : ""}
              {forecast.awayCleanSheet === "YES" ? "V" : ""}
              {forecast.homeCleanSheet === "NO" && forecast.awayCleanSheet === "NO" ? "NINGUNO" : ""}
            </span>
          </div>
        </div>

        {/* Reasoning */}
        <div className="mt-auto space-y-3">
          <p className="font-body text-sm text-text-primary italic border-l-2 border-border pl-3">
            "{forecast.keyFactor}"
          </p>
          <p className="font-body text-sm text-text-soft leading-relaxed">
            {forecast.reasoning}
          </p>
        </div>
      </div>
    </article>
  );
}

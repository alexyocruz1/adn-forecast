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
      <div className="px-4 py-2 bg-bg-card-hover border-b border-border flex justify-between items-center relative group/header">
        <div className="flex flex-col">
          <span className="font-display tracking-wider text-text-soft text-[10px] uppercase">{competition}</span>
          <span className="font-body text-[10px] text-text-muted">{timeString}</span>
        </div>
        
        <button 
          onClick={() => {
            const shareData = {
              title: `Pronóstico: ${homeTeam.name} vs ${awayTeam.name}`,
              text: `IA de ADN Futbolero predice ${forecast.scoreSuggestion} para el ${homeTeam.name} vs ${awayTeam.name}. factor clave: ${forecast.keyFactor}`,
              url: window.location.href,
            };
            if (navigator.share) {
              navigator.share(shareData).catch(console.error);
            } else {
              navigator.clipboard.writeText(window.location.href);
              alert("¡Enlace copiado al portapapeles!");
            }
          }}
          className="p-1.5 rounded-full hover:bg-green-glow/20 text-text-muted hover:text-green-glow transition-all"
          title="Compartir"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        </button>
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

        {/* Elite Context Section */}
        {data.eliteContext && (
          <div className="mt-6 pt-5 border-t border-border/40 animate-in fade-in duration-700">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-1 h-1 rounded-full bg-green-glow shadow-[0_0_8px_rgba(74,222,128,0.8)]"></span>
              <h4 className="font-display text-[9px] uppercase tracking-[0.2em] text-green-glow/80">Análisis de Élite</h4>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {/* Tactics */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-body text-text-muted uppercase tracking-wider">Táctica</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-display text-text-primary">{data.eliteContext.tacticalShape?.home || "4-3-3"}</span>
                  <span className="text-[10px] text-text-muted/40">vs</span>
                  <span className="text-xs font-display text-text-primary">{data.eliteContext.tacticalShape?.away || "4-4-2"}</span>
                </div>
              </div>

              {/* Referee */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-body text-text-muted uppercase tracking-wider">Árbitro</span>
                <div className="flex items-center gap-1.5">
                  <svg className="w-3 h-3 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" />
                  </svg>
                  <span className="text-xs font-display text-text-primary truncate">{data.eliteContext.referee?.name || "Oficial"}</span>
                </div>
              </div>
            </div>

            {/* Momentum Summary */}
            {data.eliteContext.momentum && (
              <div className="mt-3 p-2 bg-bg-deep/50 rounded border border-border/10">
                <p className="text-[10px] font-body text-text-soft leading-tight opacity-80">
                  {data.eliteContext.momentum}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Reasoning */}
        <div className="mt-auto pt-5 space-y-3">
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

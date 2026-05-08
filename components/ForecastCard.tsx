import { useRef, useState } from "react";
import { toJpeg } from "html-to-image";
import Image from "next/image";
import { ForecastResult } from "@/lib/types";

interface Props {
  data: ForecastResult;
}

export default function ForecastCard({ data }: Props) {
  const { matchId, competition, utcDate, homeTeam, awayTeam, forecast } = data;
  const cardRef = useRef<HTMLDivElement>(null);
  const [isSharing, setIsSharing] = useState(false);

  // Always format in UTC — prevents server/client hydration mismatch
  const date = new Date(utcDate);
  const timeString = date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC'
  });

  const matchDateStr = date.toISOString().split('T')[0];
  const todayStr = new Date().toISOString().split('T')[0];
  const showDate = matchDateStr !== todayStr;

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

  const confidenceColor = forecast.confidence === "HIGH"
    ? "text-badge-home border-badge-home"
    : forecast.confidence === "MEDIUM"
      ? "text-badge-draw border-badge-draw"
      : "text-badge-low border-badge-low";

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cardRef.current || isSharing) return;

    try {
      setIsSharing(true);

      const shareTitle = `Pronóstico: ${homeTeam.name} vs ${awayTeam.name}`;
      const shareText = `IA de ADN Futbolero predice ${forecast.scoreSuggestion}.`;

      if (navigator.canShare && navigator.share) {
        // --- NUCLEAR CACHE FIX: Pre-convert images to Data URLs ---
        const convertToDataUrl = async (url: string) => {
          try {
            const response = await fetch(url);
            const blob = await response.blob();
            return new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            });
          } catch (e) {
            console.warn("Failed to pre-convert image:", url, e);
            return url;
          }
        };

        const homeImg = cardRef.current.querySelector(`img[alt="${homeTeam.name}"]`) as HTMLImageElement;
        const awayImg = cardRef.current.querySelector(`img[alt="${awayTeam.name}"]`) as HTMLImageElement;

        let originalHomeSrc = "";
        let originalAwaySrc = "";

        if (homeImg && awayImg) {
          originalHomeSrc = homeImg.src;
          originalAwaySrc = awayImg.src;

          const [homeDataUrl, awayDataUrl] = await Promise.all([
            convertToDataUrl(originalHomeSrc),
            convertToDataUrl(originalAwaySrc)
          ]);

          homeImg.src = homeDataUrl;
          awayImg.src = awayDataUrl;
        }

        // Capture card as JPEG
        const dataUrl = await toJpeg(cardRef.current, {
          quality: 0.9,
          pixelRatio: 2,
          cacheBust: true,
          backgroundColor: '#0a0a0a',
          filter: (node) => {
            const isButton = node instanceof HTMLElement && (node.tagName === 'BUTTON' || node.getAttribute('title') === 'Compartir Pronóstico');
            return !isButton;
          },
        });

        // Restore original sources
        if (homeImg && awayImg) {
          homeImg.src = originalHomeSrc;
          awayImg.src = originalAwaySrc;
        }

        if (dataUrl) {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          const file = new File([blob], `pronostico-${matchId}.jpg`, { type: 'image/jpeg' });

          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
            });
            setIsSharing(false);
            return;
          }
        }
      }

      // Fallback
      if (navigator.share) {
        await navigator.share({
          title: shareTitle,
          text: `${shareTitle}\n${shareText}`,
          url: window.location.href,
        });
      } else {
        await navigator.clipboard.writeText(window.location.href);
        alert("¡Enlace copiado al portapapeles!");
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error("Error sharing:", error);
      }
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <article
      ref={cardRef}
      className={`bg-bg-card rounded-lg overflow-hidden flex flex-col h-full border border-border transition-all duration-300 ${predictionClass}`}
    >
      {/* Header */}
      <div className="px-4 py-2 bg-bg-card-hover border-b border-border flex justify-between items-center relative group/header">
        <div className="flex flex-col">
          <span className="font-display tracking-wider text-text-soft text-[10px] uppercase">{competition}</span>
          <span className="font-body text-[10px] text-text-muted">
            {showDate && (
              <span className="text-green-glow/60 mr-1">{date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'UTC' })} ·</span>
            )}
            {timeString} UTC
          </span>
        </div>

        <button
          onClick={(e) => handleShare(e)}
          disabled={isSharing}
          className={`p-1.5 rounded-full hover:bg-green-glow/20 text-text-muted hover:text-green-glow transition-all ${isSharing ? 'animate-pulse opacity-50' : ''}`}
          title="Compartir Pronóstico"
        >
          {isSharing ? (
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
          )}
        </button>
      </div>

      <div className="p-5 flex-grow flex flex-col">
        {/* Teams & Score Suggestion */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex flex-col items-center gap-2 w-1/3">
            <div className="relative w-12 h-12 flex items-center justify-center">
              <img 
                key={`home-${matchId}`}
                src={homeTeam.crest ? `/_next/image?url=${encodeURIComponent(homeTeam.crest)}&w=128&q=75&v=${matchId}` : '/images/adnlogo.png'} 
                alt={homeTeam.name}
                className="w-12 h-12 object-contain"
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
            <div className="relative w-12 h-12 flex items-center justify-center">
              <img 
                key={`away-${matchId}`}
                src={awayTeam.crest ? `/_next/image?url=${encodeURIComponent(awayTeam.crest)}&w=128&q=75&v=${matchId}` : '/images/adnlogo.png'} 
                alt={awayTeam.name}
                className="w-12 h-12 object-contain"
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

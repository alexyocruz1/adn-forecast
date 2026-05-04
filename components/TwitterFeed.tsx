"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface SocialUpdate {
  id: string;
  type: "x" | "youtube" | "tiktok";
  text: string;
  timestamp: string;
  link: string;
  images: string[];
}

export default function TwitterFeed() {
  const [updates, setUpdates] = useState<SocialUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUpdates() {
      try {
        const res = await fetch("/api/social");
        const data = await res.json();
        setUpdates(data.updates || []);
      } catch (err) {
        console.error("Failed to fetch social updates:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchUpdates();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="w-12 h-12 border-4 border-green-glow/20 border-t-green-glow rounded-full animate-spin"></div>
        <p className="font-body text-text-muted animate-pulse uppercase tracking-widest text-xs">Sincronizando Comunidad Multi-Plataforma...</p>
      </div>
    );
  }

  if (updates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-center px-6 animate-in fade-in zoom-in duration-700">
        <div className="w-20 h-20 bg-green-glow/5 rounded-full flex items-center justify-center mb-6 border border-green-glow/10">
          <span className="text-4xl animate-bounce">📡</span>
        </div>
        <h3 className="font-display text-2xl text-text-primary mb-3 uppercase tracking-tight">Sincronizando la Comunidad</h3>
        <p className="font-body text-sm text-text-soft max-w-sm mx-auto mb-10 leading-relaxed">
          Nuestra IA está recolectando los últimos pronósticos y videos desde X, YouTube y TikTok. <br/>
          <span className="opacity-60 italic text-xs">Estaremos listos en unos minutos.</span>
        </p>
        
        <div className="flex flex-col gap-4">
          <p className="text-[10px] font-display text-text-muted uppercase tracking-[0.3em]">Mientras tanto...</p>
          <a 
            href="https://twitter.com/adn_futbolero_" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 px-8 py-4 bg-white/5 hover:bg-white/10 text-text-primary font-display text-lg uppercase tracking-wider rounded-2xl border border-white/10 transition-all duration-300 shadow-xl"
          >
            Seguir en @adn_futbolero_
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto space-y-12 pb-20">
      <div className="text-center">
        <h2 className="font-display text-4xl tracking-tight text-text-primary mb-2 uppercase">Comunidad ADN</h2>
        <p className="text-sm font-body text-text-soft uppercase tracking-[0.2em] opacity-60">
          X · YouTube · TikTok
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {updates.map((update) => (
          <a 
            key={update.id}
            href={update.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group block bg-bg-card/40 backdrop-blur-md border border-border/40 rounded-3xl overflow-hidden hover:border-green-glow/50 transition-all duration-500 shadow-xl hover:shadow-green-glow/5"
          >
            {update.images && update.images.length > 0 && (
              <div className="relative h-64 w-full overflow-hidden border-b border-border/20 bg-black/20">
                <Image 
                  src={update.images[0]} 
                  alt="Social Media Media" 
                  fill 
                  className="object-contain group-hover:scale-105 transition-transform duration-700"
                  unoptimized
                />
                {update.type === "youtube" && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                      <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white ml-1">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <div className="p-6 flex flex-col h-full">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center border transition-colors ${
                  update.type === "youtube" ? "bg-red-600/10 border-red-600/20" : 
                  update.type === "tiktok" ? "bg-cyan-400/10 border-cyan-400/20" : 
                  "bg-green-glow/10 border-green-glow/20"
                }`}>
                   <span className="text-lg">
                      {update.type === "youtube" ? "📺" : update.type === "tiktok" ? "📱" : "⚽"}
                   </span>
                </div>
                <div>
                  <h4 className="text-sm font-display text-text-primary">
                    {update.type === "youtube" ? "ADN YouTube" : update.type === "tiktok" ? "ADN TikTok" : "ADN Futbolero"}
                  </h4>
                  <p className="text-[10px] font-body text-text-muted uppercase tracking-wider">
                    {new Date(update.timestamp).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <div className="ml-auto">
                   {update.type === "x" && (
                     <svg viewBox="0 0 24 24" className="w-4 h-4 fill-text-muted/40 group-hover:fill-green-glow transition-colors">
                       <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.008 5.961h-1.96z"></path>
                     </svg>
                   )}
                   {update.type === "youtube" && (
                     <svg viewBox="0 0 24 24" className="w-5 h-5 fill-red-600 group-hover:scale-110 transition-transform">
                       <path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 4-8 4z" />
                     </svg>
                   )}
                   {update.type === "tiktok" && (
                     <svg viewBox="0 0 24 24" className="w-5 h-5 fill-text-primary group-hover:scale-110 transition-transform">
                        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1.04-.1z" />
                     </svg>
                   )}
                </div>
              </div>

              <p className="font-body text-text-soft text-sm flex-grow mb-4 leading-relaxed whitespace-pre-wrap line-clamp-6">
                {update.text}
              </p>

              <div className="flex items-center justify-between mt-auto pt-4 border-t border-border/10">
                <span className={`text-[10px] font-display uppercase tracking-widest group-hover:translate-x-1 transition-transform ${
                  update.type === "youtube" ? "text-red-500" : update.type === "tiktok" ? "text-cyan-400" : "text-green-glow"
                }`}>
                  {update.type === "youtube" ? "Ver Video →" : update.type === "tiktok" ? "Ver TikTok →" : "Ver en X →"}
                </span>
                <span className="text-[10px] font-body text-text-muted/40 italic">ADN Multi-Source</span>
              </div>
            </div>
          </a>
        ))}
      </div>

      <div className="p-8 rounded-3xl bg-gradient-to-br from-bg-card to-bg-deep border border-border/20 text-center shadow-2xl">
        <h3 className="font-display text-2xl text-text-primary mb-4 tracking-tight uppercase">¿Quieres unirte a la conversación?</h3>
        <p className="text-sm font-body text-text-soft mb-6 max-w-md mx-auto opacity-70">
          Síguenos en nuestras redes para participar en encuestas, ver análisis exclusivos y recibir alertas de último minuto.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <a 
            href="https://twitter.com/adn_futbolero_" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 px-6 py-3 bg-white/5 hover:bg-white/10 text-text-primary font-display text-sm uppercase tracking-wider rounded-2xl border border-white/10 transition-all duration-300"
          >
            Seguir @adn_futbolero_
          </a>
          <a 
            href="https://www.youtube.com/@ADNFutbolero-7" 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 px-6 py-3 bg-red-600/10 hover:bg-red-600/20 text-red-500 font-display text-sm uppercase tracking-wider rounded-2xl border border-red-600/20 transition-all duration-300"
          >
            YouTube Channel
          </a>
        </div>
      </div>
    </div>
  );
}

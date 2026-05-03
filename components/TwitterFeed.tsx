"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface Tweet {
  id: string;
  text: string;
  timestamp: string;
  link: string;
  images: string[];
}

export default function TwitterFeed() {
  const [tweets, setTweets] = useState<Tweet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTweets() {
      try {
        const res = await fetch("/api/social");
        const data = await res.json();
        setTweets(data.updates || []);
      } catch (err) {
        console.error("Failed to fetch tweets:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchTweets();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <div className="w-12 h-12 border-4 border-green-glow/20 border-t-green-glow rounded-full animate-spin"></div>
        <p className="font-body text-text-muted animate-pulse uppercase tracking-widest text-xs">Sincronizando Comunidad...</p>
      </div>
    );
  }

  if (tweets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-center px-6 animate-in fade-in zoom-in duration-700">
        <div className="w-20 h-20 bg-green-glow/5 rounded-full flex items-center justify-center mb-6 border border-green-glow/10">
          <span className="text-4xl animate-bounce">📡</span>
        </div>
        <h3 className="font-display text-2xl text-text-primary mb-3 uppercase tracking-tight">Sincronizando la Comunidad</h3>
        <p className="font-body text-sm text-text-soft max-w-sm mx-auto mb-10 leading-relaxed">
          Nuestra IA está recolectando los últimos pronósticos y debates desde X. <br/>
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
            <svg viewBox="0 0 24 24" aria-hidden="true" className="w-5 h-5 fill-current">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.008 5.961h-1.96z"></path>
            </svg>
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
          Pronósticos en tiempo real & Novedades
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {tweets.map((tweet) => (
          <a 
            key={tweet.id}
            href={tweet.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group block bg-bg-card/40 backdrop-blur-md border border-border/40 rounded-3xl overflow-hidden hover:border-green-glow/50 transition-all duration-500 shadow-xl hover:shadow-green-glow/5"
          >
            {tweet.images && tweet.images.length > 0 && (
              <div className="relative h-64 w-full overflow-hidden border-b border-border/20 bg-black/20">
                <Image 
                  src={tweet.images[0]} 
                  alt="Tweet Media" 
                  fill 
                  className="object-contain group-hover:scale-105 transition-transform duration-700"
                  unoptimized
                />
              </div>
            )}
            
            <div className="p-6 flex flex-col h-full">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-green-glow/10 flex items-center justify-center border border-green-glow/20">
                   <span className="text-lg">🤖</span>
                </div>
                <div>
                  <h4 className="text-sm font-display text-text-primary">ADN Futbolero</h4>
                  <p className="text-[10px] font-body text-text-muted uppercase tracking-wider">
                    {new Date(tweet.timestamp).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <div className="ml-auto">
                   <svg viewBox="0 0 24 24" className="w-4 h-4 fill-text-muted/40 group-hover:fill-green-glow transition-colors">
                     <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.008 5.961h-1.96z"></path>
                   </svg>
                </div>
              </div>

              <p className="font-body text-text-soft text-sm flex-grow mb-4 leading-relaxed whitespace-pre-wrap">
                {tweet.text}
              </p>

              <div className="flex items-center justify-between mt-auto pt-4 border-t border-border/10">
                <span className="text-[10px] font-display text-green-glow uppercase tracking-widest group-hover:translate-x-1 transition-transform">Ver en X.com →</span>
                <span className="text-[10px] font-body text-text-muted/40 italic">ADN Forecast System</span>
              </div>
            </div>
          </a>
        ))}
      </div>

      <div className="p-8 rounded-3xl bg-gradient-to-br from-bg-card to-bg-deep border border-border/20 text-center shadow-2xl">
        <h3 className="font-display text-2xl text-text-primary mb-4">¿Quieres unirte a la conversación?</h3>
        <p className="text-sm font-body text-text-soft mb-6 max-w-md mx-auto">
          Síguenos en X para participar en encuestas, ver análisis exclusivos y recibir alertas de último minuto.
        </p>
        <a 
          href="https://twitter.com/adn_futbolero_" 
          target="_blank" 
          rel="noopener noreferrer"
          className="inline-flex items-center gap-3 px-8 py-3 bg-green-brand text-white font-display text-lg uppercase tracking-wider rounded-full hover:bg-green-glow hover:text-bg-primary transition-all duration-300 shadow-[0_0_20px_rgba(34,197,94,0.3)]"
        >
          Seguir @adn_futbolero_
        </a>
      </div>
    </div>
  );
}

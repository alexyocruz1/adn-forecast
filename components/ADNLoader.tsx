"use client";

import Image from "next/image";

export default function ADNLoader() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-bg-deep/80 backdrop-blur-md transition-all duration-500">
      <div className="relative">
        <div className="absolute inset-0 rounded-full bg-green-glow/20 animate-ping duration-[3000ms]"></div>
        <div className="absolute -inset-4 rounded-full border border-green-glow/10 animate-pulse"></div>
        
        <div className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-full overflow-hidden border-2 border-green-brand/30 bg-bg-card shadow-[0_0_50px_rgba(34,197,94,0.2)] animate-bounce-subtle">
          <Image 
            src="/images/adnlogo.png" 
            alt="Loading ADN Futbolero" 
            fill
            priority
            className="object-cover scale-110"
            onError={(e) => {
               e.currentTarget.style.display = 'none';
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-4xl select-none pointer-events-none opacity-0 hover:opacity-100 transition-opacity">
            ⚽
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center gap-2">
        <h2 className="font-display text-xl sm:text-2xl tracking-[0.2em] text-text-primary animate-pulse">
          ANALIZANDO
        </h2>
        <div className="flex gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-glow animate-bounce [animation-delay:-0.3s]"></div>
          <div className="w-1.5 h-1.5 rounded-full bg-green-glow animate-bounce [animation-delay:-0.15s]"></div>
          <div className="w-1.5 h-1.5 rounded-full bg-green-glow animate-bounce"></div>
        </div>
        <p className="font-body text-xs text-text-muted uppercase tracking-widest mt-4 opacity-60">
          IA de ADN Futbolero
        </p>
      </div>
    </div>
  );
}

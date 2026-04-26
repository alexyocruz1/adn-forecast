"use client";

import Image from "next/image";

export default function Header() {
  const today = new Date();
  const dateOptions: Intl.DateTimeFormatOptions = { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long' 
  };
  const formattedDate = today.toLocaleDateString('es-ES', dateOptions);
  
  // Capitalize first letter
  const displayDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

  return (
    <header className="w-full border-b border-border bg-bg-primary/80 backdrop-blur-md sticky top-0 z-50">
      {/* Top accent bar */}
      <div className="h-1 w-full bg-gradient-to-r from-accent-green via-accent-yellow to-accent-blue"></div>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex justify-between items-center">
          
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-full overflow-hidden bg-bg-card border border-border">
              <Image 
                src="/logo.png" 
                alt="ADN Futbolero Logo" 
                fill 
                sizes="(max-width: 768px) 32px, 48px"
                className="object-cover"
                onError={(e) => {
                  // Fallback if logo doesn't exist yet
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
            <div>
              <h1 className="font-display text-2xl tracking-wide text-text-primary m-0 leading-none">
                ADN FUTBOLERO
              </h1>
              <p className="font-body text-xs text-text-secondary mt-1 hidden sm:block">
                Pronósticos con inteligencia artificial
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden md:block font-body text-sm text-text-secondary">
              {displayDate}
            </div>
            
            <a 
              href="https://twitter.com/adn_futbolero_" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-bg-card hover:bg-bg-card-hover border border-border px-4 py-2 rounded-full transition-colors text-sm font-body font-medium"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4 fill-current">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.008 5.961h-1.96z"></path>
              </svg>
              <span className="hidden sm:inline">@adn_futbolero_</span>
            </a>
          </div>

        </div>
      </div>
    </header>
  );
}

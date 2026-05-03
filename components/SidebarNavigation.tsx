"use client";

import { useState, useEffect, useTransition } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import ADNLoader from "./ADNLoader";

interface LeagueInfo {
  code: string;
  name: string;
}

interface SidebarNavigationProps {
  todayLeagues: LeagueInfo[];
  tomorrowLeagues: LeagueInfo[];
  todayStr: string;
  tomorrowStr: string;
}

export default function SidebarNavigation({
  todayLeagues,
  tomorrowLeagues,
  todayStr,
  tomorrowStr
}: SidebarNavigationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const activeDate = searchParams.get("date");
  const activeLeague = searchParams.get("league");

  // Close sidebar when clicking outside
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  // Use a custom event to toggle the sidebar from the Header
  useEffect(() => {
    const handleToggle = () => setIsOpen(prev => !prev);
    window.addEventListener("toggle-sidebar", handleToggle);
    return () => window.removeEventListener("toggle-sidebar", handleToggle);
  }, []);

  // Lock scroll on mobile when sidebar is open
  useEffect(() => {
    if (isOpen && window.innerWidth < 1280) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [isOpen]);

  const isActive = (date?: string, league?: string) => {
    if (!date && !league) return !activeDate && !activeLeague;
    return activeDate === date && activeLeague === league;
  };

  // Custom navigation handler to show the loader
  const navigate = (href: string) => {
    setIsOpen(false);
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <>
      {/* Navigation Loader Overlay */}
      {isPending && <ADNLoader />}

      {/* Overlay (Mobile/Tablet) */}
      {isOpen && (
        <div 
          className="fixed xl:hidden inset-0 bg-bg-deep/60 backdrop-blur-sm z-[60] transition-opacity duration-300"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside 
        className={`fixed xl:sticky top-0 left-0 h-screen w-[280px] bg-bg-card/90 xl:bg-bg-card/40 backdrop-blur-xl border-r border-border z-[70] transition-all duration-500 ease-out shadow-2xl xl:shadow-none ${
          isOpen ? "translate-x-0" : "-translate-x-full xl:translate-x-0"
        }`}
      >
        <div className="flex flex-col h-full p-6">
          {/* Sidebar Header */}
          <div className="flex justify-between items-center mb-10">
            <h2 className="font-display text-xl tracking-tight text-text-primary">Explorar</h2>
            {/* Close button - only functional when NOT persistent */}
            <button 
              onClick={() => setIsOpen(false)}
              className="xl:hidden p-2 rounded-full hover:bg-bg-card-hover text-text-muted transition-colors"
              aria-label="Close menu"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <nav className="flex-grow overflow-y-auto space-y-8 custom-scrollbar pr-2">
            {/* View All Option */}
            <button 
              onClick={() => navigate("/")}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-300 font-body text-sm ${
                isActive() 
                  ? "bg-green-glow/10 text-green-glow border border-green-glow/20" 
                  : "text-text-muted hover:bg-bg-card-hover border border-transparent text-left"
              }`}
            >
              <span className="text-lg">🏠</span>
              <span className="font-medium tracking-wide uppercase">Ver Todo</span>
            </button>

            {/* Today Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-brand"></span>
                  <h3 className="font-display text-xs uppercase tracking-widest text-text-muted/60">HOY</h3>
                </div>
                <button 
                  onClick={() => navigate(`/?date=${todayStr}`)}
                  className={`text-[10px] font-body uppercase tracking-tighter hover:text-green-glow transition-colors ${
                    activeDate === todayStr && !activeLeague ? "text-green-glow font-bold" : "text-text-muted/40"
                  }`}
                >
                  Ver Todo
                </button>
              </div>
              <div className="space-y-1 ml-3 text-left">
                {todayLeagues.map(league => (
                  <button
                    key={`today-${league.code}`}
                    onClick={() => navigate(`/?date=${todayStr}&league=${league.code}`)}
                    className={`w-full block text-left py-2 px-4 rounded-lg font-body text-sm transition-all ${
                      isActive(todayStr, league.code)
                        ? "text-green-glow bg-green-glow/5 font-medium border-l-2 border-green-glow"
                        : "text-text-soft hover:text-text-primary hover:bg-bg-card-hover"
                    }`}
                  >
                    {league.name}
                  </button>
                ))}
                {todayLeagues.length === 0 && (
                  <p className="text-[10px] text-text-muted italic px-4">No hay partidos hoy</p>
                )}
              </div>
            </div>

            {/* Tomorrow Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-text-muted/40"></span>
                  <h3 className="font-display text-xs uppercase tracking-widest text-text-muted/60">MAÑANA</h3>
                </div>
                <button 
                  onClick={() => navigate(`/?date=${tomorrowStr}`)}
                  className={`text-[10px] font-body uppercase tracking-tighter hover:text-green-glow transition-colors ${
                    activeDate === tomorrowStr && !activeLeague ? "text-green-glow font-bold" : "text-text-muted/40"
                  }`}
                >
                  Ver Todo
                </button>
              </div>
              <div className="space-y-1 ml-3 text-left">
                {tomorrowLeagues.map(league => (
                  <button
                    key={`tomorrow-${league.code}`}
                    onClick={() => navigate(`/?date=${tomorrowStr}&league=${league.code}`)}
                    className={`w-full block text-left py-2 px-4 rounded-lg font-body text-sm transition-all ${
                      isActive(tomorrowStr, league.code)
                        ? "text-green-glow bg-green-glow/5 font-medium border-l-2 border-green-glow"
                        : "text-text-soft hover:text-text-primary hover:bg-bg-card-hover"
                    }`}
                  >
                    {league.name}
                  </button>
                ))}
                {tomorrowLeagues.length === 0 && (
                  <p className="text-[10px] text-text-muted italic px-4">No hay partidos mañana</p>
                )}
              </div>
            </div>
          </nav>

          {/* Footer of Sidebar */}
          <div className="mt-auto pt-6 border-t border-border/40">
             <p className="text-[10px] font-body text-text-muted/50 text-center uppercase tracking-widest">
               ADN Futbolero Navigation
             </p>
          </div>
        </div>
      </aside>
    </>
  );
}

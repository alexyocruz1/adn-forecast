import { Suspense } from "react";
import Header from "@/components/Header";
import ForecastGrid from "@/components/ForecastGrid";
import LoadingState from "@/components/LoadingState";
import { ForecastResult } from "@/lib/types";

// Force dynamic since we want to always get the latest data or cache logic from API
export const dynamic = "force-dynamic";

async function getForecasts(): Promise<ForecastResult[]> {
  try {
    // In production we would call an absolute URL, but for relative we need headers
    // Using a direct relative fetch in Next App Router sometimes requires the absolute origin.
    // For simplicity we will build the full URL or we can directly import the data logic.
    // But per spec, we fetch from /api/forecasts. We use NEXT_PUBLIC_VERCEL_URL if available.
    
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'http://localhost:3000';
      
    const res = await fetch(`${baseUrl}/api/forecasts`, {
      cache: 'no-store'
    });
    
    if (!res.ok) throw new Error("Failed to fetch forecasts");
    
    const data = await res.json();
    return data.forecasts || [];
  } catch (error) {
    console.error("Error fetching forecasts:", error);
    return [];
  }
}

// Wrapper to handle the async fetch and suspense boundary
async function ForecastsWrapper() {
  const forecasts = await getForecasts();
  return <ForecastGrid forecasts={forecasts} />;
}

export default function Home() {
  const today = new Date();
  const dateOptions: Intl.DateTimeFormatOptions = { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long' 
  };
  const formattedDate = today.toLocaleDateString('es-ES', dateOptions);
  const displayDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

  return (
    <>
      <Header />
      
      <main className="flex-grow max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h2 className="font-display tracking-widest text-text-secondary text-lg mb-2">
            PRONÓSTICOS DE HOY
          </h2>
          <p className="font-body text-text-primary text-2xl font-light">
            {displayDate}
          </p>
        </div>

        <Suspense fallback={<LoadingState />}>
          <ForecastsWrapper />
        </Suspense>
      </main>

      <footer className="border-t border-border bg-bg-card py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-display tracking-wide text-xl text-text-primary">ADN FUTBOLERO</span>
          </div>
          
          <div className="flex items-center gap-2 text-text-secondary text-sm font-body">
            <span>Powered by AI</span>
            <span className="w-1 h-1 rounded-full bg-border"></span>
            <a href="https://twitter.com/adn_futbolero_" target="_blank" rel="noreferrer" className="hover:text-text-primary transition-colors">
              @adn_futbolero_
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}

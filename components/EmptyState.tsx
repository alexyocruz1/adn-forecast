export default function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="w-20 h-20 mb-6 bg-bg-card rounded-full flex items-center justify-center border border-border animate-bounce">
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width="40" 
          height="40" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="1.5" 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          className="text-text-muted"
        >
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 12l3.5-2.5"/>
          <path d="M12 12l-3.5-2.5"/>
          <path d="M12 12v4"/>
          <path d="M12 16l-3 2.5"/>
          <path d="M12 16l3 2.5"/>
          <path d="M8.5 9.5L5 12"/>
          <path d="M15.5 9.5L19 12"/>
        </svg>
      </div>
      <h2 className="font-display text-3xl mb-2 text-text-primary">Sin partidos programados</h2>
      <p className="font-body text-text-secondary max-w-md">
        No hay partidos programados para hoy en nuestras competiciones cubiertas. Vuelve mañana para nuevos pronósticos.
      </p>
    </div>
  );
}

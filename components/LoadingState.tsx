export default function LoadingState() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div 
          key={i} 
          className="bg-bg-card border border-border rounded-lg overflow-hidden flex flex-col h-[350px] animate-pulse"
        >
          {/* Header */}
          <div className="h-10 bg-border/50 border-b border-border"></div>
          
          {/* Body */}
          <div className="p-5 flex-grow flex flex-col justify-between">
            {/* Teams */}
            <div className="flex justify-between items-center mb-6">
              <div className="w-12 h-12 bg-border/50 rounded-full"></div>
              <div className="w-24 h-12 bg-border/50 rounded-md"></div>
              <div className="w-12 h-12 bg-border/50 rounded-full"></div>
            </div>
            
            {/* Badges */}
            <div className="flex justify-center gap-2 mb-6">
              <div className="w-24 h-6 bg-border/50 rounded-full"></div>
              <div className="w-16 h-6 bg-border/50 rounded-full"></div>
            </div>
            
            {/* Text lines */}
            <div className="space-y-3">
              <div className="w-3/4 h-4 bg-border/50 rounded"></div>
              <div className="w-full h-4 bg-border/50 rounded"></div>
              <div className="w-5/6 h-4 bg-border/50 rounded"></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

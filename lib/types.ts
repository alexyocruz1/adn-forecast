export interface TeamStats {
  id: number;
  name: string;
  crest: string; // URL to team crest image
  position: number;
  points: number;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  form: string; // e.g. "WWDLW"
  cleanSheets: number;
  failedToScore: number;
  yellowCards: number;
  redCards: number;
}

export interface Match {
  id: number;
  competition: string;
  competitionCode: string;
  utcDate: string; // ISO date string
  season: number;
  homeTeam: TeamStats;
  awayTeam: TeamStats;
}

export interface ForecastResult {
  matchId: number;
  competition: string;
  competitionCode: string;
  utcDate: string;
  homeTeam: TeamStats;
  awayTeam: TeamStats;
  forecast: {
    matchWinner: "HOME" | "AWAY" | "DRAW";
    doubleChance: "1X" | "X2" | "12";
    overUnder25: "OVER" | "UNDER";
    btts: "YES" | "NO";
    homeCleanSheet: "YES" | "NO";
    awayCleanSheet: "YES" | "NO";
    confidence: "HIGH" | "MEDIUM" | "LOW";
    reasoning: string; // 2-3 sentences in Spanish (for ADN Futbolero audience)
    scoreSuggestion: string; // e.g. "2-1"
    keyFactor: string; // One-line highlight, e.g. "Home team on 5-game win streak"
  };
  generatedAt: string; // ISO timestamp
}

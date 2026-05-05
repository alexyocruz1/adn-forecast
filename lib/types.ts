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

export interface EliteContext {
  referee?: {
    name: string;
    yellowCardsAvg?: number;
    redCardsTotal?: number;
    redCardsAvg?: number;
  };
  round?: string;
  tacticalShape?: {
    home: string; // e.g. "4-3-3"
    away: string; // e.g. "4-4-2"
  };
  venueStrength?: {
    homeGoalsAvg: number;
    awayGoalsAvg: number;
  };
  competitionSplit?: {
    uclGoalsAvg?: number;
    leagueGoalsAvg?: number;
  };
  momentum?: string; // One-line trend summary
  h2h?: {
    homeWins: number;
    awayWins: number;
    draws: number;
  };
}

export interface Match {
  id: number;
  competition: string;
  competitionCode: string;
  utcDate: string; // ISO date string
  season: number;
  homeTeam: TeamStats;
  awayTeam: TeamStats;
  eliteContext?: EliteContext;
}

export interface ForecastResult {
  matchId: number;
  competition: string;
  competitionCode: string;
  utcDate: string;
  homeTeam: TeamStats;
  awayTeam: TeamStats;
  eliteContext?: EliteContext;
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

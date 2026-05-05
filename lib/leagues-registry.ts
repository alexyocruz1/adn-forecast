/**
 * CENTRAL LEAGUE REGISTRY
 * To add a new competition, simply add an entry to this object.
 * The 'besoccerPath' is the URL segment used on besoccer.com/livescore/[league]
 */
export const LEAGUE_REGISTRY = {
  // European Giants
  "UCL": { name: "Champions League", besoccerPath: "champions_league" },
  "UEL": { name: "Europa League", besoccerPath: "uefa_europa_league" },
  "UECL": { name: "Conference League", besoccerPath: "uefa_conference_league" },
  
  // Top 5 Domestic
  "PL": { name: "Premier League", besoccerPath: "premier_league" },
  "PD": { name: "La Liga", besoccerPath: "primera_division" },
  "SA": { name: "Serie A", besoccerPath: "serie_a" },
  "BL1": { name: "Bundesliga", besoccerPath: "bundesliga" },
  "FL1": { name: "Ligue 1", besoccerPath: "ligue_1" },
  
  // Others
  "DED": { name: "Eredivisie", besoccerPath: "eredivisie" },
  "PPL": { name: "Liga Portugal", besoccerPath: "primeira_liga" },
  "CL": { name: "Copa Libertadores", besoccerPath: "copa_libertadores" },
  "WC": { name: "World Cup", besoccerPath: "world_cup" },
  "EC": { name: "Euro", besoccerPath: "eurocopa" }
};

export type LeagueCode = keyof typeof LEAGUE_REGISTRY;

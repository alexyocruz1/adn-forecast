import { Match, TeamStats } from "./types";

const BASE_URL = "https://v3.football.api-sports.io";

// Mapping of our target competitions to API-Football league IDs
const LEAGUE_IDS = [
  39,  // PL
  140, // PD
  78,  // BL1
  135, // SA
  61,  // FL1
  2,   // CL
  40,  // ELC
  94,  // PPL
  88,  // DED
  71,  // BSA
  1,   // WC
  4    // EC
];

const headers: HeadersInit = {
  "x-apisports-key": process.env.API_FOOTBALL_KEY!,
};

/**
 * Sleep utility to respect rate limits
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch with retry logic for rate-limited API calls.
 */
async function fetchWithRetry(url: string, maxRetries: number = 3): Promise<any> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, { headers });
    const data = await response.json();
    
    // API-Football specific rate limit checking
    if (data.errors && data.errors.requests) {
       console.warn(`[football] Rate limited on ${url}: ${data.errors.requests}`);
       await sleep(5000);
       continue;
    }

    const remainingStr = response.headers.get("x-ratelimit-requests-remaining");
    const remaining = remainingStr ? parseInt(remainingStr, 10) : 100;
    
    if (remaining <= 10) {
      console.warn(`[football] CRITICAL: Only ${remaining} daily requests remaining!`);
    }

    return data;
  }
  throw new Error(`[football] Max retries exceeded for ${url}`);
}

/**
 * Returns top matches scheduled for today (Capped at 15 to save API calls)
 */
export async function getTodaysMatches(): Promise<Match[]> {
  const today = new Date().toISOString().split("T")[0];
  
  const data = await fetchWithRetry(`${BASE_URL}/fixtures?date=${today}`);
  
  if (!data || !data.response) {
    return [];
  }
  
  const allFixtures = data.response;
  
  // Filter for our target leagues
  const targetFixtures = allFixtures.filter((f: any) => LEAGUE_IDS.includes(f.league.id));
  
  // Slice to max 15 to save API calls (1 fixture = 2 team stat calls)
  // Max requests used per day will be 1 (fixtures) + 30 (stats) = 31 requests. Well within 100 limit.
  const topFixtures = targetFixtures.slice(0, 15);
  
  return topFixtures.map((f: any) => ({
    id: f.fixture.id,
    competition: f.league.name,
    competitionCode: f.league.id.toString(),
    utcDate: f.fixture.date,
    season: f.league.season,
    homeTeam: {
      id: f.teams.home.id,
      name: f.teams.home.name,
      crest: f.teams.home.logo,
      position: 0, points: 0, played: 0, won: 0, draw: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, goalDifference: 0, form: "",
      cleanSheets: 0, failedToScore: 0, yellowCards: 0, redCards: 0
    },
    awayTeam: {
      id: f.teams.away.id,
      name: f.teams.away.name,
      crest: f.teams.away.logo,
      position: 0, points: 0, played: 0, won: 0, draw: 0, lost: 0,
      goalsFor: 0, goalsAgainst: 0, goalDifference: 0, form: "",
      cleanSheets: 0, failedToScore: 0, yellowCards: 0, redCards: 0
    }
  }));
}

/**
 * Returns granular team statistics
 */
export async function getTeamStats(leagueId: string, teamId: number, season: number): Promise<TeamStats | null> {
  const data = await fetchWithRetry(`${BASE_URL}/teams/statistics?league=${leagueId}&team=${teamId}&season=${season}`);
  
  if (!data || !data.response || !data.response.fixtures) {
    return null;
  }
  
  const stats = data.response;
  const fix = stats.fixtures;
  const goals = stats.goals;
  
  const played = fix.played.total || 0;
  if (played === 0) return null; // No stats yet
  
  const won = fix.wins.total || 0;
  const draw = fix.draws.total || 0;
  const lost = fix.loses.total || 0;
  
  const goalsFor = goals.for.total.total || 0;
  const goalsAgainst = goals.against.total.total || 0;
  
  // API-Football returns Clean Sheets and Failed To Score
  const cleanSheets = stats.clean_sheet.total || 0;
  const failedToScore = stats.failed_to_score.total || 0;
  
  // Sum cards
  let yellowCards = 0;
  if (stats.cards && stats.cards.yellow) {
     for (const key in stats.cards.yellow) {
        yellowCards += (stats.cards.yellow[key].total || 0);
     }
  }
  let redCards = 0;
  if (stats.cards && stats.cards.red) {
     for (const key in stats.cards.red) {
        redCards += (stats.cards.red[key].total || 0);
     }
  }

  return {
    id: stats.team.id,
    name: stats.team.name,
    crest: stats.team.logo,
    position: 0, // Using points as primary strength indicator to save /standings API calls
    points: (won * 3) + draw,
    played,
    won,
    draw,
    lost,
    goalsFor,
    goalsAgainst,
    goalDifference: goalsFor - goalsAgainst,
    form: stats.form || "",
    cleanSheets,
    failedToScore,
    yellowCards,
    redCards
  };
}

/**
 * Combines matches + stats into enriched Match objects.
 */
export async function getEnrichedMatches(): Promise<Match[]> {
  const matches = await getTodaysMatches();

  if (matches.length === 0) return [];

  const enriched: Match[] = [];
  
  for (const match of matches) {
    if (!match.season || !match.homeTeam.id || !match.awayTeam.id) {
       enriched.push(match);
       continue;
    }
    
    // Fetch home team stats
    const homeStats = await getTeamStats(match.competitionCode, match.homeTeam.id, match.season);
    await sleep(500); // Small delay to prevent rapid burst
    
    // Fetch away team stats
    const awayStats = await getTeamStats(match.competitionCode, match.awayTeam.id, match.season);
    await sleep(500);
    
    enriched.push({
      ...match,
      homeTeam: homeStats || match.homeTeam,
      awayTeam: awayStats || match.awayTeam,
    });
  }

  return enriched;
}

import { TeamStats, Match } from "./types";

const BASE_URL = "https://api.football-data.org/v4";

// All 11 competitions available on the football-data.org free tier.
// EC (European Championship) omitted — not active until 2028.
const TARGET_LEAGUES = [
  "PL",  // Premier League
  "PD",  // La Liga
  "SA",  // Serie A
  "BL1", // Bundesliga
  "FL1", // Ligue 1
  "DED", // Eredivisie
  "PPL", // Primeira Liga
  "ELC", // Championship
  "BSA", // Campeonato Brasileiro Série A
  "CL",  // UEFA Champions League
  "WC",  // FIFA World Cup 2026
  "EC",  // European Championship
];

/**
 * Utility to sleep for rate limiting
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Robust fetch with X-Auth-Token and 429 handling
 */
async function fetchWithRetry(endpoint: string, retries = 3): Promise<any> {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  const url = `${BASE_URL}${endpoint}`;

  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: { 'X-Auth-Token': apiKey || '' },
        next: { revalidate: 3600 }
      });

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 15000;
        console.warn(`[football] Rate limit hit on ${endpoint}, waiting ${waitTime}ms...`);
        await sleep(waitTime);
        continue;
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(2000 * (i + 1));
    }
  }
}

/**
 * Fetches today's matches for a specific league
 */
async function getLeagueMatches(leagueCode: string, date: string): Promise<Match[]> {
  try {
    const data = await fetchWithRetry(`/competitions/${leagueCode}/matches?dateFrom=${date}&dateTo=${date}`);
    if (!data || !data.matches) return [];

    return data.matches.map((m: any) => ({
      id: m.id,
      competition: m.competition.name,
      competitionCode: m.competition.code,
      utcDate: m.utcDate,
      season: m.season.startYear,
      homeTeam: {
        id: m.homeTeam.id, name: m.homeTeam.name, crest: m.homeTeam.crest,
        position: 0, points: 0, played: 0, won: 0, draw: 0, lost: 0,
        goalsFor: 0, goalsAgainst: 0, goalDifference: 0, form: "",
        cleanSheets: 0, failedToScore: 0, yellowCards: 0, redCards: 0
      },
      awayTeam: {
        id: m.awayTeam.id, name: m.awayTeam.name, crest: m.awayTeam.crest,
        position: 0, points: 0, played: 0, won: 0, draw: 0, lost: 0,
        goalsFor: 0, goalsAgainst: 0, goalDifference: 0, form: "",
        cleanSheets: 0, failedToScore: 0, yellowCards: 0, redCards: 0
      }
    }));
  } catch (error) {
    console.error(`[football] Error in league ${leagueCode}:`, error);
    return [];
  }
}

/**
 * Fetches today's matches using parallel requests
 */
export async function getTodaysMatches(): Promise<Match[]> {
  const today = new Date().toISOString().split('T')[0];
  console.log(`[football] Searching for matches on ${today} (sequential, rate-limited)...`);

  // Sequential fetching with a sleep between requests.
  // The free tier allows 10 req/min — 6.5s gap keeps us safely under that.
  const allMatches: Match[] = [];
  for (const code of TARGET_LEAGUES) {
    const matches = await getLeagueMatches(code, today);
    allMatches.push(...matches);
    await sleep(6500);
  }

  console.log(`[football] Found ${allMatches.length} total matches across ${TARGET_LEAGUES.length} leagues.`);
  return allMatches;
}

/**
 * Hydrates matches with standings
 */
export async function getEnrichedMatches(): Promise<Match[]> {
  const matches = await getTodaysMatches();
  if (matches.length === 0) return [];

  const enriched: Match[] = [];
  const standingsCache = new Map<string, any>();

  // Only hydrate leagues that actually have matches today
  const activeLeagues = Array.from(new Set(matches.map(m => m.competitionCode)));

  console.log(`[football] Hydrating matches for ${activeLeagues.length} active leagues...`);

  for (const match of matches) {
    let standings = standingsCache.get(match.competitionCode);
    if (!standings) {
      standings = await fetchWithRetry(`/competitions/${match.competitionCode}/standings`);
      standingsCache.set(match.competitionCode, standings);
      // Small sleep between standings to avoid hitting the 10/min burst limit too hard
      await sleep(1000);
    }

    const table = standings?.standings?.[0]?.table || [];
    const homeEntry = table.find((t: any) => t.team.id === match.homeTeam.id);
    const awayEntry = table.find((t: any) => t.team.id === match.awayTeam.id);

    const hydrateTeam = (team: any, entry: any): TeamStats => {
      if (!entry) return team;
      return {
        ...team,
        position: entry.position, played: entry.playedGames,
        won: entry.won, draw: entry.draw, lost: entry.lost,
        points: entry.points, goalsFor: entry.goalsFor,
        goalsAgainst: entry.goalsAgainst, goalDifference: entry.goalDifference,
        form: entry.form || ""
      };
    };

    enriched.push({
      ...match,
      homeTeam: hydrateTeam(match.homeTeam, homeEntry),
      awayTeam: hydrateTeam(match.awayTeam, awayEntry)
    });
  }

  return enriched;
}

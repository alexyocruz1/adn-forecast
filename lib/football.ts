import { TeamStats, Match } from "./types";

const BASE_URL = "https://api.football-data.org/v4";

// Target leagues (football-data.org codes)
const TARGET_LEAGUES = ["PL", "PD", "SA", "BL1", "FL1", "DED", "PPL", "ELC", "BSA"];

/**
 * Utility to sleep for rate limiting (football-data has a strict 10 req/min limit on free tier)
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Robust fetch with X-Auth-Token
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
        console.warn(`[football] Rate limit hit (football-data), sleeping...`);
        await sleep(60000); 
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
 * Fetches today's matches for all tracked leagues by querying each league individually.
 * This bypasses the restrictions on the global /matches endpoint.
 */
export async function getTodaysMatches(): Promise<Match[]> {
  const today = new Date().toISOString().split('T')[0];
  const allMatches: Match[] = [];

  console.log(`[football] Fetching matches for ${TARGET_LEAGUES.length} leagues...`);

  for (const leagueCode of TARGET_LEAGUES) {
    try {
      const data = await fetchWithRetry(`/competitions/${leagueCode}/matches?dateFrom=${today}&dateTo=${today}`);
      
      if (data && data.matches) {
        const mapped = data.matches.map((m: any) => ({
          id: m.id,
          competition: m.competition.name,
          competitionCode: m.competition.code,
          utcDate: m.utcDate,
          season: m.season.startYear,
          homeTeam: {
            id: m.homeTeam.id,
            name: m.homeTeam.name,
            crest: m.homeTeam.crest,
            position: 0, points: 0, played: 0, won: 0, draw: 0, lost: 0,
            goalsFor: 0, goalsAgainst: 0, goalDifference: 0, form: "",
            cleanSheets: 0, failedToScore: 0, yellowCards: 0, redCards: 0
          },
          awayTeam: {
            id: m.awayTeam.id,
            name: m.awayTeam.name,
            crest: m.awayTeam.crest,
            position: 0, points: 0, played: 0, won: 0, draw: 0, lost: 0,
            goalsFor: 0, goalsAgainst: 0, goalDifference: 0, form: "",
            cleanSheets: 0, failedToScore: 0, yellowCards: 0, redCards: 0
          }
        }));
        allMatches.push(...mapped);
      }
      
      // Respect the 10 req/min limit (6 seconds between requests)
      await sleep(6500); 
    } catch (error) {
      console.error(`[football] Error fetching matches for ${leagueCode}:`, error);
    }
  }

  return allMatches;
}

/**
 * Hydrates team stats from league standings
 */
async function getLeagueStandings(leagueCode: string): Promise<any> {
  return await fetchWithRetry(`/competitions/${leagueCode}/standings`);
}

/**
 * Main pipeline: fetches fixtures and hydrates with standings data
 */
export async function getEnrichedMatches(): Promise<Match[]> {
  const matches = await getTodaysMatches();
  if (matches.length === 0) return [];

  const enriched: Match[] = [];
  const standingsCache = new Map<string, any>();

  console.log(`[football] Hydrating ${matches.length} matches from standings...`);

  for (const match of matches) {
    // 1. Get standings for this competition (using cache to save requests)
    let standings = standingsCache.get(match.competitionCode);
    if (!standings) {
      standings = await getLeagueStandings(match.competitionCode);
      standingsCache.set(match.competitionCode, standings);
      await sleep(6500); 
    }

    const table = standings?.standings?.[0]?.table || [];
    
    // 2. Find teams in table
    const homeEntry = table.find((t: any) => t.team.id === match.homeTeam.id);
    const awayEntry = table.find((t: any) => t.team.id === match.awayTeam.id);

    // 3. Map standings to TeamStats
    const hydrateTeam = (team: any, entry: any): TeamStats => {
      if (!entry) return team;
      return {
        ...team,
        position: entry.position,
        played: entry.playedGames,
        won: entry.won,
        draw: entry.draw,
        lost: entry.lost,
        points: entry.points,
        goalsFor: entry.goalsFor,
        goalsAgainst: entry.goalsAgainst,
        goalDifference: entry.goalDifference,
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

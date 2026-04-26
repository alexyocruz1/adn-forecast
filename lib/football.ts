import { TeamStats, Match, ForecastResult } from "./types";

const BASE_URL = "https://v3.football.api-sports.io";

// Optimized list of top leagues to stay within 100 req/day
const LEAGUE_IDS = [39, 140, 135, 78, 61, 88, 94, 40, 71];

/**
 * Utility to sleep for rate limiting
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Robust fetch with retries and API keys
 */
async function fetchWithRetry(url: string, retries = 3): Promise<any> {
  const apiKey = process.env.API_FOOTBALL_KEY;
  
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          'x-apisports-key': apiKey || '',
          'x-rapidapi-host': 'v3.football.api-sports.io'
        },
        next: { revalidate: 3600 }
      });

      if (response.status === 429) {
        await sleep(2000 * (i + 1));
        continue;
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      return data;
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(1000 * (i + 1));
    }
  }
}

/**
 * Fetches top matches for today
 */
export async function getTodaysMatches(): Promise<Match[]> {
  const today = new Date().toISOString().split('T')[0];
  const url = `${BASE_URL}/fixtures?date=${today}`;
  
  const data = await fetchWithRetry(url);
  
  if (!data || !data.response) return [];

  const filtered = data.response.filter((f: any) => {
    return LEAGUE_IDS.includes(f.league.id);
  });

  const topMatches = filtered.slice(0, 15);

  return topMatches.map((f: any) => ({
    id: f.fixture.id,
    competition: f.league.name,
    competitionCode: f.league.id.toString(),
    season: f.league.season,
    utcDate: f.fixture.date,
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
 * Returns granular team statistics.
 * Automatically falls back to previous seasons if the requested one is restricted.
 */
export async function getTeamStats(leagueId: string, teamId: number, season: number): Promise<TeamStats | null> {
  const seasonsToTry = [season, season - 1, 2024]; 
  const seenSeasons = new Set<number>();
  
  let data: any = null;

  for (const s of seasonsToTry) {
    if (seenSeasons.has(s) || s < 2020) continue;
    seenSeasons.add(s);

    const url = `${BASE_URL}/teams/statistics?league=${leagueId}&team=${teamId}&season=${s}`;
    data = await fetchWithRetry(url);

    if (data?.response?.fixtures?.played?.total > 0) {
      break;
    }

    if (data?.errors?.plan) {
      continue;
    }
  }

  if (!data || !data.response || !data.response.fixtures) {
    return null;
  }
  
  const stats = data.response;
  const fix = stats.fixtures;
  const goals = stats.goals;
  
  const played = fix.played.total || 0;
  if (played === 0) return null;
  
  const won = fix.wins.total || 0;
  const draw = fix.draws.total || 0;
  
  const goalsFor = goals.for.total.total || 0;
  const goalsAgainst = goals.against.total.total || 0;
  
  return {
    id: teamId,
    name: stats.team.name,
    crest: stats.team.logo,
    position: 0,
    played,
    won,
    draw,
    lost: fix.loses.total || 0,
    points: (won * 3) + draw,
    goalsFor,
    goalsAgainst,
    goalDifference: goalsFor - goalsAgainst,
    form: stats.form || "",
    cleanSheets: stats.clean_sheet.total || 0,
    failedToScore: stats.failed_to_score.total || 0,
    yellowCards: stats.cards?.yellow?.['0-15']?.total || 0,
    redCards: stats.cards?.red?.['0-15']?.total || 0
  };
}

/**
 * Main pipeline: fetches fixtures and then hydrates them with stats
 */
export async function getEnrichedMatches(): Promise<Match[]> {
  const matches = await getTodaysMatches();
  const enriched: Match[] = [];

  console.log(`[football] Hydrating ${matches.length} matches with granular stats...`);

  for (const match of matches) {
    const homeStats = await getTeamStats(match.competitionCode, match.homeTeam.id, match.season);
    await sleep(500); 
    
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

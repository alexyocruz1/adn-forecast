import LEAGUES from './leagues.json';

/**
 * CENTRAL LEAGUE REGISTRY
 * This file now reads from leagues.json.
 * To add a new competition, simply add an entry to lib/leagues.json.
 */
export const LEAGUE_REGISTRY = LEAGUES;

export type LeagueCode = keyof typeof LEAGUE_REGISTRY;

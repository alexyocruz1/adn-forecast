/**
 * sync-matches.js — ESPN API Mirror
 *
 * Uses ESPN's unofficial but open JSON API (no key, no Cloudflare, works from
 * GitHub Actions). Fetches today + tomorrow for all leagues, enriches each match
 * with standings, H2H, and odds, then writes to Vercel KV.
 *
 * ESPN scoreboard: GET /apis/site/v2/sports/soccer/{slug}/scoreboard?dates=YYYYMMDD
 * ESPN summary:    GET /apis/site/v2/sports/soccer/{slug}/summary?event={id}
 */

const { kv } = require("@vercel/kv");
const LEAGUE_REGISTRY = require("../lib/leagues.json");

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const ESPN_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json",
};

async function apiFetch(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: ESPN_HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.log(`      ⚠️ apiFetch error (attempt ${i + 1}): ${e.message} — ${url}`);
      if (i < retries - 1) await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
  return null;
}

/** Format YYYY-MM-DD -> YYYYMMDD for ESPN */
function toEspnDate(iso) {
  return iso.replace(/-/g, "");
}

/** Extract the W-D-L record string from a competitor's records array */
function getRecord(competitor) {
  const records = competitor.records || [];
  const total = records.find(r => r.type === "total" || r.name === "overall");
  return total?.summary || null;
}

/** Pull standings stats for a team from the summary response */
function getStandingStats(standingsGroups, teamName) {
  for (const group of standingsGroups || []) {
    for (const entry of group.standings?.entries || []) {
      if (entry.team?.toLowerCase() === teamName.toLowerCase()) {
        const stats = {};
        for (const s of entry.stats || []) {
          stats[s.name] = s.value;
        }
        return stats;
      }
    }
  }
  return null;
}

async function enrichMatch(leagueSlug, eventId, homeTeamName, awayTeamName) {
  const summaryUrl = `${ESPN_BASE}/${leagueSlug}/summary?event=${eventId}`;
  const data = await apiFetch(summaryUrl);
  if (!data) return {};

  const comp = data.header?.competitions?.[0];
  const competitors = comp?.competitors || [];

  // Odds (moneyline, over/under, spread from pickcenter)
  const pc = data.pickcenter?.[0];
  const odds = pc
    ? {
        overUnder: pc.overUnder ?? null,
        homeMoneyline: pc.homeTeamOdds?.moneyLine ?? null,
        awayMoneyline: pc.awayTeamOdds?.moneyLine ?? null,
        spread: pc.spread ?? null,
        details: pc.details ?? null,
      }
    : null;

  // H2H — list of recent meetings with score + result
  const h2hGames = (data.headToHeadGames || []).flatMap(h =>
    (h.events || []).map(e => ({
      date: e.gameDate?.split("T")[0],
      home: competitors.find(c => c.team?.id === e.homeTeamId)?.team?.displayName || e.homeTeamId,
      away: competitors.find(c => c.team?.id === e.awayTeamId)?.team?.displayName || e.awayTeamId,
      score: e.score,
      result: e.gameResult,
      round: e.roundName,
    }))
  );

  const getTeamStats = (teamName) => {
    // 1. Standings
    const statsObj = getStandingStats(standingsGroups, teamName) || {};
    
    // 2. Boxscore total goals (if available)
    const boxscoreTeams = data.boxscore?.teams || [];
    const bsTeam = boxscoreTeams.find(t => t.team?.displayName?.toLowerCase() === teamName.toLowerCase());
    if (bsTeam && bsTeam.statistics) {
      const goals = bsTeam.statistics.find(s => s.name === "totalGoals");
      const conceded = bsTeam.statistics.find(s => s.name === "goalsConceded");
      if (goals) statsObj.goalsFor = goals.value || goals.displayValue;
      if (conceded) statsObj.goalsAgainst = conceded.value || conceded.displayValue;
    }

    // 3. Top Players (Leaders)
    const teamLeaders = (data.leaders || []).find(l => l.team?.displayName?.toLowerCase() === teamName.toLowerCase());
    if (teamLeaders && teamLeaders.leaders) {
      const goalLeader = teamLeaders.leaders.find(l => l.name === "goals");
      const assistLeader = teamLeaders.leaders.find(l => l.name === "goalAssists");
      
      if (goalLeader?.leaders?.[0]) {
        statsObj.topScorer = `${goalLeader.leaders[0].athlete?.displayName} (${goalLeader.leaders[0].displayValue})`;
      }
      if (assistLeader?.leaders?.[0]) {
        statsObj.topAssists = `${assistLeader.leaders[0].athlete?.displayName} (${assistLeader.leaders[0].displayValue})`;
      }
    }
    
    return Object.keys(statsObj).length > 0 ? statsObj : null;
  };

  const homeStats = getTeamStats(homeTeamName);
  const awayStats = getTeamStats(awayTeamName);

  // Round name (from notes)
  const roundNote = comp?.notes?.find(n => n.type === "event" || n.headline);
  const round = roundNote?.headline || null;

  // Momentum (recent form WWDLW)
  const boxscoreForm = data.boxscore?.form || [];
  const getFormString = (teamName) => {
    const teamForm = boxscoreForm.find(f => f.team?.displayName?.toLowerCase() === teamName.toLowerCase());
    if (!teamForm || !teamForm.events) return null;
    return teamForm.events.map(e => e.gameResult).join("");
  };
  const homeForm = getFormString(homeTeamName);
  const awayForm = getFormString(awayTeamName);
  const momentum = (homeForm || awayForm) 
    ? `Home Form: ${homeForm || 'Unknown'} | Away Form: ${awayForm || 'Unknown'}` 
    : null;

  // Injuries
  const getInjuries = (homeAway) => {
    const c = competitors.find(c => c.homeAway === homeAway);
    if (!c || !c.injuries) return null;
    return c.injuries.map(i => `${i.athlete?.displayName || 'Player'} (${i.status})`).join(", ");
  };
  const homeInjuries = getInjuries("home");
  const awayInjuries = getInjuries("away");

  return { 
    odds, 
    h2h: h2hGames.length > 0 ? h2hGames.slice(0, 5) : null, 
    homeStats, 
    awayStats, 
    round,
    momentum,
    homeInjuries,
    awayInjuries
  };
}

async function syncLeague(leagueCode, leagueCfg, date) {
  const slug = leagueCfg.espnSlug;
  if (!slug) return [];

  const url = `${ESPN_BASE}/${slug}/scoreboard?dates=${toEspnDate(date)}`;
  const data = await apiFetch(url);
  if (!data?.events?.length) return [];

  const matches = [];
  for (const event of data.events) {
    const comp = event.competitions?.[0];
    if (!comp) continue;

    // Only future matches (or currently live — status not Final)
    const status = comp.status?.type?.name;
    if (status === "STATUS_FINAL") continue;

    const competitors = comp.competitors || [];
    const home = competitors.find(c => c.homeAway === "home");
    const away = competitors.find(c => c.homeAway === "away");
    if (!home || !away) continue;

    const homeName = home.team.displayName;
    const awayName = away.team.displayName;

    console.log(`   -> ${homeName} vs ${awayName}`);

    // Rich enrichment from summary endpoint
    const enriched = await enrichMatch(slug, event.id, homeName, awayName);

    // Build the record string from scoreboard data
    const homeRecord = getRecord(home);
    const awayRecord = getRecord(away);

    matches.push({
      id: parseInt(event.id, 10),
      competition: leagueCfg.name,
      competitionCode: leagueCode,
      utcDate: event.date,
      season: new Date().getFullYear(),
      homeTeam: {
        id: parseInt(home.team.id, 10),
        name: homeName,
        crest: home.team.logo || "",
        record: homeRecord,
      },
      awayTeam: {
        id: parseInt(away.team.id, 10),
        name: awayName,
        crest: away.team.logo || "",
        record: awayRecord,
      },
      matchUrl: `https://www.espn.com/soccer/match/_/gameId/${event.id}`,
      eliteContext: {
        ...(enriched.round && { round: enriched.round }),
        ...(enriched.odds && { odds: enriched.odds }),
        ...(enriched.h2h && { h2h: enriched.h2h }),
        ...(enriched.homeStats && { homeStats: enriched.homeStats }),
        ...(enriched.awayStats && { awayStats: enriched.awayStats }),
        ...(enriched.momentum && { momentum: enriched.momentum }),
        ...(enriched.homeInjuries && { homeInjuries: enriched.homeInjuries }),
        ...(enriched.awayInjuries && { awayInjuries: enriched.awayInjuries }),
      },
    });

    // Small delay to be respectful to ESPN
    await new Promise(r => setTimeout(r, 200));
  }

  return matches;
}

async function syncMatches() {
  console.log("🚀 Starting Sports Mirror Sync (ESPN API)...");

  const todayUtc = new Date().toISOString().split("T")[0];
  const tomorrowUtc = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  for (const date of [todayUtc, tomorrowUtc]) {
    console.log(`\n📅 Syncing date: ${date}`);
    const byLeague = {};

    for (const [leagueCode, leagueCfg] of Object.entries(LEAGUE_REGISTRY)) {
      console.log(`\n🔍 Fetching ${leagueCode} (${leagueCfg.espnSlug})...`);
      const matches = await syncLeague(leagueCode, leagueCfg, date);

      if (matches.length > 0) {
        byLeague[leagueCode] = matches;
        console.log(`   ✅ ${matches.length} matches found`);
      } else {
        console.log(`   ⚪ No upcoming matches`);
      }
    }

    // Save to KV
    for (const [leagueCode, matches] of Object.entries(byLeague)) {
      console.log(`📤 Storing ${matches.length} matches for ${leagueCode} on ${date}...`);
      await kv.set(`matches:${date}:${leagueCode}`, matches, { ex: 72 * 3600 });
    }

    const total = Object.values(byLeague).reduce((s, m) => s + m.length, 0);
    console.log(`\n📊 ${date}: ${total} total matches stored across ${Object.keys(byLeague).join(", ") || "none"}`);
  }

  console.log("\n✅ Sports Mirror Sync Complete.");
}

syncMatches().catch(err => {
  console.error("❌ Sync failed:", err);
  process.exit(1);
});

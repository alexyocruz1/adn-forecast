const { chromium } = require("playwright");
const { kv } = require("@vercel/kv");

const LEAGUE_REGISTRY = require("../lib/leagues.json");

// Build a fast lookup map: sofascoreId -> leagueCode
const ID_TO_CODE = {};
for (const [code, cfg] of Object.entries(LEAGUE_REGISTRY)) {
  if (cfg.sofascoreId) ID_TO_CODE[cfg.sofascoreId] = code;
}

async function fetchWithRetry(page, url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      // Execute an actual fetch request within the browser context.
      // This bypasses Cloudflare because it looks like a legitimate XHR
      // coming from the Sofascore origin (since primeContext put us on sofascore.com)
      const data = await page.evaluate(async (targetUrl) => {
        const res = await fetch(targetUrl, {
          headers: {
            "Accept": "application/json, text/plain, */*",
            "Cache-Control": "no-cache",
          }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      }, url);
      return data;
    } catch (e) {
      console.log(`      ⚠️ fetchWithRetry error for ${url}: ${e.message}`);
      if (i === retries - 1) return null;
      await page.waitForTimeout(2000);
    }
  }
  return null;
}

// Prime the browser with Sofascore's homepage so image requests pass WAF checks
async function primeContext(page) {
  try {
    await page.goto("https://www.sofascore.com/", {
      waitUntil: "domcontentloaded",
      timeout: 15000,
    });
    console.log("🍪 Browser context primed with Sofascore cookies.");
  } catch (e) {
    console.log("⚠️ Could not prime context:", e.message);
  }
}

async function getLogoBase64(page, teamId) {
  const cacheKey = `team_logo:${teamId}`;
  const cached = await kv.get(cacheKey);
  if (cached) return cached;

  // Try up to 2 times — re-prime cookies on first failure
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await page.goto(
        `https://api.sofascore.com/api/v1/team/${teamId}/image`,
        { waitUntil: "networkidle", timeout: 10000 }
      );
      if (res && res.ok()) {
        const buffer = await res.body();
        const base64Url = `data:image/png;base64,${buffer.toString("base64")}`;
        await kv.set(cacheKey, base64Url);
        return base64Url;
      }
      // 403 — re-prime the cookies and retry
      if (attempt === 0) {
        console.log(`      ↩️  Re-priming context for team ${teamId}...`);
        await primeContext(page);
      }
    } catch (e) {
      console.log(`      ⚠️ Could not fetch logo for team ${teamId}: ${e.message}`);
      if (attempt === 0) await primeContext(page);
    }
  }
  return "/images/adnlogo.png";
}

async function syncMatches() {
  console.log("🚀 Starting Sports Mirror Sync (Sofascore)...");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 1000 },
  });
  const page = await context.newPage();

  // Prime the browser with Sofascore's homepage so image requests pass WAF checks
  await primeContext(page);

  // We fetch a 3-day window (+1/-1 around today) because Sofascore's scheduled-events
  // endpoint groups by LOCAL timezone, so a match on May 5 BST appears under May 5
  // BUT its UTC timestamp is May 4. We collect all events, deduplicate by event ID,
  // and then bin each event into its TRUE UTC calendar date.
  const todayUtc = new Date().toISOString().split("T")[0];
  const tomorrowUtc = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  const dayAfterUtc = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];

  const fetchDates = [todayUtc, tomorrowUtc, dayAfterUtc];
  
  // Collect all events, deduplicating by event ID.
  // First occurrence wins — this preserves Sofascore's "football day" grouping.
  // e.g. Copa matches at 00:00 UTC May 6 appear on Sofascore's May 5 page because
  // they kick off at ~8pm local South American time on May 5.
  const eventsBySofascoreDate = {}; // sofascoreDate -> eventId -> event

  for (const fetchDate of fetchDates) {
    console.log(`\n📡 Fetching Sofascore schedule for: ${fetchDate}`);
    const url = `https://api.sofascore.com/api/v1/sport/football/scheduled-events/${fetchDate}`;
    const data = await fetchWithRetry(page, url);

    if (!data?.events) {
      console.log(`⚠️ No events returned for ${fetchDate}`);
      continue;
    }

    if (!eventsBySofascoreDate[fetchDate]) eventsBySofascoreDate[fetchDate] = new Map();
    let added = 0;
    const seenAcrossAllDates = new Set(Object.values(eventsBySofascoreDate).flatMap(m => [...m.keys()]));

    for (const event of data.events) {
      const uniqueId = event.tournament?.uniqueTournament?.id;
      if (!uniqueId || !ID_TO_CODE[uniqueId]) continue;
      if (seenAcrossAllDates.has(event.id)) continue; // Already seen on earlier date (first wins)

      // Filter: skip matches that already kicked off more than 1 hour ago
      const kickoffMs = event.startTimestamp * 1000;
      if (kickoffMs < Date.now() - 60 * 60 * 1000) {
        console.log(`   ⏭️  Skipping (already played): ${event.homeTeam.name} vs ${event.awayTeam.name}`);
        continue;
      }

      eventsBySofascoreDate[fetchDate].set(event.id, event);
      seenAcrossAllDates.add(event.id);
      added++;
    }
    console.log(`   Found ${data.events.length} total, added ${added} upcoming relevant events.`);
  }

  // Build byDate from Sofascore's assigned dates — only today & tomorrow
  const byDate = {};
  for (const sofascoreDate of [todayUtc, tomorrowUtc]) {
    if (!eventsBySofascoreDate[sofascoreDate]) continue;
    for (const event of eventsBySofascoreDate[sofascoreDate].values()) {
      const leagueCode = ID_TO_CODE[event.tournament?.uniqueTournament?.id];
      if (!byDate[sofascoreDate]) byDate[sofascoreDate] = {};
      if (!byDate[sofascoreDate][leagueCode]) byDate[sofascoreDate][leagueCode] = [];

      byDate[sofascoreDate][leagueCode].push({
        id: event.id,
        competition: LEAGUE_REGISTRY[leagueCode].name,
        competitionCode: leagueCode,
        utcDate: new Date(event.startTimestamp * 1000).toISOString(),
        localTime: new Date(event.startTimestamp * 1000).toISOString().substring(11, 16),
        season: new Date().getFullYear(),
        homeTeam: { id: event.homeTeam.id, name: event.homeTeam.name, crest: "" },
        awayTeam: { id: event.awayTeam.id, name: event.awayTeam.name, crest: "" },
        matchUrl: `https://www.sofascore.com/football/match/${event.slug}/${event.customId}`,
      });
    }
  }

  // Summary
  for (const date of [todayUtc, tomorrowUtc]) {
    const leagues = byDate[date] ? Object.keys(byDate[date]) : [];
    const total = leagues.reduce((s, l) => s + byDate[date][l].length, 0);
    console.log(`\n📅 ${date}: ${total} matches across: ${leagues.join(", ") || "none"}`);
    for (const l of leagues) {
      byDate[date][l].forEach(m => console.log(`   ${l}: ${m.homeTeam.name} vs ${m.awayTeam.name} @ ${m.utcDate.substring(11,16)} UTC`));
    }
  }

  // --- DEEP SCRAPE FOR ELITE CONTEXT + LOGOS ---
  for (const date of [todayUtc, tomorrowUtc]) {
    if (!byDate[date]) continue;

    for (const leagueCode in byDate[date]) {
      const matches = byDate[date][leagueCode];
      console.log(`\n🔍 Deep Scanning ${matches.length} matches in ${leagueCode} for ${date}...`);

      for (const match of matches) {
        try {
          console.log(`   -> ${match.homeTeam.name} vs ${match.awayTeam.name}`);

          // 1. Event details: referee stats + round info
          const eventData = await fetchWithRetry(
            page,
            `https://api.sofascore.com/api/v1/event/${match.id}`
          );
          const ref = eventData?.event?.referee;
          const roundInfo = eventData?.event?.roundInfo;
          const refereeName = ref?.name || "Oficial";
          // Real per-game averages (not hardcoded)
          const yellowCardsAvg = ref?.games > 0 ? +(ref.yellowCards / ref.games).toFixed(2) : null;
          const redCardsAvg = ref?.games > 0 ? +(ref.redCards / ref.games).toFixed(2) : null;

          // 2. Tactical Shape
          const lineupsData = await fetchWithRetry(
            page,
            `https://api.sofascore.com/api/v1/event/${match.id}/lineups`
          );
          const tacticalHome = lineupsData?.home?.formation || null;
          const tacticalAway = lineupsData?.away?.formation || null;

          // 3. Momentum (last 5 results per team)
          const getForm = async (teamId) => {
            const formEvents = await fetchWithRetry(
              page,
              `https://api.sofascore.com/api/v1/team/${teamId}/events/last/0`
            );
            if (!formEvents?.events) return "?????";
            let formStr = "";
            for (const e of formEvents.events.slice(0, 5)) {
              if (e.homeScore?.current === undefined) continue;
              const homeWin = e.homeScore.current > e.awayScore.current;
              const awayWin = e.homeScore.current < e.awayScore.current;
              if (homeWin) formStr += e.homeTeam.id == teamId ? "W" : "L";
              else if (awayWin) formStr += e.homeTeam.id == teamId ? "L" : "W";
              else formStr += "D";
            }
            return formStr || "?????";
          };

          const [homeForm, awayForm] = await Promise.all([
            getForm(match.homeTeam.id),
            getForm(match.awayTeam.id),
          ]);

          // 4. Head-to-head
          const h2hData = await fetchWithRetry(
            page,
            `https://api.sofascore.com/api/v1/event/${match.id}/h2h`
          );
          const h2h = h2hData?.teamDuel
            ? { homeWins: h2hData.teamDuel.homeWins, awayWins: h2hData.teamDuel.awayWins, draws: h2hData.teamDuel.draws }
            : null;

          match.eliteContext = {
            referee: {
              name: refereeName,
              ...(yellowCardsAvg !== null && { yellowCardsAvg }),
              ...(redCardsAvg !== null && { redCardsAvg }),
            },
            ...(roundInfo?.name && { round: roundInfo.name }),
            ...(tacticalHome && tacticalAway && { tacticalShape: { home: tacticalHome, away: tacticalAway } }),
            momentum: `Home Form: ${homeForm} | Away Form: ${awayForm}`,
            ...(h2h && { h2h }),
          };

          // 4. Logos (cached in KV as base64 to bypass WAF on frontend)
          const [homeCrest, awayCrest] = await Promise.all([
            getLogoBase64(page, match.homeTeam.id),
            getLogoBase64(page, match.awayTeam.id),
          ]);
          match.homeTeam.crest = homeCrest;
          match.awayTeam.crest = awayCrest;

          await page.waitForTimeout(300);
        } catch (e) {
          console.log(`      ⚠️ Deep scrape error: ${e.message}`);
        }
      }
    }
  }

  // --- SAVE TO KV ---
  for (const date of [todayUtc, tomorrowUtc]) {
    if (!byDate[date]) continue;

    for (const leagueCode in byDate[date]) {
      const matchesToStore = byDate[date][leagueCode].map((m) => ({
        ...m,
        // Keep only what we actually know — no fake zeros
        homeTeam: { ...m.homeTeam },
        awayTeam: { ...m.awayTeam },
      }));


      console.log(`📤 Storing ${matchesToStore.length} matches for ${leagueCode} on ${date}...`);
      await kv.set(`matches:${date}:${leagueCode}`, matchesToStore, { ex: 72 * 3600 });
    }
  }

  await browser.close();
  console.log("\n✅ Sports Mirror Sync Complete.");
}

syncMatches();

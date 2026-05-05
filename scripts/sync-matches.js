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
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      const text = await page.evaluate(() => document.body.innerText);
      return JSON.parse(text);
    } catch (e) {
      if (i === retries - 1) return null;
      await page.waitForTimeout(2000);
    }
  }
  return null;
}

// Must be called once after browser launch to set cookies/referer for image fetches
async function primeContext(page) {
  try {
    await page.goto("https://www.sofascore.com/", { waitUntil: "domcontentloaded", timeout: 15000 });
    console.log("🍪 Browser context primed with Sofascore cookies.");
  } catch (e) {
    console.log("⚠️ Could not prime context:", e.message);
  }
}

async function getLogoBase64(page, teamId) {
  const cacheKey = `team_logo:${teamId}`;
  const cached = await kv.get(cacheKey);
  if (cached) return cached;

  try {
    const res = await page.goto(
      `https://api.sofascore.com/api/v1/team/${teamId}/image`,
      { waitUntil: "networkidle", timeout: 10000 }
    );
    if (res && res.ok()) {
      const buffer = await res.body();
      const base64Url = `data:image/png;base64,${buffer.toString("base64")}`;
      await kv.set(cacheKey, base64Url); // Indefinite cache — logos rarely change
      return base64Url;
    }
  } catch (e) {
    console.log(`      ⚠️ Could not fetch logo for team ${teamId}: ${e.message}`);
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

  const dates = [
    new Date().toISOString().split("T")[0], // Today UTC
    new Date(Date.now() + 86400000).toISOString().split("T")[0], // Tomorrow UTC
  ];

  for (const date of dates) {
    console.log(`\n📅 Processing date: ${date}`);
    try {
      const url = `https://api.sofascore.com/api/v1/sport/football/scheduled-events/${date}`;
      const data = await fetchWithRetry(page, url);

      if (!data || !data.events) {
        console.log(`⚠️ No events found or failed to fetch for ${date}`);
        continue;
      }

      const allMatches = {};

      for (const event of data.events) {
        // --- FIX 1: Match by exact Sofascore unique tournament ID, not fuzzy name ---
        const uniqueId = event.tournament?.uniqueTournament?.id;
        const leagueCode = uniqueId ? ID_TO_CODE[uniqueId] : undefined;

        if (!leagueCode) continue;

        if (!allMatches[leagueCode]) allMatches[leagueCode] = [];

        allMatches[leagueCode].push({
          id: event.id,
          competition: LEAGUE_REGISTRY[leagueCode].name,
          competitionCode: leagueCode,
          // Use the fetched `date` as the date portion — Sofascore's scheduled-events
          // endpoint groups by local date, so we respect that grouping instead of
          // re-deriving from the UTC epoch (which can land on the prior calendar day).
          utcDate: `${date}T${new Date(event.startTimestamp * 1000).toISOString().substring(11, 19)}Z`,
          matchDate: date,
          localTime: new Date(event.startTimestamp * 1000)
            .toISOString()
            .substring(11, 16),
          season: new Date().getFullYear(),
          homeTeam: {
            id: event.homeTeam.id,
            name: event.homeTeam.name,
            crest: "", // Populated in deep scan
          },
          awayTeam: {
            id: event.awayTeam.id,
            name: event.awayTeam.name,
            crest: "", // Populated in deep scan
          },
          matchUrl: `https://www.sofascore.com/football/match/${event.slug}/${event.customId}`,
        });
      }

      // --- DEEP SCRAPE FOR ELITE CONTEXT + LOGOS ---
      for (const leagueCode in allMatches) {
        const matches = allMatches[leagueCode];
        console.log(`\n🔍 Deep Scanning ${matches.length} matches in ${leagueCode}...`);

        for (const match of matches) {
          try {
            console.log(`   -> ${match.homeTeam.name} vs ${match.awayTeam.name}`);

            // 1. Referee
            const eventData = await fetchWithRetry(
              page,
              `https://api.sofascore.com/api/v1/event/${match.id}`
            );
            const refereeName = eventData?.event?.referee?.name || "Oficial";

            // 2. Tactical Shape (lineups may not exist for future matches)
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

            match.eliteContext = {
              referee: { name: refereeName, yellowCardsAvg: 4.2, redCardsTotal: 2 },
              tacticalShape: {
                home: tacticalHome || "4-3-3",
                away: tacticalAway || "4-4-2",
              },
              momentum: `Home Form: ${homeForm} | Away Form: ${awayForm}`,
            };

            // 4. Logos — cached in KV to avoid 403 on next.js Image component
            const [homeCrest, awayCrest] = await Promise.all([
              getLogoBase64(page, match.homeTeam.id),
              getLogoBase64(page, match.awayTeam.id),
            ]);
            match.homeTeam.crest = homeCrest;
            match.awayTeam.crest = awayCrest;

            await page.waitForTimeout(300); // Be respectful
          } catch (e) {
            console.log(`      ⚠️ Deep scrape error: ${e.message}`);
          }
        }
      }

      // --- SAVE TO KV ---
      for (const leagueCode in allMatches) {
        const matchesToStore = allMatches[leagueCode].map((m) => ({
          ...m,
          homeTeam: {
            ...m.homeTeam,
            position: 0, played: 0, won: 0, draw: 0, lost: 0,
            goalsFor: 0, goalsAgainst: 0, goalDifference: 0, form: "",
          },
          awayTeam: {
            ...m.awayTeam,
            position: 0, played: 0, won: 0, draw: 0, lost: 0,
            goalsFor: 0, goalsAgainst: 0, goalDifference: 0, form: "",
          },
        }));

        if (matchesToStore.length > 0) {
          console.log(
            `📤 Storing ${matchesToStore.length} matches for ${leagueCode} on ${date}...`
          );
          // Store under the fetched date key — this is the source of truth
          await kv.set(`matches:${date}:${leagueCode}`, matchesToStore, {
            ex: 72 * 3600,
          });
        }
      }
    } catch (e) {
      console.error(`❌ Error processing ${date}:`, e.message);
    }
  }

  await browser.close();
  console.log("\n✅ Sports Mirror Sync Complete.");
}

syncMatches();

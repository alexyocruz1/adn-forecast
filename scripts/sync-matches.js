const { chromium } = require("playwright");
const { kv } = require("@vercel/kv");

const LEAGUE_REGISTRY = require("../lib/leagues.json");

// Build a fast lookup map: sofascoreId -> leagueCode
const ID_TO_CODE = {};
for (const [code, cfg] of Object.entries(LEAGUE_REGISTRY)) {
  if (cfg.sofascoreId) ID_TO_CODE[cfg.sofascoreId] = code;
}

/**
 * Navigates to sofascore.com homepage and waits until Cloudflare challenge is solved
 * (or the page is genuinely ready). Returns true if successful.
 */
async function primeContext(page) {
  try {
    await page.goto("https://www.sofascore.com/", {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    // Confirm we're actually on sofascore.com (not a challenge redirect)
    const url = page.url();
    if (!url.includes("sofascore.com")) {
      console.log(`⚠️ primeContext: ended up on ${url}`);
      return false;
    }
    console.log("🍪 Browser context primed with Sofascore cookies.");
    return true;
  } catch (e) {
    console.log("⚠️ Could not prime context:", e.message);
    return false;
  }
}

/**
 * Fetches a Sofascore API URL using a fetch() call executed INSIDE the Playwright
 * browser context. The browser is already on sofascore.com, so:
 *   - The request carries real Sofascore cookies
 *   - The TLS fingerprint is Chromium's (not Node.js's)
 *   - Cloudflare sees it as a legitimate same-site XHR
 */
async function apiFetch(page, url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const data = await page.evaluate(async (targetUrl) => {
        const res = await fetch(targetUrl, {
          credentials: "include",
          headers: {
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-site",
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      }, url);
      return data;
    } catch (e) {
      console.log(`      ⚠️ apiFetch error (attempt ${i + 1}) for ${url}: ${e.message}`);
      if (i < retries - 1) {
        // Re-prime the browser context before retrying
        await primeContext(page);
        await page.waitForTimeout(2000);
      }
    }
  }
  return null;
}

async function getLogoBase64(page, teamId) {
  const cacheKey = `team_logo:${teamId}`;
  const cached = await kv.get(cacheKey);
  if (cached) return cached;

  // We stay on sofascore.com and use fetch() for images too, to avoid navigation
  try {
    const base64Url = await page.evaluate(async (teamId) => {
      const res = await fetch(`https://api.sofascore.com/api/v1/team/${teamId}/image`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      return `data:image/png;base64,${btoa(binary)}`;
    }, teamId);
    await kv.set(cacheKey, base64Url);
    return base64Url;
  } catch (e) {
    console.log(`      ⚠️ Could not fetch logo for team ${teamId}: ${e.message}`);
    return "/images/adnlogo.png";
  }
}

async function syncMatches() {
  console.log("🚀 Starting Sports Mirror Sync (Sofascore)...");

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 1000 },
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  const page = await context.newPage();

  // Stealth: hide navigator.webdriver before ANY page loads
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3] });
    window.chrome = { runtime: {} };
  });

  // CRITICAL: navigate to sofascore.com and wait for full load + cookie set
  // This ensures page.evaluate() fetch calls are made from sofascore.com origin
  const primed = await primeContext(page);
  if (!primed) {
    console.log("⚠️ Failed to prime context. Cloudflare may be blocking. Proceeding anyway...");
  }

  // Extra wait to let Cloudflare challenge complete if needed
  await page.waitForTimeout(3000);

  // We fetch a 3-day window to handle timezone-edge matches
  const todayUtc = new Date().toISOString().split("T")[0];
  const tomorrowUtc = new Date(Date.now() + 86400000).toISOString().split("T")[0];
  const dayAfterUtc = new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0];

  const fetchDates = [todayUtc, tomorrowUtc, dayAfterUtc];
  const eventsBySofascoreDate = {};
  const seenAcrossAllDates = new Set();

  for (const fetchDate of fetchDates) {
    console.log(`\n📡 Fetching Sofascore schedule for: ${fetchDate}`);
    const url = `https://api.sofascore.com/api/v1/sport/football/scheduled-events/${fetchDate}`;
    const data = await apiFetch(page, url);

    if (!data?.events) {
      console.log(`⚠️ No events returned for ${fetchDate}`);
      continue;
    }

    if (!eventsBySofascoreDate[fetchDate]) eventsBySofascoreDate[fetchDate] = new Map();
    let added = 0;

    for (const event of data.events) {
      const uniqueId = event.tournament?.uniqueTournament?.id;
      if (!uniqueId || !ID_TO_CODE[uniqueId]) continue;
      if (seenAcrossAllDates.has(event.id)) continue;

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

  // Build byDate — only today & tomorrow
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
      byDate[date][l].forEach(m => console.log(`   ${l}: ${m.homeTeam.name} vs ${m.awayTeam.name} @ ${m.utcDate.substring(11, 16)} UTC`));
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
          const eventData = await apiFetch(page, `https://api.sofascore.com/api/v1/event/${match.id}`);
          const ref = eventData?.event?.referee;
          const roundInfo = eventData?.event?.roundInfo;
          const refereeName = ref?.name || "Oficial";
          const yellowCardsAvg = ref?.games > 0 ? +(ref.yellowCards / ref.games).toFixed(2) : null;
          const redCardsAvg = ref?.games > 0 ? +(ref.redCards / ref.games).toFixed(2) : null;

          // 2. Tactical Shape
          const lineupsData = await apiFetch(page, `https://api.sofascore.com/api/v1/event/${match.id}/lineups`);
          const tacticalHome = lineupsData?.home?.formation || null;
          const tacticalAway = lineupsData?.away?.formation || null;

          // 3. Momentum (last 5 results per team)
          const getForm = async (teamId) => {
            const formEvents = await apiFetch(page, `https://api.sofascore.com/api/v1/team/${teamId}/events/last/0`);
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
          const h2hData = await apiFetch(page, `https://api.sofascore.com/api/v1/event/${match.id}/h2h`);
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

          // 5. Logos (via page.evaluate fetch — stays on sofascore.com origin)
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

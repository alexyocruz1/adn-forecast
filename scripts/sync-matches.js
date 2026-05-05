const { chromium } = require("playwright");
const { kv } = require("@vercel/kv");

const LEAGUE_REGISTRY = require("../lib/leagues.json");

async function fetchWithRetry(page, url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      const text = await page.evaluate(() => document.body.innerText);
      const data = JSON.parse(text);
      return data;
    } catch (e) {
      if (i === retries - 1) return null;
      await page.waitForTimeout(2000);
    }
  }
  return null;
}

async function syncMatches() {
  console.log("🚀 Starting Sports Mirror Sync (Sofascore)...");
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 1000 }
  });
  const page = await context.newPage();

  const dates = [
    new Date().toISOString().split("T")[0], // Today
    new Date(Date.now() + 86400000).toISOString().split("T")[0] // Tomorrow
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

      data.events.forEach(event => {
        // Find if this league is in our registry
        const title = event.tournament.uniqueTournament?.name || event.tournament.name;
        
        const leagueCode = Object.keys(LEAGUE_REGISTRY).find(code => {
          const titleLower = title.toLowerCase();
          const r = LEAGUE_REGISTRY[code];
          
          if (titleLower.includes(r.name.toLowerCase())) return true;
          if (r.aliases && Array.isArray(r.aliases)) {
            return r.aliases.some(alias => titleLower.includes(alias.toLowerCase()));
          }
          return false;
        });

        if (leagueCode) {
          if (!allMatches[leagueCode]) allMatches[leagueCode] = [];
          
          const time = new Date(event.startTimestamp * 1000).toISOString().substring(11, 16); // HH:mm
          
          allMatches[leagueCode].push({
            id: event.id,
            competition: LEAGUE_REGISTRY[leagueCode].name,
            competitionCode: leagueCode,
            utcDate: new Date(event.startTimestamp * 1000).toISOString(),
            localTime: time,
            season: new Date().getFullYear(),
            homeTeam: { 
              id: event.homeTeam.id,
              name: event.homeTeam.name, 
              crest: `https://api.sofascore.com/api/v1/team/${event.homeTeam.id}/image`
            },
            awayTeam: { 
              id: event.awayTeam.id,
              name: event.awayTeam.name, 
              crest: `https://api.sofascore.com/api/v1/team/${event.awayTeam.id}/image`
            },
            matchUrl: `https://www.sofascore.com/football/match/${event.slug}/${event.customId}`
          });
        }
      });

      // --- DEEP SCRAPE FOR ELITE CONTEXT ---
      for (const leagueCode in allMatches) {
        console.log(`\n🔍 Deep Scanning ${allMatches[leagueCode].length} matches in ${leagueCode}...`);
        for (const match of allMatches[leagueCode]) {
          try {
            console.log(`   -> Analyzing ${match.homeTeam.name} vs ${match.awayTeam.name}...`);
            
            // 1. Referee
            const eventData = await fetchWithRetry(page, `https://api.sofascore.com/api/v1/event/${match.id}`);
            const refereeName = eventData?.event?.referee?.name || "Oficial";

            // 2. Tactical Shape
            const lineupsData = await fetchWithRetry(page, `https://api.sofascore.com/api/v1/event/${match.id}/lineups`);
            const tacticalHome = lineupsData?.home?.formation || "4-3-3";
            const tacticalAway = lineupsData?.away?.formation || "4-4-2";

            // 3. Momentum (Form)
            const getForm = async (teamId) => {
              const formEvents = await fetchWithRetry(page, `https://api.sofascore.com/api/v1/team/${teamId}/events/last/0`);
              if (!formEvents || !formEvents.events) return "?????";
              
              const recent = formEvents.events.slice(0, 5);
              let formStr = "";
              for (const e of recent) {
                if (!e.homeScore || e.homeScore.current === undefined) continue;
                if (e.homeScore.current > e.awayScore.current) {
                  formStr += e.homeTeam.id == teamId ? 'W' : 'L';
                } else if (e.homeScore.current < e.awayScore.current) {
                  formStr += e.homeTeam.id == teamId ? 'L' : 'W';
                } else {
                  formStr += 'D';
                }
              }
              return formStr || "?????";
            };

            const homeForm = await getForm(match.homeTeam.id);
            const awayForm = await getForm(match.awayTeam.id);

            match.eliteContext = {
              referee: {
                name: refereeName,
                yellowCardsAvg: 4.2, 
                redCardsTotal: 2
              },
              tacticalShape: {
                home: tacticalHome,
                away: tacticalAway
              },
              momentum: `Home Form: ${homeForm} | Away Form: ${awayForm}`
            };

            await page.waitForTimeout(500); // Respectful delay
          } catch (e) {
            console.log(`      ⚠️ Could not deep scrape: ${e.message}`);
          }
        }
      }

      // --- SAVE TO KV ---
      for (const leagueCode in allMatches) {
        // Set defaults to match the expected Match type
        const matchesToStore = allMatches[leagueCode].map(m => {
          return {
            ...m,
            homeTeam: { ...m.homeTeam, position: 0, played: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, form: "" },
            awayTeam: { ...m.awayTeam, position: 0, played: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, form: "" }
          };
        });

        if (matchesToStore.length > 0) {
          console.log(`📤 Storing ${matchesToStore.length} matches for ${leagueCode} on ${date}...`);
          await kv.set(`matches:${date}:${leagueCode}`, matchesToStore, { ex: 72 * 3600 });
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

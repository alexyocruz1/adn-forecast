const { chromium } = require("playwright");
const { kv } = require("@vercel/kv");

// We use the central registry so we only ever have to update lib/leagues.json
const LEAGUE_REGISTRY = require("../lib/leagues.json");

async function syncMatches() {
  console.log("🚀 Starting Sports Mirror Sync (BeSoccer)...");
  
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
      const url = `https://www.besoccer.com/livescore/${date}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      
      // Give it a second to render
      await page.waitForTimeout(2000);

      const allMatches = await page.evaluate((registry) => {
        const results = {};
        const panels = Array.from(document.querySelectorAll(".panel-header"));
        
        panels.forEach(panel => {
          const titleEl = panel.querySelector(".title-soccer");
          if (!titleEl) return;
          
          const title = titleEl.innerText.trim();
          
          // Find if this league is in our registry
          const leagueCode = Object.keys(registry).find(code => {
            const titleLower = title.toLowerCase();
            const r = registry[code];
            
            // Check primary name
            if (titleLower.includes(r.name.toLowerCase())) return true;
            
            // Check besoccer URL path formatting
            if (titleLower.includes(r.besoccerPath.replace(/_/g, " ").toLowerCase())) return true;
            
            // Check new aliases array (for CONMEBOL, CONCACAF, etc.)
            if (r.aliases && Array.isArray(r.aliases)) {
              return r.aliases.some(alias => titleLower.includes(alias.toLowerCase()));
            }
            
            return false;
          });

          if (leagueCode) {
            console.log(`Found League: ${title} -> ${leagueCode}`);
            const matches = [];
            let nextEl = panel.nextElementSibling;
            
            // Collect matches under this header until next header
            while (nextEl && !nextEl.classList.contains("panel-header")) {
              const matchLinks = nextEl.querySelectorAll("a.match-link");
              matchLinks.forEach(link => {
                const matchId = link.href.split("/").pop();
                const homeTeamName = link.querySelector(".team-left .name")?.innerText.trim();
                const awayTeamName = link.querySelector(".team-right .name")?.innerText.trim();
                const homeCrest = link.querySelector(".team-left img")?.src;
                const awayCrest = link.querySelector(".team-right img")?.src;
                const time = link.querySelector(".match-hour p")?.innerText.trim() || link.querySelector("b")?.innerText.trim() || "00:00";
                
                matches.push({
                  id: parseInt(matchId) || Math.floor(Math.random() * 1000000),
                  competition: registry[leagueCode].name,
                  competitionCode: leagueCode,
                  utcDate: "", // Will be set outside evaluate
                  localTime: time,
                  season: new Date().getFullYear(),
                  homeTeam: { name: homeTeamName, crest: homeCrest },
                  awayTeam: { name: awayTeamName, crest: awayCrest },
                  matchUrl: link.href
                });
              });
              nextEl = nextEl.nextElementSibling;
            }
            results[leagueCode] = matches;
          }
        });
        return results;
      }, LEAGUE_REGISTRY);

      // --- DEEP SCRAPE FOR ELITE CONTEXT ---
      for (const leagueCode in allMatches) {
        console.log(`\n🔍 Deep Scanning ${allMatches[leagueCode].length} matches in ${leagueCode}...`);
        for (const match of allMatches[leagueCode]) {
          try {
            console.log(`   -> Analyzing ${match.homeTeam.name} vs ${match.awayTeam.name}...`);
            await page.goto(match.matchUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
            
            const eliteData = await page.evaluate(() => {
              const refereeEl = document.querySelector(".referee-info, .ref-name");
              const homeFormEls = Array.from(document.querySelectorAll(".team-left .form-circle"));
              const awayFormEls = Array.from(document.querySelectorAll(".team-right .form-circle"));
              
              // Extract Tactical Shape (often in a specific div or inferred)
              const tacticalHome = document.querySelector(".tactical-shape-home")?.innerText || "4-3-3";
              const tacticalAway = document.querySelector(".tactical-shape-away")?.innerText || "4-4-2";

              return {
                referee: {
                  name: refereeEl?.innerText.trim() || "Oficial",
                  yellowCardsAvg: 4.2, // Placeholder or extract if visible
                  redCardsTotal: 2
                },
                tacticalShape: {
                  home: tacticalHome,
                  away: tacticalAway
                },
                momentum: `Home Form: ${homeFormEls.map(el => el.innerText).join("")} | Away Form: ${awayFormEls.map(el => el.innerText).join("")}`
              };
            });
            match.eliteContext = eliteData;
            await page.waitForTimeout(500); // Respectful delay
          } catch (e) {
            console.log(`      ⚠️ Could not deep scrape: ${e.message}`);
          }
        }
      }

      // --- SAVE TO KV ---
      for (const leagueCode in allMatches) {
        const matches = allMatches[leagueCode].map(m => ({
          ...m,
          utcDate: `${date}T${m.localTime.includes(":") ? m.localTime : "00:00"}:00Z`,
          homeTeam: { ...m.homeTeam, id: Math.random(), position: 0, played: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, form: "" },
          awayTeam: { ...m.awayTeam, id: Math.random(), position: 0, played: 0, won: 0, draw: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, form: "" },
          eliteContext: m.eliteContext
        }));

        if (matches.length > 0) {
          console.log(`📤 Storing ${matches.length} matches for ${leagueCode} on ${date}...`);
          await kv.set(`matches:${date}:${leagueCode}`, matches, { ex: 72 * 3600 });
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

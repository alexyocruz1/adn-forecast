const { chromium } = require("playwright");

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const teamId = "42"; // Arsenal
  
  try {
    await page.goto(`https://api.sofascore.com/api/v1/team/${teamId}/performance`, { waitUntil: "domcontentloaded" });
    let text = await page.evaluate(() => document.body.innerText);
    console.log("Performance:", text.substring(0, 200));
    
    await page.goto(`https://api.sofascore.com/api/v1/team/${teamId}/events/last/0`, { waitUntil: "domcontentloaded" });
    text = await page.evaluate(() => document.body.innerText);
    const lastEvents = JSON.parse(text);
    if (lastEvents.events) {
      const form = lastEvents.events.slice(0, 5).map(e => {
        if(e.homeScore.current > e.awayScore.current) return e.homeTeam.id == teamId ? 'W' : 'L';
        if(e.homeScore.current < e.awayScore.current) return e.homeTeam.id == teamId ? 'L' : 'W';
        return 'D';
      }).join('');
      console.log("Calculated Form:", form);
    }
  } catch (e) {
    console.error("Error:", e.message);
  }
  await browser.close();
}
run();

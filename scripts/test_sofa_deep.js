const { chromium } = require("playwright");

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const eventId = "15632635"; // example ID from previous run
  
  try {
    // 1. Base Event (Referee)
    await page.goto(`https://api.sofascore.com/api/v1/event/${eventId}`, { waitUntil: "domcontentloaded" });
    const eventText = await page.evaluate(() => document.body.innerText);
    const eventData = JSON.parse(eventText);
    const referee = eventData.event?.referee?.name || "Unknown";
    console.log("Referee:", referee);
    
    // 2. Lineups (Tactical Shape)
    await page.goto(`https://api.sofascore.com/api/v1/event/${eventId}/lineups`, { waitUntil: "domcontentloaded" });
    const lineupsText = await page.evaluate(() => document.body.innerText);
    let lineupsData;
    try { lineupsData = JSON.parse(lineupsText); } catch (e) {}
    
    let homeFormation = "Unknown";
    let awayFormation = "Unknown";
    if (lineupsData && lineupsData.home && lineupsData.home.formation) homeFormation = lineupsData.home.formation;
    if (lineupsData && lineupsData.away && lineupsData.away.formation) awayFormation = lineupsData.away.formation;
    console.log("Tactical Shape - Home:", homeFormation, "Away:", awayFormation);
    
    // 3. Pre-game Form or H2H
    await page.goto(`https://api.sofascore.com/api/v1/event/${eventId}/h2h/events`, { waitUntil: "domcontentloaded" });
    const h2hText = await page.evaluate(() => document.body.innerText);
    let h2hData;
    try { h2hData = JSON.parse(h2hText); } catch(e) {}
    console.log("H2H events fetched? ", !!h2hData);
    
  } catch (e) {
    console.error("Error:", e.message);
  }
  await browser.close();
}
run();

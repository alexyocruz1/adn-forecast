const { chromium } = require("playwright");

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto("https://api.sofascore.com/api/v1/sport/football/scheduled-events/2026-05-06", { waitUntil: "domcontentloaded", timeout: 15000 });
    const text = await page.evaluate(() => document.body.innerText);
    const data = JSON.parse(text);
    console.log(`Found ${data.events ? data.events.length : 0} events!`);
    if(data.events && data.events.length > 0) {
      console.log(data.events[0].tournament.name, data.events[0].homeTeam.name, "vs", data.events[0].awayTeam.name);
    }
  } catch (e) {
    console.error("Error:", e.message);
  }
  await browser.close();
}
run();

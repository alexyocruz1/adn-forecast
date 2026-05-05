const { chromium } = require("playwright");

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto("https://api.sofascore.com/api/v1/sport/football/scheduled-events/2026-05-06", { waitUntil: "domcontentloaded", timeout: 15000 });
    const text = await page.evaluate(() => document.body.innerText);
    const data = JSON.parse(text);
    console.log(JSON.stringify(data.events[0], null, 2));
  } catch (e) {
    console.error("Error:", e.message);
  }
  await browser.close();
}
run();

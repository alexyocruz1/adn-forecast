const { chromium } = require("playwright");

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const eventId = "15632635";
  
  try {
    await page.goto(`https://api.sofascore.com/api/v1/event/${eventId}/pregame-form`, { waitUntil: "domcontentloaded" });
    const text = await page.evaluate(() => document.body.innerText);
    console.log(text.substring(0, 500));
  } catch (e) {
    console.error("Error:", e.message);
  }
  await browser.close();
}
run();

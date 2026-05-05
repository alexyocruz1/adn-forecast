const { chromium } = require("playwright");

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto("https://www.sofascore.com/football/2026-05-06", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(3000);
    const content = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log("Sofascore Content:", content);
  } catch (e) {
    console.error("Sofascore error:", e);
  }
  await browser.close();
}
run();

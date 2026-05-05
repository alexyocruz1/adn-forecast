const { chromium } = require("playwright");

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto("https://www.sofascore.com/football/2026-05-06", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(3000);
    const data = await page.evaluate(() => {
      // Find elements containing 'Bayern' to pinpoint a match
      const el = Array.from(document.querySelectorAll('*')).find(e => e.innerText === 'Bayern' && e.childElementCount === 0);
      if (!el) return { error: "Bayern not found" };
      
      const parent = el.closest('a'); // Matches are usually links
      return { html: parent ? parent.innerHTML : "No parent a" };
    });
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(e);
  }
  await browser.close();
}
run();

const { chromium } = require("playwright");

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto("https://www.besoccer.com/livescore/2026-05-06", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);

  const titles = await page.evaluate(() => {
    const panels = Array.from(document.querySelectorAll(".panel-title"));
    const alternativePanels = Array.from(document.querySelectorAll(".panel-header"));
    return {
      panelTitles: panels.map(p => p.innerText.trim()),
      panelHeaders: alternativePanels.map(p => {
        const el = p.querySelector(".title-soccer");
        return el ? el.innerText.trim() : "NO_TITLE";
      })
    };
  });
  console.log("Found titles:", titles);
  await browser.close();
}
run();

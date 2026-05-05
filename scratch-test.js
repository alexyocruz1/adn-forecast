const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const date = new Date().toISOString().split("T")[0];
  await page.goto(`https://www.besoccer.com/livescore/${date}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);
  const titles = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.title-soccer')).map(el => el.innerText.trim());
  });
  console.log(titles);
  await browser.close();
})();

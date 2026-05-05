const { chromium } = require("playwright");

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    const res = await page.goto("https://api.sofascore.com/api/v1/team/42/image", { waitUntil: "networkidle" });
    const buffer = await res.body();
    console.log("Buffer size:", buffer.length);
    console.log("Base64 start:", buffer.toString('base64').substring(0, 50));
  } catch (e) {
    console.error("Error:", e.message);
  }
  await browser.close();
}
run();

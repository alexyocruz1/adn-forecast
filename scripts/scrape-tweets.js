const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

async function scrapeTweets() {
  console.log("🚀 Starting Ninja Scraper...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 1000 }
  });
  const page = await context.newPage();

  try {
    console.log("📅 Navigating to X.com/adn_futbolero_...");
    
    // Use a slightly different URL that sometimes bypasses simple blocks
    await page.goto("https://x.com/adn_futbolero_", { 
      waitUntil: "domcontentloaded",
      timeout: 60000 
    });
    
    console.log("⏳ Waiting for content to appear...");
    
    // Wait for either tweets OR a login wall
    try {
      await page.waitForSelector('article[data-testid="tweet"]', { timeout: 30000 });
    } catch (e) {
      console.log("⚠️ Tweets not found immediately. Checking for blocks or login walls...");
      await page.screenshot({ path: "scraper-error.png", fullPage: true });
      throw new Error("Could not find tweets. See scraper-error.png for what X is showing.");
    }

    console.log("🔍 Extracting tweets...");
    const tweets = await page.evaluate(() => {
      const tweetElements = Array.from(document.querySelectorAll('article[data-testid="tweet"]')).slice(0, 10);
      
      return tweetElements.map(el => {
        const textEl = el.querySelector('div[data-testid="tweetText"]');
        const timeEl = el.querySelector("time");
        const linkEl = el.querySelector('a[href*="/status/"]');
        
        // Extract Media (Images)
        const imageEls = Array.from(el.querySelectorAll('div[data-testid="tweetPhoto"] img'));
        const images = imageEls.map(img => img.src);

        return {
          id: linkEl ? linkEl.href.split("/").pop() : Math.random().toString(),
          text: textEl ? textEl.innerText : "",
          timestamp: timeEl ? timeEl.getAttribute("datetime") : new Date().toISOString(),
          link: linkEl ? `https://x.com${linkEl.getAttribute("href")}` : "#",
          images: images
        };
      });
    });

    if (tweets.length === 0) {
      await page.screenshot({ path: "scraper-empty.png", fullPage: true });
      throw new Error("Found 0 tweets. Check scraper-empty.png");
    }

    console.log(`✅ Successfully scraped ${tweets.length} tweets.`);
    
    // Sync with our API
    const response = await fetch("https://adn-forecast.vercel.app/api/social/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.CRON_SECRET}`
      },
      body: JSON.stringify({ updates: tweets })
    });

    const result = await response.json();
    console.log("📤 Sync Result:", result);

  } catch (error) {
    console.error("❌ Scraper failed:", error.message);
    // Ensure we have a screenshot of the failure
    try {
        await page.screenshot({ path: "scraper-failure.png", fullPage: true });
        console.log("📸 Screenshot saved to scraper-failure.png");
    } catch (sErr) {}
    process.exit(1);
  } finally {
    await browser.close();
  }
}

scrapeTweets();

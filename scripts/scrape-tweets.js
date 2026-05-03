const { chromium } = require("playwright");

async function scrapeTweets() {
  console.log("🚀 Starting scraper...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();

  try {
    console.log("📅 Navigating to X.com/adn_futbolero_...");
    await page.goto("https://x.com/adn_futbolero_", { waitUntil: "networkidle" });
    
    // Wait for tweets to load
    await page.waitForSelector('article[data-testid="tweet"]', { timeout: 15000 });

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
    console.error("❌ Scraper failed:", error);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

scrapeTweets();

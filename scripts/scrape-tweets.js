const { chromium } = require("playwright");

async function scrapeTweets() {
  console.log("🚀 Starting Mirror Scraper (Nitter Mode)...");
  
  // List of Nitter instances to try if one is down
  const instances = [
    "https://nitter.tiekoetter.com",
    "https://nitter.privacydev.net",
    "https://nitter.net",
    "https://nitter.poast.org"
  ];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();

  let tweets = [];
  let success = false;

  for (const instance of instances) {
    try {
      const url = `${instance}/adn_futbolero_`;
      console.log(`📅 Trying instance: ${url}`);
      
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      
      // Wait for timeline items
      await page.waitForSelector(".timeline-item", { timeout: 10000 });

      console.log("🔍 Extracting tweets from mirror (excluding pinned)...");
      tweets = await page.evaluate((instanceUrl) => {
        // Grab more than 10 to account for potential pinned tweet
        const allItems = Array.from(document.querySelectorAll(".timeline-item:not(.show-more)")).slice(0, 15);
        
        const filtered = allItems.filter(el => {
          // Check if this is a pinned tweet
          const isPinned = el.querySelector(".pinned");
          return !isPinned;
        });

        // Now take the top 10
        return filtered.slice(0, 10).map(el => {
          const contentEl = el.querySelector(".tweet-content");
          const dateEl = el.querySelector(".tweet-date a");
          const imageEls = Array.from(el.querySelectorAll(".attachments img"));
          
          const relativeLink = dateEl ? dateEl.getAttribute("href") : "";
          const tweetId = relativeLink.split("/").pop().split("#")[0];
          const xLink = `https://x.com/adn_futbolero_/status/${tweetId}`;

          const rawDate = dateEl ? dateEl.getAttribute("title") : "";
          let cleanDate = new Date().toISOString();
          
          if (rawDate) {
            try {
              // Nitter format: "May 3, 2026 · 6:48 AM UTC"
              // Remove the middle dot and parse
              const parseableDate = rawDate.replace("·", "").trim();
              cleanDate = new Date(parseableDate).toISOString();
            } catch (e) {
              console.error("Date parsing error:", e);
            }
          }

          const images = imageEls.map(img => {
            let src = img.src;
            if (src.startsWith("/")) {
               src = new URL(src, instanceUrl).href;
            }
            return src;
          });

          return {
            id: tweetId || Math.random().toString(),
            text: contentEl ? contentEl.textContent.trim() : "",
            timestamp: cleanDate,
            link: xLink,
            images: images
          };
        });
      }, instance);

      if (tweets.length > 0) {
        success = true;
        console.log(`✅ Successfully scraped ${tweets.length} tweets from ${instance}`);
        break; 
      }
    } catch (err) {
      console.log(`⚠️ Instance ${instance} failed or timed out. Trying next...`);
    }
  }

  if (!success) {
    console.error("❌ All Nitter instances failed. X.com might be heavily blocking or instances are down.");
    await page.screenshot({ path: "nitter-failure.png" });
    process.exit(1);
  }

  try {
    // Sync with our API
    console.log("📤 Sending tweets to ADN Sync API...");
    const response = await fetch("https://adn-forecast.vercel.app/api/social/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.CRON_SECRET}`
      },
      body: JSON.stringify({ updates: tweets })
    });

    const result = await response.json();
    console.log("✅ Sync Result:", result);

  } catch (error) {
    console.error("❌ API Sync failed:", error.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

scrapeTweets();

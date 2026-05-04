const { chromium } = require("playwright");

async function syncSocial() {
  console.log("🚀 Starting Unified Social Sync (X + YouTube + TikTok)...");
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 1000 }
  });
  const page = await context.newPage();

  let allUpdates = [];

  // --- 1. SCRAPE X (via Nitter) ---
  console.log("🐦 Scraping X (Twitter)...");
  const nitterInstances = ["https://nitter.tiekoetter.com", "https://nitter.privacydev.net", "https://nitter.poast.org"];
  for (const instance of nitterInstances) {
    try {
      await page.goto(`${instance}/adn_futbolero_`, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForSelector(".timeline-item", { timeout: 10000 });
      const xUpdates = await page.evaluate((instanceUrl) => {
        const items = Array.from(document.querySelectorAll(".timeline-item:not(.show-more)")).slice(0, 15);
        return items.filter(el => !el.querySelector(".pinned")).slice(0, 10).map(el => {
          const contentEl = el.querySelector(".tweet-content");
          const dateEl = el.querySelector(".tweet-date a");
          const imageEls = Array.from(el.querySelectorAll(".attachments img"));
          const tweetId = dateEl ? dateEl.getAttribute("href").split("/").pop().split("#")[0] : "";
          const rawDate = dateEl ? dateEl.getAttribute("title") : "";
          let cleanDate = new Date().toISOString();
          if (rawDate) { try { cleanDate = new Date(rawDate.replace("·", "").trim()).toISOString(); } catch(e){} }
          return {
            id: `x-${tweetId}`,
            type: "x",
            text: contentEl ? contentEl.textContent.trim() : "",
            timestamp: cleanDate,
            link: `https://x.com/adn_futbolero_/status/${tweetId}`,
            images: imageEls.map(img => img.src.startsWith("/") ? new URL(img.src, instanceUrl).href : img.src)
          };
        });
      }, instance);
      if (xUpdates.length > 0) {
        allUpdates = [...allUpdates, ...xUpdates];
        console.log(`✅ Scraped ${xUpdates.length} tweets.`);
        break;
      }
    } catch (e) { console.log(`⚠️ Nitter ${instance} failed.`); }
  }

  // --- 2. SCRAPE YOUTUBE ---
  console.log("📺 Scraping YouTube...");
  try {
    // We'll check the 'videos' tab which includes shorts and long videos
    await page.goto("https://www.youtube.com/@ADNFutbolero-7/videos", { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForSelector("ytd-rich-item-renderer", { timeout: 15000 });
    const ytUpdates = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll("ytd-rich-item-renderer")).slice(0, 5);
      return items.map(el => {
        const titleEl = el.querySelector("#video-title");
        const linkEl = el.querySelector("a#video-title-link");
        const thumbEl = el.querySelector("img");
        return {
          id: `yt-${linkEl ? linkEl.href.split("v=")[1] || linkEl.href.split("/").pop() : Math.random()}`,
          type: "youtube",
          text: titleEl ? titleEl.innerText.trim() : "Nuevo Video de ADN Futbolero",
          timestamp: new Date().toISOString(), // YouTube relative dates are hard, using current
          link: linkEl ? linkEl.href : "https://www.youtube.com/@ADNFutbolero-7",
          images: thumbEl ? [thumbEl.src] : []
        };
      });
    });
    allUpdates = [...allUpdates, ...ytUpdates];
    console.log(`✅ Scraped ${ytUpdates.length} YouTube videos.`);
  } catch (e) { console.log("❌ YouTube scraping failed:", e.message); }

  // --- 3. SCRAPE TIKTOK (via Mirror) ---
  console.log("📱 Scraping TikTok...");
  const tiktokMirrors = ["https://proxitok.pabloferreiro.es", "https://proxitok.pussthecat.org", "https://tok.artemislena.eu"];
  for (const mirror of tiktokMirrors) {
    try {
      await page.goto(`${mirror}/@adn.futboleroo`, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForSelector("article.media", { timeout: 10000 });
      const ttUpdates = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll("article.media")).slice(0, 5);
        return items.map(el => {
          const captionEl = el.querySelector(".content p");
          const linkEl = el.querySelector("a.button.is-success");
          const videoEl = el.querySelector("video");
          const dateEl = el.querySelector("small[title]");
          return {
            id: `tt-${linkEl ? linkEl.href.split("/").pop() : Math.random()}`,
            type: "tiktok",
            text: captionEl ? captionEl.innerText.trim() : "Nuevo TikTok de ADN Futbolero",
            timestamp: dateEl ? new Date(dateEl.getAttribute("title")).toISOString() : new Date().toISOString(),
            link: `https://www.tiktok.com/@adn.futboleroo`,
            images: videoEl && videoEl.getAttribute("poster") ? [videoEl.getAttribute("poster")] : []
          };
        });
      });
      if (ttUpdates.length > 0) {
        allUpdates = [...allUpdates, ...ttUpdates];
        console.log(`✅ Scraped ${ttUpdates.length} TikToks.`);
        break;
      }
    } catch (e) { console.log(`⚠️ TikTok mirror ${mirror} failed.`); }
  }

  // --- SORT AND SYNC ---
  allUpdates.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (allUpdates.length > 0) {
    console.log(`📤 Sending ${allUpdates.length} total updates to ADN Sync API...`);
    try {
      const response = await fetch("https://adn-forecast.vercel.app/api/social/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.CRON_SECRET}` },
        body: JSON.stringify({ updates: allUpdates })
      });
      console.log("✅ Sync Result:", await response.json());
    } catch (e) { console.error("❌ API Sync failed:", e.message); }
  } else {
    console.log("⚠️ No updates found from any source.");
  }

  await browser.close();
}

syncSocial();

const https = require('https');
https.get("https://api.sofascore.com/api/v1/team/42/image", {
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "https://www.sofascore.com/",
    "Origin": "https://www.sofascore.com",
    "Accept": "image/webp,image/apng,image/*,*/*;q=0.8"
  }
}, (res) => {
  console.log("Status:", res.statusCode);
});

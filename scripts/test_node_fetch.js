async function run() {
  const res = await fetch("https://api.sofascore.com/api/v1/team/42/image", {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": "https://www.sofascore.com/",
      "Origin": "https://www.sofascore.com",
    }
  });
  console.log("Status:", res.status);
  console.log("Content-Type:", res.headers.get("content-type"));
}
run();

const { kv } = require("@vercel/kv");

async function flushDatabase() {
  console.log("⚠️  Flushing Vercel KV Database...");
  try {
    const keys = await kv.keys("*");
    if (keys.length === 0) {
      console.log("Database is already empty.");
      return;
    }
    
    console.log(`Found ${keys.length} keys. Deleting...`);
    
    // Delete in chunks of 100 to avoid request limits
    for (let i = 0; i < keys.length; i += 100) {
      const chunk = keys.slice(i, i + 100);
      await kv.del(...chunk);
    }
    
    console.log("✅ Successfully flushed Vercel KV Database.");
  } catch (error) {
    console.error("❌ Failed to flush database:", error.message);
  }
}

flushDatabase();

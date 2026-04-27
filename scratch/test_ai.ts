import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateBatchForecasts } from "../lib/gemini";
import { Match } from "../lib/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Mock match data
const mockMatches: Match[] = [
  {
    id: 538122,
    competition: "Premier League",
    competitionCode: "PL",
    utcDate: "2026-04-27T19:00:00Z",
    season: 2025,
    homeTeam: {
      id: 66, name: "Manchester United FC", shortName: "Man Utd", tla: "MUN", crest: "",
      position: 7, points: 50, played: 33, won: 15, draw: 5, lost: 13,
      goalsFor: 45, goalsAgainst: 48, goalDifference: -3, form: "WLDDW",
      cleanSheets: 0, failedToScore: 0, yellowCards: 0, redCards: 0
    },
    awayTeam: {
      id: 402, name: "Brentford FC", shortName: "Brentford", tla: "BRE", crest: "",
      position: 15, points: 35, played: 33, won: 9, draw: 8, lost: 16,
      goalsFor: 42, goalsAgainst: 55, goalDifference: -13, form: "DDWLD",
      cleanSheets: 0, failedToScore: 0, yellowCards: 0, redCards: 0
    }
  }
];

async function runTest() {
  console.log("🚀 Starting AI Diagnostic Test...");
  console.log("--------------------------------");
  
  try {
    console.log("1. Checking available models for your key...");
    // @ts-ignore
    const list = await genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Placeholder to check connection
    
    // We try to use a different approach to find models if possible
    console.log("2. Running forecast test with fallback logic...");
    const results = await generateBatchForecasts(mockMatches);
    
    if (results.size > 0) {
      console.log("✅ SUCCESS! AI generated forecasts:");
      console.log(JSON.stringify(Object.fromEntries(results), null, 2));
    } else {
      console.warn("⚠️ WARNING: AI returned zero results. Model fallback failed.");
    }
  } catch (error) {
    console.error("❌ ERROR during AI test:", error);
  }
}

runTest();

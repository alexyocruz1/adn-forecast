import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Match, ForecastResult } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `You are a professional soccer analyst for ADN Futbolero, a Spanish-language soccer forecast account. 
Your job is to analyze match data and produce accurate, confident forecasts.

You will receive a list of multiple matches. You must respond ONLY with a valid JSON array matching the provided schema. Each item in the array must contain the matchId and the forecast object for that match. No preamble, no explanation.

Confidence rules:
- HIGH: Clear statistical advantage for one side (5+ position gap, strong form differential)
- MEDIUM: Some advantage but match is competitive
- LOW: Very close teams, derby, or cup match with unpredictable nature`;

const forecastSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    matchWinner: {
      type: Type.STRING,
      enum: ["HOME", "AWAY", "DRAW"],
      description: "Match winner prediction: HOME, AWAY, or DRAW",
    },
    doubleChance: {
      type: Type.STRING,
      enum: ["1X", "X2", "12"],
      description: "Double chance prediction: 1X (Home or Draw), X2 (Away or Draw), or 12 (Home or Away)",
    },
    overUnder25: {
      type: Type.STRING,
      enum: ["OVER", "UNDER"],
      description: "Will there be OVER or UNDER 2.5 goals in the match?",
    },
    btts: {
      type: Type.STRING,
      enum: ["YES", "NO"],
      description: "Both Teams To Score: YES or NO",
    },
    homeCleanSheet: {
      type: Type.STRING,
      enum: ["YES", "NO"],
      description: "Will the Home team keep a clean sheet (concede 0 goals)?",
    },
    awayCleanSheet: {
      type: Type.STRING,
      enum: ["YES", "NO"],
      description: "Will the Away team keep a clean sheet (concede 0 goals)?",
    },
    confidence: {
      type: Type.STRING,
      enum: ["HIGH", "MEDIUM", "LOW"],
      description: "Confidence level of the overall forecast",
    },
    reasoning: {
      type: Type.STRING,
      description: "2-3 sentences in Spanish explaining the forecast",
    },
    scoreSuggestion: {
      type: Type.STRING,
      description: "Correct score prediction, e.g. 2-1",
    },
    keyFactor: {
      type: Type.STRING,
      description: "One sentence in Spanish identifying the decisive factor",
    },
  },
  required: [
    "matchWinner",
    "doubleChance",
    "overUnder25",
    "btts",
    "homeCleanSheet",
    "awayCleanSheet",
    "confidence",
    "reasoning",
    "scoreSuggestion",
    "keyFactor",
  ],
};

const batchResponseSchema: Schema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      matchId: {
        type: Type.INTEGER,
        description: "The unique ID of the match",
      },
      forecast: forecastSchema,
    },
    required: ["matchId", "forecast"],
  },
};

/**
 * Build user prompt for a single match.
 */
function buildMatchString(match: Match): string {
  return `--- MATCH ID: ${match.id} ---
Match: ${match.homeTeam.name} vs ${match.awayTeam.name}
Competition: ${match.competition}

HOME TEAM — ${match.homeTeam.name}
  Points: ${match.homeTeam.points} in ${match.homeTeam.played} games
  Record: ${match.homeTeam.won}W ${match.homeTeam.draw}D ${match.homeTeam.lost}L
  Goals: ${match.homeTeam.goalsFor} scored, ${match.homeTeam.goalsAgainst} conceded
  Recent Form (last 5): ${match.homeTeam.form}
  Clean Sheets: ${match.homeTeam.cleanSheets} | Failed to Score: ${match.homeTeam.failedToScore}

AWAY TEAM — ${match.awayTeam.name}
  Points: ${match.awayTeam.points} in ${match.awayTeam.played} games
  Record: ${match.awayTeam.won}W ${match.awayTeam.draw}D ${match.awayTeam.lost}L
  Goals: ${match.awayTeam.goalsFor} scored, ${match.awayTeam.goalsAgainst} conceded
  Recent Form (last 5): ${match.awayTeam.form}
  Clean Sheets: ${match.awayTeam.cleanSheets} | Failed to Score: ${match.awayTeam.failedToScore}
`;
}

/**
 * Fallback forecast used when Gemini API fails.
 */
const FALLBACK_FORECAST: ForecastResult["forecast"] = {
  matchWinner: "DRAW",
  doubleChance: "1X",
  overUnder25: "UNDER",
  btts: "YES",
  homeCleanSheet: "NO",
  awayCleanSheet: "NO",
  confidence: "LOW",
  reasoning: "Análisis no disponible debido a la alta demanda.",
  scoreSuggestion: "?-?",
  keyFactor: "-",
};

/**
 * Generate forecasts for multiple matches in a single batch API call.
 * This prevents hitting Gemini's strict "Requests Per Minute" limits on the free tier.
 */
export async function generateBatchForecasts(
  matches: Match[]
): Promise<Map<number, ForecastResult["forecast"]>> {
  const resultFolder = new Map<number, ForecastResult["forecast"]>();

  // If no matches, return empty
  if (matches.length === 0) return resultFolder;

  // Build the massive prompt containing all matches
  const promptContents = matches.map(buildMatchString).join("\n\n");
  const fullPrompt = `Please analyze the following ${matches.length} matches and generate a forecast for each one.\n\n${promptContents}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: fullPrompt,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: batchResponseSchema,
        temperature: 0.2, // Lower temperature for more consistent JSON output
      },
    });

    if (!response.text) {
      console.error("[gemini] No text returned from model in batch request");
      return resultFolder; // Will use fallback in the route
    }

    const parsedArray = JSON.parse(response.text) as { matchId: number; forecast: ForecastResult["forecast"] }[];

    for (const item of parsedArray) {
      if (item.matchId && item.forecast && item.forecast.matchWinner) {
        resultFolder.set(item.matchId, item.forecast);
      }
    }
  } catch (error) {
    console.error("[gemini] Error generating batch forecasts:", error);
  }

  // Pre-fill any missing matches with fallback
  for (const match of matches) {
    if (!resultFolder.has(match.id)) {
      resultFolder.set(match.id, FALLBACK_FORECAST);
    }
  }

  return resultFolder;
}

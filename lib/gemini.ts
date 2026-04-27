import { GoogleGenerativeAI } from "@google/generative-ai";
import { Match, ForecastResult } from "./types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

/**
 * Utility to sleep for rate limiting
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Generates forecasts for a batch of matches with model fallback and retries.
 */
export async function generateBatchForecasts(matches: Match[], retries = 3): Promise<Map<number, ForecastResult["forecast"]>> {
  const models = [
    "gemini-2.0-flash", 
    "gemini-2.5-flash", 
    "gemini-flash-latest",
    "gemini-2.0-flash-lite",
    "gemini-pro-latest"
  ];
  
  const systemPrompt = `
    Eres "Antigravity", el experto analista de apuestas de ADN Futbolero. 
    Tu tarea es generar pronósticos precisos y consistentes.

    REGLAS DE FORMATO (ESTRICTO):
    Responde ÚNICAMENTE con un JSON donde las llaves sean los matchId y el valor sea un objeto con este esquema EXACTO:
    {
      "matchWinner": "HOME" | "AWAY" | "DRAW",
      "doubleChance": "1X" | "X2" | "12",
      "overUnder25": "OVER" | "UNDER",
      "btts": "YES" | "NO",
      "homeCleanSheet": "YES" | "NO",
      "awayCleanSheet": "YES" | "NO",
      "confidence": "HIGH" | "MEDIUM" | "LOW",
      "reasoning": "Texto breve y profesional (Máx 200 caracteres)",
      "scoreSuggestion": "Ej: 2-1",
      "keyFactor": "Frase corta del factor clave"
    }

    REGLAS DE LÓGICA:
    1. Si scoreSuggestion es 1-0, overUnder25 DEBE ser "UNDER".
    2. Si scoreSuggestion es 2-1, btts DEBE ser "YES".
    3. NO menciones falta de datos.
  `;

  const matchesData = matches.map(m => ({
    matchId: m.id,
    match: `${m.homeTeam.name} vs ${m.awayTeam.name}`,
    competition: m.competition,
    stats: {
      home: { form: m.homeTeam.form, position: m.homeTeam.position, points: m.homeTeam.points },
      away: { form: m.awayTeam.form, position: m.awayTeam.position, points: m.awayTeam.points }
    }
  }));

  const userPrompt = `Genera el JSON de pronósticos para estos partidos:\n${JSON.stringify(matchesData, null, 2)}`;

  for (const modelName of models) {
    try {
      console.log(`[gemini] Attempting with model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });

      for (let i = 0; i < retries; i++) {
        try {
          const result = await model.generateContent([systemPrompt, userPrompt]);
          const response = await result.response;
          const text = response.text();
          
          const cleanJson = text.replace(/```json|```/g, "").trim();
          const parsed = JSON.parse(cleanJson);
          
          const resultMap = new Map<number, ForecastResult["forecast"]>();
          for (const [id, forecast] of Object.entries(parsed)) {
            resultMap.set(Number(id), forecast as ForecastResult["forecast"]);
          }
          
          console.log(`[gemini] Success with ${modelName}`);
          return resultMap;
        } catch (error: any) {
          const status = error.status || "UNKNOWN";
          const message = error.message || "No error message";
          
          if (status === 429 || message.includes("429")) {
            console.warn(`[gemini] ${modelName} rate limit hit, retry ${i + 1}/${retries}...`);
            if (i < retries - 1) {
              await sleep(1000 * (i + 1));
              continue;
            }
          } 
          
          console.warn(`[gemini] ${modelName} attempt failed: ${message.substring(0, 100)}...`);
          break; 
        }
      }
    } catch (modelError: any) {
      console.warn(`[gemini] Setup error for ${modelName}: ${modelError.message}`);
      continue; 
    }
  }
  
  return new Map();
}

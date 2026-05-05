import { GoogleGenerativeAI } from "@google/generative-ai";
import { Match, ForecastResult } from "./types";

const apiKeys = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_FALLBACK_API_KEY
].filter(Boolean) as string[];

/**
 * Utility to sleep for rate limiting
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Generates forecasts for a batch of matches with model fallback and retries.
 */
export async function generateBatchForecasts(matches: Match[], retries = 3): Promise<Map<number, ForecastResult["forecast"]>> {
  const models = [
    "gemini-3.1-flash-lite-preview", // 500 RPD limit
    "gemini-2.5-flash",              // 20 RPD limit
    "gemini-flash-latest",           // Maps to Gemini 3 Flash (20 RPD)
    "gemini-2.0-flash"               // 0 RPD limit for this project
  ];

  const systemPrompt = `
    Eres "Antigravity", el experto analista de apuestas de ADN Futbolero con 20 años de experiencia en análisis cuantitativo.
    Tu tarea es generar pronósticos deportivos de alta precisión basados en estadísticas real    INSTRUCCIONES DE ANÁLISIS:
    1. Evalúa la 'forma' (WWDLW) y la posición en la tabla.
    2. FACTOR DE ELITE: Si recibes 'eliteContext', úsalo prioritariamente. 
       - Compara las formaciones tácticas (tacticalShape) para ver quién tiene ventaja posicional.
       - Usa el promedio de tarjetas del árbitro (referee) para predecir la intensidad y riesgo de amonestaciones.
       - Considera el 'momentum' y el 'competitionSplit' para ver si un equipo rinde mejor en esta competición específica.
    3. FACTOR DE SUPERVIVENCIA: Si se han jugado > 65% de los partidos y un equipo está en las últimas 5 posiciones, considera su urgencia.
    4. Usa el promedio de goles anotados (goalsFor/venueStrength) para determinar Over/Under y Clean Sheets.
    
    ESTILO DE REDACCIÓN: Dinámico, profesional y extremadamente CONCISO. Ve directo al grano táctico.
    
    REGLAS DE CONSISTENCIA (OBLIGATORIAS):
    - Si scoreSuggestion suma > 2.5 goles, overUnder25 DEBE ser "OVER".
    - Si ambos anotan en scoreSuggestion, btts DEBE ser "YES".
    - Si un equipo tiene 0 en scoreSuggestion, su rival cleanSheet DEBE ser "YES".
    - NO uses frases vacías. NO menciones que eres una IA.
    - NO uses comillas dobles (") dentro de tus textos.

    FORMATO DE RESPUESTA (ESTRICTO):
    Responde ÚNICAMENTE con un JSON donde las llaves sean los matchId y el valor sea un objeto con este esquema:
    {
      "matchWinner": "HOME" | "AWAY" | "DRAW",
      "doubleChance": "1X" | "X2" | "12",
      "overUnder25": "OVER" | "UNDER",
      "btts": "YES" | "NO",
      "homeCleanSheet": "YES" | "NO",
      "awayCleanSheet": "YES" | "NO",
      "confidence": "HIGH" | "MEDIUM" | "LOW",
      "reasoning": "Análisis táctico profundo basado en datos de ELITE (Máx 350 caracteres)",
      "scoreSuggestion": "Ej: 2-1",
      "keyFactor": "El factor táctico o arbitral determinante (Máx 60 caracteres)"
    }
  `;

  const matchesData = matches.map(m => ({
    matchId: m.id,
    match: `${m.homeTeam.name} vs ${m.awayTeam.name}`,
    competition: m.competition,
    stats: {
      home: {
        form: m.homeTeam.form,
        position: m.homeTeam.position,
        played: m.homeTeam.played,
        goalsFor: m.homeTeam.goalsFor,
        goalsAgainst: m.homeTeam.goalsAgainst,
      },
      away: {
        form: m.awayTeam.form,
        position: m.awayTeam.position,
        played: m.awayTeam.played,
        goalsFor: m.awayTeam.goalsFor,
        goalsAgainst: m.awayTeam.goalsAgainst,
      },
      elite: m.eliteContext || null
    }
  }));

  const userPrompt = `Genera los pronósticos para estos partidos:\n${JSON.stringify(matchesData, null, 2)}`;

  let currentKeyIndex = 0;

  for (const modelName of models) {
    try {
      console.log(`[gemini] Attempting with model: ${modelName} using key index ${currentKeyIndex}`);
      
      let genAI = new GoogleGenerativeAI(apiKeys[currentKeyIndex] || "");
      let model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.4,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
        }
      });

      for (let i = 0; i < retries; i++) {
        try {
          const result = await model.generateContent([systemPrompt, userPrompt]);
          const response = await result.response;
          const text = response.text();

          const cleanJson = text.replace(/```json|```/g, "").trim();
          const parsed = JSON.parse(cleanJson);

          const resultMap = new Map<number, ForecastResult["forecast"]>();

          if (Array.isArray(parsed)) {
            // Handle array response
            for (let j = 0; j < parsed.length; j++) {
              const forecastObj = parsed[j];
              // Try to find the match ID either in the object itself or by matching the array index
              const matchId = forecastObj.matchId || (matchesData[j] ? matchesData[j].matchId : null);
              if (matchId) {
                resultMap.set(Number(matchId), forecastObj as ForecastResult["forecast"]);
              }
            }
          } else {
            // Handle object response (dictionary)
            for (const [id, forecastObj] of Object.entries(parsed)) {
              const numId = Number(id);
              // Sometimes Gemini uses 0, 1, 2 as keys instead of matchIds
              if (numId < matchesData.length && String(matchesData[numId].matchId) !== String(id)) {
                resultMap.set(matchesData[numId].matchId, forecastObj as ForecastResult["forecast"]);
              } else {
                resultMap.set(numId, forecastObj as ForecastResult["forecast"]);
              }
            }
          }

          console.log(`[gemini] Success with ${modelName}`);
          return resultMap;
        } catch (error: any) {
          const status = error.status || "UNKNOWN";
          const message = error.message || "No error message";

          if (status === 429 || message.includes("429")) {
            console.warn(`[gemini] ${modelName} rate limit hit on key ${currentKeyIndex}, waiting 15s before retry ${i + 1}/${retries}...`);
            if (i < retries - 1) {
              await sleep(15000); // Wait a full 15 seconds to let the minute-based rate limit reset
              continue;
            }
            
            // If we exhausted 429 retries, try falling back to the next API key if available
            if (currentKeyIndex < apiKeys.length - 1) {
              console.warn(`[gemini] Primary API key rate limit exhausted. Switching to fallback API key...`);
              currentKeyIndex++;
              // Reinitialize the model with the new key
              genAI = new GoogleGenerativeAI(apiKeys[currentKeyIndex]);
              model = genAI.getGenerativeModel({
                model: modelName,
                generationConfig: {
                  temperature: 0.4,
                  topP: 0.95,
                  topK: 40,
                  maxOutputTokens: 2048,
                  responseMimeType: "application/json",
                }
              });
              // Reset the retry counter to try again with the new key
              i = -1; 
              continue;
            }

            // If we exhausted all 429 retries and have no more fallback keys, abort
            throw new Error(`[gemini] CRITICAL RATE LIMIT EXHAUSTED on ${modelName} across all API keys. Aborting to save quota.`);
          }

          console.warn(`[gemini] ${modelName} attempt failed: ${message.substring(0, 100)}...`);
          break; // If it failed for a reason other than 429 (like invalid JSON output), break and try the next model
        }
      }
    } catch (modelError: any) {
      console.warn(`[gemini] Setup error for ${modelName}: ${modelError.message}`);
      continue;
    }
  }

  return new Map();
}

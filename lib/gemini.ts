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
    Eres "Antigravity", el experto analista de apuestas de ADN Futbolero con 20 años de experiencia en análisis cuantitativo.
    Tu tarea es generar pronósticos deportivos de alta precisión basados en estadísticas reales.

    INSTRUCCIONES DE ANÁLISIS:
    1. Evalúa la 'forma' (WWDLW) y la posición en la tabla.
    2. FACTOR DE SUPERVIVENCIA: Si se han jugado > 65% de los partidos de la temporada y un equipo está en las últimas 5 posiciones, considera su "urgencia por no descender". Estos equipos suelen rendir por encima de su nivel estadístico por pura motivación.
    3. Usa el promedio de goles anotados (goalsFor) y recibidos (goalsAgainst) para determinar el Over/Under, btts, y Clean Sheets.
    4. ESTILO DE REDACCIÓN: Dinámico, profesional y variado. Adapta el tono al contexto (ej: tenso para un derbi, clínico para un favorito claro, épico para una sorpresa). EVITA repetir siempre las mismas palabras (varía entre términos como jerarquía, solvencia, asedio, vulnerabilidad, contundencia, pragmatismo, etc.).
    5. ESTRUCTURA DEL RAZONAMIENTO: Varía la forma en que presentas la información, pero asegúrate de incluir: [Momento actual de los equipos] + [Dato estadístico clave] + [Por qué ocurrirá el resultado]. No uses siempre la misma fórmula introductoria.

    REGLAS DE CONSISTENCIA (OBLIGATORIAS):
    - Si scoreSuggestion suma > 2.5 goles, overUnder25 DEBE ser "OVER".
    - Si ambos anotan en scoreSuggestion, btts DEBE ser "YES".
    - Si un equipo tiene 0 en scoreSuggestion, su rival cleanSheet DEBE ser "YES".
    - NO uses frases vacías como "será un partido reñido". Ve directo al grano táctico.
    - NO menciones que eres una IA o que te faltan datos.
    - NO uses comillas dobles (") dentro de tus textos (usa comillas simples ' ' si es necesario) para evitar corromper el JSON.

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
      "reasoning": "Análisis profundo, variado y profesional (Máx 400 caracteres)",
      "scoreSuggestion": "Ej: 2-1",
      "keyFactor": "El factor táctico determinante (Máx 60 caracteres)"
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
        points: m.homeTeam.points,
        played: m.homeTeam.played,
        goalsFor: m.homeTeam.goalsFor,
        goalsAgainst: m.homeTeam.goalsAgainst,
        goalDifference: m.homeTeam.goalDifference
      },
      away: {
        form: m.awayTeam.form,
        position: m.awayTeam.position,
        points: m.awayTeam.points,
        played: m.awayTeam.played,
        goalsFor: m.awayTeam.goalsFor,
        goalsAgainst: m.awayTeam.goalsAgainst,
        goalDifference: m.awayTeam.goalDifference
      }
    }
  }));

  const userPrompt = `Genera los pronósticos para estos partidos:\n${JSON.stringify(matchesData, null, 2)}`;

  for (const modelName of models) {
    try {
      console.log(`[gemini] Attempting with model: ${modelName}`);
      const model = genAI.getGenerativeModel({
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
            for (let i = 0; i < parsed.length; i++) {
              const forecastObj = parsed[i];
              // Try to find the match ID either in the object itself or by matching the array index
              const matchId = forecastObj.matchId || (matchesData[i] ? matchesData[i].matchId : null);
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

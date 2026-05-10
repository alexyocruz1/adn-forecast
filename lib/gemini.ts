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
    Eres "Antigravity", el experto analista deportivo de ADN Futbolero. Llevas 20 años en el análisis cuantitativo de fútbol internacional.
    
    Tu misión: generar pronósticos ÚNICOS y VARIADOS para cada partido. Cada partido es diferente. Tu análisis debe reflejarlo.

    REGLA PRINCIPAL — VARÍA EL ÁNGULO DE ANÁLISIS:
    Para cada partido, identifica el factor MÁS DETERMINANTE y lidera con él:
    - Si hay una racha de forma clara (ej. 5 victorias seguidas) → lidera con esa inercia
    - Si el árbitro es conocido por tarjetas frecuentes → lidera con el factor arbitral
    - Si es una fase eliminatoria → lidera con la presión y el historial en eliminatorias
    - Si hay asimetría táctica clara (ej. 4-3-3 vs 5-3-2) → lidera con la ventaja posicional
    - Si las estadísticas de goles son extremas (equipo que anota mucho vs defensa sólida) → lidera con eso
    - Si es un derbi o partido de alta rivalidad histórica → lidera con el contexto emocional
    NUNCA empieces el reasoning con "Analizando las formaciones". Usa esa información solo si es genuinamente determinante.

    INSTRUCCIONES DE ANÁLISIS (por prioridad según disponibilidad de datos):
    1. LESIONES CLAVE: Si un jugador mencionado en 'topScorer' o 'topAssists' aparece en la lista de 'injuries' (lesiones), ESTE es el factor más crítico. Debes mencionarlo obligatoriamente en tu reasoning y ajustar tus probabilidades.
    2. MOMENTUM: La forma reciente (WWDLW) es el predictor más fiable. Una racha W-W-W es más potente que cualquier formación.
    3. EXPECTATIVAS DEL MERCADO: Si las 'bettingOdds' muestran un claro favorito (ej. moneyline muy negativa), usa esto como base de la expectativa real del mercado, pero busca ángulos de valor.
    4. CONTEXTO DE COMPETICIÓN: La fase importa (grupos vs eliminatorias), el torneo importa (Copa Libertadores tiene su propia física).
    5. FACTOR ÁRBITRO: Si tienes datos del árbitro con tarjetas altas, úsalo.
    4. TÁCTICA: Solo analiza formaciones si tienen una diferencia estructural real y relevante.
    5. ZERO-DATA: Si todos los stats son 0 o "?????", confía en el conocimiento histórico de los equipos/competición.

    ANTI-REPETICIÓN (CRÍTICO):
    - Cada reasoning en un batch debe ser visiblemente diferente al resto
    - Prohíbido copiar estructura de frases entre partidos del mismo batch
    - Varía el vocabulario: alterna entre "presión", "contragolpe", "transiciones", "solidez defensiva", "ejecución ofensiva"
    - El keyFactor de cada partido DEBE ser único — no repitas el mismo keyFactor dos veces en el batch

    REGLAS DE CONSISTENCIA (OBLIGATORIAS):
    - Si scoreSuggestion suma > 2.5 goles, overUnder25 DEBE ser "OVER"
    - Si ambos anotan en scoreSuggestion, btts DEBE ser "YES"
    - Si un equipo tiene 0 en scoreSuggestion, su rival cleanSheet DEBE ser "YES"
    - NO uses comillas dobles (") dentro de tus textos de reasoning/keyFactor
    - NO menciones que eres una IA

    FORMATO DE RESPUESTA (ESTRICTO — RESPONDER SIEMPRE EN ESPAÑOL):
    Responde ÚNICAMENTE con un JSON donde las llaves sean los matchId y el valor sea un objeto con este esquema exacto:
    {
      "matchWinner": "HOME" | "AWAY" | "DRAW",
      "doubleChance": "1X" | "X2" | "12",
      "overUnder25": "OVER" | "UNDER",
      "btts": "YES" | "NO",
      "homeCleanSheet": "YES" | "NO",
      "awayCleanSheet": "YES" | "NO",
      "confidence": "HIGH" | "MEDIUM" | "LOW",
      "reasoning": "Análisis ÚNICO y DETALLADO en ESPAÑOL para ESTE partido (Máx 350 caracteres)",
      "scoreSuggestion": "Ej: 2-1",
      "keyFactor": "Factor determinante UNICO para este partido y en ESPAÑOL (Máx 60 caracteres)"
    }
  `;

  const matchesData = matches.map(m => {
    // Map the new ESPN data structure to the AI payload
    const homeStats: Record<string, any> = {};
    const awayStats: Record<string, any> = {};

    if (m.homeTeam.record) homeStats.record = m.homeTeam.record;
    if (m.awayTeam.record) awayStats.record = m.awayTeam.record;

    const elite = m.eliteContext;
    if (elite?.homeStats) homeStats.leagueStats = elite.homeStats;
    if (elite?.awayStats) awayStats.leagueStats = elite.awayStats;

    return {
      matchId: m.id,
      match: `${m.homeTeam.name} vs ${m.awayTeam.name}`,
      competition: m.competition,
      ...(elite?.round && { phase: elite.round }),
      ...(Object.keys(homeStats).length && { homeStats }),
      ...(Object.keys(awayStats).length && { awayStats }),
      ...(elite?.odds && { bettingOdds: elite.odds }),
      ...(elite?.h2h && { h2h: elite.h2h }),
      ...(elite?.momentum && { momentum: elite.momentum }),
      ...(elite?.homeInjuries && { homeInjuries: elite.homeInjuries }),
      ...(elite?.awayInjuries && { awayInjuries: elite.awayInjuries }),
      note: "If stats are missing, use your world knowledge about these clubs and this competition."
    };
  });

  const userPrompt = `Genera pronósticos VARIADOS y EXCLUSIVAMENTE EN ESPAÑOL para estos ${matches.length} partidos. Recuerda: cada reasoning y keyFactor debe ser DISTINTO al de los otros partidos del batch.\n\n${JSON.stringify(matchesData, null, 2)}`;

  let currentKeyIndex = 0;

  for (const modelName of models) {
    try {
      console.log(`[gemini] Attempting with model: ${modelName} using key index ${currentKeyIndex}`);

      let genAI = new GoogleGenerativeAI(apiKeys[currentKeyIndex] || "");
      let model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: 0.85,   // Higher = more varied reasoning per match
          topP: 0.95,
          topK: 64,
          maxOutputTokens: 4096,
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

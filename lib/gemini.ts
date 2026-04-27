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
  // Verfied most stable model names
  const models = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"];
  
  const systemPrompt = `
    Eres "Antigravity", el motor de IA de ADN Futbolero, un experto analista de apuestas deportivas con un estilo directo, premium y profesional.
    Tu tarea es generar pronósticos precisos para una lista de partidos de fútbol.

    REGLAS CRÍTICAS DE ANÁLISIS:
    1. LÓGICA DE CONSISTENCIA: Todas las predicciones de un partido DEBEN ser matemáticamente consistentes con el 'scoreSuggestion'.
    2. TONO PROFESIONAL: NUNCA menciones que te faltan datos o que el pronóstico es una conjetura.
    3. IDIOMA: Todo el contenido de texto debe estar en ESPAÑOL neutro y motivador.
    4. FORMATO: Responde ÚNICAMENTE con un objeto JSON donde las llaves sean los matchId.
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

  const userPrompt = `Analiza estos partidos y genera el JSON de pronósticos:\n${JSON.stringify(matchesData, null, 2)}`;

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
          if (error.status === 429 || error.message?.includes("429")) {
            console.warn(`[gemini] ${modelName} rate limit hit, retry ${i + 1}/${retries}...`);
            if (i < retries - 1) {
              await sleep(5000 * (i + 1));
              continue;
            }
          } else {
            throw error; 
          }
        }
      }
    } catch (modelError: any) {
      console.warn(`[gemini] Skipping model ${modelName} due to error: ${modelError.message}`);
      continue; 
    }
  }
  
  return new Map();
}

import { GoogleGenerativeAI } from "@google/generative-ai";
import { Match, ForecastResult } from "./types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

/**
 * Generates forecasts for a batch of matches to optimize token usage and avoid rate limits.
 */
export async function generateBatchForecasts(matches: Match[]): Promise<Map<number, ForecastResult["forecast"]>> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const systemPrompt = `
    Eres "Antigravity", el motor de IA de ADN Futbolero, un experto analista de apuestas deportivas con un estilo directo, premium y profesional.
    Tu tarea es generar pronósticos precisos para una lista de partidos de fútbol.

    REGLAS CRÍTICAS DE ANÁLISIS:
    1. LÓGICA DE CONSISTENCIA: Todas las predicciones de un partido DEBEN ser matemáticamente consistentes con el 'scoreSuggestion'.
       - Si scoreSuggestion es 1-0: matchWinner debe ser HOME, doubleChance debe ser 1X o 12, overUnder25 debe ser UNDER, btts debe ser NO, homeCleanSheet debe ser YES, awayCleanSheet debe ser NO.
       - Si btts es YES: Ambos equipos deben marcar en el scoreSuggestion (ej. 1-1, 2-1).
       - Si overUnder25 es OVER: La suma del scoreSuggestion debe ser >= 3.
    2. TONO PROFESIONAL: NUNCA menciones que te faltan datos, que no tienes información reciente o que el pronóstico es una conjetura. 
       Si los datos estadísticos son limitados, utiliza tu conocimiento general de la liga, la importancia del club y el contexto histórico para dar un análisis experto y fluido.
    3. IDIOMA: Todo el contenido de texto (reasoning, keyFactor) debe estar en ESPAÑOL neutro y motivador.
    4. FORMATO: Responde ÚNICAMENTE con un objeto JSON donde las llaves sean los matchId.

    ESQUEMA JSON POR PARTIDO:
    {
      "matchWinner": "HOME" | "AWAY" | "DRAW",
      "doubleChance": "1X" | "X2" | "12",
      "overUnder25": "OVER" | "UNDER",
      "btts": "YES" | "NO",
      "homeCleanSheet": "YES" | "NO",
      "awayCleanSheet": "YES" | "NO",
      "confidence": "HIGH" | "MEDIUM" | "LOW",
      "reasoning": "2-3 oraciones analizando el estilo de juego o momento actual.",
      "scoreSuggestion": "Puntaje exacto (ej. 2-1)",
      "keyFactor": "Una frase corta que defina el partido (ej. Dominio histórico del local)."
    }
  `;

  const matchesData = matches.map(m => ({
    matchId: m.id,
    match: `${m.homeTeam.name} vs ${m.awayTeam.name}`,
    competition: m.competition,
    stats: {
      home: {
        form: m.homeTeam.form,
        played: m.homeTeam.played,
        goalsFor: m.homeTeam.goalsFor,
        goalsAgainst: m.homeTeam.goalsAgainst,
        cleanSheets: m.homeTeam.cleanSheets,
        failedToScore: m.homeTeam.failedToScore
      },
      away: {
        form: m.awayTeam.form,
        played: m.awayTeam.played,
        goalsFor: m.awayTeam.goalsFor,
        goalsAgainst: m.awayTeam.goalsAgainst,
        cleanSheets: m.awayTeam.cleanSheets,
        failedToScore: m.awayTeam.failedToScore
      }
    }
  }));

  const userPrompt = `Analiza estos partidos y genera el JSON de pronósticos:\n${JSON.stringify(matchesData, null, 2)}`;

  try {
    const result = await model.generateContent([systemPrompt, userPrompt]);
    const response = await result.response;
    const text = response.text();
    
    // Clean JSON response (sometimes Gemini adds ```json ... ```)
    const cleanJson = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleanJson);
    
    const resultMap = new Map<number, ForecastResult["forecast"]>();
    for (const [id, forecast] of Object.entries(parsed)) {
      resultMap.set(Number(id), forecast as ForecastResult["forecast"]);
    }
    
    return resultMap;
  } catch (error) {
    console.error("[gemini] Error generating batch forecasts:", error);
    // Fallback logic handled by caller
    return new Map();
  }
}

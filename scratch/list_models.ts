import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

async function listModels() {
  console.log("🕵️‍♂️ Querying Google AI for available models...");
  console.log("------------------------------------------");
  
  try {
    // Note: The listModels API requires a different endpoint, 
    // we'll try to fetch it manually to be sure
    const apiKey = process.env.GEMINI_API_KEY;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    
    if (data.models) {
      console.log("✅ Models found:");
      data.models.forEach((m: any) => {
        console.log(`- ${m.name} (Supports: ${m.supportedGenerationMethods.join(", ")})`);
      });
    } else {
      console.warn("⚠️ No models returned in the list. Response:", JSON.stringify(data));
    }
  } catch (error) {
    console.error("❌ Error listing models:", error);
  }
}

listModels();

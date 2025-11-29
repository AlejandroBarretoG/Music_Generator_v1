
import { GoogleGenAI } from "@google/genai";

// 1x1 Red Pixel Base64 for Vision Test
const SAMPLE_IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export interface TestResult {
  success: boolean;
  message: string;
  data?: any;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

const getAIClient = (apiKey: string) => {
  if (!apiKey) {
    throw new Error("API Key es requerida.");
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Generate Musical Pattern (4-Bar Loop)
 * Generates a 5-track modular pattern designed for looping.
 * Uses Tone.js Time Notation (Bars:Beats:Sixteenths).
 */
export const generateMusicalPattern = async (apiKey: string, style: string) => {
  try {
    const ai = getAIClient(apiKey);
    const modelId = 'gemini-2.5-flash';
    
    const prompt = `
      Actúa como un productor musical experto AI.
      Genera un "Patrón Musical Modular" de exactamente 4 compases (4 bars).
      Estilo: "${style}".
      
      Estructura de 5 Pistas (Tracks):
      1. melody (Lead Synth)
      2. harmony (Chords/Piano)
      3. pad (Atmosphere)
      4. bass (Bassline)
      5. drums (Rhythm)
      
      IMPORTANTE: Responde SOLO con un objeto JSON válido.
      Estructura del JSON:
      {
        "bpm": 120,
        "key": "C Minor",
        "timeSignature": "4/4",
        "tracks": {
          "melody": [ {"note": "C5", "duration": "8n", "time": "0:0:0"} ],
          "harmony": [ {"note": "C4", "duration": "1m", "time": "0:0:0"} ],
          "pad": [ {"note": "C3", "duration": "1m", "time": "0:0:0"} ],
          "bass":   [ {"note": "C2", "duration": "2n", "time": "0:0:0"} ],
          "drums":  [ {"instrument": "kick", "time": "0:0:0"}, {"instrument": "snare", "time": "0:1:0"}, {"instrument": "hihat", "time": "0:0:2"} ]
        }
      }
      
      Reglas:
      1. Usa notación "Bars:Beats:Sixteenths" (ej: "0:0:0", "3:3:0").
      2. El patrón debe ser un LOOP perfecto (la última nota no debe chocar con el inicio del siguiente loop).
      3. Duración máxima: 4 compases (termina antes de "4:0:0").
    `;

    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        responseMimeType: "application/json" 
      }
    });

    const jsonText = response.text;
    if (!jsonText) throw new Error("Respuesta vacía de Gemini");

    return { success: true, data: JSON.parse(jsonText) };

  } catch (error: any) {
    return { success: false, message: error.message };
  }
};

export const runGeminiTests = {
  /**
   * 1. Auth & Connection Test
   * Verifies if the client can be instantiated and checks connectivity.
   */
  connect: async (apiKey: string, modelId: string = 'gemini-2.5-flash'): Promise<TestResult> => {
    try {
      const ai = getAIClient(apiKey);
      // We perform a very cheap call to verify the key.
      const response = await ai.models.generateContent({
        model: modelId,
        contents: 'ping',
      });
      
      if (response && response.text) {
        return { success: true, message: `Conexión exitosa con ${modelId}.`, data: { reply: response.text } };
      } else {
        throw new Error("Respuesta vacía del servidor.");
      }
    } catch (error: any) {
      return { success: false, message: error.message || "Error de conexión" };
    }
  },

  /**
   * 2. Text Generation Test
   * Tests standard text generation capabilities.
   */
  generateText: async (apiKey: string, modelId: string = 'gemini-2.5-flash'): Promise<TestResult> => {
    try {
      const ai = getAIClient(apiKey);
      const prompt = "Responde con una sola palabra: 'Funciona'";
      
      const response = await ai.models.generateContent({
        model: modelId,
        contents: prompt,
      });

      const text = response.text;
      return { success: true, message: "Generación de texto correcta.", data: { model: modelId, prompt, output: text } };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },

  /**
   * 3. Streaming Test
   * Tests the streaming capability of the API.
   */
  streamText: async (apiKey: string, modelId: string = 'gemini-2.5-flash'): Promise<TestResult> => {
    try {
      const ai = getAIClient(apiKey);
      const prompt = "Escribe los números del 1 al 5 separados por comas.";
      
      const responseStream = await ai.models.generateContentStream({
        model: modelId,
        contents: prompt,
      });

      let fullText = "";
      let chunkCount = 0;
      
      for await (const chunk of responseStream) {
        fullText += chunk.text;
        chunkCount++;
      }

      return { 
        success: true, 
        message: `Streaming completado en ${chunkCount} fragmentos.`, 
        data: { model: modelId, fullText, chunkCount } 
      };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },

  /**
   * 4. Token Count Test
   * Verifies the token counting endpoint.
   */
  countTokens: async (apiKey: string, modelId: string = 'gemini-2.5-flash'): Promise<TestResult> => {
    try {
      const ai = getAIClient(apiKey);
      const prompt = "Why is the sky blue?";
      
      const response = await ai.models.countTokens({
        model: modelId,
        contents: prompt,
      });

      return { 
        success: true, 
        message: "Conteo de tokens exitoso.", 
        data: { model: modelId, prompt, totalTokens: response.totalTokens } 
      };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },

  /**
   * 5. Vision (Multimodal) Test
   * Tests sending an image along with text.
   */
  vision: async (apiKey: string, modelId: string = 'gemini-2.5-flash'): Promise<TestResult> => {
    try {
      const ai = getAIClient(apiKey);
      
      // Note: Some models like Flash Lite might have limitations on vision, 
      // but generally standard Flash and Pro support it.
      const response = await ai.models.generateContent({
        model: modelId,
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/png', data: SAMPLE_IMAGE_BASE64 } },
            { text: "Describe esta imagen en 5 palabras o menos. (Es un pixel rojo)" }
          ]
        }
      });

      return { 
        success: true, 
        message: "Análisis de visión completado.", 
        data: { model: modelId, output: response.text } 
      };
    } catch (error: any) {
      return { success: false, message: `Error en visión (${modelId}): ${error.message}` };
    }
  },

  /**
   * 6. System Instruction Test
   * Tests if the model respects system instructions.
   */
  systemInstruction: async (apiKey: string, modelId: string = 'gemini-2.5-flash'): Promise<TestResult> => {
    try {
      const ai = getAIClient(apiKey);
      const instruction = "Eres un gato. Responde solo con 'Miau'.";
      const prompt = "Hola, ¿cómo estás?";
      
      const response = await ai.models.generateContent({
        model: modelId,
        contents: prompt,
        config: {
          systemInstruction: instruction
        }
      });
      
      const text = response.text || "";
      const isCorrect = text.toLowerCase().includes("miau");
      
      return {
        success: isCorrect,
        message: isCorrect ? "Instrucción del sistema respetada." : "El modelo no siguió la instrucción del sistema estrictamente.",
        data: { model: modelId, instruction, prompt, output: text }
      };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },

  /**
   * 7. Embedding Test
   * Tests generating embeddings for text.
   */
  embedding: async (apiKey: string): Promise<TestResult> => {
    try {
      const ai = getAIClient(apiKey);
      const text = "Prueba de embedding";
      const model = "text-embedding-004"; 
      
      const response = await ai.models.embedContent({
        model: model,
        contents: [{ parts: [{ text: text }] }]
      });

      const values = response.embeddings?.[0]?.values;

      if (values) {
        return {
          success: true,
          message: `Vector generado correctamente.\nDimensiones: ${values.length}\nMuestra: [${values.slice(0, 3).join(', ')}...]`,
          data: { model, vectorLength: values.length }
        };
      } else {
        console.warn("Embedding response missing values:", response);
        return {
            success: false,
            message: `Fallo: Respuesta vacía o malformada.\nRespuesta Cruda: ${JSON.stringify(response, null, 2)}` 
        };
      }
      
    } catch (error: any) {
        console.error("Error Embeddings Catch:", error);
        return {
            success: false,
            message: `Excepción en Embeddings: ${error.message || error}\n${JSON.stringify(error, null, 2)}`
        };
    }
  },

  /**
   * 8. Generate Chat Response
   * Generates a response based on chat history and system instructions.
   */
  generateChatResponse: async (
    apiKey: string, 
    modelId: string, 
    systemInstruction: string, 
    history: ChatMessage[], 
    newMessage: string
  ): Promise<string> => {
    try {
      const ai = getAIClient(apiKey);

      // Construct the conversation history for the model
      const contents = history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
      }));

      // Add the new user message
      contents.push({
        role: 'user',
        parts: [{ text: newMessage }]
      });

      const response = await ai.models.generateContent({
        model: modelId,
        contents: contents,
        config: {
          systemInstruction: systemInstruction
        }
      });

      return response.text || "(Sin respuesta)";
    } catch (error: any) {
      console.error("Chat Error:", error);
      throw new Error(`Error en IA: ${error.message}`);
    }
  }
};

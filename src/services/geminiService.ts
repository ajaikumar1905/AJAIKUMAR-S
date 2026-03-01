import { GoogleGenAI, Modality, Content, Part } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY!;
const ai = new GoogleGenAI({ apiKey });

export interface Message {
  role: "user" | "model";
  text: string;
  audioUrl?: string;
}

export async function chatWithGemini(
  history: Content[],
  userInput: string | { data: string; mimeType: string }
): Promise<{ text: string; audioBase64?: string }> {
  const model = "gemini-3-flash-preview";
  
  let userPart: Part;
  if (typeof userInput === "string") {
    userPart = { text: userInput };
  } else {
    userPart = {
      inlineData: {
        data: userInput.data,
        mimeType: userInput.mimeType,
      },
    };
  }

  const contents: Content[] = [...history, { role: "user", parts: [userPart] }];

  // 1. Get Text Response
  const textResponse = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction: "You are EchoMind, a helpful and articulate AI assistant. You communicate clearly and concisely. If the user provides audio, acknowledge it and respond appropriately.",
    },
  });

  const responseText = textResponse.text || "I'm sorry, I couldn't generate a response.";

  // 2. Generate Audio (TTS)
  let audioBase64: string | undefined;
  try {
    const ttsResponse = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: responseText }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: "Zephyr" },
          },
        },
      },
    });

    audioBase64 = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (error) {
    console.error("TTS Generation failed:", error);
  }

  return {
    text: responseText,
    audioBase64,
  };
}

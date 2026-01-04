
import { GoogleGenAI, Chat, Modality, LiveServerMessage } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "../constants";

const getAIInstance = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing. Please ensure process.env.API_KEY is defined.");
  }
  return new GoogleGenAI({ apiKey });
};

export const createIslamicChat = (useSearch = false): Chat => {
  const ai = getAIInstance();
  return ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.7,
      topP: 0.95,
      topK: 40,
      ...(useSearch ? { tools: [{ googleSearch: {} }] } : {})
    },
  });
};

export const analyzeImage = async (prompt: string, base64Image: string, mimeType: string) => {
  const ai = getAIInstance();
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [
        { inlineData: { data: base64Image, mimeType } },
        { text: prompt }
      ]
    },
    config: {
      systemInstruction: SYSTEM_INSTRUCTION
    }
  });
  return response.text;
};

export const refineContent = async (text: string, action: 'summarize' | 'kids' | 'academic' | 'related') => {
  const ai = getAIInstance();
  const prompts = {
    summarize: "Berikan ringkasan poin-poin penting dari teks berikut tanpa menghilangkan esensi Islaminya. HANYA berikan ringkasannya saja.",
    kids: "Jelaskan ulang teks berikut dengan bahasa yang sangat sederhana agar mudah dipahami oleh anak usia 7-10 tahun. Tetap sertakan nilai moralnya.",
    academic: "Berikan analisis akademik lebih dalam dan sertakan referensi literatur Islam klasik (seperti Kitab Kuning) yang relevan dengan bahasan ini.",
    related: "Berikan 3-5 pertanyaan lanjutan atau topik terkait yang layak dipelajari untuk mendalami bahasan ini."
  };

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [{ text: `${prompts[action]}\n\nTEKS:\n${text}` }]
    },
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.5
    }
  });
  return response.text;
};

export const transcribeAudio = async (base64Audio: string) => {
  const ai = getAIInstance();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { data: base64Audio, mimeType: 'audio/wav' } },
        { text: "Tolong transkripsikan audio berikut. Audio ini mungkin berisi bahasa Indonesia, teks Arab (ayat Al-Quran/doa), atau campuran keduanya. HANYA berikan hasil transkripsinya saja. Jika ada teks Arab, tuliskan dalam aksara Arab yang benar beserta harakatnya. Jangan tambahkan kata pengantar atau penjelasan apa pun." }
      ]
    }
  });
  
  let text = response.text || "";
  text = text.replace(/^(berikut adalah|ini adalah|hasil transkripsi|transkripsi dari audio).*?:/gi, "").trim();
  return text;
};

export const generateSpeech = async (text: string) => {
  const ai = getAIInstance();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Bacakan teks berikut dengan khidmat dan jelas: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' },
        },
      },
    },
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};

export const connectLiveVoice = async (callbacks: {
  onopen: () => void;
  onmessage: (message: LiveServerMessage) => void;
  onerror: (e: any) => void;
  onclose: (e: any) => void;
}) => {
  const ai = getAIInstance();
  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
      },
      systemInstruction: SYSTEM_INSTRUCTION + " Gunakan bahasa Indonesia yang ramah.",
    }
  });
};

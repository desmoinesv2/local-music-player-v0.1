import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.API_KEY || ''; // In a real app, handle missing key gracefully
const ai = new GoogleGenAI({ apiKey });

export const generateLyrics = async (artist: string, title: string): Promise<string> => {
  if (!apiKey) return `[00:00.00] API Key missing.\n[00:05.00] Please configure your Gemini API Key.`;

  try {
    const prompt = `Generate synchronized lyrics in standard LRC format for the song "${title}" by "${artist}". 
    The output must be strictly in LRC format (e.g., [mm:ss.xx] Lyric text). 
    Do not add any conversational text, just the LRC content.
    If you don't know the exact timing, estimate it reasonably based on a standard song structure or provide just the text with approximated timestamps spaced out every 4 seconds.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || '';
  } catch (error) {
    console.error("Gemini lyric generation failed:", error);
    return `[00:00.00] Could not generate lyrics.\n[00:05.00] Please try again later.`;
  }
};

export const getSongInsight = async (artist: string, title: string): Promise<string> => {
  if (!apiKey) return "API Key missing.";

  try {
    const prompt = `Provide a short, 2-sentence fun fact or emotional insight about the song "${title}" by "${artist}". Keep it concise and interesting for a music player display.`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    return response.text || 'Enjoy the music!';
  } catch (error) {
    return 'Music is the universal language of mankind.';
  }
};

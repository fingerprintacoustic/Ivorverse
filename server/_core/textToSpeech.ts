/**
 * Text-to-speech via OpenAI's Audio Speech API (gpt-4o-mini-tts).
 *
 * Replaces voice.generateSpeech's previous stub, which ignored its input and
 * always returned "https://example.com/audio.mp3". Reuses OPENAI_API_KEY
 * (already required for Whisper transcription and image generation).
 */
import OpenAI from "openai";
import { storagePut } from "server/storage";

export const TTS_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const;
export type TtsVoice = (typeof TTS_VOICES)[number];

/** OpenAI's hard limit on input length per request. */
export const TTS_MAX_CHARS = 4096;

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

export async function generateSpeech(options: {
  text: string;
  userId: number;
  voice?: TtsVoice;
  /** Delivery guidance, e.g. "Speak warmly and at a relaxed pace." */
  instructions?: string;
}): Promise<{ url: string; key: string }> {
  const speech = await getClient().audio.speech.create({
    model: "gpt-4o-mini-tts",
    voice: options.voice ?? "coral",
    input: options.text.slice(0, TTS_MAX_CHARS),
    instructions: options.instructions,
    response_format: "mp3",
  });

  const buffer = Buffer.from(await speech.arrayBuffer());
  return await storagePut(`${options.userId}/voice/speech.mp3`, buffer, "audio/mpeg");
}

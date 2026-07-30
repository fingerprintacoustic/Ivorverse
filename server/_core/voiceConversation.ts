import { transcribeAudio } from "./voiceTranscription";
import { invokeLLM } from "./llm";

/**
 * Voice Conversation System
 * Handles speech-to-text, LLM processing, and text-to-speech
 */

export interface VoiceMessage {
  audioUrl: string;
  language?: string;
  userId: string;
  conversationId: string;
}

export interface VoiceResponse {
  transcribedText: string;
  aiResponse: string;
  audioUrl?: string;
  confidence: number;
}

/**
 * Process voice input and generate voice response
 */
export async function processVoiceMessage(
  input: VoiceMessage
): Promise<VoiceResponse> {
  try {
    // Step 1: Transcribe audio to text
    const transcription = await transcribeAudio({
      audioUrl: input.audioUrl,
      language: input.language || "en",
      prompt: "Transcribe the user's spoken message clearly.",
    });

    // Handle both successful transcription and error responses
    if ("error" in transcription) {
      throw new Error(`Transcription failed: ${transcription.error}`);
    }

    const transcribedText = transcription.text || "";
    const confidence = 0.9; // Default confidence

    // Step 2: Send to LLM for processing
    const aiResponse = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are a helpful AI assistant. Respond naturally and concisely to voice input.",
        },
        {
          role: "user",
          content: transcribedText,
        },
      ],
    });

    const responseContent = aiResponse.choices[0]?.message.content;
    const responseText =
      typeof responseContent === "string"
        ? responseContent
        : "I couldn't generate a response.";

    return {
      transcribedText,
      aiResponse: responseText,
      confidence,
    };
  } catch (error) {
    console.error("[VoiceConversation] Error processing voice message:", error);
    throw error;
  }
}

/**
 * Voice Activity Detection - determines if audio contains speech
 */
export function detectVoiceActivity(audioBuffer: Float32Array): boolean {
  if (!audioBuffer || audioBuffer.length === 0) return false;

  // Calculate RMS (Root Mean Square) energy
  let sum = 0;
  for (let i = 0; i < audioBuffer.length; i++) {
    sum += audioBuffer[i] * audioBuffer[i];
  }

  const rms = Math.sqrt(sum / audioBuffer.length);

  // If RMS is above threshold (0.01), voice activity detected
  const threshold = 0.01;
  return rms > threshold;
}

/**
 * Continuous conversation mode
 * Keeps listening for voice input and responds
 */
export async function startContinuousConversation(
  userId: string,
  conversationId: string,
  onMessage: (response: VoiceResponse) => void,
  onError: (error: Error) => void
): Promise<() => void> {
  let isListening = true;

  const stopListening = () => {
    isListening = false;
  };

  // Simulate continuous listening loop
  const listenLoop = async () => {
    while (isListening) {
      try {
        // In real implementation, this would capture audio from microphone
        // For now, this is a placeholder for the listening loop
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  };

  // Start listening in background
  listenLoop().catch((error) => {
    onError(error instanceof Error ? error : new Error(String(error)));
  });

  return stopListening;
}

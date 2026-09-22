import { transcribeAudio } from "./voiceTranscription";
import { invokeLLM } from "./llm";
import { generateSpeech, type TtsVoice } from "./textToSpeech";

/**
 * Voice conversation: one spoken turn → transcript → LLM reply → spoken reply.
 *
 * The browser owns the "continuous" part: it records a turn with
 * MediaRecorder, uploads it, calls this, plays the reply, and repeats. The
 * previous version of this file had a server-side startContinuousConversation
 * that was an empty sleep loop (it never captured or processed any audio) and
 * a processVoiceMessage that nothing called and that never produced audio.
 */

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface VoiceTurnResult {
  transcript: string;
  reply: string;
  replyAudioUrl: string;
}

const SYSTEM_PROMPT =
  "You are IvorVerse's voice assistant. Your replies are converted to speech, so " +
  "answer conversationally in a few short sentences. Never use markdown, lists, " +
  "code blocks, URLs, or emoji — only plain spoken prose.";

export async function processVoiceTurn(input: {
  audioUrl: string;
  userId: number;
  history: ConversationTurn[];
  language?: string;
  voice?: TtsVoice;
}): Promise<VoiceTurnResult> {
  const transcription = await transcribeAudio({
    audioUrl: input.audioUrl,
    language: input.language,
  });
  if ("error" in transcription) {
    throw new Error(`${transcription.error}${transcription.details ? `: ${transcription.details}` : ""}`);
  }

  const transcript = transcription.text.trim();
  if (!transcript) {
    throw new Error("No speech was detected in the recording");
  }

  const response = await invokeLLM({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...input.history,
      { role: "user", content: transcript },
    ],
    maxTokens: 400,
  });

  const content = response.choices[0]?.message.content;
  const reply =
    typeof content === "string" && content.trim()
      ? content.trim()
      : "Sorry, I couldn't come up with a response to that.";

  const { url } = await generateSpeech({ text: reply, userId: input.userId, voice: input.voice });

  return { transcript, reply, replyAudioUrl: url };
}

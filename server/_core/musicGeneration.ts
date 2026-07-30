/**
 * Real song audio generation via ACE-Step, an open-weight (Apache 2.0)
 * music foundation model — not Suno. Suno has no public API and no
 * self-hostable weights (proprietary, closed), so it was never an option
 * to call or clone directly. ACE-Step is a genuinely open model that
 * independent benchmarks (SongEval) have shown outperforming Suno v5 on
 * some dimensions, runs on modest consumer GPU hardware, and is fully
 * self-hostable — no per-track vendor lock-in, no ToS risk.
 *
 * This module calls fal.ai's hosted inference for ACE-Step rather than
 * standing up our own GPU infrastructure: same open model, same output,
 * zero ops burden. If full independence from fal.ai is ever wanted, the
 * exact same weights can be self-hosted (e.g. via the ACE-Step Docker
 * image on RunPod) and this module's HTTP call swapped for that endpoint
 * — the interface below (GenerateMusicOptions/GenerateMusicResponse)
 * doesn't need to change either way.
 */
import { fal } from "@fal-ai/client";

export type GenerateMusicOptions = {
  prompt: string; // style/genre/mood description
  lyrics?: string;
  instrumental?: boolean;
  durationSeconds?: number;
};

export type GenerateMusicResponse = {
  audioUrl: string;
  seed: number;
};

function ensureConfigured() {
  if (!process.env.FAL_KEY) {
    throw new Error("FAL_KEY is not configured");
  }
  fal.config({ credentials: process.env.FAL_KEY });
}

export async function generateMusic(
  options: GenerateMusicOptions
): Promise<GenerateMusicResponse> {
  ensureConfigured();

  // Explicit lyrics -> use the tags+lyrics endpoint directly for full
  // control. No lyrics (or instrumental) -> let ACE-Step derive tags and
  // lyrics from the prompt itself.
  const useExplicitLyrics = !!options.lyrics && !options.instrumental;

  const result = useExplicitLyrics
    ? await fal.subscribe("fal-ai/ace-step", {
        input: {
          tags: options.prompt,
          lyrics: options.lyrics,
          duration: options.durationSeconds ?? 60,
        },
      })
    : await fal.subscribe("fal-ai/ace-step/prompt-to-audio", {
        input: {
          prompt: options.prompt,
          instrumental: options.instrumental ?? false,
          duration: options.durationSeconds ?? 60,
        },
      });

  const data = result.data as { audio: { url: string }; seed: number };

  if (!data?.audio?.url) {
    throw new Error("Music generation returned no audio.");
  }

  return { audioUrl: data.audio.url, seed: data.seed };
}

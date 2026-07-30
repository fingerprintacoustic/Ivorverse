/**
 * Music generation (full song audio, not just lyrics/structure text).
 *
 * IMPORTANT: As of mid-2026, Suno has no official public developer API.
 * Suno's own product team has said they're exploring a partner API, but it
 * is not self-serve and there is no published endpoint/pricing/SLA. What
 * exists today are third-party reverse-engineered wrappers around Suno's
 * private web-app endpoints — these work, but carry real ToS/legal risk
 * since they're unauthorized by Suno, and can break without notice.
 *
 * This module does NOT hard-wire one of those wrappers without an explicit
 * decision, since that's a legal/business call, not just an engineering one.
 * Instead it exposes a pluggable provider interface. To activate it:
 *
 *   1. Pick a provider (an unofficial Suno wrapper, or an official
 *      alternative like MiniMax Music which does have a published API).
 *   2. Implement `MusicProvider` for it below.
 *   3. Set MUSIC_PROVIDER + the provider's API key env var.
 *
 * Until configured, generateMusic throws a clear, actionable error instead
 * of silently no-op'ing or fabricating audio.
 */

export type GenerateMusicOptions = {
  prompt: string; // style/genre/mood description
  lyrics?: string;
  instrumental?: boolean;
  durationSeconds?: number;
};

export type GenerateMusicResponse = {
  audioUrl: string;
  durationSeconds?: number;
};

interface MusicProvider {
  name: string;
  generate(options: GenerateMusicOptions): Promise<GenerateMusicResponse>;
}

/**
 * Example provider stub for MiniMax Music (which does publish an official
 * API, as of the research done for this migration) — fill in the endpoint
 * details from MiniMax's current docs before use; not implemented here
 * since it wasn't confirmed against a live account/key.
 */
class MiniMaxMusicProvider implements MusicProvider {
  name = "minimax";
  async generate(_options: GenerateMusicOptions): Promise<GenerateMusicResponse> {
    throw new Error(
      "MiniMax Music provider is scaffolded but not implemented — wire up the " +
        "actual endpoint/auth from MiniMax's current API docs before enabling it."
    );
  }
}

/**
 * Placeholder for an unofficial Suno wrapper. Deliberately left
 * unimplemented — using one of these is a legal/ToS-risk decision that
 * should be made explicitly, not defaulted into.
 */
class UnofficialSunoProvider implements MusicProvider {
  name = "suno-unofficial";
  async generate(_options: GenerateMusicOptions): Promise<GenerateMusicResponse> {
    throw new Error(
      "No unofficial Suno provider is wired up. Using a reverse-engineered " +
        "Suno wrapper carries ToS/legal risk since it's unauthorized by Suno — " +
        "confirm you want to proceed with a specific provider before implementing this."
    );
  }
}

function getProvider(): MusicProvider {
  const providerName = process.env.MUSIC_PROVIDER;
  switch (providerName) {
    case "minimax":
      return new MiniMaxMusicProvider();
    case "suno-unofficial":
      return new UnofficialSunoProvider();
    default:
      throw new Error(
        "No music generation provider configured. Set MUSIC_PROVIDER to 'minimax' " +
          "(official API, needs implementation) or 'suno-unofficial' (unofficial, " +
          "carries ToS risk) — see server/_core/musicGeneration.ts for details."
      );
  }
}

export async function generateMusic(
  options: GenerateMusicOptions
): Promise<GenerateMusicResponse> {
  const provider = getProvider();
  return await provider.generate(options);
}

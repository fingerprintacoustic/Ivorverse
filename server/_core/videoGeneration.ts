/**
 * Real music video generation — assembles scene images, song audio, and
 * timed lyric subtitles into an actual MP4, using ffmpeg inside an E2B
 * sandbox (the same infrastructure appBuilder.ts uses for the App Builder).
 *
 * This replaces what was previously a complete UI mockup (VideoFeature.tsx
 * had hardcoded "Duration: 3:45", static placeholder scene boxes, and a
 * non-functional "Assembling Video..." button with no backend at all).
 *
 * Pipeline:
 *   1. Download the audio and each scene image into the sandbox
 *   2. Probe the audio's real duration with ffprobe (don't trust the
 *      requested duration — actual generated audio can differ slightly)
 *   3. Build an .srt subtitle file from the lyrics, evenly timed across
 *      the audio duration (simple heuristic — not word-level alignment)
 *   4. Ken-Burns-style zoom/pan on each scene image, concatenated to fill
 *      the audio's duration, subtitles burned in, muxed with the audio
 *   5. Read the rendered file back out and upload it to Firebase Storage
 */
import { Sandbox } from "e2b";
import { storagePut } from "../storage";

export type GenerateMusicVideoOptions = {
  audioUrl: string;
  sceneImageUrls: string[]; // at least 1
  lyrics?: string; // used to generate burned-in subtitles if provided
  timeoutMs?: number;
};

export type GenerateMusicVideoResult = {
  videoUrl: string;
  durationSeconds: number;
};

const DEFAULT_TIMEOUT_MS = 15 * 60 * 1000; // video rendering is slower than app builds

/** Turn raw lyrics into cue lines for subtitles: drop [Verse]/[Chorus]-style
 * section markers and blank lines, keep everything else as one cue per line. */
function lyricsToCueLines(lyrics: string): string[] {
  return lyrics
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/^\[.+\]$/.test(line));
}

function formatSrtTimestamp(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const ms = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

function buildSrt(cueLines: string[], durationSeconds: number): string {
  if (cueLines.length === 0) return "";
  const perCue = durationSeconds / cueLines.length;
  return cueLines
    .map((line, i) => {
      const start = i * perCue;
      const end = Math.min((i + 1) * perCue, durationSeconds);
      return `${i + 1}\n${formatSrtTimestamp(start)} --> ${formatSrtTimestamp(end)}\n${line}\n`;
    })
    .join("\n");
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url} (${resp.status})`);
  return await resp.arrayBuffer();
}

export async function generateMusicVideo(
  options: GenerateMusicVideoOptions
): Promise<GenerateMusicVideoResult> {
  if (!process.env.E2B_API_KEY) {
    throw new Error("E2B_API_KEY is not configured");
  }
  if (options.sceneImageUrls.length === 0) {
    throw new Error("At least one scene image is required");
  }

  const sandbox = await Sandbox.create({
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  });

  try {
    // ffmpeg isn't in the base template — install it.
    const install = await sandbox.commands.run(
      "apt-get update -qq && apt-get install -y -qq ffmpeg"
    );
    if (install.exitCode !== 0) {
      throw new Error(`Failed to install ffmpeg:\n${install.stderr}`);
    }

    // Download audio and images into the sandbox.
    const audioBytes = await fetchBytes(options.audioUrl);
    await sandbox.files.write("/video/audio.input", audioBytes);

    for (let i = 0; i < options.sceneImageUrls.length; i++) {
      const bytes = await fetchBytes(options.sceneImageUrls[i]);
      await sandbox.files.write(`/video/img${i}.png`, bytes);
    }

    // Real audio duration — don't trust the requested length.
    const probe = await sandbox.commands.run(
      "ffprobe -v error -show_entries format=duration -of csv=p=0 /video/audio.input"
    );
    const durationSeconds = parseFloat(probe.stdout.trim());
    if (!durationSeconds || Number.isNaN(durationSeconds)) {
      throw new Error(`Could not determine audio duration: ${probe.stderr}`);
    }

    // Subtitles (optional).
    let subtitleArg = "";
    if (options.lyrics) {
      const cues = lyricsToCueLines(options.lyrics);
      const srt = buildSrt(cues, durationSeconds);
      if (srt) {
        await sandbox.files.write("/video/subs.srt", srt);
        subtitleArg = ",subtitles=/video/subs.srt:force_style='FontSize=18,Outline=1'";
      }
    }

    // Ken-Burns slideshow: each image gets an equal slice of the total
    // duration, with a slow zoom, then all slices are concatenated.
    const n = options.sceneImageUrls.length;
    const segDur = durationSeconds / n;
    const fps = 30;
    const segFrames = Math.max(1, Math.round(segDur * fps));

    const inputs = Array.from({ length: n }, (_, i) => `-loop 1 -t ${segDur.toFixed(3)} -i /video/img${i}.png`).join(" ");
    const perClipFilters = Array.from({ length: n }, (_, i) =>
      `[${i}:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,zoompan=z='min(zoom+0.0015,1.2)':d=${segFrames}:s=1280x720:fps=${fps},setsar=1[v${i}]`
    ).join(";\n");
    const concatInputs = Array.from({ length: n }, (_, i) => `[v${i}]`).join("");
    const filterComplex = `${perClipFilters};\n${concatInputs}concat=n=${n}:v=1:a=0[vconcat];\n[vconcat]format=yuv420p${subtitleArg}[vout]`;

    const ffmpegScript = `ffmpeg -y ${inputs} -i /video/audio.input -filter_complex "${filterComplex}" -map "[vout]" -map ${n}:a -c:v libx264 -c:a aac -shortest /video/output.mp4`;
    await sandbox.files.write("/video/render.sh", ffmpegScript);

    const render = await sandbox.commands.run("bash /video/render.sh");
    if (render.exitCode !== 0) {
      throw new Error(`Video rendering failed:\n${render.stderr.slice(-4000)}`);
    }

    const outputBytes = await sandbox.files.read("/video/output.mp4", { format: "bytes" });
    const { url } = await storagePut(
      `videos/${Date.now()}.mp4`,
      Buffer.from(outputBytes),
      "video/mp4"
    );

    return { videoUrl: url, durationSeconds };
  } finally {
    await sandbox.kill().catch(() => {});
  }
}

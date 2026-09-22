/**
 * App Builder pipeline, run as a background job (see jobs.ts):
 *   1. Claude writes requirements, a design spec, and a complete runnable
 *      file set as schema-validated structured output
 *   2. the files are installed and started in an E2B sandbox (appBuilder.ts)
 *      for a live preview
 *   3. everything is saved to the project's appProjects record
 *
 * Replaces AppBuilderFeature.tsx's previous approach of sending a prompt to
 * the chat endpoint and showing the first 500 characters of the reply, with
 * Requirements/Design tabs that never filled in.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import * as db from "../db";
import { buildApp, SANDBOX_TIMEOUT_MS } from "./appBuilder";
import type { JobContext } from "./jobs";

const MODEL = "claude-opus-5";
const APP_PORT = 3000;

export const AppTypeSchema = z.enum(["website", "mobile", "saas"]);

const GeneratedAppSchema = z.object({
  requirements: z
    .string()
    .describe("Markdown: functional and technical requirements for the app"),
  design: z
    .string()
    .describe("Markdown: UI/UX design spec — pages/screens, layout, components, visual style"),
  files: z
    .array(z.object({ path: z.string(), content: z.string() }))
    .describe("Every file needed to install and run the app, including package.json"),
  installCommand: z.string().describe("Usually 'npm install'"),
  startCommand: z
    .string()
    .describe(`Starts the app listening on 0.0.0.0:${APP_PORT}`),
});

export type GeneratedApp = z.infer<typeof GeneratedAppSchema>;

const APP_TYPE_GUIDANCE: Record<z.infer<typeof AppTypeSchema>, string> = {
  website: "a website",
  saas: "a SaaS-style web application with a dashboard-style UI",
  mobile:
    "a mobile-first web app (it runs in a browser preview, so no native code — " +
    "design for a phone-width viewport with touch-friendly controls)",
};

const SYSTEM_PROMPT = `You build small, complete, runnable web apps from a description.

Your files are written into a fresh Linux sandbox with Node.js 20 and npm, installed with your installCommand, and started with your startCommand. The app must then serve on 0.0.0.0 port ${APP_PORT}; a live preview of that port is shown to the user.

- Prefer Vite + React (TypeScript) unless the request clearly suits something else. For Vite, the start command is "npx vite --host 0.0.0.0 --port ${APP_PORT}" and vite.config must set server.allowedHosts to true so the sandbox preview host is accepted.
- The app cannot use API keys, secrets, or paid external services. Use in-memory state, localStorage, or bundled mock data instead, and say so in the requirements.
- Keep the project focused: roughly 5–15 files. Every file must be complete — no placeholders, TODOs, or "rest of code here".
- Pin dependency versions that are known to work together.
- requirements and design are Markdown documents written for the person who asked for the app.`;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

async function generateAppSpec(
  appType: z.infer<typeof AppTypeSchema>,
  description: string,
  onProgress: (charsWritten: number) => void
): Promise<GeneratedApp> {
  const stream = getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: betaZodOutputFormat(GeneratedAppSchema) },
    // If Opus 5 declines, the API re-runs the request on its default fallback model
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Build ${APP_TYPE_GUIDANCE[appType]}.\n\nDescription:\n${description}`,
      },
    ],
  });

  let chars = 0;
  stream.on("text", (delta) => {
    chars += delta.length;
    onProgress(chars);
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new Error("The model declined to build this app. Try rephrasing the description.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("The app was too large to generate in one pass. Try a smaller scope.");
  }
  if (!message.parsed_output) {
    throw new Error("The model's response didn't match the expected app format");
  }
  return message.parsed_output;
}

export async function runAppBuildJob(
  input: { projectId: number; appType: z.infer<typeof AppTypeSchema>; description: string },
  ctx: JobContext
) {
  const project = await db.getProjectById(input.projectId, ctx.userId);
  if (!project) throw new Error("Project not found");

  await ctx.report(5, "Planning the app");

  // Throttle progress writes to one every few seconds while code streams in
  let lastReport = 0;
  const spec = await generateAppSpec(input.appType, input.description, (chars) => {
    const now = Date.now();
    if (now - lastReport < 4000) return;
    lastReport = now;
    // Structured output streams as JSON text; ~60k chars is a typical app
    const progress = Math.min(55, 10 + Math.round((chars / 60000) * 45));
    void ctx.report(progress, `Writing code (${Math.round(chars / 1000)}k characters)`);
  });

  await ctx.report(60, "Installing dependencies and starting the app");

  let previewUrl: string | null = null;
  let previewExpiresAt: string | null = null;
  let buildError: string | null = null;
  try {
    const build = await buildApp({
      files: spec.files,
      installCommand: spec.installCommand,
      startCommand: spec.startCommand,
      port: APP_PORT,
    });
    previewUrl = build.previewUrl;
    previewExpiresAt = new Date(Date.now() + SANDBOX_TIMEOUT_MS).toISOString();
  } catch (error) {
    // Keep the generated code even if it didn't boot — it's still downloadable
    buildError = error instanceof Error ? error.message : String(error);
  }

  await ctx.report(95, "Saving");

  const fields = {
    appType: input.appType,
    requirements: spec.requirements,
    design: spec.design,
    sourceCode: JSON.stringify(spec.files),
    sourceCodeUrl: previewUrl,
  };
  if (await db.getAppProject(input.projectId, ctx.userId)) {
    await db.updateAppProject(input.projectId, ctx.userId, fields);
  } else {
    await db.createAppProject(input.projectId, ctx.userId, input.appType);
    await db.updateAppProject(input.projectId, ctx.userId, fields);
  }
  await db.trackUsage(ctx.userId, "app_build");

  return {
    requirements: spec.requirements,
    design: spec.design,
    files: spec.files,
    previewUrl,
    previewExpiresAt,
    buildError,
  };
}

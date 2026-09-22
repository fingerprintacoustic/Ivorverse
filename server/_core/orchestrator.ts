/**
 * Chat orchestrator: a real Claude model (via the Anthropic API) that can
 * call tools mid-conversation — the same pattern Claude.ai itself uses for
 * things like web search or code execution. Replaces the Forge-proxied
 * invokeLLM() for the main chat assistant.
 *
 * Tools: web search (Anthropic-hosted), image generation, memory, and
 * build_app / generate_music, which start background jobs (jobs.ts) because
 * they outlast a request. Add further tools the same way: declare it in
 * TOOLS, handle it in executeTool().
 */
import Anthropic from "@anthropic-ai/sdk";
import { generateImage } from "./imageGeneration";
import { enqueueJob } from "./jobs";
import { setMemory } from "../db";

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

export type OrchestratorMessage = {
  role: "user" | "assistant";
  content: string;
};

export type OrchestratorResult = {
  message: string;
  toolsUsed: string[];
  /** Background jobs started this turn (see jobs.ts) */
  jobIds: number[];
};

const MODEL = "claude-sonnet-4-6";

const TOOLS: Anthropic.ToolUnion[] = [
  // Anthropic-hosted: executed server-side by the Anthropic API itself, no
  // local handling needed in executeTool(). Replaces the old manual
  // Google-search-via-Manus-Forge pipeline.
  { type: "web_search_20250305", name: "web_search" },
  {
    name: "generate_image",
    description:
      "Generate an image from a text description and return its URL. Use this " +
      "whenever the user asks to see, draw, create, or generate an image, logo, " +
      "illustration, or picture.",
    input_schema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "A detailed description of the image to generate.",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "build_app",
    description:
      "Start building a working app, website, or tool in a real cloud sandbox " +
      "with a live preview. Use this whenever the user asks to build, create, " +
      "or scaffold an app — not just to see code. The build runs in the " +
      "background (typically 2–5 minutes) and its progress, live preview, and " +
      "downloadable source appear under your reply automatically, so just tell " +
      "the user it has started. Do not write the code yourself; describe what " +
      "to build.",
    input_schema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description:
            "Detailed description of the app: purpose, audience, main screens, " +
            "and features, including anything relevant from the conversation.",
        },
        appType: {
          type: "string",
          enum: ["website", "mobile", "saas"],
          description: "website (default), mobile (mobile-first web app), or saas.",
        },
      },
      required: ["description"],
    },
  },
  {
    name: "generate_music",
    description:
      "Start generating a real song with audio (not just lyrics). Use this " +
      "whenever the user asks to make, create, or generate a song, track, or " +
      "piece of music with actual playable audio. Generation runs in the " +
      "background and a player appears under your reply when it's ready, so " +
      "just tell the user it has started.",
    input_schema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Genre/style/mood description, e.g. 'upbeat pop with guitar'.",
        },
        lyrics: {
          type: "string",
          description:
            "Full lyrics to sing, using [Verse]/[Chorus]/[Bridge] section markers. " +
            "Omit for an instrumental or to let the model write its own lyrics from the prompt.",
        },
        instrumental: {
          type: "boolean",
          description: "True for no vocals.",
        },
        durationSeconds: {
          type: "number",
          description: "Length of the track in seconds. Defaults to 60.",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "remember_fact",
    description:
      "Store a fact worth remembering across future messages in this project " +
      "(e.g. a preference, decision, or detail the user shared). Use this when " +
      "the user shares something durable that would help in later conversations " +
      "— not for routine chat content.",
    input_schema: {
      type: "object",
      properties: {
        key: { type: "string", description: "A short label for this fact, e.g. 'preferred_tech_stack'." },
        value: { type: "string", description: "The fact to remember." },
        importance: {
          type: "number",
          description: "1-5, how important this is to keep surfacing. Defaults to 1.",
        },
      },
      required: ["key", "value"],
    },
  },
];

export type OrchestratorContext = {
  projectId?: number;
  userId?: number;
};

async function executeTool(
  name: string,
  input: Record<string, any>,
  context: OrchestratorContext,
  jobIds: number[]
): Promise<string> {
  const { projectId, userId } = context;
  switch (name) {
    case "generate_image": {
      const { url } = await generateImage({ prompt: input.prompt });
      return url
        ? JSON.stringify({ imageUrl: url })
        : JSON.stringify({ error: "Image generation failed to return a URL." });
    }
    // App builds and music take minutes — longer than the 60s a request
    // through Firebase Hosting may run — so these queue background jobs
    // (jobs.ts) and return at once; the chat UI polls them.
    case "build_app": {
      if (!projectId || !userId) {
        return JSON.stringify({ error: "App building isn't available in this context." });
      }
      const description = String(input.description ?? "").trim();
      if (description.length < 10) {
        return JSON.stringify({ error: "Describe the app in more detail before building." });
      }
      const appType = ["website", "mobile", "saas"].includes(input.appType) ? input.appType : "website";
      const job = await enqueueJob("app_build", userId, { projectId, appType, description });
      jobIds.push(job.id);
      return JSON.stringify({ status: "started", jobId: job.id });
    }
    case "generate_music": {
      if (!userId) {
        return JSON.stringify({ error: "Music generation isn't available in this context." });
      }
      const job = await enqueueJob("music_generate", userId, {
        projectId,
        prompt: input.prompt,
        lyrics: input.lyrics,
        instrumental: input.instrumental,
        durationSeconds: input.durationSeconds,
      });
      jobIds.push(job.id);
      return JSON.stringify({ status: "started", jobId: job.id });
    }
    case "remember_fact": {
      if (!projectId) {
        return JSON.stringify({ error: "No project context to store this memory against." });
      }
      await setMemory(projectId, input.key, input.value, input.importance ?? 1);
      return JSON.stringify({ remembered: true });
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

/**
 * Run one turn of the conversation through Claude, letting it call tools
 * (e.g. image generation) as many times as it needs before producing a
 * final text response.
 */
export async function runOrchestrator(
  systemPrompt: string,
  history: OrchestratorMessage[],
  context: OrchestratorContext = {}
): Promise<OrchestratorResult> {
  const client = getClient();
  const toolsUsed: string[] = [];
  const jobIds: number[] = [];

  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // Cap tool-call rounds per turn so a confused loop can't run forever.
  for (let round = 0; round < 6; round++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
      tools: TOOLS,
    });

    // Server-executed tools (currently just web_search) resolve inline —
    // they don't set stop_reason to "tool_use", so track them here too.
    for (const block of response.content) {
      if (block.type === "server_tool_use") {
        toolsUsed.push(block.name);
      }
    }

    if (response.stop_reason !== "tool_use") {
      const textBlock = response.content.find((b) => b.type === "text");
      return {
        message: textBlock && textBlock.type === "text" ? textBlock.text : "",
        toolsUsed,
        jobIds,
      };
    }

    // Claude wants to call one or more tools — execute them and continue.
    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type === "tool_use") {
        toolsUsed.push(block.name);
        const result = await executeTool(block.name, block.input as Record<string, any>, context, jobIds);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  return {
    message:
      "I wasn't able to finish that after several tool calls — could you rephrase or simplify the request?",
    toolsUsed,
    jobIds,
  };
}

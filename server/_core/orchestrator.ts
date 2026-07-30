/**
 * Chat orchestrator: a real Claude model (via the Anthropic API) that can
 * call tools mid-conversation — the same pattern Claude.ai itself uses for
 * things like web search or code execution. Replaces the Forge-proxied
 * invokeLLM() for the main chat assistant.
 *
 * Today this wires up one tool (image generation, via OpenAI). Music
 * generation isn't wired in as a tool yet — see musicGeneration.ts for why
 * (no official Suno API). Add further tools here the same way:
 * declare it in TOOLS, handle it in executeTool().
 */
import Anthropic from "@anthropic-ai/sdk";
import { generateImage } from "./imageGeneration";
import { buildApp } from "./appBuilder";
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
};

const MODEL = "claude-sonnet-4-6";

const TOOLS: Anthropic.Tool[] = [
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
      "Write a set of files into a real, isolated cloud sandbox, install " +
      "dependencies, start the app, and return a live preview URL. Use this " +
      "whenever the user asks to build, create, or scaffold a working app, " +
      "website, or tool — not just to see the code, but to have it actually " +
      "running. Generate complete, runnable file contents yourself (e.g. a " +
      "package.json, an index.html or server entrypoint, etc.) before calling " +
      "this tool.",
    input_schema: {
      type: "object",
      properties: {
        files: {
          type: "array",
          description: "All files the app needs, including package.json.",
          items: {
            type: "object",
            properties: {
              path: { type: "string", description: "File path, e.g. 'package.json' or 'src/index.js'." },
              content: { type: "string", description: "Full file contents." },
            },
            required: ["path", "content"],
          },
        },
        installCommand: {
          type: "string",
          description: "Command to install dependencies. Defaults to 'npm install'.",
        },
        startCommand: {
          type: "string",
          description:
            "Command to start the app so it's reachable on the given port, e.g. " +
            "'npm run dev -- --host 0.0.0.0 --port 3000' or 'node server.js'.",
        },
        port: {
          type: "number",
          description: "Port the app listens on, matching startCommand.",
        },
      },
      required: ["files", "startCommand", "port"],
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

async function executeTool(
  name: string,
  input: Record<string, any>,
  projectId: number | undefined
): Promise<string> {
  switch (name) {
    case "generate_image": {
      const { url } = await generateImage({ prompt: input.prompt });
      return url
        ? JSON.stringify({ imageUrl: url })
        : JSON.stringify({ error: "Image generation failed to return a URL." });
    }
    case "build_app": {
      try {
        const result = await buildApp({
          files: input.files,
          installCommand: input.installCommand,
          startCommand: input.startCommand,
          port: input.port,
        });
        return JSON.stringify({
          previewUrl: result.previewUrl,
          sandboxId: result.sandboxId,
        });
      } catch (error) {
        return JSON.stringify({
          error: error instanceof Error ? error.message : "App build failed for an unknown reason.",
        });
      }
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
  projectId?: number
): Promise<OrchestratorResult> {
  const client = getClient();
  const toolsUsed: string[] = [];

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

    if (response.stop_reason !== "tool_use") {
      const textBlock = response.content.find((b) => b.type === "text");
      return {
        message: textBlock && textBlock.type === "text" ? textBlock.text : "",
        toolsUsed,
      };
    }

    // Claude wants to call one or more tools — execute them and continue.
    messages.push({ role: "assistant", content: response.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type === "tool_use") {
        toolsUsed.push(block.name);
        const result = await executeTool(block.name, block.input as Record<string, any>, projectId);
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
  };
}

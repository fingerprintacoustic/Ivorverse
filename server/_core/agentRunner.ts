/**
 * Runs an agent task: Claude works the task with the agent's instructions
 * and enabled tools, then writes a Markdown report saved on the task.
 * Runs as a background job (jobs.ts) since research can take minutes.
 *
 * Replaces the Agents feature's previous behaviour, where tasks were plain
 * records whose status the user changed by hand — nothing ever ran them.
 */
import Anthropic from "@anthropic-ai/sdk";
import * as db from "../db";
import { generateImage } from "./imageGeneration";
import type { JobContext } from "./jobs";

const MODEL = "claude-opus-5";
const MAX_ROUNDS = 12;
// Job workers get 540s; leave room for the final write-up and saving.
const TIME_BUDGET_MS = 400_000;

export const AGENT_TOOLS = ["web_search", "web_fetch", "generate_image"] as const;
export type AgentTool = (typeof AGENT_TOOLS)[number];
export const DEFAULT_AGENT_TOOLS: AgentTool[] = ["web_search", "web_fetch"];

const TOOL_DEFS: Record<AgentTool, Anthropic.Beta.BetaToolUnion> = {
  web_search: { type: "web_search_20260209", name: "web_search", max_uses: 8 },
  web_fetch: { type: "web_fetch_20260209", name: "web_fetch", max_uses: 8 },
  generate_image: {
    name: "generate_image",
    description:
      "Generate an image from a detailed text description. Returns the image URL; " +
      "include it in your report as a Markdown image.",
    strict: true,
    input_schema: {
      type: "object",
      properties: { prompt: { type: "string", description: "Detailed description of the image." } },
      required: ["prompt"],
      additionalProperties: false,
    },
  },
};

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

/** Normalise stored capabilities to known tool names (older agents have none). */
export function agentTools(capabilities: unknown): AgentTool[] {
  if (!Array.isArray(capabilities)) return DEFAULT_AGENT_TOOLS;
  return capabilities.filter((c): c is AgentTool => (AGENT_TOOLS as readonly string[]).includes(c));
}

function systemPrompt(agent: { name: string; description: string | null } | undefined, tools: AgentTool[]) {
  const persona = agent
    ? `You are "${agent.name}", an autonomous agent.${agent.description ? `\n\nYour instructions:\n${agent.description}` : ""}`
    : "You are an autonomous assistant agent.";
  const toolNote =
    tools.length > 0
      ? `Use your tools (${tools.join(", ")}) as needed to do the work rather than answering from memory.`
      : "You have no tools, so work from your own knowledge and say where information may be out of date.";
  return `${persona}

You are given a task to complete on your own; the user is not available for questions, so make reasonable assumptions and state them. ${toolNote}

When finished, reply with a complete report in Markdown: lead with the outcome or answer, then supporting detail. The report is the deliverable, so don't describe your process or offer follow-ups.`;
}

function describeStep(block: Anthropic.Beta.BetaContentBlock): string | null {
  if (block.type === "server_tool_use") {
    const input = block.input as Record<string, any>;
    if (block.name === "web_search" && input?.query) return `Searching: ${input.query}`;
    if (block.name === "web_fetch" && input?.url) return `Reading ${input.url}`;
    return `Using ${block.name}`;
  }
  if (block.type === "tool_use" && block.name === "generate_image") return "Generating an image";
  return null;
}

async function executeClientTool(
  block: Anthropic.Beta.BetaToolUseBlock,
  userId: number | undefined
): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
  try {
    if (block.name === "generate_image") {
      const { prompt } = block.input as { prompt: string };
      // Stored under the user's folder so account deletion removes it
      const { url } = await generateImage({ prompt, userId });
      if (!url) throw new Error("Image generation returned no URL");
      return { type: "tool_result", tool_use_id: block.id, content: JSON.stringify({ imageUrl: url }) };
    }
    throw new Error(`Unknown tool: ${block.name}`);
  } catch (error) {
    return {
      type: "tool_result",
      tool_use_id: block.id,
      is_error: true,
      content: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Final report text plus a Sources list built from web citations. */
function extractReport(content: Anthropic.Beta.BetaContentBlock[]): string {
  const text = content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const sources = new Map<string, string>();
  for (const block of content) {
    if (block.type !== "text" || !block.citations) continue;
    for (const c of block.citations) {
      if ("url" in c && typeof c.url === "string" && !sources.has(c.url)) {
        sources.set(c.url, ("title" in c && typeof c.title === "string" && c.title) || c.url);
      }
    }
  }
  if (sources.size === 0) return text;
  const list = Array.from(sources, ([url, title]) => `- [${title}](${url})`).join("\n");
  return `${text}\n\n## Sources\n${list}`;
}

/**
 * The agent loop: work `prompt` with the agent's instructions and tools
 * until Claude produces a final report. Shared by agent tasks and workflow
 * steps. `onProgress` receives 0–100 and a short stage label.
 */
export async function runAgent(options: {
  agent: { name: string; description: string | null; capabilities?: unknown } | undefined;
  prompt: string;
  /** Owner of anything the run creates (e.g. generated images) */
  userId?: number;
  onProgress: (progress: number, stage: string) => Promise<void>;
}): Promise<string> {
  const { agent, prompt, onProgress, userId } = options;
  const tools = agentTools(agent?.capabilities);
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
  const started = Date.now();
  let wrapUp = false;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      // If Opus 5 declines, the API re-runs the request on its default fallback model
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: systemPrompt(agent, tools),
      tools: tools.map((t) => TOOL_DEFS[t]),
      ...(wrapUp ? { tool_choice: { type: "none" as const } } : {}),
      messages,
    });

    const steps = response.content.map(describeStep).filter((s): s is string => s !== null);
    const progress = Math.min(90, 10 + Math.round(((round + 1) / MAX_ROUNDS) * 80));
    await onProgress(progress, steps.at(-1) ?? "Thinking");

    if (response.stop_reason === "refusal") {
      throw new Error("The agent declined this task.");
    }

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "pause_turn") {
      // Server-side tool loop hit its iteration cap; re-sending resumes it
      continue;
    }
    if (response.stop_reason !== "tool_use") {
      const report = extractReport(response.content);
      if (!report) throw new Error("The agent finished without writing a report.");
      return report;
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use"
    );
    const results: Anthropic.Beta.BetaContentBlockParam[] = await Promise.all(
      toolUses.map((block) => executeClientTool(block, userId))
    );

    // Out of time or rounds: ask for the report now, with tools disabled
    if (Date.now() - started > TIME_BUDGET_MS || round >= MAX_ROUNDS - 2) {
      wrapUp = true;
      results.push({
        type: "text",
        text: "You're out of time for further research. Write your final report now with what you have.",
      });
    }
    messages.push({ role: "user", content: results });
  }

  throw new Error("The agent didn't finish within its step limit.");
}

export async function runAgentTaskJob(input: { taskId: number }, ctx: JobContext) {
  const task = await db.getTaskById(input.taskId, ctx.userId);
  if (!task) throw new Error("Task not found");
  const agent = task.agentId ? await db.getAgentById(task.agentId, ctx.userId) : undefined;

  await db.updateTask(task.id, { status: "in_progress", progress: 5, error: null });
  await ctx.report(5, "Starting");

  try {
    const result = await runAgent({
      agent,
      userId: ctx.userId,
      prompt: `Task: ${task.title}${task.description ? `

Details:
${task.description}` : ""}`,
      onProgress: async (progress, stage) => {
        await ctx.report(progress, stage);
        await db.updateTask(task.id, { progress });
      },
    });

    await db.updateTask(task.id, { status: "completed", progress: 100, result, completedAt: new Date() });
    await db.trackUsage(ctx.userId, "agent_task");
    return { taskId: task.id };
  } catch (error) {
    await db.updateTask(task.id, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

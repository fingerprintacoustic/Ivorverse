import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = { messages: { create } };
  },
}));

const tasks = new Map<number, any>();
const agents = new Map<number, any>();
vi.mock("./db", () => ({
  getTaskById: vi.fn(async (id: number, userId: number) => {
    const t = tasks.get(id);
    return t && t.userId === userId ? t : undefined;
  }),
  getAgentById: vi.fn(async (id: number, userId: number) => {
    const a = agents.get(id);
    return a && a.userId === userId ? a : undefined;
  }),
  updateTask: vi.fn(async (id: number, updates: any) => Object.assign(tasks.get(id), updates)),
  trackUsage: vi.fn(),
}));
const generateImage = vi.fn(async () => ({ url: "https://img.example/cat.png" }));
vi.mock("./_core/imageGeneration", () => ({ generateImage }));

process.env.ANTHROPIC_API_KEY = "test-key";
const { runAgentTaskJob } = await import("./_core/agentRunner");

const ctx = { userId: 1, report: vi.fn(async () => {}) };
const turn = (stop_reason: string, content: any[]) => ({ stop_reason, content });

describe("agent task runner", () => {
  beforeEach(() => {
    create.mockReset();
    generateImage.mockClear();
    tasks.clear();
    agents.clear();
    agents.set(3, {
      id: 3,
      userId: 1,
      name: "Illustrator",
      description: "Make art.",
      capabilities: ["generate_image"],
    });
    tasks.set(10, { id: 10, userId: 1, agentId: 3, title: "Draw a cat", description: null, status: "pending" });
  });

  it("runs client tools, then saves the final report", async () => {
    create
      .mockResolvedValueOnce(
        turn("tool_use", [{ type: "tool_use", id: "t1", name: "generate_image", input: { prompt: "a cat" } }])
      )
      .mockResolvedValueOnce(turn("end_turn", [{ type: "text", text: "# Cat\n![cat](https://img.example/cat.png)" }]));

    await runAgentTaskJob({ taskId: 10 }, ctx);

    // stored under the task owner's folder
    expect(generateImage).toHaveBeenCalledWith({ prompt: "a cat", userId: 1 });
    const firstCall = create.mock.calls[0][0];
    expect(firstCall.system).toContain("Illustrator");
    expect(firstCall.system).toContain("Make art.");
    expect(firstCall.tools.map((t: any) => t.name)).toEqual(["generate_image"]);
    // (the mock holds the live messages array, so find the turn by content)
    const toolTurn = create.mock.calls[1][0].messages.find(
      (m: any) => m.role === "user" && Array.isArray(m.content)
    );
    expect(toolTurn.content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(tasks.get(10)).toMatchObject({ status: "completed", progress: 100, result: expect.stringContaining("# Cat") });
  });

  it("resumes a pause_turn without adding a user message", async () => {
    create
      .mockResolvedValueOnce(turn("pause_turn", [{ type: "server_tool_use", id: "s1", name: "web_search", input: { query: "cats" } }]))
      .mockResolvedValueOnce(turn("end_turn", [{ type: "text", text: "Done." }]));

    await runAgentTaskJob({ taskId: 10 }, ctx);

    // user task → paused assistant turn → final assistant turn; no "continue" message
    expect(create.mock.calls[1][0].messages.map((m: any) => m.role)).toEqual(["user", "assistant", "assistant"]);
    expect(ctx.report).toHaveBeenCalledWith(expect.any(Number), "Searching: cats");
    expect(tasks.get(10).status).toBe("completed");
  });

  it("appends a Sources list from web citations", async () => {
    create.mockResolvedValueOnce(
      turn("end_turn", [
        { type: "text", text: "Cats sleep a lot.", citations: [{ type: "web_search_result_location", url: "https://a.example", title: "Cat facts" }] },
      ])
    );

    await runAgentTaskJob({ taskId: 10 }, ctx);

    expect(tasks.get(10).result).toBe("Cats sleep a lot.\n\n## Sources\n- [Cat facts](https://a.example)");
  });

  it("marks the task failed on refusal", async () => {
    create.mockResolvedValueOnce(turn("refusal", []));

    await expect(runAgentTaskJob({ taskId: 10 }, ctx)).rejects.toThrow("declined");
    expect(tasks.get(10)).toMatchObject({ status: "failed", error: "The agent declined this task." });
  });

  it("forces a final report instead of looping forever", async () => {
    create.mockResolvedValue(
      turn("tool_use", [{ type: "tool_use", id: "t", name: "generate_image", input: { prompt: "x" } }])
    );

    await expect(runAgentTaskJob({ taskId: 10 }, ctx)).rejects.toThrow("step limit");
    // Before giving up it disabled tools and asked for the report
    const wrapUpCall = create.mock.calls.find((c) => c[0].tool_choice?.type === "none");
    expect(wrapUpCall).toBeDefined();
    expect(tasks.get(10).status).toBe("failed");
  });

  it("won't run another user's task", async () => {
    await expect(runAgentTaskJob({ taskId: 10 }, { ...ctx, userId: 2 })).rejects.toThrow("Task not found");
    expect(create).not.toHaveBeenCalled();
  });
});

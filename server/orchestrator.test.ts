import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));

let nextJobId = 100;
const enqueueJob = vi.fn(async () => ({ id: nextJobId++ }));
vi.mock("./_core/jobs", () => ({ enqueueJob }));
vi.mock("./_core/imageGeneration", () => ({ generateImage: vi.fn() }));
vi.mock("./db", () => ({ setMemory: vi.fn(), createFile: vi.fn() }));
const consumeQuota = vi.fn(async () => "2026-09");
vi.mock("./_core/quota", async (orig) => ({
  ...(await orig<any>()),
  consumeQuota,
  refundQuota: vi.fn(async () => {}),
}));

process.env.ANTHROPIC_API_KEY = "test-key";
const { runOrchestrator } = await import("./_core/orchestrator");
const { QuotaExceededError } = await import("./_core/quota");
const user = { id: 9, role: "user" as const, subscriptionTier: "free" as const };

function toolUseTurn(name: string, input: Record<string, any>) {
  return {
    stop_reason: "tool_use",
    content: [{ type: "tool_use", id: `toolu_${name}`, name, input }],
  };
}
const finalTurn = (text: string) => ({ stop_reason: "end_turn", content: [{ type: "text", text }] });

describe("orchestrator background-job tools", () => {
  beforeEach(() => {
    create.mockReset();
    enqueueJob.mockClear();
    consumeQuota.mockClear();
    nextJobId = 100;
  });

  it("queues an app_build job for build_app and returns immediately", async () => {
    create
      .mockResolvedValueOnce(toolUseTurn("build_app", { description: "A habit tracker with streaks", appType: "mobile" }))
      .mockResolvedValueOnce(finalTurn("Building it now!"));

    const result = await runOrchestrator("sys", [{ role: "user", content: "build me a habit tracker" }], {
      projectId: 5,
      userId: 9,
      user,
    });

    expect(consumeQuota).toHaveBeenCalledWith(user, "appBuilds");
    expect(enqueueJob).toHaveBeenCalledWith(
      "app_build",
      9,
      { projectId: 5, appType: "mobile", description: "A habit tracker with streaks" },
      { quota: "appBuilds", period: "2026-09" }
    );
    expect(result).toMatchObject({ message: "Building it now!", jobIds: [100] });

    // Claude is told the job started, not handed a preview it doesn't have yet
    const toolResult = create.mock.calls[1][0].messages.at(-1).content[0];
    expect(JSON.parse(toolResult.content)).toEqual({ status: "started", jobId: 100 });
  });

  it("queues a music_generate job for generate_music", async () => {
    create
      .mockResolvedValueOnce(toolUseTurn("generate_music", { prompt: "lofi beats", instrumental: true }))
      .mockResolvedValueOnce(finalTurn("Your track is on the way."));

    const result = await runOrchestrator("sys", [{ role: "user", content: "make lofi" }], {
      projectId: 5,
      userId: 9,
      user,
    });

    expect(enqueueJob).toHaveBeenCalledWith(
      "music_generate",
      9,
      expect.objectContaining({ projectId: 5, prompt: "lofi beats", instrumental: true }),
      { quota: "musicGenerations", period: "2026-09" }
    );
    expect(result.jobIds).toEqual([100]);
  });

  it("tells Claude when the user is over their plan limit, without starting a job", async () => {
    consumeQuota.mockRejectedValueOnce(new QuotaExceededError("appBuilds", 1, "Free"));
    create
      .mockResolvedValueOnce(toolUseTurn("build_app", { description: "A habit tracker with streaks" }))
      .mockResolvedValueOnce(finalTurn("You've hit your limit."));

    const result = await runOrchestrator("sys", [{ role: "user", content: "build it" }], { projectId: 5, userId: 9, user });

    expect(enqueueJob).not.toHaveBeenCalled();
    expect(result.jobIds).toEqual([]);
    const toolTurn = create.mock.calls[1][0].messages.find((m: any) => m.role === "user" && Array.isArray(m.content));
    expect(JSON.parse(toolTurn.content[0].content).error).toContain("Free plan");
  });

  it("refuses job tools without a user context (e.g. research)", async () => {
    create
      .mockResolvedValueOnce(toolUseTurn("build_app", { description: "A habit tracker with streaks" }))
      .mockResolvedValueOnce(finalTurn("I can't build apps here."));

    const result = await runOrchestrator("sys", [{ role: "user", content: "build an app" }]);

    expect(enqueueJob).not.toHaveBeenCalled();
    expect(result.jobIds).toEqual([]);
    const toolResult = create.mock.calls[1][0].messages.at(-1).content[0];
    expect(JSON.parse(toolResult.content).error).toBeDefined();
  });
});

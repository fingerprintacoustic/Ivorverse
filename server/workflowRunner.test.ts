import { beforeEach, describe, expect, it, vi } from "vitest";

const runs = new Map<number, any>();
const workflows = new Map<number, any>();
const agents = new Map<number, any>();
vi.mock("./db", () => ({
  createWorkflowRun: vi.fn(async (data: any) => {
    const run = { id: 1, status: "running", ...data };
    runs.set(1, run);
    return run;
  }),
  getWorkflowRun: vi.fn(async (id: number, userId: number) => {
    const r = runs.get(id);
    return r && r.userId === userId ? structuredClone(r) : undefined;
  }),
  updateWorkflowRun: vi.fn(async (id: number, updates: any) => Object.assign(runs.get(id), structuredClone(updates))),
  getWorkflowById: vi.fn(async (id: number, userId: number) => {
    const w = workflows.get(id);
    return w && w.userId === userId ? w : undefined;
  }),
  getAgentById: vi.fn(async (id: number, userId: number) => {
    const a = agents.get(id);
    return a && a.userId === userId ? a : undefined;
  }),
  trackUsage: vi.fn(),
}));
const runAgent = vi.fn();
vi.mock("./_core/agentRunner", () => ({ runAgent }));
const enqueueJob = vi.fn(async () => ({ id: 99 }));
vi.mock("./_core/jobs", () => ({ enqueueJob }));

const { runWorkflowStepJob, startWorkflowRun, parseWorkflowDefinition } = await import("./_core/workflowRunner");

const ctx = (jobId: number) => ({ jobId, userId: 1, report: vi.fn(async () => {}) });
const definition = {
  steps: [
    { name: "Research", agentId: 7, instructions: "Find facts." },
    { name: "Write", instructions: "Write the post." },
  ],
};

describe("workflow runner", () => {
  beforeEach(() => {
    runs.clear();
    workflows.clear();
    agents.clear();
    runAgent.mockReset();
    enqueueJob.mockClear();
    workflows.set(5, { id: 5, userId: 1, name: "Blog pipeline", definition: JSON.stringify(definition) });
    agents.set(7, { id: 7, userId: 1, name: "Researcher", description: "Be thorough.", capabilities: ["web_search"] });
  });

  it("parses step definitions and rejects legacy free-form JSON", () => {
    expect(parseWorkflowDefinition(JSON.stringify(definition))?.steps).toHaveLength(2);
    expect(parseWorkflowDefinition('{"anything": true}')).toBeNull();
    expect(parseWorkflowDefinition("not json")).toBeNull();
  });

  it("starts a run by queueing step 1", async () => {
    await startWorkflowRun(workflows.get(5), definition, 1, "Topic: tea");

    expect(runs.get(1)).toMatchObject({
      status: "running",
      input: "Topic: tea",
      steps: [
        { name: "Research", status: "pending" },
        { name: "Write", status: "pending" },
      ],
    });
    expect(enqueueJob).toHaveBeenCalledWith("workflow_step", 1, { runId: 1, stepIndex: 0 });
  });

  it("runs steps in order, passing input and earlier output forward", async () => {
    await startWorkflowRun(workflows.get(5), definition, 1, "Topic: tea");

    runAgent.mockResolvedValueOnce("Tea facts: it is old.");
    await runWorkflowStepJob({ runId: 1, stepIndex: 0 }, ctx(11));

    expect(runAgent.mock.calls[0][0].agent).toMatchObject({ name: "Researcher" });
    expect(runs.get(1).steps[0]).toMatchObject({ status: "completed", output: "Tea facts: it is old.", jobId: 11 });
    expect(runs.get(1).status).toBe("running");
    expect(enqueueJob).toHaveBeenLastCalledWith("workflow_step", 1, { runId: 1, stepIndex: 1 });

    runAgent.mockResolvedValueOnce("# All about tea");
    await runWorkflowStepJob({ runId: 1, stepIndex: 1 }, ctx(12));

    const prompt: string = runAgent.mock.calls[1][0].prompt;
    expect(prompt).toContain("step 2 of 2");
    expect(prompt).toContain("Topic: tea");
    expect(prompt).toContain("### Step 1: Research\nTea facts: it is old.");
    expect(prompt).toContain("## Your step: Write\nWrite the post.");
    expect(runAgent.mock.calls[1][0].agent).toBeUndefined(); // general assistant

    expect(runs.get(1)).toMatchObject({ status: "completed" });
    expect(runs.get(1).steps[1]).toMatchObject({ status: "completed", output: "# All about tea" });
    expect(enqueueJob).toHaveBeenCalledTimes(2); // nothing queued after the last step
  });

  it("fails the run when a step fails, without queueing more", async () => {
    await startWorkflowRun(workflows.get(5), definition, 1, null);
    runAgent.mockRejectedValueOnce(new Error("The agent declined this task."));

    await expect(runWorkflowStepJob({ runId: 1, stepIndex: 0 }, ctx(11))).rejects.toThrow("declined");

    expect(runs.get(1).status).toBe("failed");
    expect(runs.get(1).steps[0]).toMatchObject({ status: "failed", error: "The agent declined this task." });
    expect(enqueueJob).toHaveBeenCalledTimes(1);
  });

  it("fails clearly if the step's agent was deleted", async () => {
    await startWorkflowRun(workflows.get(5), definition, 1, null);
    agents.clear();

    await expect(runWorkflowStepJob({ runId: 1, stepIndex: 0 }, ctx(11))).rejects.toThrow("agent no longer exists");
    expect(runAgent).not.toHaveBeenCalled();
  });

  it("fails if the workflow was edited to remove the step mid-run", async () => {
    await startWorkflowRun(workflows.get(5), definition, 1, null);
    workflows.get(5).definition = JSON.stringify({ steps: [{ name: "Something else", instructions: "x" }] });

    await expect(runWorkflowStepJob({ runId: 1, stepIndex: 0 }, ctx(11))).rejects.toThrow("workflow changed");
  });

  it("does nothing for a run that already ended", async () => {
    await startWorkflowRun(workflows.get(5), definition, 1, null);
    runs.get(1).status = "failed";

    await expect(runWorkflowStepJob({ runId: 1, stepIndex: 0 }, ctx(11))).resolves.toEqual({ skipped: true });
    expect(runAgent).not.toHaveBeenCalled();
  });
});

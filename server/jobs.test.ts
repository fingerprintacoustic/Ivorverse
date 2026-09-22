import { beforeEach, describe, expect, it, vi } from "vitest";

const jobs = new Map<number, any>();

vi.mock("./db", () => ({
  createJob: vi.fn(async (userId: number, type: string, input: any, charge?: any) => {
    const job = { id: jobs.size + 1, userId, type, input, status: "queued", progress: 0, stage: "Queued", charge };
    jobs.set(job.id, job);
    return job;
  }),
  getJob: vi.fn(async (id: number) => jobs.get(id)),
  updateJob: vi.fn(async (id: number, updates: any) => {
    Object.assign(jobs.get(id), updates);
  }),
  claimJob: vi.fn(async (id: number) => {
    const job = jobs.get(id);
    if (!job || job.status !== "queued") return false;
    job.status = "running";
    return true;
  }),
}));

const refundQuota = vi.fn(async () => {});
vi.mock("./_core/quota", () => ({ refundQuota }));

const appBuild = vi.fn();
vi.mock("./_core/appGeneration", () => ({ runAppBuildJob: appBuild }));
vi.mock("./_core/videoGeneration", () => ({ runVideoAssembleJob: vi.fn() }));

// Simulate Cloud Functions so enqueueJob leaves execution to the trigger
process.env.K_SERVICE = "api";
const { enqueueJob, runJob } = await import("./_core/jobs");

describe("background jobs", () => {
  beforeEach(() => {
    jobs.clear();
    appBuild.mockReset();
    refundQuota.mockClear();
  });

  it("runs the handler and stores its result", async () => {
    appBuild.mockImplementation(async (input, ctx) => {
      await ctx.report(50, "Halfway");
      return { echoed: input.description };
    });
    const job = await enqueueJob("app_build", 7, { description: "todo app" });
    expect(jobs.get(job.id).status).toBe("queued");

    await runJob(job.id);

    expect(appBuild).toHaveBeenCalledWith({ description: "todo app" }, expect.objectContaining({ userId: 7 }));
    expect(jobs.get(job.id)).toMatchObject({
      status: "completed",
      progress: 100,
      result: { echoed: "todo app" },
    });
  });

  it("records the error when the handler throws", async () => {
    appBuild.mockRejectedValue(new Error("sandbox exploded"));
    const job = await enqueueJob("app_build", 7, {});

    await runJob(job.id);

    expect(jobs.get(job.id)).toMatchObject({ status: "failed", error: "sandbox exploded" });
  });

  it("refunds the plan quota charged for a job that fails", async () => {
    appBuild.mockRejectedValue(new Error("sandbox exploded"));
    const job = await enqueueJob("app_build", 7, {}, { quota: "appBuilds", period: "2026-09" });

    await runJob(job.id);

    expect(refundQuota).toHaveBeenCalledWith(7, "appBuilds", 1, "2026-09");
  });

  it("keeps the charge when the job succeeds", async () => {
    appBuild.mockResolvedValue({});
    const job = await enqueueJob("app_build", 7, {}, { quota: "appBuilds", period: "2026-09" });

    await runJob(job.id);

    expect(refundQuota).not.toHaveBeenCalled();
  });

  it("ignores duplicate deliveries of the same job", async () => {
    appBuild.mockResolvedValue({});
    const job = await enqueueJob("app_build", 7, {});

    await Promise.all([runJob(job.id), runJob(job.id)]);

    expect(appBuild).toHaveBeenCalledTimes(1);
  });

  it("fails unknown job types instead of hanging", async () => {
    jobs.set(99, { id: 99, userId: 1, type: "bogus", input: {}, status: "queued" });

    await runJob(99);

    expect(jobs.get(99)).toMatchObject({ status: "failed", error: "Unknown job type: bogus" });
  });
});

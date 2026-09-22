/**
 * Background jobs for work that outlives a single HTTP request.
 *
 * Why this exists: in production every /api call goes Firebase Hosting →
 * the `api` Cloud Function, and Hosting cuts proxied requests off at 60s
 * (the function itself is also configured for 60s). App builds and video
 * renders take minutes, so running them inside a tRPC mutation silently
 * died mid-way in production while working fine locally.
 *
 * Flow: a procedure calls enqueueJob() → a `jobs/{id}` doc is written →
 *   - in Cloud Functions: the Firestore-triggered `jobWorker` function
 *     (functions/index.ts, 540s timeout) calls runJob(id)
 *   - locally (plain Express, no triggers): runJob(id) starts in-process
 * The client polls jobs.get until status is completed/failed.
 */
import * as db from "../db";

export type JobContext = {
  userId: number;
  /** Report progress (0–100) and a short human-readable stage label. */
  report: (progress: number, stage: string) => Promise<void>;
};

type JobHandler = (input: any, ctx: JobContext) => Promise<Record<string, any>>;

// Loaded lazily so this module stays cheap to import and free of cycles.
const HANDLERS: Record<string, () => Promise<JobHandler>> = {
  app_build: async () => (await import("./appGeneration")).runAppBuildJob,
  video_assemble: async () => (await import("./videoGeneration")).runVideoAssembleJob,
};

export type JobType = keyof typeof HANDLERS;

// K_SERVICE is set on Cloud Functions (2nd gen) / Cloud Run, FUNCTION_TARGET
// on the Functions emulator; in both, the Firestore trigger runs the job.
const HAS_JOB_TRIGGER = Boolean(process.env.K_SERVICE || process.env.FUNCTION_TARGET);

export async function enqueueJob(type: JobType, userId: number, input: Record<string, any>) {
  const job = await db.createJob(userId, type, input);
  if (!HAS_JOB_TRIGGER) {
    void runJob(job.id).catch((error) => console.error(`[Jobs] Job ${job.id} crashed:`, error));
  }
  return job;
}

export async function runJob(jobId: number): Promise<void> {
  if (!(await db.claimJob(jobId))) return; // already running or finished

  const job = await db.getJob(jobId);
  if (!job) return;

  const loadHandler = HANDLERS[job.type];
  if (!loadHandler) {
    await db.updateJob(jobId, { status: "failed", error: `Unknown job type: ${job.type}` });
    return;
  }

  const ctx: JobContext = {
    userId: job.userId,
    report: (progress, stage) => db.updateJob(jobId, { progress, stage }),
  };

  try {
    const handler = await loadHandler();
    const result = await handler(job.input, ctx);
    await db.updateJob(jobId, { status: "completed", progress: 100, stage: "Done", result });
  } catch (error) {
    console.error(`[Jobs] Job ${jobId} (${job.type}) failed:`, error);
    await db.updateJob(jobId, {
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

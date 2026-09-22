/**
 * Workflows: a named sequence of agent steps. Running one creates a
 * workflowRuns record and executes the steps in order; each step sees the
 * run's input plus every earlier step's output.
 *
 * Each step is its own background job (jobs.ts) that queues the next step
 * when it finishes, so a long workflow isn't squeezed into one job's 540s.
 *
 * Replaces the previous Workflows feature, which stored a free-form JSON
 * blob ("the format is up to how you design the execution engine") that
 * nothing ever read or executed.
 */
import { z } from "zod";
import * as db from "../db";
import { runAgent } from "./agentRunner";
import { enqueueJob, type JobContext } from "./jobs";
import { refundQuota } from "./quota";

export const MAX_WORKFLOW_STEPS = 8;
// Earlier outputs passed to later steps are capped to keep prompts bounded
const MAX_CONTEXT_CHARS_PER_STEP = 15_000;

export const WorkflowDefinitionSchema = z.object({
  steps: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        agentId: z.number().int().positive().nullable().optional(),
        instructions: z.string().trim().min(1).max(4000),
      })
    )
    .min(1)
    .max(MAX_WORKFLOW_STEPS),
});
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>;

/** Parse a stored definition; null for legacy/free-form ones that can't run. */
export function parseWorkflowDefinition(definition: string): WorkflowDefinition | null {
  try {
    const parsed = WorkflowDefinitionSchema.safeParse(JSON.parse(definition));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function truncate(text: string, max: number) {
  return text.length <= max ? text : `${text.slice(0, max)}\n\n[…truncated]`;
}

function buildStepPrompt(
  workflowName: string,
  input: string | null,
  steps: db.WorkflowRunStep[],
  stepIndex: number,
  instructions: string
) {
  const parts = [`You are running step ${stepIndex + 1} of ${steps.length} in the workflow "${workflowName}".`];
  if (input) parts.push(`## Input for this run\n${input}`);
  const earlier = steps.slice(0, stepIndex).filter((s) => s.output);
  if (earlier.length > 0) {
    parts.push(
      "## Output from earlier steps\n" +
        earlier
          .map((s, i) => `### Step ${i + 1}: ${s.name}\n${truncate(s.output!, MAX_CONTEXT_CHARS_PER_STEP)}`)
          .join("\n\n")
    );
  }
  parts.push(`## Your step: ${steps[stepIndex].name}\n${instructions}`);
  return parts.join("\n\n");
}

/** Start a run of a workflow. Caller must have verified ownership. */
/** Caller must have charged definition.steps.length agentRuns (consumeQuota) in `quotaPeriod`. */
export async function startWorkflowRun(
  workflow: db.Workflow,
  definition: WorkflowDefinition,
  userId: number,
  input: string | null,
  quotaPeriod: string | null = null
) {
  const run = await db.createWorkflowRun({
    userId,
    workflowId: workflow.id,
    input,
    quotaPeriod,
    steps: definition.steps.map((s) => ({ name: s.name, status: "pending" as const })),
  });
  await queueStep(run, 0);
  return run;
}

// The step job records its own jobId when it starts: writing it here after
// enqueueing would race the job (which can start immediately) and could
// overwrite its "running" status.
async function queueStep(run: db.WorkflowRun, stepIndex: number) {
  await enqueueJob("workflow_step", run.userId, { runId: run.id, stepIndex });
}

export async function runWorkflowStepJob(input: { runId: number; stepIndex: number }, ctx: JobContext) {
  const run = await db.getWorkflowRun(input.runId, ctx.userId);
  if (!run) throw new Error("Workflow run not found");
  if (run.status !== "running") return { skipped: true }; // run already ended

  const workflow = await db.getWorkflowById(run.workflowId, ctx.userId);
  const definition = workflow ? parseWorkflowDefinition(workflow.definition) : null;
  const stepDef = definition?.steps[input.stepIndex];

  const steps = [...run.steps];
  const setStep = async (patch: Partial<db.WorkflowRunStep>, runPatch: Partial<db.WorkflowRun> = {}) => {
    steps[input.stepIndex] = { ...steps[input.stepIndex], ...patch };
    await db.updateWorkflowRun(run.id, { steps, ...runPatch });
  };

  try {
    // The workflow was edited or deleted mid-run in a way that removed this step
    if (!workflow || !stepDef || stepDef.name !== steps[input.stepIndex]?.name) {
      throw new Error("The workflow changed while this run was in progress. Start a new run.");
    }
    const agent = stepDef.agentId ? await db.getAgentById(stepDef.agentId, ctx.userId) : undefined;
    if (stepDef.agentId && !agent) {
      throw new Error("This step's agent no longer exists. Edit the workflow to pick another.");
    }

    await setStep({ status: "running", error: null, jobId: ctx.jobId });
    await ctx.report(5, `Step ${input.stepIndex + 1}: starting`);

    const output = await runAgent({
      agent,
      prompt: buildStepPrompt(workflow.name, run.input, steps, input.stepIndex, stepDef.instructions),
      onProgress: (progress, stage) => ctx.report(progress, stage),
    });

    const isLast = input.stepIndex === steps.length - 1;
    await setStep(
      { status: "completed", output },
      isLast ? { status: "completed", completedAt: new Date() } : {}
    );
    await db.trackUsage(ctx.userId, "workflow_step");

    if (!isLast) {
      await queueStep({ ...run, steps }, input.stepIndex + 1);
    }
    return { runId: run.id, stepIndex: input.stepIndex };
  } catch (error) {
    await setStep(
      { status: "failed", error: error instanceof Error ? error.message : String(error) },
      { status: "failed", completedAt: new Date() }
    );
    // Each step was charged one agent run up front: refund this one and the rest
    await refundQuota(ctx.userId, "agentRuns", steps.length - input.stepIndex, run.quotaPeriod ?? null);
    throw error;
  }
}

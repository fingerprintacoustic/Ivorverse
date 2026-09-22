import { trpc } from "@/lib/trpc";

/**
 * Polls a background job (server/_core/jobs.ts) until it completes or fails.
 * Pass null when there's no job to watch.
 */
export function useJob(jobId: number | null) {
  const query = trpc.jobs.get.useQuery(
    { jobId: jobId ?? 0 },
    {
      enabled: jobId !== null,
      refetchInterval: (q) => {
        const status = q.state.data?.status;
        return status === "completed" || status === "failed" ? false : 2000;
      },
    }
  );

  const job = jobId !== null ? query.data : undefined;
  return {
    job,
    isActive: jobId !== null && (!job || job.status === "queued" || job.status === "running"),
    isCompleted: job?.status === "completed",
    isFailed: job?.status === "failed" || query.isError,
    error: job?.error ?? query.error?.message ?? null,
  };
}

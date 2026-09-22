import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useJob } from "@/hooks/useJob";
import { downloadZip } from "@/lib/downloadZip";
import { AlertTriangle, AppWindow, CheckCircle2, Download, ExternalLink, Loader2, Music } from "lucide-react";

const TITLES: Record<string, string> = {
  app_build: "App build",
  music_generate: "Song",
  video_assemble: "Music video",
};

/**
 * Live status and result for a background job (server/_core/jobs.ts),
 * shown under the chat message that started it.
 */
export function JobCard({ jobId }: { jobId: number }) {
  const { job, isActive, isCompleted, isFailed, error } = useJob(jobId);
  const title = (job && TITLES[job.type]) ?? "Task";
  const Icon = job?.type === "music_generate" ? Music : AppWindow;
  const result = (job?.result ?? {}) as Record<string, any>;

  return (
    <div className="mt-2 rounded-lg border bg-background p-3 text-sm space-y-2 text-foreground">
      <div className="flex items-center gap-2 font-medium">
        <Icon className="size-4 shrink-0" />
        <span>{title}</span>
        <span className="ml-auto flex items-center gap-1 text-xs font-normal text-muted-foreground">
          {isActive && <Loader2 className="size-3 animate-spin" />}
          {isCompleted && <CheckCircle2 className="size-3 text-green-600" />}
          {isFailed && <AlertTriangle className="size-3 text-destructive" />}
          {isActive ? job?.stage ?? "Queued" : isCompleted ? "Done" : isFailed ? "Failed" : ""}
        </span>
      </div>

      {isActive && <Progress value={job?.progress ?? 0} />}
      {isFailed && <p className="text-xs text-destructive">{error}</p>}

      {isCompleted && job?.type === "music_generate" && typeof result.audioUrl === "string" && (
        <audio controls src={result.audioUrl} className="w-full h-9" />
      )}

      {isCompleted && job?.type === "app_build" && (
        <div className="space-y-2">
          {result.buildError ? (
            <p className="text-xs text-muted-foreground">
              The code was generated but didn't start in the sandbox — you can still download it.
            </p>
          ) : (
            result.previewExpiresAt && (
              <p className="text-xs text-muted-foreground">
                Live preview available until about{" "}
                {new Date(result.previewExpiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
              </p>
            )
          )}
          <div className="flex flex-wrap gap-2">
            {result.previewUrl && !result.buildError && (
              <Button asChild size="sm" variant="outline">
                <a href={result.previewUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5 mr-1.5" />
                  Open preview
                </a>
              </Button>
            )}
            {Array.isArray(result.files) && result.files.length > 0 && (
              <Button size="sm" variant="outline" onClick={() => downloadZip(result.files, "app")}>
                <Download className="size-3.5 mr-1.5" />
                Download code
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

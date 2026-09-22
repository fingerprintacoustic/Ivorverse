import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useJob } from "@/hooks/useJob";
import { trpc } from "@/lib/trpc";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  History,
  Loader2,
  Pencil,
  Play,
  Plus,
  Trash2,
  Workflow as WorkflowIcon,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";

const MAX_STEPS = 8; // matches MAX_WORKFLOW_STEPS on the server
const GENERAL_AGENT = "general";

type StepDraft = { name: string; agentId: string; instructions: string };
type EditorState = { workflowId: number | null; name: string; description: string; steps: StepDraft[] };

const emptyStep = (): StepDraft => ({ name: "", agentId: GENERAL_AGENT, instructions: "" });
const emptyEditor = (): EditorState => ({ workflowId: null, name: "", description: "", steps: [emptyStep()] });

const RUN_STATUS_COLORS: Record<string, string> = {
  running: "bg-blue-500/10 text-blue-600",
  completed: "bg-green-500/10 text-green-600",
  failed: "bg-red-500/10 text-red-600",
};

function StepStatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />;
  if (status === "failed") return <XCircle className="w-4 h-4 text-destructive shrink-0" />;
  if (status === "running") return <Loader2 className="w-4 h-4 animate-spin text-blue-600 shrink-0" />;
  return <Circle className="w-4 h-4 text-muted-foreground shrink-0" />;
}

function StepLiveProgress({ jobId }: { jobId: number | null | undefined }) {
  const { job } = useJob(jobId ?? null);
  return (
    <div className="space-y-1.5 pl-6">
      <Progress value={job?.progress ?? 0} />
      <p className="text-xs text-muted-foreground truncate">{job?.stage ?? "Starting"}…</p>
    </div>
  );
}

/** One run's steps, polling while it's in progress. */
function RunDetail({ runId }: { runId: number }) {
  const [openStep, setOpenStep] = useState<number | null>(null);
  const { data: run } = trpc.workflows.getRun.useQuery(
    { runId },
    { refetchInterval: (q) => (q.state.data?.status === "running" ? 3000 : false) }
  );
  if (!run) return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-3">
      {run.input && (
        <p className="text-sm">
          <span className="font-medium">Input: </span>
          <span className="text-muted-foreground whitespace-pre-wrap">{run.input}</span>
        </p>
      )}
      {run.steps.map((step, i) => {
        const open = openStep === i || (openStep === null && step.status === "completed" && i === run.steps.length - 1);
        return (
          <div key={i} className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <StepStatusIcon status={step.status} />
              <span className="text-sm font-medium flex-1">
                {i + 1}. {step.name}
              </span>
              {step.output && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  aria-label={open ? "Hide output" : "Show output"}
                  onClick={() => setOpenStep(open ? -1 : i)}
                >
                  {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              )}
            </div>
            {step.status === "running" && <StepLiveProgress jobId={step.jobId} />}
            {step.status === "failed" && step.error && <p className="text-sm text-destructive pl-6">{step.error}</p>}
            {open && step.output && (
              <div className="border-t pt-3 prose prose-sm dark:prose-invert max-w-none">
                <Streamdown>{step.output}</Streamdown>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RunHistory({ workflowId, selectedRunId, onSelect }: {
  workflowId: number;
  selectedRunId: number | null;
  onSelect: (id: number) => void;
}) {
  const { data: runs } = trpc.workflows.listRuns.useQuery(
    { workflowId },
    { refetchInterval: (q) => (q.state.data?.some((r) => r.status === "running") ? 3000 : false) }
  );
  if (!runs) return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />;
  if (runs.length === 0) return <p className="text-sm text-muted-foreground">No runs yet.</p>;

  const activeId = selectedRunId ?? runs[0].id;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {runs.map((r) => (
          <button
            key={r.id}
            onClick={() => onSelect(r.id)}
            className={`text-xs rounded-md border px-2.5 py-1.5 flex items-center gap-1.5 ${
              r.id === activeId ? "bg-secondary" : "hover:bg-muted"
            }`}
          >
            <Badge className={`${RUN_STATUS_COLORS[r.status] ?? ""} px-1.5 py-0`}>{r.status}</Badge>
            {new Date(r.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            <span className="text-muted-foreground">
              {r.stepsDone}/{r.stepCount}
            </span>
          </button>
        ))}
      </div>
      <RunDetail key={activeId} runId={activeId} />
    </div>
  );
}

export default function WorkflowsFeature() {
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [runTarget, setRunTarget] = useState<{ id: number; name: string } | null>(null);
  const [runInput, setRunInput] = useState("");
  const [expandedWorkflowId, setExpandedWorkflowId] = useState<number | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const { data: workflows, refetch } = trpc.workflows.list.useQuery();
  const { data: agents } = trpc.agents.list.useQuery();
  const agentNames = new Map((agents ?? []).map((a) => [a.id, a.name]));

  const onSaved = () => {
    setEditor(null);
    refetch();
  };
  const createMutation = trpc.workflows.create.useMutation({
    onSuccess: () => {
      onSaved();
      toast.success("Workflow created");
    },
    onError: (error) => toast.error(`Failed to save workflow: ${error.message}`),
  });
  const updateMutation = trpc.workflows.update.useMutation({
    onSuccess: () => {
      onSaved();
      toast.success("Workflow saved");
    },
    onError: (error) => toast.error(`Failed to save workflow: ${error.message}`),
  });
  const deleteMutation = trpc.workflows.delete.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Workflow deleted");
    },
    onError: (error) => toast.error(error.message),
  });
  const runMutation = trpc.workflows.run.useMutation({
    onSuccess: (data, vars) => {
      setRunTarget(null);
      setRunInput("");
      setExpandedWorkflowId(vars.workflowId);
      setSelectedRunId(data.runId);
      utils.workflows.listRuns.invalidate({ workflowId: vars.workflowId });
      toast.success("Workflow started");
    },
    onError: (error) => toast.error(`Couldn't start workflow: ${error.message}`),
  });

  const saving = createMutation.isPending || updateMutation.isPending;
  const editorValid =
    editor !== null &&
    editor.name.trim().length > 0 &&
    editor.steps.every((s) => s.name.trim() && s.instructions.trim());

  const updateStep = (index: number, patch: Partial<StepDraft>) =>
    setEditor((e) => e && { ...e, steps: e.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) });
  const moveStep = (index: number, delta: number) =>
    setEditor((e) => {
      if (!e) return e;
      const steps = [...e.steps];
      const [step] = steps.splice(index, 1);
      steps.splice(index + delta, 0, step);
      return { ...e, steps };
    });

  const handleSave = () => {
    if (!editor || !editorValid) return;
    const payload = {
      name: editor.name,
      description: editor.description || undefined,
      definition: {
        steps: editor.steps.map((s) => ({
          name: s.name,
          instructions: s.instructions,
          agentId: s.agentId === GENERAL_AGENT ? null : Number(s.agentId),
        })),
      },
    };
    if (editor.workflowId === null) createMutation.mutate(payload);
    else updateMutation.mutate({ workflowId: editor.workflowId, ...payload });
  };

  const openEditor = (workflow?: NonNullable<typeof workflows>[number]) => {
    if (!workflow) return setEditor(emptyEditor());
    setEditor({
      workflowId: workflow.id,
      name: workflow.name,
      description: workflow.description ?? "",
      steps: workflow.steps?.map((s) => ({
        name: s.name,
        instructions: s.instructions,
        agentId: s.agentId ? String(s.agentId) : GENERAL_AGENT,
      })) ?? [emptyStep()],
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Workflows</h1>
            <p className="text-muted-foreground mt-2">
              Chain agent steps together — each step builds on the output of the ones before it
            </p>
          </div>
          <Button onClick={() => openEditor()}>
            <Plus className="w-4 h-4 mr-2" />
            New Workflow
          </Button>
        </div>

        {!workflows || workflows.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12 text-muted-foreground">
              <WorkflowIcon className="w-10 h-10 mx-auto mb-3 opacity-50" />
              No workflows yet. Create one to get started.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {workflows.map((workflow) => {
              const expanded = expandedWorkflowId === workflow.id;
              return (
                <Card key={workflow.id}>
                  <CardHeader>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <WorkflowIcon className="w-4 h-4" />
                          {workflow.name}
                        </CardTitle>
                        {workflow.description ? (
                          <CardDescription className="mt-1">{workflow.description}</CardDescription>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          disabled={!workflow.steps}
                          onClick={() => setRunTarget({ id: workflow.id, name: workflow.name })}
                        >
                          <Play className="w-3.5 h-3.5 mr-1.5" />
                          Run
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setExpandedWorkflowId(expanded ? null : workflow.id);
                            setSelectedRunId(null);
                          }}
                        >
                          <History className="w-3.5 h-3.5 mr-1.5" />
                          Runs
                        </Button>
                        <Button size="icon" variant="ghost" aria-label="Edit workflow" onClick={() => openEditor(workflow)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Delete workflow"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            if (confirm(`Delete "${workflow.name}"?`)) deleteMutation.mutate({ workflowId: workflow.id });
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {workflow.steps ? (
                      <ol className="space-y-1.5">
                        {workflow.steps.map((step, i) => (
                          <li key={i} className="text-sm flex gap-2">
                            <span className="text-muted-foreground tabular-nums">{i + 1}.</span>
                            <span className="font-medium">{step.name}</span>
                            <span className="text-muted-foreground">
                              · {step.agentId ? agentNames.get(step.agentId) ?? "Missing agent" : "General assistant"}
                            </span>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        This workflow uses the old free-form JSON format, which can't run. Edit it to add steps.
                      </p>
                    )}
                    {expanded && (
                      <div className="border-t pt-4">
                        <RunHistory
                          workflowId={workflow.id}
                          selectedRunId={selectedRunId}
                          onSelect={setSelectedRunId}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / edit */}
      <Dialog open={editor !== null} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editor?.workflowId ? "Edit Workflow" : "Create Workflow"}</DialogTitle>
            <DialogDescription>
              Steps run in order. Each one gets the run's input and every earlier step's output.
            </DialogDescription>
          </DialogHeader>
          {editor && (
            <div className="space-y-4">
              <Input
                placeholder="Workflow name, e.g. Blog post pipeline"
                value={editor.name}
                maxLength={100}
                onChange={(e) => setEditor({ ...editor, name: e.target.value })}
              />
              <Textarea
                placeholder="Description (optional)"
                value={editor.description}
                maxLength={2000}
                onChange={(e) => setEditor({ ...editor, description: e.target.value })}
                rows={2}
              />
              <div className="space-y-3">
                <Label>Steps</Label>
                {editor.steps.map((step, i) => (
                  <div key={i} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground tabular-nums w-5">{i + 1}.</span>
                      <Input
                        placeholder="Step name, e.g. Research"
                        value={step.name}
                        maxLength={100}
                        onChange={(e) => updateStep(i, { name: e.target.value })}
                      />
                      <Button size="icon" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => moveStep(i, -1)}>
                        <ArrowUp className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Move down"
                        disabled={i === editor.steps.length - 1}
                        onClick={() => moveStep(i, 1)}
                      >
                        <ArrowDown className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Remove step"
                        disabled={editor.steps.length === 1}
                        onClick={() => setEditor({ ...editor, steps: editor.steps.filter((_, j) => j !== i) })}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <Select value={step.agentId} onValueChange={(agentId) => updateStep(i, { agentId })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={GENERAL_AGENT}>General assistant (web tools)</SelectItem>
                        {(agents ?? []).map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Textarea
                      placeholder="What this step should do, e.g. Find 5 recent articles about the topic and summarise their key points"
                      value={step.instructions}
                      maxLength={4000}
                      onChange={(e) => updateStep(i, { instructions: e.target.value })}
                      rows={3}
                    />
                  </div>
                ))}
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={editor.steps.length >= MAX_STEPS}
                  onClick={() => setEditor({ ...editor, steps: [...editor.steps, emptyStep()] })}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Step {editor.steps.length >= MAX_STEPS ? `(max ${MAX_STEPS})` : ""}
                </Button>
              </div>
              <Button onClick={handleSave} disabled={!editorValid || saving} className="w-full">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {editor.workflowId ? "Save Changes" : "Create Workflow"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Run */}
      <Dialog open={runTarget !== null} onOpenChange={(open) => !open && setRunTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run "{runTarget?.name}"</DialogTitle>
            <DialogDescription>
              Optionally give this run something to work on — every step sees it.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Input (optional), e.g. Topic: remote work trends in 2026"
            value={runInput}
            maxLength={8000}
            onChange={(e) => setRunInput(e.target.value)}
            rows={4}
          />
          <Button
            onClick={() => runTarget && runMutation.mutate({ workflowId: runTarget.id, input: runInput || undefined })}
            disabled={runMutation.isPending}
          >
            {runMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
            Start Run
          </Button>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

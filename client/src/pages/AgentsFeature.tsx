import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useJob } from "@/hooks/useJob";
import { trpc } from "@/lib/trpc";
import { Bot, ChevronDown, ChevronUp, ListTodo, Loader2, Play, Plus, RotateCw } from "lucide-react";
import { useState } from "react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-500/10 text-blue-600",
  completed: "bg-green-500/10 text-green-600",
  failed: "bg-red-500/10 text-red-600",
};

// Keep in sync with AGENT_TOOLS in server/_core/agentRunner.ts
const TOOLS = [
  { id: "web_search", label: "Web search", hint: "Search the web for current information" },
  { id: "web_fetch", label: "Read web pages", hint: "Open and read specific URLs" },
  { id: "generate_image", label: "Generate images", hint: "Create images for its report" },
] as const;
type ToolId = (typeof TOOLS)[number]["id"];
const TOOL_LABELS: Record<string, string> = Object.fromEntries(TOOLS.map((t) => [t.id, t.label]));

function toolList(capabilities: unknown): string[] {
  return Array.isArray(capabilities) ? capabilities.filter((c) => typeof c === "string") : [];
}

/** Live stage text for a running task, from its background job. */
function RunProgress({ jobId, progress }: { jobId: number | null | undefined; progress: number }) {
  const { job } = useJob(jobId ?? null);
  return (
    <div className="space-y-1.5">
      <Progress value={job?.progress ?? progress} />
      <p className="text-xs text-muted-foreground truncate">{job?.stage ?? "Queued"}…</p>
    </div>
  );
}

export default function AgentsFeature() {
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [agentDescription, setAgentDescription] = useState("");
  const [agentTools, setAgentTools] = useState<ToolId[]>(["web_search", "web_fetch"]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskAgentId, setTaskAgentId] = useState<string>("");
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);

  const { data: agents, refetch: refetchAgents } = trpc.agents.list.useQuery();
  const { data: tasks, refetch: refetchTasks } = trpc.agents.listTasks.useQuery(undefined, {
    // Keep polling while anything is running so status and results appear
    refetchInterval: (q) => (q.state.data?.some((t) => t.status === "in_progress") ? 3000 : false),
  });
  const agentNames = new Map((agents ?? []).map((a) => [a.id, a.name]));

  const createAgentMutation = trpc.agents.create.useMutation({
    onSuccess: () => {
      setAgentName("");
      setAgentDescription("");
      setAgentTools(["web_search", "web_fetch"]);
      setAgentDialogOpen(false);
      refetchAgents();
      toast.success("Agent created");
    },
    onError: (error) => toast.error(`Failed to create agent: ${error.message}`),
  });

  const runTaskMutation = trpc.agents.runTask.useMutation({
    onSuccess: () => refetchTasks(),
    onError: (error) => toast.error(`Couldn't start task: ${error.message}`),
  });

  const createTaskMutation = trpc.agents.createTask.useMutation({
    onError: (error) => toast.error(`Failed to create task: ${error.message}`),
  });

  const handleCreateAgent = () => {
    if (!agentName.trim()) return;
    createAgentMutation.mutate({
      name: agentName,
      description: agentDescription || undefined,
      capabilities: agentTools,
    });
  };

  const handleCreateTask = async (runNow: boolean) => {
    if (!taskTitle.trim()) return;
    const task = await createTaskMutation.mutateAsync({
      title: taskTitle,
      description: taskDescription || undefined,
      agentId: taskAgentId ? Number(taskAgentId) : undefined,
    });
    setTaskTitle("");
    setTaskDescription("");
    setTaskAgentId("");
    setTaskDialogOpen(false);
    if (runNow) {
      await runTaskMutation.mutateAsync({ taskId: task.id });
      setExpandedTaskId(task.id);
      toast.success("Task started");
    } else {
      toast.success("Task created");
    }
    refetchTasks();
  };

  const toggleTool = (id: ToolId, on: boolean) =>
    setAgentTools((prev) => (on ? (prev.includes(id) ? prev : [...prev, id]) : prev.filter((t) => t !== id)));

  const sortedTasks = [...(tasks ?? [])].reverse(); // newest first

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Agents</h1>
          <p className="text-muted-foreground mt-2">
            Create agents with instructions and tools, then give them tasks to work on
          </p>
        </div>

        <Tabs defaultValue="tasks">
          <TabsList>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="agents">Agents</TabsTrigger>
          </TabsList>

          <TabsContent value="agents" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={agentDialogOpen} onOpenChange={setAgentDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    New Agent
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Agent</DialogTitle>
                    <DialogDescription>
                      Its instructions apply to every task it runs.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Input
                      placeholder="Agent name, e.g. Market Researcher"
                      value={agentName}
                      maxLength={100}
                      onChange={(e) => setAgentName(e.target.value)}
                    />
                    <Textarea
                      placeholder="Instructions, e.g. You research competitors for a small SaaS company. Focus on pricing and positioning, and keep reports under a page."
                      value={agentDescription}
                      maxLength={4000}
                      onChange={(e) => setAgentDescription(e.target.value)}
                      rows={4}
                    />
                    <div className="space-y-2">
                      <Label>Tools</Label>
                      {TOOLS.map((tool) => (
                        <label key={tool.id} className="flex items-start gap-3 text-sm cursor-pointer">
                          <Checkbox
                            checked={agentTools.includes(tool.id)}
                            onCheckedChange={(checked) => toggleTool(tool.id, checked === true)}
                            className="mt-0.5"
                          />
                          <span>
                            <span className="font-medium">{tool.label}</span>
                            <span className="block text-xs text-muted-foreground">{tool.hint}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <Button
                      onClick={handleCreateAgent}
                      disabled={!agentName.trim() || createAgentMutation.isPending}
                      className="w-full"
                    >
                      {createAgentMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : null}
                      Create Agent
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {!agents || agents.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12 text-muted-foreground">
                  <Bot className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  No agents yet. Create one to get started.
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {agents.map((agent) => {
                  const tools = toolList(agent.capabilities);
                  return (
                    <Card key={agent.id}>
                      <CardHeader className="space-y-3">
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Bot className="w-4 h-4" />
                          {agent.name}
                        </CardTitle>
                        {agent.description ? (
                          <CardDescription className="line-clamp-4 whitespace-pre-wrap">
                            {agent.description}
                          </CardDescription>
                        ) : null}
                        <div className="flex flex-wrap gap-1.5">
                          {(Array.isArray(agent.capabilities) ? tools : ["web_search", "web_fetch"]).map((t) => (
                            <Badge key={t} variant="secondary">
                              {TOOL_LABELS[t] ?? t}
                            </Badge>
                          ))}
                          {Array.isArray(agent.capabilities) && tools.length === 0 && (
                            <Badge variant="outline">No tools</Badge>
                          )}
                        </div>
                      </CardHeader>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="tasks" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    New Task
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Task</DialogTitle>
                    <DialogDescription>
                      Describe what you want done. The agent works on it on its own and writes up a report.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Input
                      placeholder="Task, e.g. Compare the top 3 note-taking apps for students"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                    />
                    <Textarea
                      placeholder="Details (optional)..."
                      value={taskDescription}
                      onChange={(e) => setTaskDescription(e.target.value)}
                      rows={3}
                    />
                    <Select value={taskAgentId} onValueChange={setTaskAgentId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Agent (default: general assistant with web tools)" />
                      </SelectTrigger>
                      <SelectContent>
                        {(agents ?? []).map((agent) => (
                          <SelectItem key={agent.id} value={String(agent.id)}>
                            {agent.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        onClick={() => handleCreateTask(false)}
                        disabled={!taskTitle.trim() || createTaskMutation.isPending || runTaskMutation.isPending}
                      >
                        Save for Later
                      </Button>
                      <Button
                        onClick={() => handleCreateTask(true)}
                        disabled={!taskTitle.trim() || createTaskMutation.isPending || runTaskMutation.isPending}
                      >
                        {createTaskMutation.isPending || runTaskMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4 mr-2" />
                        )}
                        Create &amp; Run
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {sortedTasks.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12 text-muted-foreground">
                  <ListTodo className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  No tasks yet.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {sortedTasks.map((task) => {
                  const running = task.status === "in_progress";
                  const expanded = expandedTaskId === task.id;
                  const hasOutput = Boolean(task.result || task.error);
                  return (
                    <Card key={task.id}>
                      <CardContent className="py-4 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{task.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {task.agentId ? agentNames.get(task.agentId) ?? "Agent" : "General assistant"}
                              {task.completedAt ? ` · finished ${new Date(task.completedAt).toLocaleString()}` : ""}
                            </p>
                            {task.description ? (
                              <p className="text-sm text-muted-foreground mt-1">{task.description}</p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={STATUS_COLORS[task.status] ?? ""}>
                              {task.status.replace("_", " ")}
                            </Badge>
                            {!running && (
                              <Button
                                size="sm"
                                variant={task.status === "pending" ? "default" : "outline"}
                                disabled={runTaskMutation.isPending}
                                onClick={() => {
                                  runTaskMutation.mutate({ taskId: task.id });
                                  setExpandedTaskId(task.id);
                                }}
                              >
                                {task.status === "pending" ? (
                                  <Play className="w-3.5 h-3.5 mr-1.5" />
                                ) : (
                                  <RotateCw className="w-3.5 h-3.5 mr-1.5" />
                                )}
                                {task.status === "pending" ? "Run" : "Run again"}
                              </Button>
                            )}
                            {hasOutput && !running && (
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={expanded ? "Hide result" : "Show result"}
                                onClick={() => setExpandedTaskId(expanded ? null : task.id)}
                              >
                                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                              </Button>
                            )}
                          </div>
                        </div>

                        {running && <RunProgress jobId={task.jobId} progress={task.progress} />}

                        {!running && expanded && task.status === "failed" && task.error && (
                          <p className="text-sm text-destructive">{task.error}</p>
                        )}
                        {!running && expanded && task.result && (
                          <div className="border-t pt-3 prose prose-sm dark:prose-invert max-w-none">
                            <Streamdown>{task.result}</Streamdown>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

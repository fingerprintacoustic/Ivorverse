import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { trpc } from "@/lib/trpc";
import { Bot, ListTodo, Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  in_progress: "bg-blue-500/10 text-blue-600",
  completed: "bg-green-500/10 text-green-600",
  failed: "bg-red-500/10 text-red-600",
};

export default function AgentsFeature() {
  const [agentDialogOpen, setAgentDialogOpen] = useState(false);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [agentDescription, setAgentDescription] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskAgentId, setTaskAgentId] = useState<string>("");

  const { data: agents, refetch: refetchAgents } = trpc.agents.list.useQuery();
  const { data: tasks, refetch: refetchTasks } = trpc.agents.listTasks.useQuery();

  const createAgentMutation = trpc.agents.create.useMutation({
    onSuccess: () => {
      setAgentName("");
      setAgentDescription("");
      setAgentDialogOpen(false);
      refetchAgents();
      toast.success("Agent created");
    },
    onError: (error) => toast.error(`Failed to create agent: ${error.message}`),
  });

  const createTaskMutation = trpc.agents.createTask.useMutation({
    onSuccess: () => {
      setTaskTitle("");
      setTaskDescription("");
      setTaskAgentId("");
      setTaskDialogOpen(false);
      refetchTasks();
      toast.success("Task created");
    },
    onError: (error) => toast.error(`Failed to create task: ${error.message}`),
  });

  const updateTaskStatusMutation = trpc.agents.updateTaskStatus.useMutation({
    onSuccess: () => {
      refetchTasks();
    },
    onError: (error) => toast.error(`Failed to update task: ${error.message}`),
  });

  const handleCreateAgent = () => {
    if (!agentName.trim()) return;
    createAgentMutation.mutate({ name: agentName, description: agentDescription || undefined });
  };

  const handleCreateTask = () => {
    if (!taskTitle.trim()) return;
    createTaskMutation.mutate({
      title: taskTitle,
      description: taskDescription || undefined,
      agentId: taskAgentId ? Number(taskAgentId) : undefined,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Agents</h1>
            <p className="text-muted-foreground mt-2">
              Create agents and assign them tasks to track
            </p>
          </div>
        </div>

        <Tabs defaultValue="agents">
          <TabsList>
            <TabsTrigger value="agents">Agents</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
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
                    <DialogDescription>Give it a name and what it's for.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Input
                      placeholder="Agent name..."
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                    />
                    <Textarea
                      placeholder="Description (optional)..."
                      value={agentDescription}
                      onChange={(e) => setAgentDescription(e.target.value)}
                      rows={3}
                    />
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
                {agents.map((agent) => (
                  <Card key={agent.id}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Bot className="w-4 h-4" />
                        {agent.name}
                      </CardTitle>
                      {agent.description ? (
                        <CardDescription>{agent.description}</CardDescription>
                      ) : null}
                    </CardHeader>
                  </Card>
                ))}
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
                      Optionally assign it to one of your agents.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Input
                      placeholder="Task title..."
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                    />
                    <Textarea
                      placeholder="Description (optional)..."
                      value={taskDescription}
                      onChange={(e) => setTaskDescription(e.target.value)}
                      rows={3}
                    />
                    {agents && agents.length > 0 ? (
                      <Select value={taskAgentId} onValueChange={setTaskAgentId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Assign to agent (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {agents.map((agent) => (
                            <SelectItem key={agent.id} value={String(agent.id)}>
                              {agent.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                    <Button
                      onClick={handleCreateTask}
                      disabled={!taskTitle.trim() || createTaskMutation.isPending}
                      className="w-full"
                    >
                      {createTaskMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : null}
                      Create Task
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {!tasks || tasks.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12 text-muted-foreground">
                  <ListTodo className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  No tasks yet.
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <Card key={task.id}>
                    <CardContent className="flex items-center justify-between py-4">
                      <div>
                        <p className="font-medium">{task.title}</p>
                        {task.description ? (
                          <p className="text-sm text-muted-foreground">{task.description}</p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={STATUS_COLORS[task.status] ?? ""}>
                          {task.status.replace("_", " ")}
                        </Badge>
                        <Select
                          value={task.status}
                          onValueChange={(status) =>
                            updateTaskStatusMutation.mutate({
                              taskId: task.id,
                              status: status as "pending" | "in_progress" | "completed" | "failed",
                            })
                          }
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="in_progress">In progress</SelectItem>
                            <SelectItem value="completed">Completed</SelectItem>
                            <SelectItem value="failed">Failed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

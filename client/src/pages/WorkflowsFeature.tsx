import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Loader2, Plus, Workflow as WorkflowIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function WorkflowsFeature() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [definition, setDefinition] = useState("");

  const { data: workflows, refetch } = trpc.workflows.list.useQuery();

  const createMutation = trpc.workflows.create.useMutation({
    onSuccess: () => {
      setName("");
      setDescription("");
      setDefinition("");
      setDialogOpen(false);
      refetch();
      toast.success("Workflow created");
    },
    onError: (error) => toast.error(`Failed to create workflow: ${error.message}`),
  });

  const handleCreate = () => {
    if (!name.trim() || !definition.trim()) {
      toast.error("Name and definition are required");
      return;
    }
    try {
      JSON.parse(definition);
    } catch {
      toast.error("Definition must be valid JSON");
      return;
    }
    createMutation.mutate({ name, definition, description: description || undefined });
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Workflows</h1>
            <p className="text-muted-foreground mt-2">
              Define automated workflows as JSON step definitions
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Workflow
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Workflow</DialogTitle>
                <DialogDescription>
                  Definition is a JSON blob describing the steps — the format is up
                  to how you design the execution engine.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  placeholder="Workflow name..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Textarea
                  placeholder="Description (optional)..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
                <Textarea
                  placeholder='{"steps": [...]}'
                  value={definition}
                  onChange={(e) => setDefinition(e.target.value)}
                  rows={6}
                  className="font-mono text-sm"
                />
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                  className="w-full"
                >
                  {createMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Create Workflow
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {!workflows || workflows.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12 text-muted-foreground">
              <WorkflowIcon className="w-10 h-10 mx-auto mb-3 opacity-50" />
              No workflows yet. Create one to get started.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {workflows.map((workflow) => (
              <Card key={workflow.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <WorkflowIcon className="w-4 h-4" />
                    {workflow.name}
                  </CardTitle>
                  {workflow.description ? (
                    <CardDescription>{workflow.description}</CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent>
                  <pre className="text-xs bg-muted rounded p-3 overflow-x-auto max-h-40">
                    {workflow.definition}
                  </pre>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

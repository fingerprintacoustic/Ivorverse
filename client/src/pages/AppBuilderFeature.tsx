import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useJob } from "@/hooks/useJob";
import { trpc } from "@/lib/trpc";
import { strToU8, zipSync } from "fflate";
import { AlertTriangle, Code, Copy, Download, ExternalLink, FileCode, Loader2, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Streamdown } from "streamdown";
import { toast } from "sonner";

type AppType = "website" | "mobile" | "saas";
type AppFile = { path: string; content: string };
type BuildResult = {
  requirements: string | null;
  design: string | null;
  files: AppFile[];
  previewUrl: string | null;
  previewExpiresAt?: string | null;
  buildError?: string | null;
};

function downloadZip(files: AppFile[], name: string) {
  const zipped = zipSync(Object.fromEntries(files.map((f) => [f.path.replace(/^\/+/, ""), strToU8(f.content)])));
  const url = URL.createObjectURL(new Blob([zipped], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.replace(/[^\w.-]+/g, "-") || "app"}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

function copyText(text: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success("Copied to clipboard"))
    .catch(() => toast.error("Couldn't access the clipboard"));
}

function CodeBrowser({ files, projectName }: { files: AppFile[]; projectName: string }) {
  const sorted = useMemo(() => [...files].sort((a, b) => a.path.localeCompare(b.path)), [files]);
  const [selectedPath, setSelectedPath] = useState(sorted[0]?.path);
  const selected = sorted.find((f) => f.path === selectedPath) ?? sorted[0];

  if (!selected) {
    return <p className="text-sm text-muted-foreground">No files were generated.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={() => copyText(selected.content)}>
          <Copy className="w-4 h-4 mr-2" />
          Copy file
        </Button>
        <Button size="sm" onClick={() => downloadZip(files, projectName)}>
          <Download className="w-4 h-4 mr-2" />
          Download project (.zip)
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
        <nav className="border rounded-lg p-2 max-h-[32rem] overflow-y-auto space-y-0.5">
          {sorted.map((f) => (
            <button
              key={f.path}
              onClick={() => setSelectedPath(f.path)}
              className={`w-full text-left text-xs font-mono px-2 py-1.5 rounded flex items-center gap-2 truncate ${
                f.path === selected.path ? "bg-secondary" : "hover:bg-muted"
              }`}
              title={f.path}
            >
              <FileCode className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{f.path}</span>
            </button>
          ))}
        </nav>
        <div className="bg-gray-900 text-gray-100 rounded-lg overflow-auto max-h-[32rem] min-w-0">
          <div className="px-4 py-2 border-b border-gray-700 text-xs font-mono text-gray-400">{selected.path}</div>
          <pre className="p-4 text-xs font-mono whitespace-pre">{selected.content}</pre>
        </div>
      </div>
    </div>
  );
}

function PreviewPanel({ result, isFreshBuild }: { result: BuildResult; isFreshBuild: boolean }) {
  if (result.buildError) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
          <p>
            The code was generated but didn't start in the sandbox. You can still download it from the Code
            tab, or generate again.
          </p>
        </div>
        <pre className="bg-muted p-3 rounded-lg text-xs whitespace-pre-wrap max-h-64 overflow-auto">
          {result.buildError}
        </pre>
      </div>
    );
  }
  if (!result.previewUrl) {
    return <p className="text-sm text-muted-foreground">No live preview for this build.</p>;
  }

  const expiresAt = result.previewExpiresAt ? new Date(result.previewExpiresAt) : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {expiresAt
            ? `Live preview sandbox — available until about ${expiresAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
            : "Preview sandboxes shut down about 10 minutes after a build; generate again if this one has expired."}
        </p>
        <Button asChild variant="outline" size="sm">
          <a href={result.previewUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="w-4 h-4 mr-2" />
            Open in new tab
          </a>
        </Button>
      </div>
      {(isFreshBuild || expiresAt) && (
        <iframe
          src={result.previewUrl}
          title="App preview"
          className="w-full h-[36rem] rounded-lg border bg-white"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      )}
    </div>
  );
}

export default function AppBuilderFeature() {
  const [projectName, setProjectName] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [appDescription, setAppDescription] = useState("");
  const [appType, setAppType] = useState<AppType>("website");
  const [jobId, setJobId] = useState<number | null>(null);
  const [resultTab, setResultTab] = useState("preview");

  const { data: projects, refetch } = trpc.projects.list.useQuery();
  const appProjects = projects?.filter((p) => p.type === "app") || [];
  const projectId = selectedProjectId ?? appProjects[0]?.id ?? null;
  const currentProject = appProjects.find((p) => p.id === projectId);

  const createProjectMutation = trpc.projects.create.useMutation({
    onSuccess: (project) => {
      setProjectName("");
      setIsOpen(false);
      setSelectedProjectId(project.id);
      refetch();
    },
  });

  const savedQuery = trpc.appBuilder.get.useQuery(
    { projectId: projectId ?? 0 },
    { enabled: projectId !== null }
  );
  const generateMutation = trpc.appBuilder.generate.useMutation({
    onSuccess: (data) => setJobId(data.jobId),
    onError: (error) => toast.error(error.message),
  });
  const build = useJob(jobId);
  const isBuilding = generateMutation.isPending || build.isActive;

  // Switching projects drops any build being watched for the previous one
  useEffect(() => setJobId(null), [projectId]);

  useEffect(() => {
    if (build.isCompleted) {
      savedQuery.refetch();
      setResultTab("preview");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [build.isCompleted]);

  const freshResult = build.isCompleted ? (build.job?.result as BuildResult | undefined) : undefined;
  const result: BuildResult | null = freshResult ?? savedQuery.data ?? null;

  const handleCreateProject = async () => {
    if (!projectName.trim()) return;
    await createProjectMutation.mutateAsync({
      name: projectName,
      type: "app",
      description: "App builder project",
    });
  };

  const handleGenerate = () => {
    if (projectId === null || appDescription.trim().length < 10) return;
    generateMutation.mutate({ projectId, appType, description: appDescription });
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">AI App Builder</h1>
            <p className="text-muted-foreground mt-2">
              Describe an app and get working code with a live preview
            </p>
          </div>
          <div className="flex items-center gap-2">
            {appProjects.length > 1 && projectId !== null && (
              <Select value={String(projectId)} onValueChange={(v) => setSelectedProjectId(Number(v))}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {appProjects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  New Project
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New App Project</DialogTitle>
                  <DialogDescription>Start a new app generation project</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <Input
                    placeholder="Enter project name..."
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateProject();
                    }}
                  />
                  <Button
                    onClick={handleCreateProject}
                    disabled={!projectName.trim() || createProjectMutation.isPending}
                    className="w-full"
                  >
                    {createProjectMutation.isPending ? "Creating..." : "Create Project"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {projectId === null ? (
          <Card>
            <CardHeader>
              <CardTitle>No Projects Yet</CardTitle>
              <CardDescription>Create your first app project to get started</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setIsOpen(true)}>Create First Project</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Describe Your App</CardTitle>
                <CardDescription>
                  The AI writes the requirements, design, and full source, then runs it in a sandbox.
                  Builds usually take 2–5 minutes.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">App Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["website", "mobile", "saas"] as const).map((type) => (
                      <Button
                        key={type}
                        variant={appType === type ? "default" : "outline"}
                        onClick={() => setAppType(type)}
                        className="capitalize"
                        disabled={isBuilding}
                      >
                        {type}
                      </Button>
                    ))}
                  </div>
                </div>

                <Textarea
                  placeholder="Describe your app idea in detail — who it's for, the main screens, and what users can do..."
                  value={appDescription}
                  onChange={(e) => setAppDescription(e.target.value)}
                  rows={6}
                  maxLength={8000}
                  disabled={isBuilding}
                />

                <Button
                  onClick={handleGenerate}
                  disabled={appDescription.trim().length < 10 || isBuilding}
                  className="w-full"
                >
                  {isBuilding ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Building...
                    </>
                  ) : (
                    <>
                      <Code className="w-4 h-4 mr-2" />
                      {result ? "Generate New Version" : "Generate App"}
                    </>
                  )}
                </Button>

                {build.isActive && (
                  <div className="space-y-2">
                    <Progress value={build.job?.progress ?? 0} />
                    <p className="text-sm text-muted-foreground">{build.job?.stage ?? "Queued"}…</p>
                  </div>
                )}
                {build.isFailed && (
                  <p className="text-sm text-destructive">Build failed: {build.error}</p>
                )}
              </CardContent>
            </Card>

            {savedQuery.isLoading && !result ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : result ? (
              <Tabs value={resultTab} onValueChange={setResultTab} className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                  <TabsTrigger value="requirements">Requirements</TabsTrigger>
                  <TabsTrigger value="design">Design</TabsTrigger>
                  <TabsTrigger value="code">Code</TabsTrigger>
                </TabsList>

                <TabsContent value="preview">
                  <Card>
                    <CardContent className="pt-6">
                      <PreviewPanel result={result} isFreshBuild={Boolean(freshResult)} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="requirements">
                  <Card>
                    <CardContent className="pt-6 prose prose-sm dark:prose-invert max-w-none">
                      <Streamdown>{result.requirements || "_No requirements were generated._"}</Streamdown>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="design">
                  <Card>
                    <CardContent className="pt-6 prose prose-sm dark:prose-invert max-w-none">
                      <Streamdown>{result.design || "_No design spec was generated._"}</Streamdown>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="code">
                  <Card>
                    <CardContent className="pt-6">
                      <CodeBrowser files={result.files} projectName={currentProject?.name ?? "app"} />
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            ) : null}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

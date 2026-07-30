import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Plus, Code, Loader2 } from "lucide-react";
import { useState } from "react";

export default function AppBuilderFeature() {
  const [projectName, setProjectName] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [appDescription, setAppDescription] = useState("");
  const [appType, setAppType] = useState<"website" | "mobile" | "saas">("website");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  const { data: projects, refetch } = trpc.projects.list.useQuery();
  const createProjectMutation = trpc.projects.create.useMutation({
    onSuccess: () => {
      setProjectName("");
      setIsOpen(false);
      refetch();
    },
  });

  const generateCodeMutation = trpc.chat.sendMessage.useMutation({
    onSuccess: (data: any) => {
      const code = data.message || null;
      setGeneratedCode(code);
    },
  });

  const appProjects = projects?.filter((p) => p.type === "app") || [];

  const handleCreateProject = async () => {
    if (!projectName.trim()) return;
    
    await createProjectMutation.mutateAsync({
      name: projectName,
      type: "app",
      description: "App builder project",
    });
  };

  const handleGenerateCode = async () => {
    if (!appDescription.trim() || !appProjects[0]) return;
    
    const prompt = `Generate a complete ${appType} application based on this description: ${appDescription}\n\nProvide the full source code, database schema, and deployment instructions.`;
    
    await generateCodeMutation.mutateAsync({
      projectId: appProjects[0].id,
      message: prompt,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">AI App Builder</h1>
            <p className="text-muted-foreground mt-2">
              Generate full applications from text descriptions
            </p>
          </div>
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
                <DialogDescription>
                  Start a new app generation project
                </DialogDescription>
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

        {appProjects.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No Projects Yet</CardTitle>
              <CardDescription>
                Create your first app project to get started
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setIsOpen(true)}>Create First Project</Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="generate" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="generate">Generate</TabsTrigger>
              <TabsTrigger value="requirements">Requirements</TabsTrigger>
              <TabsTrigger value="design">Design</TabsTrigger>
              <TabsTrigger value="code">Code</TabsTrigger>
            </TabsList>

            <TabsContent value="generate" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Describe Your App</CardTitle>
                  <CardDescription>
                    Tell us what app you want to build
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
                        >
                          {type}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <Textarea
                    placeholder="Describe your app idea in detail..."
                    value={appDescription}
                    onChange={(e) => setAppDescription(e.target.value)}
                    rows={6}
                  />

                  <Button
                    onClick={handleGenerateCode}
                    disabled={!appDescription.trim() || generateCodeMutation.isPending}
                    className="w-full"
                  >
                    {generateCodeMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Code className="w-4 h-4 mr-2" />
                        Generate App
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="requirements" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Generated Requirements</CardTitle>
                  <CardDescription>
                    Functional and technical requirements for your app
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted p-4 rounded-lg text-sm text-muted-foreground">
                    Requirements will appear here after generation
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="design" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>UI/UX Design</CardTitle>
                  <CardDescription>
                    Generated design mockups and specifications
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted p-4 rounded-lg text-sm text-muted-foreground">
                    Design mockups will appear here after generation
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="code" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Generated Code</CardTitle>
                  <CardDescription>
                    Full source code ready to deploy
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {generatedCode ? (
                    <div className="space-y-4">
                      <div className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto max-h-96">
                        <pre className="text-xs font-mono">{generatedCode.substring(0, 500)}...</pre>
                      </div>
                      <div className="flex gap-2">
                        <Button className="flex-1" variant="outline">
                          Copy Code
                        </Button>
                        <Button className="flex-1">
                          Download Project
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-muted p-4 rounded-lg text-sm text-muted-foreground text-center py-8">
                      Generate an app to see the code
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}

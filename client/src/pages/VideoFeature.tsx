import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Plus, Film, Loader2, Music, Image as ImageIcon, Zap } from "lucide-react";
import { useState } from "react";

export default function VideoFeature() {
  const [projectName, setProjectName] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [videoDescription, setVideoDescription] = useState("");
  const [currentStep, setCurrentStep] = useState<"concept" | "lyrics" | "scenes" | "images" | "assembly">("concept");

  const { data: projects, refetch } = trpc.projects.list.useQuery();
  const createProjectMutation = trpc.projects.create.useMutation({
    onSuccess: () => {
      setProjectName("");
      setIsOpen(false);
      refetch();
    },
  });

  const videoProjects = projects?.filter((p) => p.type === "video") || [];

  const handleCreateProject = async () => {
    if (!projectName.trim()) return;
    
    await createProjectMutation.mutateAsync({
      name: projectName,
      type: "video",
      description: "Music video generation project",
    });
  };

  const steps = [
    { id: "concept", label: "Concept", icon: Zap },
    { id: "lyrics", label: "Generate Lyrics", icon: Music },
    { id: "scenes", label: "Create Scenes", icon: Film },
    { id: "images", label: "Generate Images", icon: ImageIcon },
    { id: "assembly", label: "Assemble Video", icon: Film },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Music Video Generator</h1>
            <p className="text-muted-foreground mt-2">
              Create complete music videos: song, lyrics, scenes, images, and assembly
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
                <DialogTitle>Create New Music Video Project</DialogTitle>
                <DialogDescription>
                  Start a new music video generation project
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

        {videoProjects.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No Projects Yet</CardTitle>
              <CardDescription>
                Create your first music video project to get started
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setIsOpen(true)}>Create First Project</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* Workflow Steps */}
            <Card>
              <CardHeader>
                <CardTitle>Music Video Workflow</CardTitle>
                <CardDescription>
                  Follow these steps to create your music video
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-6">
                  {steps.map((step, index) => {
                    const StepIcon = step.icon;
                    const isActive = currentStep === step.id;
                    const isCompleted = steps.findIndex((s) => s.id === currentStep) > index;

                    return (
                      <div key={step.id} className="flex flex-col items-center flex-1">
                        <div
                          className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 ${
                            isActive
                              ? "bg-blue-500 text-white"
                              : isCompleted
                              ? "bg-green-500 text-white"
                              : "bg-gray-200 text-gray-600"
                          }`}
                        >
                          <StepIcon className="w-6 h-6" />
                        </div>
                        <span className="text-xs font-medium text-center">{step.label}</span>
                        {index < steps.length - 1 && (
                          <div
                            className={`h-1 flex-1 mx-2 ${
                              isCompleted ? "bg-green-500" : "bg-gray-200"
                            }`}
                            style={{ width: "100%" }}
                          ></div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Step Content */}
            <Tabs value={currentStep} onValueChange={(value: any) => setCurrentStep(value)}>
              <TabsList className="grid w-full grid-cols-5">
                {steps.map((step) => (
                  <TabsTrigger key={step.id} value={step.id} className="text-xs">
                    {step.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <TabsContent value="concept" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Video Concept</CardTitle>
                    <CardDescription>
                      Describe the music video concept and theme
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Textarea
                      placeholder="Describe your music video concept, mood, theme, and visual style..."
                      value={videoDescription}
                      onChange={(e) => setVideoDescription(e.target.value)}
                      rows={6}
                    />
                    <Button
                      onClick={() => setCurrentStep("lyrics")}
                      disabled={!videoDescription.trim()}
                      className="w-full"
                    >
                      Next: Generate Lyrics
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="lyrics" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Generate Lyrics</CardTitle>
                    <CardDescription>
                      AI-generated lyrics based on your concept
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-muted p-4 rounded-lg min-h-64 text-sm">
                      <p className="text-muted-foreground">Lyrics will be generated here...</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setCurrentStep("concept")}>
                        Back
                      </Button>
                      <Button onClick={() => setCurrentStep("scenes")} className="flex-1">
                        Next: Create Scenes
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="scenes" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Scene Descriptions</CardTitle>
                    <CardDescription>
                      AI-generated scene descriptions for each verse and chorus
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="border rounded-lg p-3">
                          <h4 className="font-semibold text-sm mb-2">Scene {i}</h4>
                          <p className="text-sm text-muted-foreground">Scene description will appear here...</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setCurrentStep("lyrics")}>
                        Back
                      </Button>
                      <Button onClick={() => setCurrentStep("images")} className="flex-1">
                        Next: Generate Images
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="images" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Generated Images</CardTitle>
                    <CardDescription>
                      AI-generated images for each scene
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="border rounded-lg aspect-video bg-muted flex items-center justify-center">
                          <ImageIcon className="w-8 h-8 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setCurrentStep("scenes")}>
                        Back
                      </Button>
                      <Button onClick={() => setCurrentStep("assembly")} className="flex-1">
                        Next: Assemble Video
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="assembly" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Video Assembly</CardTitle>
                    <CardDescription>
                      Assemble all elements into final music video with subtitles
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="border rounded-lg aspect-video bg-black flex items-center justify-center">
                      <Film className="w-16 h-16 text-gray-600" />
                    </div>
                    <Button className="w-full">
                      <Loader2 className="w-4 h-4 mr-2" />
                      Assembling Video...
                    </Button>
                    <div className="bg-muted p-4 rounded-lg">
                      <p className="text-sm font-semibold mb-2">Video Details</p>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>• Duration: 3:45</li>
                        <li>• Format: MP4 (1080p)</li>
                        <li>• Subtitles: Enabled</li>
                      </ul>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1">
                        Download Video
                      </Button>
                      <Button className="flex-1">
                        Share
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

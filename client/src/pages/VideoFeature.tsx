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
  const [scenes, setScenes] = useState<string[]>([]);
  const [sceneImageUrls, setSceneImageUrls] = useState<string[]>([]);
  const [audioUrl, setAudioUrl] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const { data: projects, refetch } = trpc.projects.list.useQuery();
  const createProjectMutation = trpc.projects.create.useMutation({
    onSuccess: () => {
      setProjectName("");
      setIsOpen(false);
      refetch();
    },
  });

  const generateScenesMutation = trpc.video.generateScenes.useMutation({
    onSuccess: (data) => {
      setScenes(data.scenes);
      setCurrentStep("images");
    },
  });

  const generateImagesMutation = trpc.video.generateSceneImages.useMutation({
    onSuccess: (data) => {
      setSceneImageUrls(data.imageUrls);
      setCurrentStep("assembly");
    },
  });

  const assembleMutation = trpc.video.assemble.useMutation({
    onSuccess: (data) => {
      setVideoUrl(data.videoUrl);
    },
  });

  const videoProjects = projects?.filter((p) => p.type === "video") || [];
  const currentProjectId = videoProjects[0]?.id;

  const handleCreateProject = async () => {
    if (!projectName.trim()) return;
    
    await createProjectMutation.mutateAsync({
      name: projectName,
      type: "video",
      description: "Music video generation project",
    });
  };

  const handleGenerateScenes = () => {
    if (!currentProjectId || !videoDescription.trim()) return;
    generateScenesMutation.mutate({ projectId: currentProjectId, concept: videoDescription });
  };

  const handleGenerateImages = () => {
    if (!currentProjectId) return;
    generateImagesMutation.mutate({ projectId: currentProjectId });
  };

  const handleAssemble = () => {
    if (!currentProjectId || !audioUrl.trim()) return;
    assembleMutation.mutate({ projectId: currentProjectId, audioUrl, lyrics: lyrics || undefined });
  };

  const steps = [
    { id: "concept", label: "Concept", icon: Zap },
    { id: "lyrics", label: "Song", icon: Music },
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
                      Next: Song
                    </Button>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="lyrics" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Song</CardTitle>
                    <CardDescription>
                      Paste the audio URL from a song you generated in Music Studio, plus its
                      lyrics (used for the video's subtitles)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Input
                      placeholder="Audio URL from Music Studio..."
                      value={audioUrl}
                      onChange={(e) => setAudioUrl(e.target.value)}
                    />
                    <Textarea
                      placeholder="Lyrics (optional, used for subtitles) — [Verse]/[Chorus] markers are stripped automatically..."
                      value={lyrics}
                      onChange={(e) => setLyrics(e.target.value)}
                      rows={6}
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setCurrentStep("concept")}>
                        Back
                      </Button>
                      <Button
                        onClick={handleGenerateScenes}
                        disabled={!audioUrl.trim() || generateScenesMutation.isPending}
                        className="flex-1"
                      >
                        {generateScenesMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Writing scenes...
                          </>
                        ) : (
                          "Next: Create Scenes"
                        )}
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
                      {scenes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No scenes yet — go back and generate them from your concept.
                        </p>
                      ) : (
                        scenes.map((scene, i) => (
                          <div key={i} className="border rounded-lg p-3">
                            <h4 className="font-semibold text-sm mb-2">Scene {i + 1}</h4>
                            <p className="text-sm text-muted-foreground">{scene}</p>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setCurrentStep("lyrics")}>
                        Back
                      </Button>
                      <Button
                        onClick={handleGenerateImages}
                        disabled={scenes.length === 0 || generateImagesMutation.isPending}
                        className="flex-1"
                      >
                        {generateImagesMutation.isPending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Generating images...
                          </>
                        ) : (
                          "Next: Generate Images"
                        )}
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
                      {sceneImageUrls.length === 0 ? (
                        [1, 2, 3, 4].map((i) => (
                          <div key={i} className="border rounded-lg aspect-video bg-muted flex items-center justify-center">
                            <ImageIcon className="w-8 h-8 text-muted-foreground" />
                          </div>
                        ))
                      ) : (
                        sceneImageUrls.map((url, i) => (
                          <img key={i} src={url} alt={`Scene ${i + 1}`} className="rounded-lg border aspect-video object-cover" />
                        ))
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setCurrentStep("scenes")}>
                        Back
                      </Button>
                      <Button
                        onClick={() => setCurrentStep("assembly")}
                        disabled={sceneImageUrls.length === 0}
                        className="flex-1"
                      >
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
                    {videoUrl ? (
                      <video controls src={videoUrl} className="w-full rounded-lg border" />
                    ) : (
                      <div className="border rounded-lg aspect-video bg-black flex items-center justify-center">
                        <Film className="w-16 h-16 text-gray-600" />
                      </div>
                    )}
                    <Button
                      onClick={handleAssemble}
                      disabled={assembleMutation.isPending || !audioUrl.trim() || sceneImageUrls.length === 0}
                      className="w-full"
                    >
                      {assembleMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Assembling video (this can take several minutes)...
                        </>
                      ) : (
                        "Assemble Video"
                      )}
                    </Button>
                    {videoUrl && (
                      <div className="flex gap-2">
                        <Button asChild variant="outline" className="flex-1">
                          <a href={videoUrl} download target="_blank" rel="noreferrer">
                            Download Video
                          </a>
                        </Button>
                      </div>
                    )}
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

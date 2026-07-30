import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Plus, Music, Loader2 } from "lucide-react";
import { useState } from "react";

export default function MusicFeature() {
  const [projectName, setProjectName] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [generatedLyrics, setGeneratedLyrics] = useState<string | null>(null);

  const { data: projects, refetch } = trpc.projects.list.useQuery();
  const createProjectMutation = trpc.projects.create.useMutation({
    onSuccess: () => {
      setProjectName("");
      setIsOpen(false);
      refetch();
    },
  });

  const generateLyricsMutation = trpc.music.generateLyrics.useMutation({
    onSuccess: (data) => {
      const lyrics = typeof data.lyrics === 'string' ? data.lyrics : null;
      setGeneratedLyrics(lyrics);
    },
  });

  const generateStructureMutation = trpc.music.generateStructure.useMutation();
  const generateProductionMutation = trpc.music.generateProductionPrompt.useMutation();

  const musicProjects = projects?.filter((p) => p.type === "music") || [];

  const handleCreateProject = async () => {
    if (!projectName.trim()) return;
    
    await createProjectMutation.mutateAsync({
      name: projectName,
      type: "music",
      description: "Music generation project",
    });
  };

  const handleGenerateLyrics = async () => {
    if (!description.trim() || !musicProjects[0]) return;
    
    await generateLyricsMutation.mutateAsync({
      projectId: musicProjects[0].id,
      prompt: description,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Music Studio</h1>
            <p className="text-muted-foreground mt-2">
              Generate lyrics, song structures, and production prompts
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
                <DialogTitle>Create New Music Project</DialogTitle>
                <DialogDescription>
                  Start a new music generation project
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

        {musicProjects.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No Projects Yet</CardTitle>
              <CardDescription>
                Create your first music project to get started
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setIsOpen(true)}>Create First Project</Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="lyrics" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="lyrics">Lyrics</TabsTrigger>
              <TabsTrigger value="structure">Structure</TabsTrigger>
              <TabsTrigger value="production">Production</TabsTrigger>
            </TabsList>

            <TabsContent value="lyrics" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Generate Lyrics</CardTitle>
                  <CardDescription>
                    Describe the song you want to create
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="Describe your song (theme, mood, genre, etc.)..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                  />
                  <Button
                    onClick={handleGenerateLyrics}
                    disabled={!description.trim() || generateLyricsMutation.isPending}
                    className="w-full"
                  >
                    {generateLyricsMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Music className="w-4 h-4 mr-2" />
                        Generate Lyrics
                      </>
                    )}
                  </Button>

                  {generatedLyrics && (
                    <div className="mt-6 bg-muted p-4 rounded-lg">
                      <h3 className="font-semibold mb-2">Generated Lyrics</h3>
                      <p className="whitespace-pre-wrap text-sm">{generatedLyrics}</p>
                      <Button className="w-full mt-4" variant="outline">
                        Copy Lyrics
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="structure" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Song Structure</CardTitle>
                  <CardDescription>
                    Generate a song structure based on your description
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="Describe your song..."
                    rows={4}
                  />
                  <Button
                    onClick={() => generateStructureMutation.mutate({ projectId: musicProjects[0]?.id || 0, prompt: "" })}
                    disabled={generateStructureMutation.isPending}
                    className="w-full"
                  >
                    {generateStructureMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Music className="w-4 h-4 mr-2" />
                        Generate Structure
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="production" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Production Prompt</CardTitle>
                  <CardDescription>
                    Generate production instructions and prompts
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="Describe your song..."
                    rows={4}
                  />
                  <Button
                    onClick={() => generateProductionMutation.mutate({ projectId: musicProjects[0]?.id || 0, description: "" })}
                    disabled={generateProductionMutation.isPending}
                    className="w-full"
                  >
                    {generateProductionMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Music className="w-4 h-4 mr-2" />
                        Generate Production
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}

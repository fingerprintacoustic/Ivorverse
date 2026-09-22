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
import { Progress } from "@/components/ui/progress";
import { useJob } from "@/hooks/useJob";
import { useEffect, useState } from "react";

export default function MusicFeature() {
  const [projectName, setProjectName] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [generatedLyrics, setGeneratedLyrics] = useState<string | null>(null);
  const [audioPrompt, setAudioPrompt] = useState("");
  const [audioLyrics, setAudioLyrics] = useState("");
  const [instrumental, setInstrumental] = useState(false);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);

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
  // Generation runs as a background job; the mutation only queues it
  const [audioJobId, setAudioJobId] = useState<number | null>(null);
  const audioJob = useJob(audioJobId);
  const generateAudioMutation = trpc.music.generateAudio.useMutation({
    onSuccess: (data) => {
      setGeneratedAudioUrl(null);
      setAudioJobId(data.jobId);
    },
  });
  const isGeneratingAudio = generateAudioMutation.isPending || audioJob.isActive;

  useEffect(() => {
    const url = audioJob.job?.result?.audioUrl;
    if (audioJob.isCompleted && typeof url === "string") setGeneratedAudioUrl(url);
  }, [audioJob.isCompleted, audioJob.job?.result?.audioUrl]);

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

  const handleGenerateAudio = async () => {
    if (!audioPrompt.trim() || !musicProjects[0]) return;

    await generateAudioMutation.mutateAsync({
      projectId: musicProjects[0].id,
      prompt: audioPrompt,
      lyrics: audioLyrics.trim() || undefined,
      instrumental,
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
          <Tabs defaultValue="audio" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="audio">Audio</TabsTrigger>
              <TabsTrigger value="lyrics">Lyrics</TabsTrigger>
              <TabsTrigger value="structure">Structure</TabsTrigger>
              <TabsTrigger value="production">Production</TabsTrigger>
            </TabsList>

            <TabsContent value="audio" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Generate Song</CardTitle>
                  <CardDescription>
                    Real, playable audio — style/genre plus optional lyrics
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    placeholder="Style/genre/mood, e.g. 'upbeat pop with guitar'..."
                    value={audioPrompt}
                    onChange={(e) => setAudioPrompt(e.target.value)}
                  />
                  <Textarea
                    placeholder="Lyrics (optional) — use [Verse], [Chorus], [Bridge] markers, or leave blank to let it write its own..."
                    value={audioLyrics}
                    onChange={(e) => setAudioLyrics(e.target.value)}
                    rows={4}
                    disabled={instrumental}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={instrumental}
                      onChange={(e) => setInstrumental(e.target.checked)}
                    />
                    Instrumental (no vocals)
                  </label>
                  <Button
                    onClick={handleGenerateAudio}
                    disabled={!audioPrompt.trim() || isGeneratingAudio}
                    className="w-full"
                  >
                    {isGeneratingAudio ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating (this can take a minute)...
                      </>
                    ) : (
                      <>
                        <Music className="w-4 h-4 mr-2" />
                        Generate Song
                      </>
                    )}
                  </Button>

                  {audioJob.isActive && (
                    <div className="space-y-2">
                      <Progress value={audioJob.job?.progress ?? 0} />
                      <p className="text-sm text-muted-foreground">{audioJob.job?.stage ?? "Queued"}…</p>
                    </div>
                  )}
                  {(audioJob.isFailed || generateAudioMutation.error) && (
                    <p className="text-sm text-destructive">
                      Song generation failed: {audioJob.error ?? generateAudioMutation.error?.message}
                    </p>
                  )}

                  {generatedAudioUrl && (
                    <div className="mt-6 space-y-3">
                      <audio controls src={generatedAudioUrl} className="w-full" />
                      <Button asChild variant="outline" className="w-full">
                        <a href={generatedAudioUrl} download target="_blank" rel="noreferrer">
                          Download
                        </a>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

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

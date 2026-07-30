import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Plus, Mic, Upload, Loader2 } from "lucide-react";
import { useState } from "react";

export default function VoiceFeature() {
  const [projectName, setProjectName] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [textToSpeak, setTextToSpeak] = useState("");
  const [transcribedText, setTranscribedText] = useState<string | null>(null);

  const { data: projects, refetch } = trpc.projects.list.useQuery();
  const createProjectMutation = trpc.projects.create.useMutation({
    onSuccess: () => {
      setProjectName("");
      setIsOpen(false);
      refetch();
    },
  });

  const transcribeMutation = trpc.voice.transcribe.useMutation({
    onSuccess: (data) => {
      setTranscribedText(data.text || null);
    },
  });

  const generateSpeechMutation = trpc.voice.generateSpeech.useMutation();

  const voiceProjects = projects?.filter((p) => p.type === "voice") || [];

  const handleCreateProject = async () => {
    if (!projectName.trim()) return;
    
    await createProjectMutation.mutateAsync({
      name: projectName,
      type: "voice",
      description: "Voice generation project",
    });
  };

  const handleTranscribe = async () => {
    if (!audioUrl.trim() || !voiceProjects[0]) return;
    
    await transcribeMutation.mutateAsync({
      audioUrl,
    });
  };

  const handleGenerateSpeech = async () => {
    if (!textToSpeak.trim() || !voiceProjects[0]) return;
    
    await generateSpeechMutation.mutateAsync({
      projectId: voiceProjects[0].id,
      text: textToSpeak,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Voice Studio</h1>
            <p className="text-muted-foreground mt-2">
              Transcribe audio and generate AI speech
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
                <DialogTitle>Create New Voice Project</DialogTitle>
                <DialogDescription>
                  Start a new voice generation project
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

        {voiceProjects.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No Projects Yet</CardTitle>
              <CardDescription>
                Create your first voice project to get started
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setIsOpen(true)}>Create First Project</Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="transcribe" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="transcribe">Transcribe</TabsTrigger>
              <TabsTrigger value="generate">Generate Speech</TabsTrigger>
            </TabsList>

            <TabsContent value="transcribe" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Transcribe Audio</CardTitle>
                  <CardDescription>
                    Convert audio to text using AI
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    placeholder="Enter audio file URL..."
                    value={audioUrl}
                    onChange={(e) => setAudioUrl(e.target.value)}
                  />
                  <Button
                    onClick={handleTranscribe}
                    disabled={!audioUrl.trim() || transcribeMutation.isPending}
                    className="w-full"
                  >
                    {transcribeMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Transcribing...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Transcribe
                      </>
                    )}
                  </Button>

                  {transcribedText && (
                    <div className="mt-6 bg-muted p-4 rounded-lg">
                      <h3 className="font-semibold mb-2">Transcription</h3>
                      <p className="text-sm">{transcribedText}</p>
                      <Button className="w-full mt-4" variant="outline">
                        Copy Text
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="generate" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Generate Speech</CardTitle>
                  <CardDescription>
                    Convert text to speech using AI
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="Enter text to convert to speech..."
                    value={textToSpeak}
                    onChange={(e) => setTextToSpeak(e.target.value)}
                    rows={4}
                  />
                  <Button
                    onClick={handleGenerateSpeech}
                    disabled={!textToSpeak.trim() || generateSpeechMutation.isPending}
                    className="w-full"
                  >
                    {generateSpeechMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Mic className="w-4 h-4 mr-2" />
                        Generate Speech
                      </>
                    )}
                  </Button>

                  {generateSpeechMutation.data && (
                    <div className="mt-6 bg-muted p-4 rounded-lg">
                      <h3 className="font-semibold mb-2">Generated Audio</h3>
                      <audio controls className="w-full">
                        <source src={generateSpeechMutation.data.audioUrl} type="audio/mpeg" />
                        Your browser does not support the audio element.
                      </audio>
                      <Button className="w-full mt-4" variant="outline">
                        Download Audio
                      </Button>
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

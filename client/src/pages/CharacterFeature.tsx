import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { blobToBase64, useAudioRecorder } from "@/hooks/useAudioRecorder";
import { Plus, User, Upload, Loader2, Trash2, Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const MAX_UPLOAD_BYTES = 7.5 * 1024 * 1024; // matches characters.uploadMedia's cap

/** Upload (or, for voice, record) a character's face image or voice sample. */
function MediaUploadButton({
  characterId,
  kind,
  onUploaded,
}: {
  characterId: number;
  kind: "face" | "voice";
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const recorder = useAudioRecorder();
  const uploadMutation = trpc.characters.uploadMedia.useMutation();

  const upload = async (blob: Blob, filename?: string) => {
    if (blob.size > MAX_UPLOAD_BYTES) {
      toast.error("File is larger than 7.5MB");
      return;
    }
    try {
      await uploadMutation.mutateAsync({
        characterId,
        kind,
        fileData: await blobToBase64(blob),
        mimeType: blob.type || (kind === "face" ? "image/png" : "audio/webm"),
        filename,
      });
      toast.success(kind === "face" ? "Face image saved" : "Voice sample saved");
      onUploaded();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    }
  };

  const handleRecord = async () => {
    try {
      if (recorder.isRecording) await upload(await recorder.stop());
      else await recorder.start();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Recording failed");
    }
  };

  const busy = uploadMutation.isPending;
  return (
    <div className={kind === "voice" ? "grid gap-2 sm:grid-cols-2" : ""}>
      <Button className="w-full" onClick={() => inputRef.current?.click()} disabled={busy || recorder.isRecording}>
        {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
        {kind === "face" ? "Upload Face Image" : "Upload Voice Sample"}
      </Button>
      {kind === "voice" && (
        <Button
          className="w-full"
          variant={recorder.isRecording ? "destructive" : "outline"}
          onClick={handleRecord}
          disabled={busy}
        >
          {recorder.isRecording ? (
            <>
              <Square className="w-4 h-4 mr-2" />
              Stop and save ({recorder.elapsedSeconds}s)
            </>
          ) : (
            <>
              <Mic className="w-4 h-4 mr-2" />
              Record Sample
            </>
          )}
        </Button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={kind === "face" ? "image/*" : "audio/*"}
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) await upload(file, file.name);
        }}
      />
    </div>
  );
}

export default function CharacterFeature() {
  const [characterName, setCharacterName] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<number | null>(null);
  const [characterDescription, setCharacterDescription] = useState("");
  const [voiceType, setVoiceType] = useState("neutral");
  const [editDescription, setEditDescription] = useState("");

  const { data: characters, refetch } = trpc.characters.list.useQuery();
  const createCharacterMutation = trpc.characters.create.useMutation({
    onSuccess: () => {
      setCharacterName("");
      setCharacterDescription("");
      setIsOpen(false);
      refetch();
    },
  });

  const updateCharacterMutation = trpc.characters.update.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const deleteCharacterMutation = trpc.characters.delete.useMutation({
    onSuccess: () => {
      setSelectedCharacter(null);
      refetch();
    },
  });

  const handleCreateCharacter = async () => {
    if (!characterName.trim()) return;
    
    await createCharacterMutation.mutateAsync({
      name: characterName,
      description: characterDescription,
      personality: { voiceType },
    });
  };

  const handleDeleteCharacter = async (id: number) => {
    if (confirm("Are you sure you want to delete this character?")) {
      await deleteCharacterMutation.mutateAsync({ characterId: id });
    }
  };

  const currentCharacter = characters?.find((c) => c.id === selectedCharacter);

  useEffect(() => {
    setEditDescription(currentCharacter?.description ?? "");
  }, [currentCharacter?.id, currentCharacter?.description]);

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Character Memory</h1>
            <p className="text-muted-foreground mt-2">
              Save and reuse character faces, voices, and personalities across all projects
            </p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Character
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Character</DialogTitle>
                <DialogDescription>
                  Define a character to use across your projects
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  placeholder="Character name..."
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                />
                <Textarea
                  placeholder="Character description, personality, background..."
                  value={characterDescription}
                  onChange={(e) => setCharacterDescription(e.target.value)}
                  rows={3}
                />
                <div className="space-y-2">
                  <label className="text-sm font-medium">Voice Type</label>
                  <select
                    value={voiceType}
                    onChange={(e) => setVoiceType(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                  >
                    <option value="neutral">Neutral</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="child">Child</option>
                    <option value="robotic">Robotic</option>
                  </select>
                </div>
                <Button
                  onClick={handleCreateCharacter}
                  disabled={!characterName.trim() || createCharacterMutation.isPending}
                  className="w-full"
                >
                  {createCharacterMutation.isPending ? "Creating..." : "Create Character"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Characters List */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">Your Characters</CardTitle>
              <CardDescription>
                {characters?.length || 0} character{(characters?.length || 0) !== 1 ? "s" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {characters && characters.length > 0 ? (
                  characters.map((character) => (
                    <button
                      key={character.id}
                      onClick={() => setSelectedCharacter(character.id)}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedCharacter === character.id
                          ? "bg-blue-50 border-blue-300"
                          : "hover:bg-gray-50 border-gray-200"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{character.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            Character
                          </p>
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">No characters yet</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsOpen(true)}
                      className="mt-2"
                    >
                      Create First Character
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Character Details */}
          <Card className="lg:col-span-2">
            {currentCharacter ? (
              <>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{currentCharacter.name}</CardTitle>
                      <CardDescription>
                        Character Profile
                      </CardDescription>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteCharacter(currentCharacter.id)}
                      disabled={deleteCharacterMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="profile" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="profile">Profile</TabsTrigger>
                      <TabsTrigger value="face">Face</TabsTrigger>
                      <TabsTrigger value="voice">Voice</TabsTrigger>
                    </TabsList>

                    <TabsContent value="profile" className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium" htmlFor="character-description">
                          Description
                        </label>
                        <Textarea
                          id="character-description"
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          placeholder="Appearance, personality, backstory..."
                          maxLength={2000}
                          rows={4}
                        />
                        <Button
                          size="sm"
                          disabled={
                            updateCharacterMutation.isPending ||
                            editDescription === (currentCharacter.description ?? "")
                          }
                          onClick={() =>
                            updateCharacterMutation.mutate(
                              { characterId: currentCharacter.id, updates: { description: editDescription } },
                              { onSuccess: () => toast.success("Description saved") }
                            )
                          }
                        >
                          {updateCharacterMutation.isPending ? "Saving..." : "Save Description"}
                        </Button>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Voice Type</label>
                        <p className="text-sm text-muted-foreground capitalize">
                          {currentCharacter.personality?.voiceType ?? "Not set"}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Created</label>
                        <p className="text-sm text-muted-foreground">
                          {new Date(currentCharacter.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </TabsContent>

                    <TabsContent value="face" className="space-y-4">
                      {currentCharacter.faceImageUrl ? (
                        <img
                          src={currentCharacter.faceImageUrl}
                          alt={currentCharacter.name + " face"}
                          className="rounded-lg aspect-square w-full object-cover border"
                        />
                      ) : (
                        <div className="border-2 border-dashed rounded-lg aspect-square flex items-center justify-center bg-muted">
                          <div className="text-center">
                            <User className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground">No face image uploaded</p>
                          </div>
                        </div>
                      )}
                      <MediaUploadButton characterId={currentCharacter.id} kind="face" onUploaded={refetch} />
                    </TabsContent>

                    <TabsContent value="voice" className="space-y-4">
                      <div className="bg-muted p-4 rounded-lg">
                        {currentCharacter.voiceUrl ? (
                          <audio controls src={currentCharacter.voiceUrl} className="w-full" />
                        ) : (
                          <p className="text-sm text-muted-foreground">No voice sample yet</p>
                        )}
                      </div>
                      <MediaUploadButton characterId={currentCharacter.id} kind="voice" onUploaded={refetch} />
                    </TabsContent>

                  </Tabs>
                </CardContent>
              </>
            ) : (
              <CardContent className="flex items-center justify-center h-96">
                <div className="text-center">
                  <User className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">
                    Select a character to view details
                  </p>
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

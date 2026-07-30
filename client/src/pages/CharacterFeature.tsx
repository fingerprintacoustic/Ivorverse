import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Plus, User, Upload, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";

export default function CharacterFeature() {
  const [characterName, setCharacterName] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<number | null>(null);
  const [characterDescription, setCharacterDescription] = useState("");
  const [voiceType, setVoiceType] = useState("neutral");

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
    });
  };

  const handleDeleteCharacter = async (id: number) => {
    if (confirm("Are you sure you want to delete this character?")) {
      await deleteCharacterMutation.mutateAsync({ characterId: id });
    }
  };

  const currentCharacter = characters?.find((c) => c.id === selectedCharacter);

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
                    <TabsList className="grid w-full grid-cols-4">
                      <TabsTrigger value="profile">Profile</TabsTrigger>
                      <TabsTrigger value="face">Face</TabsTrigger>
                      <TabsTrigger value="voice">Voice</TabsTrigger>
                      <TabsTrigger value="usage">Usage</TabsTrigger>
                    </TabsList>

                    <TabsContent value="profile" className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Description</label>
                        <p className="text-sm text-muted-foreground">
                          {currentCharacter.description || "No description"}
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
                      <div className="border-2 border-dashed rounded-lg aspect-square flex items-center justify-center bg-muted">
                        <div className="text-center">
                          <User className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">No face image uploaded</p>
                        </div>
                      </div>
                      <Button className="w-full">
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Face Image
                      </Button>
                    </TabsContent>

                    <TabsContent value="voice" className="space-y-4">
                      <div className="bg-muted p-4 rounded-lg">
                        <p className="text-sm text-muted-foreground mb-4">
                          Voice sample (if available)
                        </p>
                        <audio controls className="w-full">
                          <source src="" type="audio/mpeg" />
                          Your browser does not support the audio element.
                        </audio>
                      </div>
                      <Button className="w-full">
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Voice Sample
                      </Button>
                    </TabsContent>

                    <TabsContent value="usage" className="space-y-4">
                      <div className="space-y-3">
                        <div className="border rounded-lg p-3">
                          <p className="text-sm font-medium">Projects Using This Character</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            0 projects
                          </p>
                        </div>
                        <div className="border rounded-lg p-3">
                          <p className="text-sm font-medium">Last Used</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Never
                          </p>
                        </div>
                      </div>
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

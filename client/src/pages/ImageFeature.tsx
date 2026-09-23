import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Copy, Download, Loader2, Plus, Share2, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

type GeneratedImage = { url: string; fileId: number };
type Kind = "image" | "thumbnail" | "graphic" | "logo";

// Downloads go through our own origin (/api/files/:id/download): browsers
// ignore `download` on the cross-origin storage URL and can't read its bytes.
const downloadUrl = (fileId: number) => `/api/files/${fileId}/download`;

function saveBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}

async function downloadImage(image: GeneratedImage, format: "png" | "jpg") {
  try {
    const response = await fetch(downloadUrl(image.fileId));
    if (!response.ok) throw new Error(`Download failed (${response.status})`);
    const png = await response.blob();
    if (format === "png") {
      saveBlob(png, `image-${image.fileId}.png`);
      return;
    }
    // Real JPEG conversion; JPEG has no transparency, so flatten onto white
    const bitmap = await createImageBitmap(png);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    const jpg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!jpg) throw new Error("JPEG conversion failed");
    saveBlob(jpg, `image-${image.fileId}.jpg`);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Download failed");
  }
}

function copyUrl(url: string) {
  navigator.clipboard
    .writeText(url)
    .then(() => toast.success("Image URL copied to clipboard"))
    .catch(() => toast.error("Couldn't access the clipboard"));
}

function shareImage(url: string) {
  if (navigator.share) {
    navigator
      .share({ title: "Generated Image", text: "Made with IvorVerse AI", url })
      .catch(() => {}); // user dismissed the share sheet
  } else {
    copyUrl(url);
  }
}

function ImageResult({ image, logo }: { image: GeneratedImage; logo?: boolean }) {
  return (
    <div className="mt-6 space-y-4">
      <img src={image.url} alt="Generated" className={`w-full rounded-lg border ${logo ? "bg-white p-4" : ""}`} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Button onClick={() => downloadImage(image, "png")} variant="outline">
          <Download className="w-4 h-4 mr-2" />
          PNG
        </Button>
        <Button onClick={() => downloadImage(image, "jpg")} variant="outline">
          <Download className="w-4 h-4 mr-2" />
          JPG
        </Button>
        <Button onClick={() => copyUrl(image.url)} variant="outline">
          <Copy className="w-4 h-4 mr-2" />
          Copy URL
        </Button>
        <Button onClick={() => shareImage(image.url)} variant="outline">
          <Share2 className="w-4 h-4 mr-2" />
          Share
        </Button>
      </div>
    </div>
  );
}

function CharacterPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: characters } = trpc.characters.list.useQuery();
  return (
    <div className="space-y-1.5">
      <Label>Character (optional)</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No character</SelectItem>
          {(characters ?? []).map((c) => (
            <SelectItem key={c.id} value={String(c.id)} disabled={!c.faceImageUrl}>
              {c.name}
              {!c.faceImageUrl ? " (add a face first)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {characters && characters.length > 0 ? (
          "Uses the character's face so the same person appears in your image."
        ) : (
          <>
            Create characters with a face image in{" "}
            <Link href="/feature/character" className="underline">
              Characters
            </Link>{" "}
            to feature them here.
          </>
        )}
      </p>
    </div>
  );
}

const PANELS: Record<Kind, { title: string; description: string; placeholder: string; button: string; multiline: boolean; character: boolean }> = {
  image: {
    title: "Generate Image",
    description: "Describe the image you want to create",
    placeholder: "Describe your image in detail...",
    button: "Generate Image",
    multiline: true,
    character: true,
  },
  thumbnail: {
    title: "Generate Thumbnail",
    description: "A YouTube-style thumbnail for a video title",
    placeholder: "Video title, e.g. I tried every coffee in Tokyo",
    button: "Generate Thumbnail",
    multiline: false,
    character: true,
  },
  graphic: {
    title: "Generate Social Graphic",
    description: "A social media graphic for a post or announcement",
    placeholder: "What the graphic is for, e.g. Launch day announcement for our app",
    button: "Generate Graphic",
    multiline: true,
    character: true,
  },
  logo: {
    title: "Generate Logo",
    description: "A professional logo for your company",
    placeholder: "Company name",
    button: "Generate Logo",
    multiline: false,
    character: false,
  },
};

function CreatePanel({ kind, projectId }: { kind: Kind; projectId: number }) {
  const panel = PANELS[kind];
  const utils = trpc.useUtils();
  const [text, setText] = useState("");
  const [characterId, setCharacterId] = useState("none");
  const [result, setResult] = useState<GeneratedImage | null>(null);

  const onSuccess = (data: { url: string; fileId: number }) => {
    setResult(data);
    utils.image.list.invalidate();
    toast.success("Image generated");
  };
  const onError = (error: { message: string }) => toast.error(`Failed to generate: ${error.message}`);
  const generate = trpc.image.generate.useMutation({ onSuccess, onError });
  const thumbnail = trpc.image.generateThumbnail.useMutation({ onSuccess, onError });
  const graphic = trpc.image.generateGraphic.useMutation({ onSuccess, onError });
  const logo = trpc.image.generateLogo.useMutation({ onSuccess, onError });
  const pending = generate.isPending || thumbnail.isPending || graphic.isPending || logo.isPending;

  const handleGenerate = () => {
    const value = text.trim();
    if (!value) return;
    const character = characterId === "none" ? undefined : Number(characterId);
    if (kind === "image") generate.mutate({ projectId, prompt: value, characterId: character });
    else if (kind === "thumbnail") thumbnail.mutate({ projectId, title: value, characterId: character });
    else if (kind === "graphic") graphic.mutate({ projectId, description: value, characterId: character });
    else logo.mutate({ projectId, companyName: value });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{panel.title}</CardTitle>
        <CardDescription>{panel.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {panel.multiline ? (
          <Textarea placeholder={panel.placeholder} value={text} onChange={(e) => setText(e.target.value)} rows={4} />
        ) : (
          <Input
            placeholder={panel.placeholder}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
          />
        )}
        {panel.character && <CharacterPicker value={characterId} onChange={setCharacterId} />}
        <Button onClick={handleGenerate} disabled={!text.trim() || pending} className="w-full">
          {pending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              {panel.button}
            </>
          )}
        </Button>
        {result && <ImageResult image={result} logo={kind === "logo"} />}
      </CardContent>
    </Card>
  );
}

function Gallery() {
  const { data: images, isLoading } = trpc.image.list.useQuery();
  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;
  if (!images || images.length === 0) {
    return <div className="text-center py-8 text-muted-foreground">No images generated yet. Start creating!</div>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {images.map((image) => (
        <div key={image.fileId} className="space-y-2">
          <img src={image.url} alt={image.name} className="w-full rounded-lg border" loading="lazy" />
          <p className="text-xs text-muted-foreground">{new Date(image.createdAt).toLocaleString()}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => downloadImage(image, "png")}>
              <Download className="w-3 h-3 mr-1" />
              PNG
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => downloadImage(image, "jpg")}>
              <Download className="w-3 h-3 mr-1" />
              JPG
            </Button>
            <Button size="sm" variant="outline" aria-label="Copy URL" onClick={() => copyUrl(image.url)}>
              <Copy className="w-3 h-3" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ImageFeature() {
  const [projectName, setProjectName] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const { data: projects, refetch } = trpc.projects.list.useQuery();
  const createProjectMutation = trpc.projects.create.useMutation({
    onSuccess: () => {
      setProjectName("");
      setIsOpen(false);
      refetch();
      toast.success("Project created successfully");
    },
    onError: (error) => toast.error(`Failed to create project: ${error.message}`),
  });

  const imageProjects = projects?.filter((p) => p.type === "image") || [];
  const projectId = imageProjects[0]?.id;

  const handleCreateProject = () => {
    if (!projectName.trim()) return;
    createProjectMutation.mutate({ name: projectName, type: "image", description: "Image generation project" });
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Image Studio</h1>
            <p className="text-muted-foreground mt-2">Create images, logos, thumbnails, and social media graphics</p>
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
                <DialogTitle>Create New Image Project</DialogTitle>
                <DialogDescription>Start a new image generation project</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  placeholder="Enter project name..."
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateProject()}
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

        {projectId === undefined ? (
          <Card>
            <CardHeader>
              <CardTitle>No Projects Yet</CardTitle>
              <CardDescription>Create your first image project to get started</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setIsOpen(true)}>Create First Project</Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="image" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="image">Image</TabsTrigger>
              <TabsTrigger value="thumbnail">Thumbnail</TabsTrigger>
              <TabsTrigger value="graphic">Graphic</TabsTrigger>
              <TabsTrigger value="logo">Logo</TabsTrigger>
              <TabsTrigger value="gallery">Gallery</TabsTrigger>
            </TabsList>
            {(["image", "thumbnail", "graphic", "logo"] as const).map((kind) => (
              <TabsContent key={kind} value={kind} forceMount className="space-y-4 data-[state=inactive]:hidden">
                <CreatePanel kind={kind} projectId={projectId} />
              </TabsContent>
            ))}
            <TabsContent value="gallery" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Your Images</CardTitle>
                  <CardDescription>Everything you've generated, including images from chat and videos</CardDescription>
                </CardHeader>
                <CardContent>
                  <Gallery />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}

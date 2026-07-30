import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Plus, Sparkles, Loader2, Download, Copy, Share2 } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

// Memory optimization: keep only last 20 images in memory
const MAX_IMAGES_IN_MEMORY = 20;

export default function ImageFeature() {
  const [projectName, setProjectName] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [generatedImage, setGeneratedImage] = useState<{ url: string; format: "png" | "jpg" } | null>(null);
  const [generatedImages, setGeneratedImages] = useState<Array<{ id: string; url: string; prompt: string; createdAt: Date }>>([]);

  const { data: projects, refetch } = trpc.projects.list.useQuery();
  const createProjectMutation = trpc.projects.create.useMutation({
    onSuccess: () => {
      setProjectName("");
      setIsOpen(false);
      refetch();
      toast.success("Project created successfully");
    },
    onError: (error) => {
      toast.error(`Failed to create project: ${error.message}`);
    },
  });

  const generateImageMutation = trpc.image.generate.useMutation({
    onSuccess: (data) => {
      const imageUrl = data.url || null;
      if (imageUrl) {
        setGeneratedImage({ url: imageUrl, format: "png" });
                        setGeneratedImages((prev) => {
                          const updated = [
                            {
                              id: Date.now().toString(),
                              url: imageUrl,
                              prompt: prompt,
                              createdAt: new Date(),
                            },
                            ...prev,
                          ];
                          // Keep only last MAX_IMAGES_IN_MEMORY to prevent memory bloat
                          return updated.slice(0, MAX_IMAGES_IN_MEMORY);
                        });
        toast.success("Image generated successfully");
      }
    },
    onError: (error) => {
      toast.error(`Failed to generate image: ${error.message}`);
    },
  });

  const generateLogoMutation = trpc.image.generateLogo.useMutation({
    onSuccess: (data) => {
      const imageUrl = data.url || null;
      if (imageUrl) {
        setGeneratedImage({ url: imageUrl, format: "png" });
                        setGeneratedImages((prev) => {
                          const updated = [
                            {
                              id: Date.now().toString(),
                              url: imageUrl,
                              prompt: `Logo for ${companyName}`,
                              createdAt: new Date(),
                            },
                            ...prev,
                          ];
                          // Keep only last MAX_IMAGES_IN_MEMORY to prevent memory bloat
                          return updated.slice(0, MAX_IMAGES_IN_MEMORY);
                        });
        toast.success("Logo generated successfully");
      }
    },
    onError: (error) => {
      toast.error(`Failed to generate logo: ${error.message}`);
    },
  });

  const imageProjects = projects?.filter((p) => p.type === "image") || [];

  const handleCreateProject = async () => {
    if (!projectName.trim()) return;
    
    try {
      await createProjectMutation.mutateAsync({
        name: projectName,
        type: "image",
        description: "Image generation project",
      });
    } catch (error) {
      console.error("Error creating project:", error);
    }
  };

  const handleGenerateImage = async () => {
    if (!prompt.trim() || !imageProjects[0]) {
      toast.error("Please enter a prompt and create a project first");
      return;
    }
    
    try {
      await generateImageMutation.mutateAsync({
        projectId: imageProjects[0].id,
        prompt,
      });
    } catch (error) {
      console.error("Error generating image:", error);
    }
  };

  const handleGenerateLogo = async () => {
    if (!companyName.trim() || !imageProjects[0]) {
      toast.error("Please enter a company name and create a project first");
      return;
    }
    
    try {
      await generateLogoMutation.mutateAsync({
        projectId: imageProjects[0].id,
        companyName,
      });
    } catch (error) {
      console.error("Error generating logo:", error);
    }
  };

  const handleDownloadImage = (imageUrl: string, format: "png" | "jpg") => {
    try {
      const link = document.createElement("a");
      link.href = imageUrl;
      link.download = `image-${Date.now()}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`Image downloaded as ${format.toUpperCase()}`);
    } catch (error) {
      console.error("Error downloading image:", error);
      toast.error("Failed to download image");
    }
  };

  const handleCopyImageUrl = (imageUrl: string) => {
    try {
      navigator.clipboard.writeText(imageUrl);
      toast.success("Image URL copied to clipboard");
    } catch (error) {
      console.error("Error copying URL:", error);
      toast.error("Failed to copy URL");
    }
  };

  const handleShareImage = (imageUrl: string) => {
    try {
      if (navigator.share) {
        navigator.share({
          title: "Generated Image",
          text: "Check out this AI-generated image from IvorVerse AI",
          url: imageUrl,
        });
      } else {
        // Fallback: copy to clipboard
        handleCopyImageUrl(imageUrl);
      }
    } catch (error) {
      console.error("Error sharing image:", error);
      toast.error("Failed to share image");
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Image Studio</h1>
            <p className="text-muted-foreground mt-2">
              Create images, logos, thumbnails, and social media graphics
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
                <DialogTitle>Create New Image Project</DialogTitle>
                <DialogDescription>
                  Start a new image generation project
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

        {imageProjects.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No Projects Yet</CardTitle>
              <CardDescription>
                Create your first image project to get started
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setIsOpen(true)}>Create First Project</Button>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="generate" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="generate">Generate Image</TabsTrigger>
              <TabsTrigger value="logo">Generate Logo</TabsTrigger>
              <TabsTrigger value="gallery">Gallery ({generatedImages.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="generate" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Generate Image</CardTitle>
                  <CardDescription>
                    Describe the image you want to create
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="Describe your image in detail..."
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={4}
                  />
                  <Button
                    onClick={handleGenerateImage}
                    disabled={!prompt.trim() || generateImageMutation.isPending}
                    className="w-full"
                  >
                    {generateImageMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate Image
                      </>
                    )}
                  </Button>

                  {generatedImage && (
                    <div className="mt-6 space-y-4">
                      <img
                        src={generatedImage.url}
                        alt="Generated"
                        className="w-full rounded-lg border"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          onClick={() => handleDownloadImage(generatedImage.url, "png")}
                          variant="outline"
                          className="w-full"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          PNG
                        </Button>
                        <Button
                          onClick={() => handleDownloadImage(generatedImage.url, "jpg")}
                          variant="outline"
                          className="w-full"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          JPG
                        </Button>
                        <Button
                          onClick={() => handleCopyImageUrl(generatedImage.url)}
                          variant="outline"
                          className="w-full"
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Copy URL
                        </Button>
                      </div>
                      <Button
                        onClick={() => handleShareImage(generatedImage.url)}
                        variant="outline"
                        className="w-full"
                      >
                        <Share2 className="w-4 h-4 mr-2" />
                        Share
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="logo" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Generate Logo</CardTitle>
                  <CardDescription>
                    Create a professional logo for your company
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    placeholder="Enter company name..."
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                  <Button
                    onClick={handleGenerateLogo}
                    disabled={!companyName.trim() || generateLogoMutation.isPending}
                    className="w-full"
                  >
                    {generateLogoMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Generate Logo
                      </>
                    )}
                  </Button>

                  {generatedImage && (
                    <div className="mt-6 space-y-4">
                      <img
                        src={generatedImage.url}
                        alt="Generated Logo"
                        className="w-full rounded-lg border bg-white p-4"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          onClick={() => handleDownloadImage(generatedImage.url, "png")}
                          variant="outline"
                          className="w-full"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          PNG
                        </Button>
                        <Button
                          onClick={() => handleDownloadImage(generatedImage.url, "jpg")}
                          variant="outline"
                          className="w-full"
                        >
                          <Download className="w-4 h-4 mr-2" />
                          JPG
                        </Button>
                        <Button
                          onClick={() => handleCopyImageUrl(generatedImage.url)}
                          variant="outline"
                          className="w-full"
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Copy URL
                        </Button>
                      </div>
                      <Button
                        onClick={() => handleShareImage(generatedImage.url)}
                        variant="outline"
                        className="w-full"
                      >
                        <Share2 className="w-4 h-4 mr-2" />
                        Share
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="gallery" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Generated Images</CardTitle>
                  <CardDescription>
                    View all images you've generated
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {generatedImages.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No images generated yet. Start creating!
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {generatedImages.map((image) => (
                        <div key={image.id} className="space-y-2">
                          <img
                            src={image.url}
                            alt={image.prompt}
                            className="w-full rounded-lg border"
                          />
                          <p className="text-sm text-muted-foreground truncate">
                            {image.prompt}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => handleDownloadImage(image.url, "png")}
                            >
                              <Download className="w-3 h-3 mr-1" />
                              Download
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCopyImageUrl(image.url)}
                            >
                              <Copy className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
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

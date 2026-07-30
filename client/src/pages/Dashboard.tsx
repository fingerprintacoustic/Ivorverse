import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  MessageSquare,
  Search,
  Code2,
  Music,
  Image,
  Mic,
  Film,
  Users,
  Plus,
} from "lucide-react";
import { useLocation } from "wouter";

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { data: projects, isLoading } = trpc.projects.list.useQuery();

  const features = [
    {
      id: "chat",
      name: "AI Chat",
      description: "Ask questions, upload files, generate reports",
      icon: MessageSquare,
      color: "bg-blue-500",
    },
    {
      id: "research",
      name: "Deep Research",
      description: "Search web, get citations, create reports",
      icon: Search,
      color: "bg-purple-500",
    },
    {
      id: "app",
      name: "App Builder",
      description: "Generate full app code from prompts",
      icon: Code2,
      color: "bg-green-500",
    },
    {
      id: "music",
      name: "Music Studio",
      description: "Generate lyrics, structure, production",
      icon: Music,
      color: "bg-pink-500",
    },
    {
      id: "image",
      name: "Image Studio",
      description: "Create images, logos, graphics",
      icon: Image,
      color: "bg-orange-500",
    },
    {
      id: "voice",
      name: "Voice Studio",
      description: "Transcribe, generate speech",
      icon: Mic,
      color: "bg-red-500",
    },
    {
      id: "video",
      name: "Music Video",
      description: "Generate music videos with subtitles",
      icon: Film,
      color: "bg-indigo-500",
    },
    {
      id: "character",
      name: "Characters",
      description: "Save and reuse characters",
      icon: Users,
      color: "bg-cyan-500",
    },
  ];

  const chatProjects = projects?.filter((p) => p.type === "chat") || [];
  const researchProjects = projects?.filter((p) => p.type === "research") || [];
  const musicProjects = projects?.filter((p) => p.type === "music") || [];
  const imageProjects = projects?.filter((p) => p.type === "image") || [];
  const videoProjects = projects?.filter((p) => p.type === "video") || [];

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Welcome back, {user?.name || "Creator"}!</h1>
          <p className="text-muted-foreground mt-2">
            Create amazing content with AI-powered tools
          </p>
        </div>

        {/* Quick Access - Feature Grid */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold">Features</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card
                  key={feature.id}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => setLocation(`/feature/${feature.id}`)}
                >
                  <CardHeader>
                    <div className={`${feature.color} w-12 h-12 rounded-lg flex items-center justify-center mb-2`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <CardTitle className="text-lg">{feature.name}</CardTitle>
                    <CardDescription>{feature.description}</CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Projects Overview */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Recent Projects</h2>
          <Tabs defaultValue="all" className="w-full">
            <TabsList>
              <TabsTrigger value="all">All ({projects?.length || 0})</TabsTrigger>
              <TabsTrigger value="chat">Chat ({chatProjects.length})</TabsTrigger>
              <TabsTrigger value="research">Research ({researchProjects.length})</TabsTrigger>
              <TabsTrigger value="music">Music ({musicProjects.length})</TabsTrigger>
              <TabsTrigger value="media">Media ({videoProjects.length + imageProjects.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4">
              {isLoading ? (
                <div className="text-center py-8">Loading projects...</div>
              ) : projects && projects.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {projects.map((project) => (
                    <Card
                      key={project.id}
                      className="cursor-pointer hover:shadow-lg transition-shadow"
                      onClick={() => setLocation(`/project/${project.id}`)}
                    >
                      <CardHeader>
                        <CardTitle className="text-lg">{project.name}</CardTitle>
                        <CardDescription>{project.type}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          {project.description || "No description"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          Created {new Date(project.createdAt).toLocaleDateString()}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-muted-foreground mb-4">No projects yet. Create one to get started!</p>
                  <Button onClick={() => setLocation("/feature/chat")}>Create First Project</Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="chat" className="space-y-4">
              {chatProjects.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {chatProjects.map((project) => (
                    <Card key={project.id} className="cursor-pointer hover:shadow-lg transition-shadow">
                      <CardHeader>
                        <CardTitle className="text-lg">{project.name}</CardTitle>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No chat projects yet</p>
                  <Button onClick={() => setLocation("/feature/chat")}>Create Chat Project</Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="research" className="space-y-4">
              {researchProjects.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {researchProjects.map((project) => (
                    <Card key={project.id} className="cursor-pointer hover:shadow-lg transition-shadow">
                      <CardHeader>
                        <CardTitle className="text-lg">{project.name}</CardTitle>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No research projects yet</p>
                  <Button onClick={() => setLocation("/feature/research")}>Create Research Project</Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="music" className="space-y-4">
              {musicProjects.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {musicProjects.map((project) => (
                    <Card key={project.id} className="cursor-pointer hover:shadow-lg transition-shadow">
                      <CardHeader>
                        <CardTitle className="text-lg">{project.name}</CardTitle>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No music projects yet</p>
                  <Button onClick={() => setLocation("/feature/music")}>Create Music Project</Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="media" className="space-y-4">
              {videoProjects.length > 0 || imageProjects.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...videoProjects, ...imageProjects].map((project) => (
                    <Card key={project.id} className="cursor-pointer hover:shadow-lg transition-shadow">
                      <CardHeader>
                        <CardTitle className="text-lg">{project.name}</CardTitle>
                        <CardDescription>{project.type}</CardDescription>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No media projects yet</p>
                  <div className="flex gap-2 justify-center">
                    <Button onClick={() => setLocation("/feature/image")}>Create Image</Button>
                    <Button onClick={() => setLocation("/feature/video")}>Create Video</Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{projects?.length || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Chat Messages</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">-</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Images Generated</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">-</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Subscription</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">Free</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

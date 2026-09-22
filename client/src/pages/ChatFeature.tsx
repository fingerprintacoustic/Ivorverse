import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { AIChatBox, Message } from "@/components/AIChatBox";
import { JobCard } from "@/components/JobCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Plus, ArrowLeft } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

// Pagination constants
const MESSAGES_PER_PAGE = 50;
const MAX_MESSAGES_IN_MEMORY = 100;

export default function ChatFeature() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [projectName, setProjectName] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  
  // Extract chat ID from URL if viewing a specific chat
  const chatIdMatch = location.match(/^\/feature\/chat\/(\d+)$/);
  const activeChatId = chatIdMatch ? parseInt(chatIdMatch[1]) : null;
  
  // Pagination state
  const [messageOffset, setMessageOffset] = useState(0);
  
  const { data: projects, isLoading, refetch } = trpc.projects.list.useQuery();
  const { data: chatMessages, refetch: refetchMessages } = trpc.chat.getMessages.useQuery(
    { projectId: activeChatId || 0 },
    { enabled: !!activeChatId }
  );

  const createProjectMutation = trpc.projects.create.useMutation({
    onSuccess: (result) => {
      setProjectName("");
      setIsOpen(false);
      refetch();
      toast.success("Chat created successfully");
    },
    onError: (error) => {
      toast.error(`Failed to create chat: ${error.message}`);
    },
  });

  const sendMessageMutation = trpc.chat.sendMessage.useMutation({
    onSuccess: (response) => {
      // Reset offset to show latest messages
      setMessageOffset(0);
      refetchMessages();
      toast.success("Message sent");
    },
    onError: (error) => {
      toast.error(`Failed to send message: ${error.message}`);
    },
  });

  const chatProjects = projects?.filter((p) => p.type === "chat") || [];
  const activeChat = chatProjects.find((p) => p.id === activeChatId);

  const handleCreateProject = async () => {
    if (!projectName.trim()) return;
    
    try {
      await createProjectMutation.mutateAsync({
        name: projectName,
        type: "chat",
        description: "AI Chat conversation",
      });
    } catch (error) {
      console.error("Error creating project:", error);
    }
  };

  const handleSendMessage = async (content: string) => {
    if (!activeChatId || !content.trim()) return;

    try {
      await sendMessageMutation.mutateAsync({
        projectId: activeChatId,
        message: content,
        fileUrls: [],
      });
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  // Convert chat messages to Message format for AIChatBox
  // Limit to MAX_MESSAGES_IN_MEMORY to prevent memory bloat
  const messages: Message[] = useMemo(() => {
    if (!chatMessages) return [];
    return chatMessages
      .slice(-MAX_MESSAGES_IN_MEMORY)
      .map((msg) => ({
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content,
        // App builds / songs the assistant started — live progress + results
        attachments: msg.jobIds?.length
          ? msg.jobIds.map((jobId) => <JobCard key={jobId} jobId={jobId} />)
          : undefined,
      }));
  }, [chatMessages]);

  // If viewing a specific chat, show chat detail view
  if (activeChatId && activeChat) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setMessageOffset(0); // Reset pagination
                setLocation("/feature/chat");
              }}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">{activeChat.name}</h1>
              <p className="text-muted-foreground">
                {activeChat.description || "AI Chat conversation"}
              </p>
            </div>
          </div>

          <Card className="h-[600px]">
            <CardContent className="p-0 h-full">
              <AIChatBox
                messages={messages}
                onSendMessage={handleSendMessage}
                isLoading={sendMessageMutation.isPending}
                placeholder="Type your message..."
                height="100%"
                emptyStateMessage="Start a conversation with AI"
                suggestedPrompts={[
                  "Explain this concept",
                  "Write a summary",
                  "Generate ideas",
                ]}
              />
            </CardContent>
          </Card>

          {/* Pagination controls */}
          {chatMessages && chatMessages.length >= MESSAGES_PER_PAGE && (
            <div className="flex justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => setMessageOffset(Math.max(0, messageOffset - MESSAGES_PER_PAGE))}
                disabled={messageOffset === 0}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                onClick={() => setMessageOffset(messageOffset + MESSAGES_PER_PAGE)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // Show chat list view
  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">AI Chat Assistant</h1>
            <p className="text-muted-foreground mt-2">
              Ask questions, upload files, generate reports and plans
            </p>
          </div>
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Chat
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Chat</DialogTitle>
                <DialogDescription>
                  Start a new conversation with the AI assistant
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  placeholder="Enter chat name..."
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
                  {createProjectMutation.isPending ? "Creating..." : "Create Chat"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Active Chat or List */}
        {chatProjects.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No Chats Yet</CardTitle>
              <CardDescription>
                Create your first chat conversation to get started
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => setIsOpen(true)}>Create First Chat</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* Chat List */}
            <div className="lg:col-span-1">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Conversations</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {chatProjects.map((project) => (
                    <Button
                      key={project.id}
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => {
                        setMessageOffset(0); // Reset pagination
                        setLocation(`/feature/chat/${project.id}`);
                      }}
                    >
                      {project.name}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setIsOpen(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    New Chat
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Chat Interface */}
            <div className="lg:col-span-3">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Chat</CardTitle>
                  <CardDescription>
                    Select a chat from the left or create a new one to start
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center h-96 text-muted-foreground">
                    <p>Select a chat to begin</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Features Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ask Questions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Ask the AI anything and get instant answers with detailed explanations
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload Files</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Upload documents, images, and other files for the AI to analyze
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Generate Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Generate business plans, marketing strategies, and detailed reports
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

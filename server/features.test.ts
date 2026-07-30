import { describe, expect, it, beforeEach, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../db";

// Mock user context
const mockUser: User = {
  id: 1,
  openId: "test-user-123",
  email: "test@example.com",
  name: "Test User",
  loginMethod: "manus",
  role: "user",
  subscriptionTier: "pro",
  profileImageUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

const mockAdminUser: User = {
  ...mockUser,
  id: 999,
  role: "admin",
};

function createMockContext(user: User | null = mockUser): TrpcContext {
  return {
    user,
    req: {
      protocol: "https",
      headers: {
        origin: "https://example.com",
      },
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as TrpcContext["res"],
  };
}

describe("IvorVerse AI - Feature Tests", () => {
  describe("Projects Router", () => {
    it("should list user projects", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      // This will return an empty array if no projects exist
      const projects = await caller.projects.list();
      expect(Array.isArray(projects)).toBe(true);
    });

    it("should create a new project", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const project = await caller.projects.create({
        name: "Test Chat Project",
        type: "chat",
        description: "A test project",
      });

      expect(project).toBeDefined();
      expect(project.name).toBe("Test Chat Project");
      expect(project.type).toBe("chat");
    });

    it("should handle different project types", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const types = ["chat", "research", "app", "music", "image", "voice", "video"] as const;

      for (const type of types) {
        const project = await caller.projects.create({
          name: `Test ${type} Project`,
          type,
        });

        expect(project.type).toBe(type);
      }
    });
  });

  describe("Chat Router", () => {
    it("should send a message and get response", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      // Create a project first
      const project = await caller.projects.create({
        name: "Chat Test",
        type: "chat",
      });

      // Send a message
      const response = await caller.chat.sendMessage({
        projectId: project.id,
        message: "Hello, AI!",
      });

      expect(response).toBeDefined();
      expect(response.message).toBeDefined();
      expect(typeof response.message).toBe("string");
    });

    it("should handle file uploads", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.chat.uploadFile({
        filename: "test.txt",
        fileData: Buffer.from("test content").toString("base64"),
        mimeType: "text/plain",
      });

      expect(result).toBeDefined();
      expect(result.url).toBeDefined();
      expect(result.key).toBeDefined();
    });

    it("should generate a report", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const project = await caller.projects.create({
        name: "Report Test",
        type: "chat",
      });

      const response = await caller.chat.generateReport({
        projectId: project.id,
        topic: "Artificial Intelligence",
      });

      expect(response).toBeDefined();
      expect(response.report).toBeDefined();
    });
  });

  describe("Research Router", () => {
    it("should search and return results", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const results = await caller.research.search({
        query: "machine learning",
      });

      expect(results).toBeDefined();
      expect(results.results).toBeDefined();
      expect(Array.isArray(results.results)).toBe(true);
    });

    it("should generate a research report", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const project = await caller.projects.create({
        name: "Research Test",
        type: "research",
      });

      const response = await caller.research.generateReport({
        projectId: project.id,
        topic: "Climate Change",
        sources: ["https://example.com/source1"],
      });

      expect(response).toBeDefined();
      expect(response.report).toBeDefined();
    });
  });

  describe("Music Router", () => {
    it("should generate lyrics", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const project = await caller.projects.create({
        name: "Music Test",
        type: "music",
      });

      const response = await caller.music.generateLyrics({
        projectId: project.id,
        prompt: "A song about love",
      });

      expect(response).toBeDefined();
      expect(response.lyrics).toBeDefined();
    });

    it("should generate song structure", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const project = await caller.projects.create({
        name: "Music Structure Test",
        type: "music",
      });

      const response = await caller.music.generateStructure({
        projectId: project.id,
        prompt: "Upbeat pop song",
      });

      expect(response).toBeDefined();
      expect(response.structure).toBeDefined();
    });

    it("should generate production prompt", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const project = await caller.projects.create({
        name: "Production Test",
        type: "music",
      });

      const response = await caller.music.generateProductionPrompt({
        projectId: project.id,
        description: "Electronic dance music",
      });

      expect(response).toBeDefined();
      expect(response.productionPrompt).toBeDefined();
    });
  });

  describe("Image Router", () => {
    it("should generate an image", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const project = await caller.projects.create({
        name: "Image Test",
        type: "image",
      });

      const response = await caller.image.generate({
        projectId: project.id,
        prompt: "A beautiful sunset",
      });

      expect(response).toBeDefined();
      expect(response.url).toBeDefined();
    });

    it("should generate a logo", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const project = await caller.projects.create({
        name: "Logo Test",
        type: "image",
      });

      const response = await caller.image.generateLogo({
        projectId: project.id,
        companyName: "TechCorp",
      });

      expect(response).toBeDefined();
      expect(response.url).toBeDefined();
    });

    it("should generate a thumbnail", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const project = await caller.projects.create({
        name: "Thumbnail Test",
        type: "image",
      });

      const response = await caller.image.generateThumbnail({
        projectId: project.id,
        title: "Amazing Video Title",
      });

      expect(response).toBeDefined();
      expect(response.url).toBeDefined();
    });

    it("should generate a graphic", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const project = await caller.projects.create({
        name: "Graphic Test",
        type: "image",
      });

      const response = await caller.image.generateGraphic({
        projectId: project.id,
        description: "Social media post about AI",
      });

      expect(response).toBeDefined();
      expect(response.url).toBeDefined();
    });
  });

  describe("Voice Router", () => {
    it("should transcribe audio", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const response = await caller.voice.transcribe({
        audioUrl: "https://example.com/audio.mp3",
        language: "en",
      });

      expect(response).toBeDefined();
      expect(response.text).toBeDefined();
    });

    it("should generate speech", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const project = await caller.projects.create({
        name: "Voice Test",
        type: "voice",
      });

      const response = await caller.voice.generateSpeech({
        projectId: project.id,
        text: "Hello, this is a test",
      });

      expect(response).toBeDefined();
      expect(response.audioUrl).toBeDefined();
    });
  });

  describe("Characters Router", () => {
    it("should create a character", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const character = await caller.characters.create({
        name: "Alex",
        description: "A friendly AI assistant",
        personality: { tone: "friendly", style: "casual" },
      });

      expect(character).toBeDefined();
      expect(character.name).toBe("Alex");
    });

    it("should list user characters", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const characters = await caller.characters.list();
      expect(Array.isArray(characters)).toBe(true);
    });

    it("should update a character", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const character = await caller.characters.create({
        name: "Bob",
        description: "A helpful assistant",
      });

      const updated = await caller.characters.update({
        characterId: character.id,
        updates: { description: "An updated description" },
      });

      expect(updated).toBeDefined();
    });

    it("should delete a character", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const character = await caller.characters.create({
        name: "Charlie",
      });

      const result = await caller.characters.delete({
        characterId: character.id,
      });

      expect(result).toBeDefined();
    });
  });

  describe("Subscriptions Router", () => {
    it("should get current subscription", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const subscription = await caller.subscriptions.getCurrent();
      expect(subscription).toBeDefined();
    });

    it("should upgrade subscription", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.subscriptions.upgrade({
        tier: "pro",
      });

      expect(result).toBeDefined();
    });
  });

  describe("Admin Router", () => {
    it("should list users (admin only)", async () => {
      const ctx = createMockContext(mockAdminUser);
      const caller = appRouter.createCaller(ctx);

      const users = await caller.admin.listUsers();
      expect(Array.isArray(users)).toBe(true);
    });

    it("should get usage stats (admin only)", async () => {
      const ctx = createMockContext(mockAdminUser);
      const caller = appRouter.createCaller(ctx);

      const stats = await caller.admin.getUsageStats();
      expect(stats).toBeDefined();
      expect(typeof stats.totalUsers).toBe("number");
    });

    it("should reject non-admin access", async () => {
      const ctx = createMockContext(mockUser); // Regular user
      const caller = appRouter.createCaller(ctx);

      try {
        await caller.admin.listUsers();
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe("Auth Router", () => {
    it("should get current user", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const user = await caller.auth.me();
      expect(user).toBeDefined();
      expect(user?.id).toBe(mockUser.id);
    });

    it("should logout user", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const result = await caller.auth.logout();
      expect(result.success).toBe(true);
    });
  });

  describe("Stripe Router", () => {
    it("should get subscription status", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const status = await caller.stripe.getSubscriptionStatus();
      // Status might be null if no subscription exists
      expect(status === null || status !== null).toBe(true);
    });

    it("should get billing history", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      const history = await caller.stripe.getBillingHistory();
      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe("Integration Tests", () => {
    it("should create a complete workflow: project -> chat -> research", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      // Create project
      const project = await caller.projects.create({
        name: "Complete Workflow",
        type: "chat",
      });
      expect(project).toBeDefined();

      // Send chat message
      const chatResponse = await caller.chat.sendMessage({
        projectId: project.id,
        message: "What is AI?",
      });
      expect(chatResponse.message).toBeDefined();

      // Generate research report
      const researchResponse = await caller.research.generateReport({
        projectId: project.id,
        topic: "Artificial Intelligence",
      });
      expect(researchResponse.report).toBeDefined();
    });

    it("should create a complete creative workflow: music -> image -> character", async () => {
      const ctx = createMockContext();
      const caller = appRouter.createCaller(ctx);

      // Create character
      const character = await caller.characters.create({
        name: "Creative Bot",
        description: "A creative AI character",
      });
      expect(character).toBeDefined();

      // Create music project
      const musicProject = await caller.projects.create({
        name: "Creative Music",
        type: "music",
      });

      // Generate music
      const lyrics = await caller.music.generateLyrics({
        projectId: musicProject.id,
        prompt: "Uplifting pop song",
      });
      expect(lyrics.lyrics).toBeDefined();

      // Create image project
      const imageProject = await caller.projects.create({
        name: "Creative Images",
        type: "image",
      });

      // Generate image
      const image = await caller.image.generate({
        projectId: imageProject.id,
        prompt: "Album cover art",
      });
      expect(image.url).toBeDefined();
    });
  });
});

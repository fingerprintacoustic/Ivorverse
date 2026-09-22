import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

// Project 1 belongs to user 1. Every other db call is a spy, so any
// procedure that reaches one without checking ownership is caught.
const dbCalls: string[] = [];
vi.mock("./db", () => {
  const fns: Record<string, any> = {
    getProjectById: vi.fn(async (projectId: number, userId: number) =>
      projectId === 1 && userId === 1 ? { id: 1, userId: 1, type: "chat" } : undefined
    ),
    getAgents: vi.fn(async () => []),
    getCharacterById: vi.fn(async (characterId: number, userId: number) =>
      characterId === 1 && userId === 1 ? { id: 1, userId: 1 } : undefined
    ),
    updateTaskStatus: vi.fn(async (_taskId: number, userId: number) => userId === 1),
    getWorkflowById: vi.fn(async (id: number, userId: number) =>
      id === 1 && userId === 1 ? { id: 1, userId: 1, name: "w", definition: "{}" } : undefined
    ),
    getWorkflowRun: vi.fn(async (id: number, userId: number) =>
      id === 1 && userId === 1 ? { id: 1, userId: 1, steps: [] } : undefined
    ),
    getProductById: vi.fn(async (id: number) =>
      id === 1
        ? { id: 1, userId: 1, name: "Guide", type: "ebook", price: 10, published: true, deliveryUrl: "https://secret.test/file" }
        : id === 2
          ? { id: 2, userId: 1, name: "Draft", type: "ebook", price: 10, published: false }
          : undefined
    ),
    getUserById: vi.fn(async (id: number) => (id === 1 ? { id: 1, name: "Seller", stripeChargesEnabled: true } : undefined)),
    getTaskById: vi.fn(async (taskId: number, userId: number) =>
      taskId === 1 && userId === 1 ? { id: 1, userId: 1, status: "pending" } : undefined
    ),
  };
  return new Proxy(fns, {
    get: (target, name) =>
      // Not "then": a module exposing then() looks like a Promise and awaiting it hangs
      typeof name !== "string" || name === "then" || name === "__esModule" ? undefined :
      target[name] ??
      (target[name] = vi.fn(async () => {
        dbCalls.push(name);
        return [];
      })),
  });
});
const llm = vi.fn();
vi.mock("./_core/llm", () => ({ invokeLLM: llm }));
vi.mock("./_core/orchestrator", () => ({ runOrchestrator: llm }));
vi.mock("./_core/imageGeneration", () => ({ generateImage: llm }));
vi.mock("./_core/textToSpeech", async (orig) => ({ ...(await orig<any>()), generateSpeech: llm }));
vi.mock("./_core/jobs", () => ({ enqueueJob: llm }));

const { appRouter } = await import("./routers");

const intruder = appRouter.createCaller({
  user: { id: 2, role: "user", email: "intruder@example.com" },
  req: { protocol: "https", headers: {} },
  res: { clearCookie: vi.fn(), cookie: vi.fn() },
} as unknown as TrpcContext);

const OTHER_USERS_PROJECT = 1;

const attempts: Record<string, () => Promise<unknown>> = {
  "chat.getMessages": () => intruder.chat.getMessages({ projectId: OTHER_USERS_PROJECT }),
  "chat.sendMessage": () => intruder.chat.sendMessage({ projectId: OTHER_USERS_PROJECT, message: "hi" }),
  "chat.uploadFile": () =>
    intruder.chat.uploadFile({ projectId: OTHER_USERS_PROJECT, filename: "a.txt", fileData: "", mimeType: "text/plain" }),
  "chat.generateReport": () => intruder.chat.generateReport({ projectId: OTHER_USERS_PROJECT, topic: "x" } as any),
  "research.generateReport": () => intruder.research.generateReport({ projectId: OTHER_USERS_PROJECT, topic: "x" } as any),
  "music.generateLyrics": () => intruder.music.generateLyrics({ projectId: OTHER_USERS_PROJECT, prompt: "x" }),
  "music.generateStructure": () => intruder.music.generateStructure({ projectId: OTHER_USERS_PROJECT, prompt: "x" }),
  "music.generateProductionPrompt": () =>
    intruder.music.generateProductionPrompt({ projectId: OTHER_USERS_PROJECT, description: "x" }),
  "music.generateAudio": () => intruder.music.generateAudio({ projectId: OTHER_USERS_PROJECT, prompt: "x" }),
  "image.generate": () => intruder.image.generate({ projectId: OTHER_USERS_PROJECT, prompt: "x" }),
  "image.generateLogo": () => intruder.image.generateLogo({ projectId: OTHER_USERS_PROJECT, companyName: "x" }),
  "image.generateThumbnail": () => intruder.image.generateThumbnail({ projectId: OTHER_USERS_PROJECT, title: "x" }),
  "image.generateGraphic": () => intruder.image.generateGraphic({ projectId: OTHER_USERS_PROJECT, description: "x" }),
  "voice.generateSpeech": () => intruder.voice.generateSpeech({ projectId: OTHER_USERS_PROJECT, text: "x" }),
  "appBuilder.generate": () =>
    intruder.appBuilder.generate({ projectId: OTHER_USERS_PROJECT, appType: "website", description: "a todo app" }),
  "agents.updateTaskStatus": () => intruder.agents.updateTaskStatus({ taskId: 1, status: "completed" }),
  "agents.createTask": () => intruder.agents.createTask({ title: "x", agentId: 1 }),
  "agents.runTask": () => intruder.agents.runTask({ taskId: 1 }),
  "workflows.update": () =>
    intruder.workflows.update({ workflowId: 1, name: "x", definition: { steps: [{ name: "a", instructions: "b" }] } }),
  "workflows.delete": () => intruder.workflows.delete({ workflowId: 1 }),
  "workflows.run": () => intruder.workflows.run({ workflowId: 1 }),
  "workflows.listRuns": () => intruder.workflows.listRuns({ workflowId: 1 }),
  "workflows.getRun": () => intruder.workflows.getRun({ runId: 1 }),
  "monetization.updateProduct": () =>
    intruder.monetization.updateProduct({ productId: 1, name: "x", type: "ebook", price: 5, published: true }),
  "monetization.deleteProduct": () => intruder.monetization.deleteProduct({ productId: 1 }),
  "monetization.getPublicProduct (draft)": () => intruder.monetization.getPublicProduct({ productId: 2 }),
  // a workflow step pointing at another user's agent
  "workflows.create (foreign agent)": () =>
    intruder.workflows.create({ name: "x", definition: { steps: [{ name: "a", agentId: 1, instructions: "b" }] } }),
  "characters.uploadMedia": () =>
    intruder.characters.uploadMedia({ characterId: 1, kind: "face", fileData: "", mimeType: "image/png" }),
};

describe("cross-user access is rejected", () => {
  for (const [name, attempt] of Object.entries(attempts)) {
    it(name, async () => {
      dbCalls.length = 0;
      llm.mockClear();

      await expect(attempt()).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(llm).not.toHaveBeenCalled();
      expect(dbCalls).toEqual([]);
    });
  }
});

describe("public product page", () => {
  it("never exposes the delivery link", async () => {
    const product = await intruder.monetization.getPublicProduct({ productId: 1 });
    expect(product).toMatchObject({ name: "Guide", price: 10, purchasable: true });
    expect(JSON.stringify(product)).not.toContain("secret.test");
  });
});

describe("billing", () => {
  it("has no client-callable way to change your own plan", () => {
    const procedures = Object.keys(appRouter._def.procedures);
    expect(procedures).toContain("subscriptions.getCurrent"); // sanity: right shape
    expect(procedures).not.toContain("subscriptions.upgrade");
  });
});

describe("character updates", () => {
  it("rejects fields outside name/description/personality (e.g. userId)", async () => {
    await expect(
      intruder.characters.update({ characterId: 5, updates: { userId: 1 } as any })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

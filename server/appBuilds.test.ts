import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  getUserAppProjects: vi.fn(async () => [
    { projectId: 1, appType: "website", sourceCode: "[]", updatedAt: new Date("2026-09-01") },
    { projectId: 2, appType: "mobile", sourceCode: "[]", updatedAt: new Date("2026-09-10") }, // built in chat
    { projectId: 3, appType: "website", sourceCode: null, updatedAt: new Date("2026-09-12") }, // never finished
    { projectId: 99, appType: "saas", sourceCode: "[]", updatedAt: new Date("2026-09-15") }, // project gone
  ]),
  getUserProjects: vi.fn(async () => [
    { id: 1, name: "Todo app", type: "app" },
    { id: 2, name: "Brainstorm", type: "chat" },
    { id: 3, name: "Half done", type: "app" },
  ]),
}));

const { appRouter } = await import("./routers");

describe("appBuilder.listBuilds", () => {
  it("lists saved builds from App Builder and chat, newest first", async () => {
    const api = appRouter.createCaller({
      user: { id: 1, role: "user", subscriptionTier: "free" },
      req: { protocol: "https", headers: {} },
      res: { clearCookie: vi.fn(), cookie: vi.fn() },
    } as unknown as TrpcContext);

    const builds = await api.appBuilder.listBuilds();

    expect(builds.map((b) => [b.projectId, b.projectName, b.projectType])).toEqual([
      [2, "Brainstorm", "chat"],
      [1, "Todo app", "app"],
    ]);
  });
});

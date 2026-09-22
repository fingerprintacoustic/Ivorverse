import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

// Minimal in-memory Firestore: enough for quota docs and transactions.
const store = new Map<string, Record<string, any>>();
const snap = (path: string) => ({ exists: store.has(path), data: () => store.get(path) });
const fakeFirestore = {
  collection: (c: string) => ({
    doc: (id: string) => ({ path: `${c}/${id}`, get: async () => snap(`${c}/${id}`) }),
  }),
  runTransaction: async (fn: (tx: any) => Promise<unknown>) =>
    fn({
      get: async (ref: { path: string }) => snap(ref.path),
      set: (ref: { path: string }, data: Record<string, any>) =>
        store.set(ref.path, { ...(store.get(ref.path) ?? {}), ...data }),
    }),
};

let characterCount = 0;
vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  getDb: vi.fn(async () => fakeFirestore),
  getUserCharacters: vi.fn(async () => Array.from({ length: characterCount }, (_, i) => ({ id: i }))),
  getProjectById: vi.fn(async (id: number, userId: number) => ({ id, userId, type: "image" })),
  createFile: vi.fn(),
  trackUsage: vi.fn(),
}));
const generateImage = vi.fn();
vi.mock("./_core/imageGeneration", () => ({ generateImage }));

const { consumeQuota, refundQuota, getQuotaUsage, QuotaExceededError } = await import("./_core/quota");
const { quotaPeriod } = await import("@shared/plans");

const free = { id: 1, role: "user" as const, subscriptionTier: "free" as const };
const pro = { id: 2, role: "user" as const, subscriptionTier: "pro" as const };
const business = { id: 3, role: "user" as const, subscriptionTier: "business" as const };
const admin = { id: 4, role: "admin" as const, subscriptionTier: "free" as const };
const used = (userId: number, key: string) => store.get(`quotaUsage/${userId}_${quotaPeriod()}`)?.[key] ?? 0;

beforeEach(() => {
  store.clear();
  characterCount = 0;
  generateImage.mockReset();
});

describe("consumeQuota", () => {
  it("allows usage up to the plan limit, then refuses with a clear message", async () => {
    for (let i = 0; i < 5; i++) await consumeQuota(free, "imageGenerations"); // Free: 5 images
    expect(used(1, "imageGenerations")).toBe(5);

    const error = await consumeQuota(free, "imageGenerations").catch((e) => e);
    expect(error).toBeInstanceOf(QuotaExceededError);
    expect(error.code).toBe("FORBIDDEN");
    expect(error.message).toBe("You've used all 5 images on the Free plan this month. Upgrade in Settings for more.");
    expect(used(1, "imageGenerations")).toBe(5); // a refused request isn't counted
  });

  it("charges multi-unit requests all-or-nothing", async () => {
    await consumeQuota(pro, "imageGenerations", 98); // Pro: 100
    await expect(consumeQuota(pro, "imageGenerations", 3)).rejects.toBeInstanceOf(QuotaExceededError);
    expect(used(2, "imageGenerations")).toBe(98);
  });

  it("tracks each quota separately", async () => {
    await consumeQuota(free, "appBuilds"); // Free: 1
    await expect(consumeQuota(free, "appBuilds")).rejects.toThrow("your 1 app build");
    await expect(consumeQuota(free, "chatMessages")).resolves.toBe(quotaPeriod());
  });

  it("doesn't record anything for unlimited plans or admins", async () => {
    await expect(consumeQuota(business, "agentRuns", 1000)).resolves.toBeNull();
    await expect(consumeQuota(pro, "chatMessages")).resolves.toBeNull();
    await expect(consumeQuota(admin, "appBuilds", 50)).resolves.toBeNull();
    expect(store.size).toBe(0);
  });

  it("caps characters by how many exist, not by month", async () => {
    await expect(consumeQuota(free, "characters")).resolves.toBeNull(); // 0 of 1
    characterCount = 1;
    await expect(consumeQuota(free, "characters")).rejects.toThrow("The Free plan allows 1 character.");
  });

  it("treats an unknown tier as Free", async () => {
    const odd = { id: 5, role: "user" as const, subscriptionTier: "enterprise" as any };
    await consumeQuota(odd, "appBuilds");
    await expect(consumeQuota(odd, "appBuilds")).rejects.toBeInstanceOf(QuotaExceededError);
  });
});

describe("refundQuota and usage", () => {
  it("gives units back, never below zero", async () => {
    const period = await consumeQuota(free, "musicGenerations", 2);
    await refundQuota(free.id, "musicGenerations", 1, period);
    expect(used(1, "musicGenerations")).toBe(1);
    await refundQuota(free.id, "musicGenerations", 5, period);
    expect(used(1, "musicGenerations")).toBe(0);
  });

  it("reports usage against the plan", async () => {
    await consumeQuota(free, "chatMessages", 7);
    characterCount = 1;
    const usage = await getQuotaUsage(free);
    expect(usage.plan).toBe("free");
    expect(usage.items.find((i) => i.key === "chatMessages")).toMatchObject({ used: 7, limit: 50, monthly: true });
    expect(usage.items.find((i) => i.key === "characters")).toMatchObject({ used: 1, limit: 1, monthly: false });
  });
});

describe("quota-metered procedures", async () => {
  const { appRouter } = await import("./routers");
  const caller = appRouter.createCaller({
    user: { ...free, email: "u@test.com", name: "U" },
    req: { protocol: "https", headers: {} },
    res: { clearCookie: vi.fn(), cookie: vi.fn() },
  } as unknown as TrpcContext);

  it("charges a successful request", async () => {
    generateImage.mockResolvedValue({ url: "https://img.test/a.png" });
    await caller.image.generate({ projectId: 1, prompt: "a cat" });
    expect(used(1, "imageGenerations")).toBe(1);
  });

  it("refunds a request that fails", async () => {
    generateImage.mockRejectedValue(new Error("OpenAI is down"));
    await expect(caller.image.generate({ projectId: 1, prompt: "a cat" })).rejects.toThrow();
    expect(used(1, "imageGenerations")).toBe(0);
  });

  it("refuses over the limit without calling the model", async () => {
    await consumeQuota(free, "imageGenerations", 5);
    await expect(caller.image.generate({ projectId: 1, prompt: "a cat" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(generateImage).not.toHaveBeenCalled();
  });
});

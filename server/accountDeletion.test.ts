import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory Firestore with just what deleteAccount uses
type Doc = Record<string, any>;
const collections = new Map<string, Map<string, Doc>>();
const col = (name: string) => {
  if (!collections.has(name)) collections.set(name, new Map());
  return collections.get(name)!;
};
const docRef = (name: string, id: string) => ({ delete: async () => void col(name).delete(id), _col: name, _id: id });
const fakeFirestore = {
  collection: (name: string) => ({
    doc: (id: string) => docRef(name, id),
    where: (field: string, _op: string, value: unknown) => ({
      get: async () => ({
        docs: [...col(name).entries()]
          .filter(([, d]) => d[field] === value)
          .map(([id, d]) => ({ id, data: () => d, ref: docRef(name, id) })),
      }),
    }),
  }),
  batch: () => {
    const refs: any[] = [];
    return { delete: (ref: any) => refs.push(ref), commit: async () => refs.forEach((r) => col(r._col).delete(r._id)) };
  },
};

let subscription: any = null;
vi.mock("./db", () => ({
  getDb: vi.fn(async () => fakeFirestore),
  getSubscriptionByUserId: vi.fn(async () => subscription),
}));
const storageDelete = vi.fn(async () => {});
const storageDeletePrefix = vi.fn(async () => {});
vi.mock("./storage", () => ({ storageDelete, storageDeletePrefix }));
const cancel = vi.fn(async () => ({}));
vi.mock("./stripe", () => ({ getStripe: () => ({ subscriptions: { cancel } }) }));

const { deleteAccount } = await import("./_core/accountDeletion");

function seed() {
  collections.clear();
  col("users").set("1", { email: "me@test.com" });
  col("users").set("2", { email: "other@test.com" });
  col("projects").set("10", { userId: 1 });
  col("projects").set("20", { userId: 2 });
  col("projectMemory").set("m1", { projectId: 10 });
  col("projectMemory").set("m2", { projectId: 20 });
  col("chatMessages").set("c1", { userId: 1, projectId: 10 });
  col("files").set("f1", { userId: 1, fileKey: "videos/123.mp4" });
  col("agents").set("a1", { userId: 1 });
  col("workflowRuns").set("r1", { userId: 1 });
  col("quotaUsage").set("1_2026-09", { userId: 1 });
  col("sales").set("cs_1", { sellerId: 1 });
  col("sales").set("cs_2", { sellerId: 2 });
  col("auditLogs").set("l1", { userId: 1 });
}

beforeEach(() => {
  seed();
  subscription = null;
  vi.clearAllMocks();
});

describe("deleteAccount", () => {
  it("removes the user's data and files, leaving other users alone", async () => {
    await deleteAccount(1);

    expect(col("users").has("1")).toBe(false);
    for (const name of ["projects", "chatMessages", "files", "agents", "workflowRuns", "quotaUsage"]) {
      expect([...col(name).values()].some((d) => d.userId === 1), name).toBe(false);
    }
    expect(col("projectMemory").has("m1")).toBe(false);
    expect(col("sales").has("cs_1")).toBe(false);

    // Other user's data untouched; audit logs kept
    expect(col("users").has("2")).toBe(true);
    expect(col("projects").has("20")).toBe(true);
    expect(col("projectMemory").has("m2")).toBe(true);
    expect(col("sales").has("cs_2")).toBe(true);
    expect(col("auditLogs").has("l1")).toBe(true);

    expect(storageDeletePrefix).toHaveBeenCalledWith("1/");
    expect(storageDelete).toHaveBeenCalledWith(["videos/123.mp4"]);
  });

  it("cancels an active paid subscription first", async () => {
    subscription = { stripeSubscriptionId: "sub_1", status: "active" };
    await deleteAccount(1);
    expect(cancel).toHaveBeenCalledWith("sub_1");
  });

  it("deletes nothing if the subscription can't be canceled", async () => {
    subscription = { stripeSubscriptionId: "sub_1", status: "active" };
    cancel.mockRejectedValueOnce(new Error("Stripe is down"));

    await expect(deleteAccount(1)).rejects.toThrow("Stripe is down");
    expect(col("users").has("1")).toBe(true);
    expect(col("projects").has("10")).toBe(true);
    expect(storageDeletePrefix).not.toHaveBeenCalled();
  });

  it("still deletes the account if storage cleanup fails", async () => {
    storageDeletePrefix.mockRejectedValueOnce(new Error("bucket unavailable"));
    await deleteAccount(1);
    expect(col("users").has("1")).toBe(false);
  });
});

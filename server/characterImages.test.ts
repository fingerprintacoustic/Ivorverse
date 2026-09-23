import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const characters = new Map<number, any>();
vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  getProjectById: vi.fn(async (id: number, userId: number) => ({ id, userId, type: "image" })),
  getCharacterById: vi.fn(async (id: number, userId: number) => {
    const c = characters.get(id);
    return c && c.userId === userId ? c : undefined;
  }),
  createFile: vi.fn(),
  trackUsage: vi.fn(),
}));
vi.mock("./_core/quota", async (orig) => ({
  ...(await orig<any>()),
  consumeQuota: vi.fn(async () => null),
  refundQuota: vi.fn(async () => {}),
}));
const generateImage = vi.fn(async () => ({ url: "https://img.test/out.png", key: "1/images/image_abc.png" }));
vi.mock("./_core/imageGeneration", () => ({ generateImage }));

const { appRouter } = await import("./routers");
const db = await import("./db");

const api = appRouter.createCaller({
  user: { id: 1, role: "user", subscriptionTier: "pro" },
  req: { protocol: "https", headers: {} },
  res: { clearCookie: vi.fn(), cookie: vi.fn() },
} as unknown as TrpcContext);

beforeEach(() => {
  vi.clearAllMocks();
  characters.clear();
  characters.set(5, {
    id: 5,
    userId: 1,
    name: "Nova",
    description: "a red-haired astronaut",
    faceImageUrl: "https://files.test/nova.jpg",
  });
  characters.set(6, { id: 6, userId: 1, name: "Faceless", description: null, faceImageUrl: null });
  characters.set(7, { id: 7, userId: 2, name: "Someone else's", faceImageUrl: "https://files.test/x.jpg" });
});

describe("Image Studio with characters", () => {
  it("uses the character's face as the reference image", async () => {
    await api.image.generate({ projectId: 1, prompt: "on the moon", characterId: 5 });

    const call = generateImage.mock.calls[0][0] as any;
    expect(call.originalImages).toEqual([{ url: "https://files.test/nova.jpg" }]);
    expect(call.prompt).toContain("on the moon");
    expect(call.prompt).toContain("Nova (a red-haired astronaut)");
    expect(call.userId).toBe(1);
    // file record points at the real stored object
    expect(db.createFile).toHaveBeenCalledWith(
      1, expect.stringMatching(/^image-/), "1/images/image_abc.png", "https://img.test/out.png", "image/png", undefined, 1
    );
  });

  it("works without a character (no reference image)", async () => {
    await api.image.generate({ projectId: 1, prompt: "a sunset" });
    const call = generateImage.mock.calls[0][0] as any;
    expect(call.originalImages).toBeUndefined();
    expect(call.prompt).toBe("a sunset");
  });

  it("asks for a face image when the character has none", async () => {
    await expect(api.image.generate({ projectId: 1, prompt: "x", characterId: 6 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Upload a face image for Faceless in Characters first.",
    });
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("won't use another user's character", async () => {
    await expect(api.image.generate({ projectId: 1, prompt: "x", characterId: 7 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("thumbnails and graphics accept a character too", async () => {
    await api.image.generateThumbnail({ projectId: 1, title: "My trip", characterId: 5 });
    await api.image.generateGraphic({ projectId: 1, description: "Launch day", characterId: 5 });
    expect(generateImage).toHaveBeenCalledTimes(2);
    for (const [call] of generateImage.mock.calls as any[]) {
      expect(call.originalImages).toEqual([{ url: "https://files.test/nova.jpg" }]);
    }
  });
});

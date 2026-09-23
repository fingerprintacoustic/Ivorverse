import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./_core/session", () => ({
  authenticateRequest: vi.fn(async (req: any) => {
    if (req.headers.cookie !== "session=ok") throw new Error("Invalid session cookie");
    return { id: 1 };
  }),
}));
vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  getUserFileById: vi.fn(async (fileId: number, userId: number) =>
    fileId === 7 && userId === 1
      ? { id: 7, userId: 1, filename: "image-123.png", fileKey: "1/images/a.png", mimeType: "image/png" }
      : undefined
  ),
}));
const storageReadStream = vi.fn(() => Readable.from([Buffer.from("PNGDATA")]));
vi.mock("./storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./storage")>()),
  storageReadStream,
}));

const { createApp } = await import("./_core/app");
let base = "";
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const get = (path: string, cookie?: string) => fetch(base + path, { headers: cookie ? { cookie } : {} });

describe("GET /api/files/:id/download", () => {
  it("requires a signed-in user", async () => {
    expect((await get("/api/files/7/download")).status).toBe(401);
  });

  it("won't serve another user's file", async () => {
    expect((await get("/api/files/8/download", "session=ok")).status).toBe(404);
    expect(storageReadStream).not.toHaveBeenCalled();
  });

  it("streams the caller's own file as an attachment", async () => {
    const res = await get("/api/files/7/download", "session=ok");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="image-123.png"');
    expect(await res.text()).toBe("PNGDATA");
    expect(storageReadStream).toHaveBeenCalledWith("1/images/a.png");
  });
});

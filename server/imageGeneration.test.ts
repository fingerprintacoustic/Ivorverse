import { beforeEach, describe, expect, it, vi } from "vitest";

const edit = vi.fn(async () => ({ data: [{ b64_json: Buffer.from("img").toString("base64") }] }));
const generate = vi.fn(async () => ({ data: [{ b64_json: Buffer.from("img").toString("base64") }] }));
const toFile = vi.fn(async (_buf: Buffer, name: string, opts: { type: string }) => ({ name, type: opts.type }));
vi.mock("openai", () => ({
  default: Object.assign(
    class {
      images = { edit, generate };
    },
    { toFile }
  ),
}));
const storagePut = vi.fn(async (key: string) => ({ key: `${key}-stored`, url: "https://storage.test/x.png" }));
vi.mock("server/storage", () => ({ storagePut }));

process.env.OPENAI_API_KEY = "sk-test";
const { generateImage } = await import("./_core/imageGeneration");

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(Buffer.from("face"), { headers: { "content-type": "image/jpeg" } }))
  );
});

describe("generateImage", () => {
  it("sends a JPEG reference as JPEG with high input fidelity", async () => {
    await generateImage({ prompt: "p", originalImages: [{ url: "https://files.test/face.jpg" }] });

    expect(toFile).toHaveBeenCalledWith(expect.any(Buffer), "reference.jpg", { type: "image/jpeg" });
    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ input_fidelity: "high", prompt: "p" }));
    expect(generate).not.toHaveBeenCalled();
  });

  it("stores under the user's folder and returns the storage key", async () => {
    const result = await generateImage({ prompt: "p", userId: 42 });

    expect(storagePut).toHaveBeenCalledWith("42/images/image.png", expect.any(Buffer), "image/png");
    expect(result).toEqual({ url: "https://storage.test/x.png", key: "42/images/image.png-stored" });
  });
});

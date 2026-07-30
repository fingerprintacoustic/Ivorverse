/**
 * Image generation using OpenAI's Images API directly (gpt-image-1).
 *
 * Same exported function name/signature as the original Forge-backed
 * version, so callers (routers.ts Image Studio, character/video features)
 * don't need to change.
 *
 * Example usage:
 *   const { url: imageUrl } = await generateImage({
 *     prompt: "A serene landscape with mountains"
 *   });
 *
 * For image editing (with a reference image):
 *   const { url: imageUrl } = await generateImage({
 *     prompt: "Add a rainbow to this landscape",
 *     originalImages: [{ url: "https://example.com/original.jpg" }]
 *   });
 */
import OpenAI from "openai";
import { storagePut } from "server/storage";

export type GenerateImageOptions = {
  prompt: string;
  originalImages?: Array<{
    url?: string;
    b64Json?: string;
    mimeType?: string;
  }>;
};

export type GenerateImageResponse = {
  url?: string;
};

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

export async function generateImage(
  options: GenerateImageOptions
): Promise<GenerateImageResponse> {
  const client = getClient();

  let base64Data: string | undefined;

  if (options.originalImages && options.originalImages.length > 0) {
    // Image editing: fetch the reference image(s) and use the edits endpoint.
    const ref = options.originalImages[0];
    let imageBuffer: Buffer;
    if (ref.b64Json) {
      imageBuffer = Buffer.from(ref.b64Json, "base64");
    } else if (ref.url) {
      const resp = await fetch(ref.url);
      if (!resp.ok) throw new Error(`Failed to fetch reference image (${resp.status})`);
      imageBuffer = Buffer.from(await resp.arrayBuffer());
    } else {
      throw new Error("originalImages entry must include either url or b64Json");
    }

    const file = await OpenAI.toFile(imageBuffer, "reference.png", {
      type: ref.mimeType || "image/png",
    });

    const result = await client.images.edit({
      model: "gpt-image-1",
      image: file,
      prompt: options.prompt,
    });
    base64Data = result.data?.[0]?.b64_json;
  } else {
    const result = await client.images.generate({
      model: "gpt-image-1",
      prompt: options.prompt,
      size: "1024x1024",
    });
    base64Data = result.data?.[0]?.b64_json;
  }

  if (!base64Data) {
    throw new Error("Image generation returned no image data");
  }

  const buffer = Buffer.from(base64Data, "base64");
  const { url } = await storagePut(`generated/${Date.now()}.png`, buffer, "image/png");

  return { url };
}

import express, { Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { getStripe, handleStripeWebhook } from "../stripe";
import * as db from "../db";
import { authenticateRequest } from "./session";
import { storageReadStream } from "../storage";

/**
 * Download one of the caller's files as an attachment. Files live on signed
 * Cloud Storage URLs on another origin, where the browser ignores
 * `download` (it just opens the image) and can't read the bytes to convert
 * them; serving through our own origin fixes both.
 */
async function downloadFile(req: express.Request, res: express.Response) {
  let user;
  try {
    user = await authenticateRequest(req);
  } catch {
    res.status(401).send("Not signed in");
    return;
  }
  const file = await db.getUserFileById(Number(req.params.fileId), user.id);
  if (!file) {
    res.status(404).send("File not found");
    return;
  }
  const safeName = file.filename.replace(/[^\w.-]+/g, "_") || "download";
  res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
  res.setHeader("Cache-Control", "private, no-store");
  storageReadStream(file.fileKey)
    .on("error", (error) => {
      console.error(`[Files] Download of file ${file.id} failed:`, error);
      if (!res.headersSent) res.status(404).send("File not found");
      else res.end();
    })
    .pipe(res);
}

/**
 * Stripe webhook. Must be registered before express.json(): the signature
 * is computed over the exact raw bytes. In Cloud Functions the body is
 * already parsed and the original bytes are on req.rawBody.
 */
async function stripeWebhook(req: express.Request, res: express.Response) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[Stripe] STRIPE_WEBHOOK_SECRET is not set; rejecting webhook");
    res.status(500).send("Webhook not configured");
    return;
  }
  const raw: Buffer | undefined = (req as any).rawBody ?? (Buffer.isBuffer(req.body) ? req.body : undefined);
  const signature = req.headers["stripe-signature"];
  if (!raw || typeof signature !== "string") {
    res.status(400).send("Missing body or signature");
    return;
  }

  let event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, secret);
  } catch (error) {
    console.warn("[Stripe] Webhook signature verification failed:", String(error));
    res.status(400).send("Invalid signature");
    return;
  }

  try {
    await handleStripeWebhook(event);
    res.json({ received: true });
  } catch (error) {
    // 500 makes Stripe retry the event later
    console.error(`[Stripe] Failed to handle ${event.type}:`, error);
    res.status(500).send("Webhook handler failed");
  }
}

/**
 * Builds the Express app (API only — no static file serving, no listen()).
 * Used by:
 *  - server/_core/index.ts for local development (adds Vite/static serving + listen)
 *  - functions/index.ts for the Firebase Cloud Function (Firebase Hosting serves
 *    the built client separately and rewrites /api/** to this function)
 */
export function createApp(): Express {
  const app = express();
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhook);
  app.use(express.json({ limit: "50mb" }));
  app.get("/api/files/:fileId/download", downloadFile);
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  return app;
}

import express, { Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { getStripe, handleStripeWebhook } from "../stripe";

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

import express, { Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";

/**
 * Builds the Express app (API only — no static file serving, no listen()).
 * Used by:
 *  - server/_core/index.ts for local development (adds Vite/static serving + listen)
 *  - functions/index.ts for the Firebase Cloud Function (Firebase Hosting serves
 *    the built client separately and rewrites /api/** to this function)
 */
export function createApp(): Express {
  const app = express();
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

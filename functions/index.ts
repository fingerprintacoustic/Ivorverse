import { onRequest } from "firebase-functions/v2/https";
import { createApp } from "../server/_core/app";

// 2nd-gen Cloud Function serving the whole tRPC API + OAuth + storage proxy
// routes. Firebase Hosting rewrites /api/** (see firebase.json) to this
// function; the Express app itself still mounts routes under /api/trpc etc.,
// so no path-stripping is needed here.
export const api = onRequest(
  {
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 60,
    secrets: [
      "STRIPE_SECRET_KEY",
      "JWT_SECRET",
      "OAUTH_SERVER_URL",
      "BUILT_IN_FORGE_API_KEY",
    ],
  },
  createApp()
);

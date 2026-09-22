import { onRequest } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { createApp } from "../server/_core/app";
import { runJob } from "../server/_core/jobs";

const SECRETS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "E2B_API_KEY",
  "FAL_KEY",
  "RESEND_API_KEY",
  "STRIPE_SECRET_KEY",
  "JWT_SECRET",
];

// 2nd-gen Cloud Function serving the whole tRPC API + OAuth + storage proxy
// routes. Firebase Hosting rewrites /api/** (see firebase.json) to this
// function; the Express app itself still mounts routes under /api/trpc etc.,
// so no path-stripping is needed here.
export const api = onRequest(
  {
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 60,
    secrets: SECRETS,
  },
  createApp()
);

// Background job worker (server/_core/jobs.ts). Long-running work — app
// builds, video renders — can't run inside `api`: requests proxied through
// Firebase Hosting are cut off at 60s. The API writes a jobs/{id} doc and
// returns immediately; this trigger does the work with a 9-minute budget
// (the maximum for event-driven functions) while the client polls.
export const jobWorker = onDocumentCreated(
  {
    document: "jobs/{jobId}",
    region: "us-central1",
    memory: "1GiB",
    timeoutSeconds: 540,
    // No automatic retries: a retried build would re-bill the whole run, and
    // runJob's claim step makes duplicate deliveries a no-op anyway.
    retry: false,
    secrets: SECRETS,
  },
  async (event) => {
    await runJob(Number(event.params.jobId));
  }
);

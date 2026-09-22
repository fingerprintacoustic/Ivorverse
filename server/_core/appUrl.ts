import type { Request } from "express";

/**
 * Public base URL for links we send out (verification/reset emails, Stripe
 * redirects). Uses APP_URL — never the request's Origin header in
 * production, since the caller controls it: a password-reset request with a
 * forged Origin would email the victim a genuine reset token inside a link
 * to the attacker's site.
 */
export function getAppUrl(req: Request): string {
  const configured = process.env.APP_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV !== "production" && req.headers.origin) {
    return req.headers.origin; // local dev convenience
  }
  return "https://ivorverse.ai";
}

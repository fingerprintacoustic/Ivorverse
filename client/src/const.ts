export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { PlanId } from "@shared/plans";

/**
 * Where to send someone who needs to sign in. `next` is the in-app path to
 * return to afterwards; it defaults to the current page.
 */
export const getLoginUrl = (next?: string) => {
  const path = next ?? (typeof window === "undefined" ? "/" : window.location.pathname + window.location.search);
  if (!path || path === "/" || path.startsWith("/login") || path.startsWith("/signup")) return "/login";
  return `/login?next=${encodeURIComponent(path)}`;
};

/**
 * Only same-site paths are allowed as a post-login destination: a full URL
 * or protocol-relative "//host" would make /login?next= an open redirect.
 */
export function safeNextPath(next: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

// A paid plan picked on the Home page before signing up. Kept in
// localStorage rather than the URL because email verification can open the
// login page in a new tab, dropping any query string.
const PENDING_PLAN_KEY = "ivorverse.pendingPlan";
const PENDING_PLAN_TTL_MS = 24 * 60 * 60 * 1000;

export function setPendingPlan(plan: Exclude<PlanId, "free">) {
  try {
    localStorage.setItem(PENDING_PLAN_KEY, JSON.stringify({ plan, at: Date.now() }));
  } catch {
    // Storage blocked: the user just lands on the dashboard instead.
  }
}

/** Returns and clears the pending plan, if one was chosen in the last day. */
export function takePendingPlan(): Exclude<PlanId, "free"> | null {
  try {
    const raw = localStorage.getItem(PENDING_PLAN_KEY);
    localStorage.removeItem(PENDING_PLAN_KEY);
    if (!raw) return null;
    const { plan, at } = JSON.parse(raw);
    if (Date.now() - at > PENDING_PLAN_TTL_MS) return null;
    return plan === "pro" || plan === "business" ? plan : null;
  } catch {
    return null;
  }
}

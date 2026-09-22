/**
 * Subscription plans: prices and monthly usage limits. Single source of
 * truth for the server (checkout, quota enforcement), the Settings billing
 * card, and the Home page pricing section.
 *
 * -1 means unlimited. Limits reset each calendar month (UTC), except
 * `characters`, which caps how many exist at once.
 */

export type PlanId = "free" | "pro" | "business";

export const QUOTAS = {
  chatMessages: { label: "Chat messages", unit: "message" },
  researchReports: { label: "Research searches & reports", unit: "research request" },
  imageGenerations: { label: "Image generations", unit: "image" },
  musicGenerations: { label: "Songs", unit: "song" },
  voiceRequests: { label: "Voice requests", unit: "voice request" },
  videoGenerations: { label: "Music videos", unit: "music video" },
  agentRuns: { label: "Agent runs", unit: "agent run" },
  appBuilds: { label: "App builds", unit: "app build" },
  characters: { label: "Characters", unit: "character" },
} as const;

export type QuotaKey = keyof typeof QUOTAS;
export type PlanLimits = Record<QuotaKey, number>;

export interface Plan {
  id: PlanId;
  name: string;
  description: string;
  /** USD per month */
  price: number;
  limits: PlanLimits;
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    description: "Perfect for getting started",
    price: 0,
    limits: {
      chatMessages: 50,
      researchReports: 1,
      imageGenerations: 5,
      musicGenerations: 2,
      voiceRequests: 2,
      videoGenerations: 1,
      agentRuns: 3,
      appBuilds: 1,
      characters: 1,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "For serious creators",
    price: 29,
    limits: {
      chatMessages: -1,
      researchReports: 50,
      imageGenerations: 100,
      musicGenerations: 50,
      voiceRequests: 50,
      videoGenerations: 10,
      agentRuns: 100,
      appBuilds: 20,
      characters: -1,
    },
  },
  business: {
    id: "business",
    name: "Business",
    description: "For heavy use",
    price: 99,
    limits: {
      chatMessages: -1,
      researchReports: -1,
      imageGenerations: -1,
      musicGenerations: -1,
      voiceRequests: -1,
      videoGenerations: -1,
      agentRuns: -1,
      appBuilds: -1,
      characters: -1,
    },
  },
};

export function planFor(tier: string | null | undefined): Plan {
  return PLANS[(tier as PlanId) in PLANS ? (tier as PlanId) : "free"];
}

/** Human-readable plan bullets, generated from the limits so copy can't drift. */
export function planFeatureList(plan: Plan): string[] {
  return (Object.keys(QUOTAS) as QuotaKey[]).map((key) => {
    const limit = plan.limits[key];
    const label = QUOTAS[key].label;
    if (limit === -1) return `Unlimited ${label.toLowerCase()}`;
    return key === "characters" ? `${limit} ${label.toLowerCase()}` : `${limit} ${label.toLowerCase()} / month`;
  });
}

/** "YYYY-MM" in UTC — the period monthly quotas are counted in. */
export function quotaPeriod(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

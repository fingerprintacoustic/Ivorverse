/**
 * Plan limits (shared/plans.ts), enforced server-side.
 *
 * Usage is counted per user per calendar month (UTC) in one Firestore doc,
 * quotaUsage/{userId}_{YYYY-MM}, updated in a transaction so concurrent
 * requests can't overshoot a limit. Work is charged before it runs and
 * refunded if it fails, so users aren't billed quota for errors.
 *
 * Previously the plans promised limits that nothing enforced: every user
 * had unlimited access to everything, whatever they paid.
 */
import { TRPCError } from "@trpc/server";
import { planFor, QUOTAS, quotaPeriod, type QuotaKey } from "@shared/plans";
import * as db from "../db";

export type QuotaUser = Pick<db.User, "id" | "role" | "subscriptionTier">;

export class QuotaExceededError extends TRPCError {
  constructor(
    public readonly quota: QuotaKey,
    public readonly limit: number,
    planName: string
  ) {
    const unit = QUOTAS[quota].unit;
    const what = limit === 1 ? `your 1 ${unit}` : `all ${limit} ${unit}s`;
    super({
      code: "FORBIDDEN",
      message:
        quota === "characters"
          ? `The ${planName} plan allows ${limit} ${unit}${limit === 1 ? "" : "s"}. Upgrade in Settings to create more.`
          : `You've used ${what} on the ${planName} plan this month. Upgrade in Settings for more.`,
    });
  }
}

function docRef(firestore: NonNullable<Awaited<ReturnType<typeof db.getDb>>>, userId: number, period: string) {
  return firestore.collection("quotaUsage").doc(`${userId}_${period}`);
}

/**
 * Charge `amount` units of `quota`, or throw QuotaExceededError. Returns
 * the period charged (pass it to refundQuota), or null if nothing was
 * recorded (unlimited plan, admin, or the characters cap).
 */
export async function consumeQuota(user: QuotaUser, quota: QuotaKey, amount = 1): Promise<string | null> {
  if (user.role === "admin") return null;
  const plan = planFor(user.subscriptionTier);
  const limit = plan.limits[quota];
  if (limit === -1) return null;

  // Characters cap how many exist at once, not monthly creation
  if (quota === "characters") {
    const existing = await db.getUserCharacters(user.id);
    if (existing.length + amount > limit) throw new QuotaExceededError(quota, limit, plan.name);
    return null;
  }

  const firestore = await db.getDb();
  if (!firestore) throw new Error("Database not available");
  const period = quotaPeriod();
  const ref = docRef(firestore, user.id, period);
  await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = (snap.exists ? (snap.data()![quota] as number | undefined) : 0) ?? 0;
    if (used + amount > limit) throw new QuotaExceededError(quota, limit, plan.name);
    tx.set(ref, { userId: user.id, period, [quota]: used + amount, updatedAt: new Date() }, { merge: true });
  });
  return period;
}

/** Give back units charged by consumeQuota (e.g. the work failed). */
export async function refundQuota(userId: number, quota: QuotaKey, amount: number, period: string | null) {
  if (!period || amount <= 0) return;
  const firestore = await db.getDb();
  if (!firestore) return;
  const ref = docRef(firestore, userId, period);
  await firestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const used = (snap.exists ? (snap.data()![quota] as number | undefined) : 0) ?? 0;
    tx.set(ref, { [quota]: Math.max(0, used - amount), updatedAt: new Date() }, { merge: true });
  });
}

/** This month's usage against the user's plan, for the billing UI. */
export async function getQuotaUsage(user: QuotaUser) {
  const plan = planFor(user.subscriptionTier);
  const period = quotaPeriod();
  const firestore = await db.getDb();
  const snap = firestore ? await docRef(firestore, user.id, period).get() : null;
  const counts = (snap?.exists ? snap.data() : {}) as Record<string, number>;
  const characters = (await db.getUserCharacters(user.id)).length;

  return {
    plan: plan.id,
    period,
    unlimited: user.role === "admin",
    items: (Object.keys(QUOTAS) as QuotaKey[]).map((key) => ({
      key,
      label: QUOTAS[key].label,
      used: key === "characters" ? characters : counts[key] ?? 0,
      limit: plan.limits[key],
      monthly: key !== "characters",
    })),
  };
}

/**
 * Subscription tiers for Stripe checkout. Prices and limits are defined once
 * in shared/plans.ts (also used by the client); this keeps the upper-case
 * keys stripe.ts and db.ts already use.
 */
import { PLANS } from "@shared/plans";

export const SUBSCRIPTION_TIERS = {
  FREE: PLANS.free,
  PRO: PLANS.pro,
  BUSINESS: PLANS.business,
};

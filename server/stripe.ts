import Stripe from "stripe";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { SUBSCRIPTION_TIERS } from "./products";
import { getAppUrl } from "./_core/appUrl";

let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {});
  }
  return _stripe;
}

type Tier = "free" | "pro" | "business";
const PAID_TIERS = ["pro", "business"] as const;

/** Billing period lives on subscription items in current Stripe API versions. */
function periodOf(sub: Stripe.Subscription) {
  const item = sub.items?.data?.[0];
  return {
    currentPeriodStart: item?.current_period_start ? new Date(item.current_period_start * 1000) : null,
    currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
  };
}

/**
 * Which plan a subscription is for: by the price actually charged (so a
 * plan switched in the Stripe portal is picked up), falling back to the
 * tier_id tagged at checkout.
 */
function tierOf(sub: Stripe.Subscription): Tier | undefined {
  const cents = sub.items?.data?.[0]?.price?.unit_amount;
  const byPrice = PAID_TIERS.find(
    (t) => Math.round(SUBSCRIPTION_TIERS[t.toUpperCase() as keyof typeof SUBSCRIPTION_TIERS].price * 100) === cents
  );
  if (byPrice) return byPrice;
  const tagged = sub.metadata?.tier_id;
  return (PAID_TIERS as readonly string[]).includes(tagged ?? "") ? (tagged as Tier) : undefined;
}

function mapStatus(status: Stripe.Subscription.Status): db.Subscription["status"] {
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "incomplete_expired") return "expired";
  return "canceled";
}

/** Reuse the user's Stripe customer rather than creating one per checkout. */
async function getOrCreateCustomer(user: { id: number; email: string | null; name: string | null }) {
  const subscription = await db.getOrCreateSubscription(user.id);
  if (subscription.stripeCustomerId) return subscription.stripeCustomerId;
  const customer = await getStripe().customers.create({
    email: user.email || undefined,
    name: user.name || undefined,
    metadata: { userId: user.id.toString() },
  });
  await db.updateSubscription(user.id, { stripeCustomerId: customer.id });
  return customer.id;
}

export const stripeRouter = router({
  /**
   * Start Stripe Checkout for a paid plan. The plan only changes once Stripe
   * confirms payment via the webhook (handleStripeWebhook).
   */
  createCheckoutSession: protectedProcedure
    .input(z.object({ tierId: z.enum(PAID_TIERS) }))
    .mutation(async ({ ctx, input }) => {
      const tier = SUBSCRIPTION_TIERS[input.tierId.toUpperCase() as keyof typeof SUBSCRIPTION_TIERS];
      if (!tier || tier.price === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid subscription tier" });
      }

      const existing = await db.getSubscriptionByUserId(ctx.user.id);
      if (existing?.stripeSubscriptionId && existing.status === "active") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You already have a subscription. Use Manage Billing to change plans.",
        });
      }

      const customerId = await getOrCreateCustomer(ctx.user);
      const appUrl = getAppUrl(ctx.req);
      const metadata = { user_id: ctx.user.id.toString(), tier_id: input.tierId };

      const session = await getStripe().checkout.sessions.create({
        customer: customerId,
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: { name: `IvorVerse ${tier.name}`, description: tier.description },
              unit_amount: Math.round(tier.price * 100),
              recurring: { interval: "month", interval_count: 1 },
            },
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${appUrl}/settings?billing=success`,
        cancel_url: `${appUrl}/settings`,
        client_reference_id: ctx.user.id.toString(),
        metadata,
        // Carried on the subscription itself so later subscription events map back
        subscription_data: { metadata },
        allow_promotion_codes: true,
      });

      return { sessionId: session.id, url: session.url };
    }),

  /** Stripe-hosted page to change plan, update the card, or cancel. */
  createPortalSession: protectedProcedure.mutation(async ({ ctx }) => {
    const subscription = await db.getSubscriptionByUserId(ctx.user.id);
    if (!subscription?.stripeCustomerId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "No billing account yet" });
    }
    const session = await getStripe().billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${getAppUrl(ctx.req)}/settings`,
    });
    return { url: session.url };
  }),

  getSubscriptionStatus: protectedProcedure.query(async ({ ctx }) => {
    const subscription = await db.getSubscriptionByUserId(ctx.user.id);
    if (!subscription) return null;
    return {
      tier: subscription.tier,
      status: subscription.status,
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd ?? false,
      hasBillingAccount: Boolean(subscription.stripeCustomerId),
    };
  }),

  /** Cancel at period end. The webhook records the resulting state. */
  cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const subscription = await db.getSubscriptionByUserId(ctx.user.id);
    if (!subscription?.stripeSubscriptionId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No active subscription found" });
    }
    await getStripe().subscriptions.update(subscription.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    await db.updateSubscription(ctx.user.id, { cancelAtPeriodEnd: true });
    return { success: true };
  }),

  getBillingHistory: protectedProcedure.query(async ({ ctx }) => {
    try {
      const subscription = await db.getSubscriptionByUserId(ctx.user.id);
      if (!subscription?.stripeCustomerId) return [];

      const invoices = await getStripe().invoices.list({
        customer: subscription.stripeCustomerId,
        limit: 12,
      });
      return invoices.data.map((invoice) => ({
        id: invoice.id,
        date: new Date(invoice.created * 1000),
        amount: (invoice.amount_paid || 0) / 100,
        status: invoice.status,
        pdfUrl: invoice.invoice_pdf ?? invoice.hosted_invoice_url ?? "",
      }));
    } catch (error) {
      console.error("Error fetching billing history:", error);
      return [];
    }
  }),
});

/**
 * Write a Stripe subscription's state to our records (idempotent). Only
 * IvorVerse plan subscriptions (tagged with tier_id at checkout) are synced;
 * anything else on the account is ignored so it can't change a user's plan.
 */
async function syncSubscription(sub: Stripe.Subscription, userIdHint?: number) {
  const known = await db.getSubscriptionByStripeSubscriptionId(sub.id);
  if (!sub.metadata?.tier_id && !known) return;

  const userId =
    userIdHint ??
    (sub.metadata?.user_id ? Number(sub.metadata.user_id) : undefined) ??
    known?.userId;
  if (!userId) {
    console.warn("[Stripe] Subscription with no matching user:", sub.id);
    return;
  }

  const status = mapStatus(sub.status);
  const paidTier = tierOf(sub);
  const existing = await db.getOrCreateSubscription(userId);
  const tier: Tier = status === "active" ? paidTier ?? existing.tier : "free";

  await db.updateSubscription(userId, {
    tier,
    status,
    stripeSubscriptionId: status === "canceled" || status === "expired" ? null : sub.id,
    stripeCustomerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
    ...periodOf(sub),
  });
  await db.setUserSubscriptionTier(userId, tier);
}

/**
 * Handle a verified Stripe event (see the /api/stripe/webhook route in
 * app.ts, which checks the signature before calling this).
 */
export async function handleStripeWebhook(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && session.subscription) {
        const sub = await getStripe().subscriptions.retrieve(
          typeof session.subscription === "string" ? session.subscription : session.subscription.id
        );
        const userId = session.client_reference_id ? Number(session.client_reference_id) : undefined;
        await syncSubscription(sub, userId);
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object as Stripe.Subscription);
      break;

    default:
      // invoice.* etc.: subscription state arrives via customer.subscription.*
      break;
  }
}

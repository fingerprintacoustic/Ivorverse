import Stripe from "stripe";
import { protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { SUBSCRIPTION_TIERS } from "./products";
import { getAppUrl } from "./_core/appUrl";

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {});
  }
  return _stripe;
}

export const stripeRouter = router({
  /**
   * Create a checkout session for subscription upgrade
   */
  createCheckoutSession: protectedProcedure
    .input(
      z.object({
        tierId: z.enum(["pro", "business"]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const tier = SUBSCRIPTION_TIERS[input.tierId.toUpperCase() as keyof typeof SUBSCRIPTION_TIERS];
      if (!tier || tier.price === 0) {
        throw new Error("Invalid subscription tier");
      }

      // Create new Stripe customer for this user
      const customer = await getStripe().customers.create({
        email: ctx.user.email || undefined,
        name: ctx.user.name || undefined,
        metadata: {
          userId: ctx.user.id.toString(),
        },
      });
      const customerId = customer.id;

      // Create checkout session
      const session = await getStripe().checkout.sessions.create({
        customer: customerId,
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: tier.name,
                description: tier.description,
              },
              unit_amount: Math.round(tier.price * 100), // Convert to cents
              recurring: {
                interval: "month",
                interval_count: 1,
              },
            },
            quantity: 1,
          },
        ],
        mode: "subscription",
        success_url: `${getAppUrl(ctx.req)}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${getAppUrl(ctx.req)}/dashboard`,
        client_reference_id: ctx.user.id.toString(),
        metadata: {
          user_id: ctx.user.id.toString(),
          tier_id: input.tierId,
        },
        allow_promotion_codes: true,
      });

      return {
        sessionId: session.id,
        url: session.url,
      };
    }),

  /**
   * Get current subscription status
   */
  getSubscriptionStatus: protectedProcedure.query(async ({ ctx }) => {
    const subscription = await db.getSubscriptionByUserId(ctx.user.id);

    if (!subscription) {
      return null;
    }

    // If we have a Stripe subscription ID, fetch current status
    if (subscription.stripeSubscriptionId) {
      try {
        const stripeSubscription = await getStripe().subscriptions.retrieve(subscription.stripeSubscriptionId);
        return {
          tier: subscription.tier,
          status: stripeSubscription.status,
          currentPeriodStart: new Date((stripeSubscription as any).current_period_start * 1000),
          currentPeriodEnd: new Date((stripeSubscription as any).current_period_end * 1000),
          cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
        };
      } catch (error) {
        console.error("Error fetching Stripe subscription:", error);
      }
    }

    return {
      tier: subscription.tier,
      status: "active",
      currentPeriodStart: subscription.currentPeriodStart,
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    };
  }),

  /**
   * Cancel subscription
   */
  cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    const subscription = await db.getSubscriptionByUserId(ctx.user.id);

    if (!subscription) {
      throw new Error("No active subscription found");
    }

    if ((subscription as any).stripeSubscriptionId) {
      // Cancel at end of period
      await getStripe().subscriptions.update((subscription as any).stripeSubscriptionId, {
        cancel_at_period_end: true,
      });
    }

    // Update database
    await db.updateSubscription(ctx.user.id, { cancelAtPeriodEnd: true });

    return { success: true };
  }),

  /**
   * Get billing history
   */
  getBillingHistory: protectedProcedure.query(async ({ ctx }) => {
    try {
      // Get user's subscription to find Stripe customer
      const subscription = await db.getSubscriptionByUserId(ctx.user.id);

      if (!subscription || !(subscription as any).stripeCustomerId) {
        return [];
      }

      const invoices = await getStripe().invoices.list({
        customer: (subscription as any).stripeCustomerId,
        limit: 12,
      });

      return invoices.data.map((invoice: Stripe.Invoice) => ({
        id: invoice.id,
        date: new Date(invoice.created * 1000),
        amount: (invoice.amount_paid || 0) / 100,
        status: invoice.status,
        pdfUrl: (invoice as any).pdf || "",
      }));
    } catch (error) {
      console.error("Error fetching billing history:", error);
      return [];
    }
  }),
});

/**
 * Webhook handler for Stripe events
 * This should be called from the webhook endpoint
 */
export async function handleStripeWebhook(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log("[Stripe] Checkout session completed:", session.id);

      if (session.client_reference_id && session.metadata?.tier_id) {
        const userId = parseInt(session.client_reference_id);
        const tierId = session.metadata.tier_id;

        // Create the subscription record if it doesn't exist yet, then update it.
        await db.getOrCreateSubscription(userId);
        await db.updateSubscription(userId, {
          tier: tierId as "free" | "pro" | "business",
          stripeSubscriptionId: session.subscription?.toString(),
          stripeCustomerId: session.customer?.toString(),
          status: "active",
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      console.log("[Stripe] Subscription updated:", subscription.id);

      const userSub = await db.getSubscriptionByStripeSubscriptionId(subscription.id);

      if (userSub) {
        await db.updateSubscription((userSub as any).userId, {
          status: subscription.cancel_at_period_end ? "canceled" : "active",
          currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      console.log("[Stripe] Subscription deleted:", subscription.id);

      const userSub = await db.getSubscriptionByStripeSubscriptionId(subscription.id);

      if (userSub) {
        await db.updateSubscription((userSub as any).userId, {
          tier: "free",
          stripeSubscriptionId: null,
          status: "canceled",
          canceledAt: new Date(),
        });
      }
      break;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      console.log("[Stripe] Invoice payment succeeded:", invoice.id);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      console.log("[Stripe] Invoice payment failed:", invoice.id);
      break;
    }

    default:
      console.log("[Stripe] Unhandled event type:", event.type);
  }
}

import type { AddressInfo } from "node:net";
import Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const subs = new Map<number, any>();
const userTiers = new Map<number, string>();
vi.mock("./db", () => ({
  getSubscriptionByStripeSubscriptionId: vi.fn(async (id: string) =>
    [...subs.values()].find((s) => s.stripeSubscriptionId === id)
  ),
  getOrCreateSubscription: vi.fn(async (userId: number) => {
    if (!subs.has(userId)) subs.set(userId, { userId, tier: "free", status: "active" });
    return subs.get(userId);
  }),
  updateSubscription: vi.fn(async (userId: number, updates: any) => Object.assign(subs.get(userId), updates)),
  setUserSubscriptionTier: vi.fn(async (userId: number, tier: string) => userTiers.set(userId, tier)),
  getSubscriptionByUserId: vi.fn(async (userId: number) => subs.get(userId)),
  recordSaleOnce: vi.fn(async () => true),
  getProductById: vi.fn(async () => undefined),
}));

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
const { createApp } = await import("./_core/app");

let baseUrl = "";
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

beforeEach(() => {
  subs.clear();
  userTiers.clear();
});

function subscriptionEvent(type: string, sub: Record<string, any>) {
  return {
    id: "evt_1",
    object: "event",
    type,
    data: {
      object: {
        id: "sub_1",
        object: "subscription",
        customer: "cus_1",
        status: "active",
        cancel_at_period_end: false,
        canceled_at: null,
        metadata: { user_id: "7", tier_id: "pro" },
        items: {
          data: [{ current_period_start: 1_760_000_000, current_period_end: 1_762_600_000, price: { unit_amount: 2900 } }],
        },
        ...sub,
      },
    },
  };
}

async function post(event: object, { forge = false } = {}) {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: forge ? "whsec_attacker" : process.env.STRIPE_WEBHOOK_SECRET!,
  });
  return fetch(`${baseUrl}/api/stripe/webhook`, {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": header },
    body: payload,
  });
}

describe("Stripe webhook", () => {
  it("rejects events with an invalid signature", async () => {
    const res = await post(subscriptionEvent("customer.subscription.updated", {}), { forge: true });
    expect(res.status).toBe(400);
    expect(subs.size).toBe(0);
  });

  it("records a paid plan on both the subscription and the user", async () => {
    const res = await post(subscriptionEvent("customer.subscription.created", {}));
    expect(res.status).toBe(200);
    expect(subs.get(7)).toMatchObject({
      tier: "pro",
      status: "active",
      stripeSubscriptionId: "sub_1",
      stripeCustomerId: "cus_1",
      currentPeriodEnd: new Date(1_762_600_000 * 1000),
    });
    expect(userTiers.get(7)).toBe("pro");
  });

  it("takes the plan from the price charged (portal plan switch)", async () => {
    await post(
      subscriptionEvent("customer.subscription.updated", {
        items: { data: [{ current_period_end: 1_762_600_000, price: { unit_amount: 9900 } }] },
      })
    );
    expect(userTiers.get(7)).toBe("business");
  });

  it("keeps the plan until period end when cancellation is scheduled", async () => {
    await post(subscriptionEvent("customer.subscription.updated", { cancel_at_period_end: true }));
    expect(subs.get(7)).toMatchObject({ tier: "pro", status: "active", cancelAtPeriodEnd: true });
  });

  it("drops to free when the subscription ends", async () => {
    await post(subscriptionEvent("customer.subscription.created", {}));
    await post(subscriptionEvent("customer.subscription.deleted", { status: "canceled", canceled_at: 1_763_000_000 }));
    expect(subs.get(7)).toMatchObject({ tier: "free", status: "canceled", stripeSubscriptionId: null });
    expect(userTiers.get(7)).toBe("free");
  });

  it("records a product purchase as a sale without touching the buyer's plan", async () => {
    const db = await import("./db");
    const res = await post({
      id: "evt_2",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_product",
          object: "checkout.session",
          mode: "subscription",
          subscription: "sub_product",
          payment_status: "paid",
          amount_total: 500,
          client_reference_id: "7",
          customer_details: { email: "buyer@test.com" },
          metadata: { product_id: "10", seller_id: "2" },
        },
      },
    });
    expect(res.status).toBe(200);
    expect(db.recordSaleOnce).toHaveBeenCalledWith(expect.objectContaining({ productId: 10, stripeSessionId: "cs_product" }));
    expect(subs.size).toBe(0);
    expect(userTiers.size).toBe(0);
  });

  it("ignores subscriptions that aren't IvorVerse plans", async () => {
    const res = await post(subscriptionEvent("customer.subscription.created", { id: "sub_other", metadata: {} }));
    expect(res.status).toBe(200);
    expect(subs.size).toBe(0);
    expect(userTiers.size).toBe(0);
  });
});

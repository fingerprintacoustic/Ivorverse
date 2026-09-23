import { beforeEach, describe, expect, it, vi } from "vitest";

const products = new Map<number, any>();
const users = new Map<number, any>();
const sales = new Map<string, any>();
vi.mock("./db", () => ({
  getProductById: vi.fn(async (id: number) => products.get(id)),
  getUserById: vi.fn(async (id: number) => users.get(id)),
  setUserConnectAccount: vi.fn(async (id: number, u: any) => Object.assign(users.get(id), u)),
  recordSaleOnce: vi.fn(async (sale: any) => {
    const key = sale.stripeInvoiceId ?? sale.stripeSessionId;
    if (sales.has(key)) return false;
    sales.set(key, sale);
    return true;
  }),
}));

const stripe = {
  accounts: { retrieve: vi.fn(), create: vi.fn() },
  accountLinks: { create: vi.fn() },
  checkout: { sessions: { create: vi.fn(async () => ({ url: "https://checkout.stripe.test/s" })), retrieve: vi.fn() } },
};
vi.mock("./stripe", () => ({ getStripe: () => stripe }));
const sendEmail = vi.fn(async () => true);
vi.mock("./_core/emailService", () => ({ sendEmail }));

const { createProductCheckout, getPurchaseDelivery, recordProductSale, recordProductRenewal } = await import(
  "./_core/marketplace"
);

const APP = "https://app.test";

beforeEach(() => {
  products.clear();
  users.clear();
  sales.clear();
  vi.clearAllMocks();
  delete process.env.PLATFORM_FEE_PERCENT;
  users.set(2, { id: 2, name: "Seller", stripeConnectAccountId: "acct_seller", stripeChargesEnabled: true });
  products.set(10, {
    id: 10,
    userId: 2,
    name: "Guide <b>",
    type: "ebook",
    price: 19.99,
    published: true,
    deliveryUrl: "https://files.test/guide.pdf",
  });
  stripe.accounts.retrieve.mockResolvedValue({ charges_enabled: true });
});

describe("product checkout", () => {
  it("charges the database price and pays the seller's account", async () => {
    process.env.PLATFORM_FEE_PERCENT = "10";
    await createProductCheckout(10, APP);

    const params = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(params.mode).toBe("payment");
    expect(params.line_items[0].price_data.unit_amount).toBe(1999);
    expect(params.payment_intent_data).toMatchObject({
      on_behalf_of: "acct_seller",
      transfer_data: { destination: "acct_seller" },
      application_fee_amount: 200,
    });
    expect(params.metadata).toEqual({ product_id: "10", seller_id: "2" });
    expect(params.success_url).toBe(`${APP}/p/10?session_id={CHECKOUT_SESSION_ID}`);
  });

  it("uses a monthly subscription for subscription products, with no fee by default", async () => {
    products.get(10).type = "subscription";
    await createProductCheckout(10, APP);

    const params = stripe.checkout.sessions.create.mock.calls[0][0];
    expect(params.mode).toBe("subscription");
    expect(params.line_items[0].price_data.recurring).toEqual({ interval: "month" });
    expect(params.subscription_data).toMatchObject({ transfer_data: { destination: "acct_seller" } });
    expect(params.subscription_data.application_fee_percent).toBeUndefined();
  });

  it("refuses unpublished products", async () => {
    products.get(10).published = false;
    await expect(createProductCheckout(10, APP)).rejects.toThrow("isn't available");
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("refuses sellers whose Stripe account can't take charges (checked live)", async () => {
    stripe.accounts.retrieve.mockResolvedValue({ charges_enabled: false });
    await expect(createProductCheckout(10, APP)).rejects.toThrow("isn't set up");
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
});

describe("purchase delivery", () => {
  it("reveals the delivery link only for a paid session of this product", async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValue({ payment_status: "paid", metadata: { product_id: "10" } });
    await expect(getPurchaseDelivery(10, "cs_1")).resolves.toMatchObject({
      deliveryUrl: "https://files.test/guide.pdf",
    });
  });

  it("returns nothing for an unpaid session", async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValue({ payment_status: "unpaid", metadata: { product_id: "10" } });
    await expect(getPurchaseDelivery(10, "cs_1")).resolves.toBeNull();
  });

  it("returns nothing when the session paid for a different product", async () => {
    stripe.checkout.sessions.retrieve.mockResolvedValue({ payment_status: "paid", metadata: { product_id: "99" } });
    await expect(getPurchaseDelivery(10, "cs_1")).resolves.toBeNull();
  });
});

describe("recording sales", () => {
  const session = {
    id: "cs_sale",
    mode: "payment",
    payment_status: "paid",
    amount_total: 1999,
    customer_details: { email: "buyer@test.com" },
    metadata: { product_id: "10", seller_id: "2" },
  } as any;

  it("records once and emails the buyer, even if the webhook repeats", async () => {
    await recordProductSale(session);
    await recordProductSale(session);

    expect(sales.get("cs_sale")).toMatchObject({ productId: 10, sellerId: 2, amount: 19.99, buyerEmail: "buyer@test.com" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const email = sendEmail.mock.calls[0][0] as any;
    expect(email.to).toBe("buyer@test.com");
    expect(email.html).toContain("https://files.test/guide.pdf");
    expect(email.html).toContain("Guide &lt;b&gt;"); // product name is escaped
  });

  const invoice = (overrides: Record<string, any> = {}) =>
    ({
      id: "in_renew",
      billing_reason: "subscription_cycle",
      amount_paid: 500,
      customer_email: "buyer@test.com",
      parent: { subscription_details: { metadata: { product_id: "10", seller_id: "2" } } },
      ...overrides,
    }) as any;

  it("records a monthly renewal once per invoice, without re-emailing", async () => {
    await recordProductRenewal(invoice());
    await recordProductRenewal(invoice());

    expect(sales.size).toBe(1);
    expect(sales.get("in_renew")).toMatchObject({
      productId: 10,
      sellerId: 2,
      amount: 5,
      buyerEmail: "buyer@test.com",
      mode: "renewal",
      stripeInvoiceId: "in_renew",
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("skips the first invoice, which checkout already recorded", async () => {
    await recordProductRenewal(invoice({ billing_reason: "subscription_create" }));
    expect(sales.size).toBe(0);
  });

  it("ignores invoices that aren't for a product (e.g. IvorVerse plans)", async () => {
    await recordProductRenewal(invoice({ parent: { subscription_details: { metadata: { tier_id: "pro" } } } }));
    await recordProductRenewal(invoice({ parent: null }));
    expect(sales.size).toBe(0);
  });

  it("ignores unpaid sessions", async () => {
    await recordProductSale({ ...session, id: "cs_unpaid", payment_status: "unpaid" });
    expect(sales.size).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

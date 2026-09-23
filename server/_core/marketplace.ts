/**
 * Creator marketplace via Stripe Connect (Express accounts).
 *
 * Sellers onboard their own Stripe account through Stripe-hosted onboarding
 * (identity checks, bank details and payouts are Stripe's). Buyers pay on a
 * Stripe Checkout page as a destination charge: funds go to the seller's
 * account (on_behalf_of makes them the merchant of record), and the platform
 * optionally keeps PLATFORM_FEE_PERCENT (default 0).
 *
 * Replaces the previous Monetize feature, where products were just records
 * with a price and nothing could be bought.
 */
import type Stripe from "stripe";
import * as db from "../db";
import { getStripe } from "../stripe";
import { sendEmail } from "./emailService";

export function platformFeePercent(): number {
  const pct = Number(process.env.PLATFORM_FEE_PERCENT ?? 0);
  return Number.isFinite(pct) && pct >= 0 && pct < 100 ? pct : 0;
}

export function isRecurring(product: Pick<db.Product, "type">) {
  return product.type === "subscription";
}

/** Live check with Stripe, mirrored onto the user record. */
export async function refreshSellerStatus(user: Pick<db.User, "id" | "stripeConnectAccountId">) {
  if (!user.stripeConnectAccountId) {
    return { connected: false, chargesEnabled: false, detailsSubmitted: false, payoutsEnabled: false };
  }
  const account = await getStripe().accounts.retrieve(user.stripeConnectAccountId);
  const chargesEnabled = Boolean(account.charges_enabled);
  await db.setUserConnectAccount(user.id, { stripeChargesEnabled: chargesEnabled });
  return {
    connected: true,
    chargesEnabled,
    detailsSubmitted: Boolean(account.details_submitted),
    payoutsEnabled: Boolean(account.payouts_enabled),
  };
}

/** Create the seller's Express account if needed; return a Stripe onboarding link. */
export async function createOnboardingLink(
  user: Pick<db.User, "id" | "email" | "stripeConnectAccountId">,
  appUrl: string
) {
  let accountId = user.stripeConnectAccountId;
  if (!accountId) {
    const account = await getStripe().accounts.create({
      type: "express",
      email: user.email ?? undefined,
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { userId: String(user.id) },
    });
    accountId = account.id;
    await db.setUserConnectAccount(user.id, { stripeConnectAccountId: accountId, stripeChargesEnabled: false });
  }
  const link = await getStripe().accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${appUrl}/feature/monetize?connect=refresh`,
    return_url: `${appUrl}/feature/monetize?connect=return`,
  });
  return link.url;
}

/** Checkout for a published product, paying the seller's connected account. */
export async function createProductCheckout(productId: number, appUrl: string) {
  const product = await db.getProductById(productId);
  if (!product || !product.published || !product.price || product.price <= 0) {
    throw new Error("This product isn't available for purchase.");
  }
  const seller = await db.getUserById(product.userId);
  const destination = seller?.stripeConnectAccountId;
  if (!destination) throw new Error("This seller isn't set up to accept payments yet.");
  const account = await getStripe().accounts.retrieve(destination);
  if (!account.charges_enabled) throw new Error("This seller isn't set up to accept payments yet.");

  const unitAmount = Math.round(product.price * 100);
  const feePercent = platformFeePercent();
  const recurring = isRecurring(product);
  const metadata = { product_id: String(product.id), seller_id: String(product.userId) };

  const session = await getStripe().checkout.sessions.create({
    mode: recurring ? "subscription" : "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: unitAmount,
          product_data: {
            name: product.name,
            ...(product.description ? { description: product.description.slice(0, 500) } : {}),
          },
          ...(recurring ? { recurring: { interval: "month" as const } } : {}),
        },
      },
    ],
    metadata,
    ...(recurring
      ? {
          subscription_data: {
            metadata,
            on_behalf_of: destination,
            transfer_data: { destination },
            ...(feePercent > 0 ? { application_fee_percent: feePercent } : {}),
          },
        }
      : {
          payment_intent_data: {
            metadata,
            on_behalf_of: destination,
            transfer_data: { destination },
            ...(feePercent > 0 ? { application_fee_amount: Math.round((unitAmount * feePercent) / 100) } : {}),
          },
          customer_creation: "always" as const,
        }),
    success_url: `${appUrl}/p/${product.id}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/p/${product.id}`,
  });
  if (!session.url) throw new Error("Stripe didn't return a checkout URL");
  return session.url;
}

/**
 * What a buyer gets after paying: the product's delivery link, but only for
 * a paid Checkout session of this product. The session id is unguessable,
 * so it acts as the buyer's proof of purchase.
 */
export async function getPurchaseDelivery(productId: number, sessionId: string) {
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  const paid = session.payment_status === "paid" || session.payment_status === "no_payment_required";
  if (!paid || session.metadata?.product_id !== String(productId)) return null;
  const product = await db.getProductById(productId);
  if (!product) return null;
  return { productName: product.name, deliveryUrl: product.deliveryUrl ?? null };
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** From the checkout.session.completed webhook: record the sale and email the buyer. */
export async function recordProductSale(session: Stripe.Checkout.Session) {
  const productId = Number(session.metadata?.product_id);
  const sellerId = Number(session.metadata?.seller_id);
  if (!productId || !sellerId) return;
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") return;

  const buyerEmail = session.customer_details?.email ?? null;
  const isNew = await db.recordSaleOnce({
    productId,
    sellerId,
    amount: (session.amount_total ?? 0) / 100,
    buyerEmail,
    mode: session.mode === "subscription" ? "subscription" : "payment",
    stripeSessionId: session.id,
  });
  if (!isNew) return; // duplicate webhook delivery

  const product = await db.getProductById(productId);
  if (buyerEmail && product) {
    const name = escapeHtml(product.name);
    const delivery = product.deliveryUrl
      ? `<p>Here's your access link:</p><p><a href="${escapeHtml(product.deliveryUrl)}">${escapeHtml(product.deliveryUrl)}</a></p>`
      : "<p>The seller will be in touch with access details.</p>";
    await sendEmail({
      to: buyerEmail,
      subject: `Your purchase: ${product.name}`,
      html: `<p>Thanks for buying <strong>${name}</strong>.</p>${delivery}`,
      text: `Thanks for buying ${product.name}. ${product.deliveryUrl ? `Access it here: ${product.deliveryUrl}` : "The seller will be in touch with access details."}`,
    });
  }
}

/**
 * From the invoice.paid webhook: record a monthly renewal of a product
 * subscription. The first month is recorded from checkout.session.completed
 * (billing_reason "subscription_create"), so only "subscription_cycle"
 * invoices count here. IvorVerse's own plan invoices carry no product_id
 * and are ignored.
 */
export async function recordProductRenewal(invoice: Stripe.Invoice) {
  if (invoice.billing_reason !== "subscription_cycle") return;
  const metadata = invoice.parent?.subscription_details?.metadata;
  const productId = Number(metadata?.product_id);
  const sellerId = Number(metadata?.seller_id);
  if (!productId || !sellerId || !invoice.id) return;

  await db.recordSaleOnce({
    productId,
    sellerId,
    amount: (invoice.amount_paid ?? 0) / 100,
    buyerEmail: invoice.customer_email ?? null,
    mode: "renewal",
    stripeInvoiceId: invoice.id,
  });
}

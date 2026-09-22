import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

// Keep in sync with server/products.ts SUBSCRIPTION_TIERS
const PLANS = [
  { id: "pro", name: "Pro", price: 29, blurb: "For serious creators" },
  { id: "business", name: "Business", price: 99, blurb: "For teams and heavier use" },
] as const;

/** Current plan, upgrade via Stripe Checkout, and Stripe's billing portal. */
export function BillingCard() {
  const utils = trpc.useUtils();
  // After returning from Checkout, poll briefly: the plan changes when
  // Stripe's webhook arrives, which can lag the redirect by a few seconds.
  const [awaitingUpgrade, setAwaitingUpgrade] = useState(
    () => new URLSearchParams(window.location.search).get("billing") === "success"
  );

  const status = trpc.stripe.getSubscriptionStatus.useQuery(undefined, {
    refetchInterval: awaitingUpgrade ? 2000 : false,
  });
  const history = trpc.stripe.getBillingHistory.useQuery(undefined, {
    enabled: Boolean(status.data?.hasBillingAccount),
  });

  const checkout = trpc.stripe.createCheckoutSession.useMutation({
    onSuccess: ({ url }) => {
      if (url) window.location.href = url;
    },
    onError: (error) => toast.error(error.message),
  });
  const portal = trpc.stripe.createPortalSession.useMutation({
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (error) => toast.error(error.message),
  });

  const tier = status.data?.tier ?? "free";
  const isPaid = tier !== "free" && status.data?.status === "active";

  useEffect(() => {
    if (!awaitingUpgrade) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (isPaid) {
      toast.success(`You're on the ${tier.charAt(0).toUpperCase() + tier.slice(1)} plan`);
      utils.auth.me.invalidate();
      setAwaitingUpgrade(false);
      return;
    }
    const timeout = setTimeout(() => setAwaitingUpgrade(false), 30_000);
    return () => clearTimeout(timeout);
  }, [awaitingUpgrade, isPaid, tier, utils]);

  const periodEnd = status.data?.currentPeriodEnd ? new Date(status.data.currentPeriodEnd) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan &amp; Billing</CardTitle>
        <CardDescription>Payments are handled securely by Stripe</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {status.isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold capitalize">{tier} plan</span>
                  {status.data?.status === "past_due" && <Badge variant="destructive">Payment failed</Badge>}
                  {status.data?.cancelAtPeriodEnd && <Badge variant="outline">Cancels at period end</Badge>}
                </div>
                {isPaid && periodEnd && (
                  <p className="text-sm text-muted-foreground">
                    {status.data?.cancelAtPeriodEnd ? "Ends" : "Renews"} on {periodEnd.toLocaleDateString()}
                  </p>
                )}
                {awaitingUpgrade && !isPaid && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Confirming your payment with Stripe…
                  </p>
                )}
              </div>
              {status.data?.hasBillingAccount && (
                <Button variant="outline" onClick={() => portal.mutate()} disabled={portal.isPending}>
                  {portal.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                  Manage Billing
                </Button>
              )}
            </div>

            {!isPaid && (
              <div className="grid gap-3 sm:grid-cols-2">
                {PLANS.map((plan) => (
                  <div key={plan.id} className="border rounded-lg p-4 space-y-3">
                    <div>
                      <p className="font-semibold">{plan.name}</p>
                      <p className="text-sm text-muted-foreground">{plan.blurb}</p>
                    </div>
                    <p className="text-2xl font-bold">
                      ${plan.price}
                      <span className="text-sm font-normal text-muted-foreground">/mo</span>
                    </p>
                    <Button
                      className="w-full"
                      onClick={() => checkout.mutate({ tierId: plan.id })}
                      disabled={checkout.isPending || awaitingUpgrade}
                    >
                      {checkout.isPending && checkout.variables?.tierId === plan.id ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : null}
                      Upgrade to {plan.name}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {history.data && history.data.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Invoices</p>
                <ul className="divide-y border rounded-lg">
                  {history.data.map((invoice) => (
                    <li key={invoice.id} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span>{new Date(invoice.date).toLocaleDateString()}</span>
                      <span className="tabular-nums">${invoice.amount.toFixed(2)}</span>
                      <span className="capitalize text-muted-foreground">{invoice.status}</span>
                      {invoice.pdfUrl ? (
                        <a href={invoice.pdfUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          View
                        </a>
                      ) : (
                        <span />
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, ExternalLink, Loader2, ShoppingBag } from "lucide-react";
import { useParams } from "wouter";
import { toast } from "sonner";

/** Public checkout page for a seller's product. No IvorVerse account needed. */
export default function ProductPage() {
  const params = useParams<{ id: string }>();
  const productId = Number(params.id);
  const sessionId = new URLSearchParams(window.location.search).get("session_id");

  const product = trpc.monetization.getPublicProduct.useQuery(
    { productId },
    { enabled: Number.isInteger(productId) && productId > 0, retry: false }
  );
  const purchase = trpc.monetization.getPurchase.useQuery(
    { productId, sessionId: sessionId ?? "" },
    { enabled: Boolean(sessionId), retry: 2 }
  );
  const checkout = trpc.monetization.checkout.useMutation({
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        {product.isLoading ? (
          <CardContent className="py-16 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </CardContent>
        ) : !product.data ? (
          <CardContent className="py-16 text-center text-muted-foreground">
            <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-50" />
            This product isn't available.
          </CardContent>
        ) : sessionId ? (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                Thanks for your purchase!
              </CardTitle>
              <CardDescription>{product.data.name}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {purchase.isLoading ? (
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Confirming your payment…
                </p>
              ) : purchase.data ? (
                purchase.data.deliveryUrl ? (
                  <>
                    <Button asChild className="w-full">
                      <a href={purchase.data.deliveryUrl} target="_blank" rel="noreferrer">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Access your purchase
                      </a>
                    </Button>
                    <p className="text-xs text-muted-foreground">We've also emailed you this link.</p>
                  </>
                ) : (
                  <p className="text-sm">The seller will contact you with access details at your checkout email.</p>
                )
              ) : (
                <p className="text-sm text-muted-foreground">
                  We couldn't confirm this payment yet. If you were charged, check your email for your access link.
                </p>
              )}
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="text-2xl">{product.data.name}</CardTitle>
              <CardDescription>by {product.data.sellerName}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {product.data.description && (
                <p className="text-sm whitespace-pre-wrap">{product.data.description}</p>
              )}
              <p className="text-3xl font-bold">
                ${product.data.price?.toFixed(2)}
                {product.data.recurring && <span className="text-base font-normal text-muted-foreground">/month</span>}
              </p>
              {product.data.purchasable ? (
                <Button
                  size="lg"
                  className="w-full"
                  onClick={() => checkout.mutate({ productId })}
                  disabled={checkout.isPending}
                >
                  {checkout.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  {product.data.recurring ? "Subscribe" : "Buy now"}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">This product isn't available for purchase yet.</p>
              )}
              <p className="text-xs text-muted-foreground text-center">Secure checkout by Stripe</p>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}

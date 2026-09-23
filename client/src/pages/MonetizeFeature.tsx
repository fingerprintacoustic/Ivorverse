import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Copy, ExternalLink, Loader2, Pencil, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const PRODUCT_TYPES = [
  { value: "digital", label: "Digital product" },
  { value: "subscription", label: "Subscription (monthly)" },
  { value: "course", label: "Course" },
  { value: "ebook", label: "eBook" },
  { value: "saas", label: "SaaS" },
] as const;
type ProductType = (typeof PRODUCT_TYPES)[number]["value"];

type Draft = {
  productId: number | null;
  name: string;
  type: ProductType;
  price: string;
  description: string;
  deliveryUrl: string;
  published: boolean;
};
const emptyDraft = (): Draft => ({
  productId: null,
  name: "",
  type: "digital",
  price: "",
  description: "",
  deliveryUrl: "",
  published: false,
});

const money = (n: number) => (n < 0 ? `-$${Math.abs(n).toFixed(2)}` : `$${n.toFixed(2)}`);

const SALE_LABELS: Record<string, string> = {
  subscription: " (first month)",
  renewal: " (renewal)",
  refund: " (refund)",
  dispute: " (dispute)",
  dispute_reversal: " (dispute won)",
};

function SellerStatusCard() {
  const utils = trpc.useUtils();
  const status = trpc.monetization.sellerStatus.useQuery();
  const onboarding = trpc.monetization.startOnboarding.useMutation({
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
    onError: (error) => toast.error(error.message),
  });
  const dashboard = trpc.monetization.sellerDashboardLink.useMutation({
    onSuccess: ({ url }) => {
      window.open(url, "_blank", "noopener");
    },
    onError: (error) => toast.error(error.message),
  });

  // Returning from Stripe onboarding: refresh status and tidy the URL
  useEffect(() => {
    const connect = new URLSearchParams(window.location.search).get("connect");
    if (!connect) return;
    window.history.replaceState(null, "", window.location.pathname);
    utils.monetization.sellerStatus.invalidate();
    if (connect === "refresh") toast.info("Your Stripe setup link expired. Continue setup to get a new one.");
  }, [utils]);

  const s = status.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payments</CardTitle>
        <CardDescription>
          Buyers pay you through your own Stripe account. Stripe handles payouts to your bank
          {s && s.platformFeePercent > 0 ? `; IvorVerse keeps a ${s.platformFeePercent}% platform fee` : ""}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {status.isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        ) : status.isError ? (
          <p className="text-sm text-destructive">Couldn't load your Stripe status: {status.error.message}</p>
        ) : s?.chargesEnabled ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              Stripe connected — you can accept payments.
            </p>
            <Button variant="outline" onClick={() => dashboard.mutate()} disabled={dashboard.isPending}>
              <ExternalLink className="w-4 h-4 mr-2" />
              Payouts &amp; Refunds
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {s?.connected
                ? "Your Stripe setup isn't finished yet, so buyers can't pay you."
                : "Connect a Stripe account to start selling. It takes a few minutes."}
            </p>
            <Button onClick={() => onboarding.mutate()} disabled={onboarding.isPending}>
              {onboarding.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {s?.connected ? "Continue Stripe Setup" : "Connect Stripe"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function MonetizeFeature() {
  const [draft, setDraft] = useState<Draft | null>(null);

  const { data: products, refetch } = trpc.monetization.listProducts.useQuery();
  const { data: sales } = trpc.monetization.recentSales.useQuery();
  const { data: seller } = trpc.monetization.sellerStatus.useQuery();

  const onSaved = (message: string) => {
    setDraft(null);
    refetch();
    toast.success(message);
  };
  const createMutation = trpc.monetization.createProduct.useMutation({
    onSuccess: () => onSaved("Product created"),
    onError: (error) => toast.error(`Failed to save product: ${error.message}`),
  });
  const updateMutation = trpc.monetization.updateProduct.useMutation({
    onSuccess: () => onSaved("Product saved"),
    onError: (error) => toast.error(`Failed to save product: ${error.message}`),
  });
  const deleteMutation = trpc.monetization.deleteProduct.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Product deleted");
    },
    onError: (error) => toast.error(error.message),
  });

  const priceNumber = draft ? Number(draft.price) : NaN;
  const draftValid = draft !== null && draft.name.trim() !== "" && priceNumber >= 1 && priceNumber <= 10000;
  const saving = createMutation.isPending || updateMutation.isPending;

  const handleSave = () => {
    if (!draft || !draftValid) return;
    const payload = {
      name: draft.name,
      type: draft.type,
      price: Math.round(priceNumber * 100) / 100,
      description: draft.description || undefined,
      deliveryUrl: draft.deliveryUrl.trim() || undefined,
      published: draft.published,
    };
    if (draft.productId === null) createMutation.mutate(payload);
    else updateMutation.mutate({ productId: draft.productId, ...payload });
  };

  const productUrl = (id: number) => `${window.location.origin}/p/${id}`;
  const totalRevenue = (products ?? []).reduce((sum, p) => sum + p.revenue, 0);

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Monetization</h1>
            <p className="text-muted-foreground mt-2">
              Sell digital products, courses, and subscriptions with a shareable checkout link
            </p>
          </div>
          <Button onClick={() => setDraft(emptyDraft())}>
            <Plus className="w-4 h-4 mr-2" />
            New Product
          </Button>
        </div>

        <SellerStatusCard />

        {!products || products.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12 text-muted-foreground">
              <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-50" />
              No products yet. Create one to get started.
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Total revenue: <span className="font-semibold text-foreground">{money(totalRevenue)}</span>
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map((product) => (
                <Card key={product.id} className="flex flex-col">
                  <CardHeader className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg">{product.name}</CardTitle>
                      <Badge variant={product.published ? "default" : "outline"}>
                        {product.published ? "Live" : "Draft"}
                      </Badge>
                    </div>
                    <p className="text-lg font-semibold">
                      {product.price != null ? money(product.price) : "No price"}
                      {product.type === "subscription" && (
                        <span className="text-sm font-normal text-muted-foreground">/mo</span>
                      )}
                    </p>
                    {product.description ? (
                      <CardDescription className="line-clamp-3">{product.description}</CardDescription>
                    ) : null}
                  </CardHeader>
                  <CardContent className="mt-auto space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {product.salesCount} {product.salesCount === 1 ? "sale" : "sales"} · {money(product.revenue)}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {product.published && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            navigator.clipboard
                              .writeText(productUrl(product.id))
                              .then(() => toast.success("Link copied"))
                              .catch(() => toast.error("Couldn't access the clipboard"))
                          }
                        >
                          <Copy className="w-3.5 h-3.5 mr-1.5" />
                          Copy Link
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Edit product"
                        onClick={() =>
                          setDraft({
                            productId: product.id,
                            name: product.name,
                            type: product.type,
                            price: product.price != null ? String(product.price) : "",
                            description: product.description ?? "",
                            deliveryUrl: product.deliveryUrl ?? "",
                            published: Boolean(product.published),
                          })
                        }
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label="Delete product"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (confirm(`Delete "${product.name}"? Its checkout link will stop working.`)) {
                            deleteMutation.mutate({ productId: product.id });
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {sales && sales.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Sales</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {sales.map((sale, i) => (
                  <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="font-medium">{sale.productName}</span>
                    <span className="text-muted-foreground">{sale.buyerEmail ?? "Unknown buyer"}</span>
                    <span className={`tabular-nums ${sale.amount < 0 ? "text-destructive" : ""}`}>
                      {money(sale.amount)}
                      {SALE_LABELS[sale.mode] ?? ""}
                    </span>
                    <span className="text-muted-foreground">{new Date(sale.createdAt).toLocaleDateString()}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.productId ? "Edit Product" : "Create Product"}</DialogTitle>
            <DialogDescription>Buyers see the name, price, and description.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <Input
                placeholder="Product name"
                value={draft.name}
                maxLength={200}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Select value={draft.type} onValueChange={(v) => setDraft({ ...draft, type: v as ProductType })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={1}
                  max={10000}
                  step="0.01"
                  placeholder={draft.type === "subscription" ? "Price / month (USD)" : "Price (USD)"}
                  value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                />
              </div>
              <Textarea
                placeholder="Description"
                value={draft.description}
                maxLength={5000}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                rows={3}
              />
              <div className="space-y-1.5">
                <Label htmlFor="delivery-url">Delivery link (private)</Label>
                <Input
                  id="delivery-url"
                  type="url"
                  placeholder="https://… download, course, or app link buyers get after paying"
                  value={draft.deliveryUrl}
                  onChange={(e) => setDraft({ ...draft, deliveryUrl: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Shown to buyers only after payment, and emailed to them.
                </p>
              </div>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <span className="font-medium">Published</span>
                  <span className="block text-xs text-muted-foreground">
                    {seller?.chargesEnabled
                      ? "Anyone with the link can buy it."
                      : "Connect Stripe to take payments; until then the page shows it as unavailable."}
                  </span>
                </span>
                <Switch checked={draft.published} onCheckedChange={(published) => setDraft({ ...draft, published })} />
              </label>
              {draft.price !== "" && !(priceNumber >= 1 && priceNumber <= 10000) && (
                <p className="text-sm text-destructive">Price must be between $1 and $10,000.</p>
              )}
              <Button onClick={handleSave} disabled={!draftValid || saving} className="w-full">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {draft.productId ? "Save Changes" : "Create Product"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { DollarSign, Loader2, Plus, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const PRODUCT_TYPES = [
  { value: "digital", label: "Digital product" },
  { value: "subscription", label: "Subscription" },
  { value: "course", label: "Course" },
  { value: "ebook", label: "eBook" },
  { value: "saas", label: "SaaS" },
] as const;

export default function MonetizeFeature() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<(typeof PRODUCT_TYPES)[number]["value"]>("digital");
  const [price, setPrice] = useState("");

  const { data: products, refetch } = trpc.monetization.listProducts.useQuery();

  const createMutation = trpc.monetization.createProduct.useMutation({
    onSuccess: () => {
      setName("");
      setDescription("");
      setPrice("");
      setDialogOpen(false);
      refetch();
      toast.success("Product created");
    },
    onError: (error) => toast.error(`Failed to create product: ${error.message}`),
  });

  const handleCreate = () => {
    if (!name.trim()) return;
    createMutation.mutate({
      name,
      type,
      description: description || undefined,
      price: price ? Number(price) : undefined,
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Monetization</h1>
            <p className="text-muted-foreground mt-2">
              List products, subscriptions, and courses you're selling
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Product
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Product</DialogTitle>
                <DialogDescription>Add a product to your catalog.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  placeholder="Product name..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
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
                  placeholder="Price (optional)"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
                <Textarea
                  placeholder="Description (optional)..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
                <Button
                  onClick={handleCreate}
                  disabled={!name.trim() || createMutation.isPending}
                  className="w-full"
                >
                  {createMutation.isPending ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  Create Product
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {!products || products.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12 text-muted-foreground">
              <ShoppingBag className="w-10 h-10 mx-auto mb-3 opacity-50" />
              No products yet. Create one to get started.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((product) => (
              <Card key={product.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{product.name}</CardTitle>
                    <Badge variant="outline">{product.type}</Badge>
                  </div>
                  {product.description ? (
                    <CardDescription>{product.description}</CardDescription>
                  ) : null}
                </CardHeader>
                {product.price != null ? (
                  <CardContent>
                    <div className="flex items-center text-lg font-semibold">
                      <DollarSign className="w-4 h-4" />
                      {product.price}
                    </div>
                  </CardContent>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

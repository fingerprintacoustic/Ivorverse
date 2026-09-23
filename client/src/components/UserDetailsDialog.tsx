import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";

const fmtDate = (d: Date | string | null | undefined) => (d ? new Date(d).toLocaleDateString() : "—");

/** Admin view of one user: account, plan, and this month's usage. */
export function UserDetailsDialog({ userId, onClose }: { userId: number | null; onClose: () => void }) {
  const { data, isLoading, error } = trpc.admin.getUserDetails.useQuery(
    { userId: userId ?? 0 },
    { enabled: userId !== null }
  );

  return (
    <Dialog open={userId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data?.user.name || data?.user.email || "User"}</DialogTitle>
          <DialogDescription>{data?.user.email}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        ) : error ? (
          <p className="text-sm text-destructive">{error.message}</p>
        ) : data ? (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Badge variant={data.user.role === "admin" ? "default" : "secondary"}>{data.user.role}</Badge>
              <Badge variant="outline" className="capitalize">
                {data.user.subscriptionTier} plan
              </Badge>
              {data.user.disabled && <Badge variant="destructive">Disabled</Badge>}
              {!data.user.emailVerified && <Badge variant="outline">Email unverified</Badge>}
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Joined</dt>
              <dd>{fmtDate(data.user.createdAt)}</dd>
              <dt className="text-muted-foreground">Last sign-in</dt>
              <dd>{fmtDate(data.user.lastSignedIn)}</dd>
              <dt className="text-muted-foreground">Projects</dt>
              <dd>{data.projectCount}</dd>
              <dt className="text-muted-foreground">Subscription</dt>
              <dd className="capitalize">
                {data.subscription
                  ? `${data.subscription.status}${data.subscription.cancelAtPeriodEnd ? " (cancels at period end)" : ""}`
                  : "None"}
              </dd>
              {data.subscription?.currentPeriodEnd && (
                <>
                  <dt className="text-muted-foreground">Renews / ends</dt>
                  <dd>{fmtDate(data.subscription.currentPeriodEnd)}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Selling</dt>
              <dd>{data.user.stripeChargesEnabled ? "Stripe connected" : data.user.stripeConnectAccountId ? "Setup unfinished" : "No"}</dd>
            </dl>

            <div className="space-y-3">
              <p className="text-sm font-medium">Usage this month</p>
              {data.usage.items.map((item) => {
                const unlimited = item.limit === -1;
                return (
                  <div key={item.key} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{item.label}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {unlimited ? `${item.used} · unlimited` : `${item.used} / ${item.limit}`}
                      </span>
                    </div>
                    {!unlimited && <Progress value={Math.min(100, (item.used / Math.max(1, item.limit)) * 100)} />}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

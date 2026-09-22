import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { BillingCard } from "@/components/BillingCard";

export default function Settings() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [displayName, setDisplayName] = useState(user?.name || "");
  const updateProfile = trpc.auth.updateProfile.useMutation();
  const isSaving = updateProfile.isPending;

  // user loads asynchronously; sync the field once it arrives
  useEffect(() => {
    setDisplayName(user?.name || "");
  }, [user?.name]);

  const handleSaveProfile = async () => {
    try {
      await updateProfile.mutateAsync({ name: displayName });
      await utils.auth.me.invalidate();
      toast.success("Profile updated successfully");
    } catch (error) {
      toast.error("Failed to update profile");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 py-8">
      {/* Account Information */}
      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>
            View and manage your account details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                value={user?.email || ""}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Your email address cannot be changed
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Display Name</Label>
              <Input
                id="name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your display name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Account Role</Label>
              <Input
                id="role"
                type="text"
                value={user?.role === 'admin' ? 'Administrator' : 'User'}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Your account role is managed by administrators
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subscription">Subscription Tier</Label>
              <Input
                id="subscription"
                type="text"
                value={user?.subscriptionTier ? user.subscriptionTier.charAt(0).toUpperCase() + user.subscriptionTier.slice(1) : 'Free'}
                disabled
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="joined">Member Since</Label>
              <Input
                id="joined"
                type="text"
                value={user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : ''}
                disabled
                className="bg-muted"
              />
            </div>
          </div>

          <Button
            onClick={handleSaveProfile}
            disabled={isSaving || !displayName.trim() || displayName === user?.name}
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </CardContent>
      </Card>

      <Separator />

      <BillingCard />

      <Separator />

      {/* Security Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>
            Manage your account security settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Session Management</p>
              <p className="text-sm text-muted-foreground">
                Sign out from all devices
              </p>
            </div>
            <Button variant="outline" disabled>
              Sign Out All Devices
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Account Deletion */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible actions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Delete Account</p>
              <p className="text-sm text-muted-foreground">
                Permanently delete your account and all associated data
              </p>
            </div>
            <Button variant="destructive" disabled>
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

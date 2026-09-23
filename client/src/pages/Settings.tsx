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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";

/** Both actions end the current session; send the browser home fresh. */
function leaveApp(path: string) {
  window.location.href = path;
}

function SignOutEverywhereButton() {
  const [open, setOpen] = useState(false);
  const signOut = trpc.auth.signOutEverywhere.useMutation({
    onSuccess: () => leaveApp("/login"),
    onError: (error) => toast.error(error.message),
  });
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Sign Out All Devices
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out everywhere?</AlertDialogTitle>
            <AlertDialogDescription>
              Every session on every device is ended, including this one. You'll need to log in again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button onClick={() => signOut.mutate()} disabled={signOut.isPending}>
              {signOut.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Sign Out Everywhere
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DeleteAccountButton() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const deleteAccount = trpc.auth.deleteAccount.useMutation({
    onSuccess: () => leaveApp("/"),
    onError: (error) => toast.error(error.message),
  });
  return (
    <>
      <Button variant="destructive" onClick={() => setOpen(true)}>
        Delete Account
      </Button>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setPassword("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account permanently?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>This can't be undone. It will:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Cancel any paid subscription immediately</li>
                  <li>Delete your projects, chats, characters, agents, workflows, and uploaded files</li>
                  <li>Take your products off sale and delete their sales records</li>
                </ul>
                <p>Payouts already in your connected Stripe account stay with Stripe.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-password">Enter your password to confirm</Label>
            <Input
              id="delete-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!password || deleteAccount.isPending}
              onClick={(e) => {
                e.preventDefault(); // keep the dialog open until the server answers
                deleteAccount.mutate({ password });
              }}
            >
              {deleteAccount.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Delete Everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

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
            <SignOutEverywhereButton />
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
            <DeleteAccountButton />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

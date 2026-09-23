import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { UserDetailsDialog } from "@/components/UserDetailsDialog";

export default function UserManagement() {
  const { user } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [viewUserId, setViewUserId] = useState<number | null>(null);

  // Hooks must run before the early return below (rules of hooks)
  const isAdmin = user?.role === "admin";
  const { data: users, isLoading, refetch } = trpc.admin.listUsers.useQuery(undefined, { enabled: isAdmin });
  const disableUserMutation = trpc.admin.disableUser.useMutation();
  const enableUserMutation = trpc.admin.enableUser.useMutation({
    onSuccess: () => {
      toast.success("User re-enabled");
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You do not have permission to access this page
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleDisableUser = async (userId: number) => {
    try {
      await disableUserMutation.mutateAsync({ userId });
      toast.success("User disabled and signed out");
      setShowDisableDialog(false);
      setSelectedUserId(null);
      refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disable user");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-8 py-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
        <p className="text-muted-foreground mt-2">
          Manage all users and their permissions
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
          <CardDescription>
            Total users: {users?.length || 0}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users && users.length > 0 ? (
                  users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name || "-"}</TableCell>
                      <TableCell>{u.email || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                          {u.role === 'admin' ? 'Admin' : 'User'}
                        </Badge>
                        {u.disabled && (
                          <Badge variant="destructive" className="ml-1">
                            Disabled
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {u.subscriptionTier ? u.subscriptionTier.charAt(0).toUpperCase() + u.subscriptionTier.slice(1) : 'Free'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(u.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="outline" size="sm" onClick={() => setViewUserId(u.id)}>
                          View
                        </Button>
                        {u.id !== user.id &&
                          (u.disabled ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={enableUserMutation.isPending}
                              onClick={() => enableUserMutation.mutate({ userId: u.id })}
                            >
                              Enable
                            </Button>
                          ) : (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                setSelectedUserId(u.id);
                                setShowDisableDialog(true);
                              }}
                            >
                              Disable
                            </Button>
                          ))}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No users found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable User</AlertDialogTitle>
            <AlertDialogDescription>
              They'll be signed out everywhere and won't be able to log in until re-enabled. Their
              subscription isn't changed — cancel or refund it in Stripe if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedUserId) {
                  handleDisableUser(selectedUserId);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disable User
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      <UserDetailsDialog userId={viewUserId} onClose={() => setViewUserId(null)} />
    </div>
  );
}

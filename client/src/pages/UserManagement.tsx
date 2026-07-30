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

export default function UserManagement() {
  const { user } = useAuth();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [showDisableDialog, setShowDisableDialog] = useState(false);

  // Check if user is admin
  if (user?.role !== 'admin') {
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

  const { data: users, isLoading } = trpc.admin.listUsers.useQuery();
  const disableUserMutation = trpc.admin.disableUser.useMutation();

  const handleDisableUser = async (userId: number) => {
    try {
      await disableUserMutation.mutateAsync({ userId });
      toast.success("User disabled successfully");
      setShowDisableDialog(false);
      setSelectedUserId(null);
    } catch (error) {
      toast.error("Failed to disable user");
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
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {u.subscriptionTier ? u.subscriptionTier.charAt(0).toUpperCase() + u.subscriptionTier.slice(1) : 'Free'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(u.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {u.id !== user.id && (
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
                        )}
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
              Are you sure you want to disable this user? They will not be able to access their account.
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
    </div>
  );
}

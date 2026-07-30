import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { trpc } from "@/lib/trpc";
import { Users, TrendingUp, DollarSign, BarChart3 } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect } from "react";

export default function AdminDashboard() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  
  const { data: users } = trpc.admin.listUsers.useQuery(undefined, {
    enabled: user?.role === "admin",
  });
  
  // Redirect non-admins using useEffect (not during render)
  useEffect(() => {
    if (!loading && user && user.role !== "admin") {
      setLocation("/dashboard");
    }
  }, [user, loading, setLocation]);

  // Show loading state while checking auth
  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <Spinner />
        </div>
      </DashboardLayout>
    );
  }

  // Show placeholder while redirecting non-admins
  if (!user || user.role !== "admin") {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <p className="text-muted-foreground">Redirecting...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Mock stats for now
  const stats = {
    totalUsers: users?.length || 0,
    newUsersThisMonth: 0,
    monthlyRevenue: 0,
    activeSubscriptions: 0,
    churnRate: 0,
    canceledThisMonth: 0,
    totalApiCalls: 0,
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Manage users, subscriptions, and monitor platform usage
          </p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="w-4 h-4" />
                Total Users
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalUsers}</div>
              <p className="text-xs text-muted-foreground">
                {stats.newUsersThisMonth} new this month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Monthly Revenue
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats.monthlyRevenue}</div>
              <p className="text-xs text-muted-foreground">
                {stats.activeSubscriptions} active subscriptions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Churn Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.churnRate}%</div>
              <p className="text-xs text-muted-foreground">
                {stats.canceledThisMonth} canceled this month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                API Calls
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalApiCalls}</div>
              <p className="text-xs text-muted-foreground">
                This month
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Admin Tabs */}
        <Tabs defaultValue="users" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="users">Users</TabsTrigger>
            <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>
                  View and manage all users on the platform
                </CardDescription>
              </CardHeader>
              <CardContent>
                {users && users.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {users.map((u) => (
                          <TableRow key={u.id}>
                            <TableCell>{u.name || "N/A"}</TableCell>
                            <TableCell>{u.email || "N/A"}</TableCell>
                            <TableCell>
                              <span className="capitalize px-2 py-1 rounded bg-secondary text-secondary-foreground text-xs">
                                {u.role}
                              </span>
                            </TableCell>
                            <TableCell>
                              {new Date(u.createdAt).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              <Button size="sm" variant="outline">
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No users found
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="subscriptions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Subscription Management</CardTitle>
                <CardDescription>
                  Manage user subscriptions and billing
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  Subscription management coming soon
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Platform Analytics</CardTitle>
                <CardDescription>
                  View platform usage and performance metrics
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  Analytics dashboard coming soon
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

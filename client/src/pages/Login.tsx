import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { safeNextPath, takePendingPlan } from "@/const";

export default function Login() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const loginMutation = trpc.auth.login.useMutation();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const result = await loginMutation.mutateAsync({
        email,
        password,
      });

      if (result.success) {
        // Back to where they were sent from, else on to checkout for a plan
        // picked on the Home page, else the dashboard.
        const next = safeNextPath(new URLSearchParams(window.location.search).get("next"));
        const plan = next ? null : takePendingPlan();
        setLocation(next ?? (plan ? `/settings?upgrade=${plan}` : "/dashboard"));
      }
    } catch (err: any) {
      setError(err.message || "Failed to log in");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-black flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-slate-900 border-indigo-500/20">
        <CardHeader>
          <CardTitle>Welcome Back</CardTitle>
          <CardDescription>Sign in to your IvorVerse AI account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            {error && (
              <Alert className="border-red-500/30 bg-red-500/10">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <AlertDescription className="text-red-400">{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Email</label>
              <Input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Password</label>
              <Input
                type="password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={isLoading || loginMutation.isPending}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              {isLoading || loginMutation.isPending ? "Signing in..." : "Sign In"}
            </Button>

            <div className="space-y-2 text-center text-sm">
              <div>
                <button
                  type="button"
                  onClick={() => setLocation("/forgot-password")}
                  className="text-indigo-400 hover:text-indigo-300 font-medium"
                >
                  Forgot password?
                </button>
              </div>
              <div>
                <span className="text-slate-400">Don't have an account? </span>
                <button
                  type="button"
                  onClick={() => setLocation("/signup")}
                  className="text-indigo-400 hover:text-indigo-300 font-medium"
                >
                  Sign Up
                </button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

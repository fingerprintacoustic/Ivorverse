import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function ForgotPassword() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const requestResetMutation = trpc.auth.requestPasswordReset.useMutation();

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email) {
      setError("Email is required");
      return;
    }

    try {
      const result = await requestResetMutation.mutateAsync({ email });

      if (result.success) {
        setSuccess(true);
      }
    } catch (err: any) {
      setError(err.message || "Failed to request password reset");
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-black flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-900 border-indigo-500/20">
          <CardHeader>
            <CardTitle className="text-green-400 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Check Your Email
            </CardTitle>
            <CardDescription>Password reset instructions sent</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-green-500/30 bg-green-500/10">
              <AlertCircle className="h-4 w-4 text-green-400" />
              <AlertDescription className="text-green-400">
                If an account exists for <strong>{email}</strong>, we've sent password reset instructions to it
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <p className="text-sm text-slate-400">
                Click the link in your email to reset your password. The link will expire in 1 hour.
              </p>
            </div>

            <Button
              onClick={() => setLocation("/login")}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-black flex items-center justify-center p-4">
      <Card className="w-full max-w-md bg-slate-900 border-indigo-500/20">
        <CardHeader>
          <CardTitle>Reset Password</CardTitle>
          <CardDescription>Enter your email to receive reset instructions</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRequest} className="space-y-4">
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

            <Button
              type="submit"
              disabled={requestResetMutation.isPending}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              {requestResetMutation.isPending ? "Sending..." : "Send Reset Link"}
            </Button>

            <div className="text-center text-sm">
              <button
                type="button"
                onClick={() => setLocation("/login")}
                className="text-indigo-400 hover:text-indigo-300 font-medium"
              >
                Back to Login
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

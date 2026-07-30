import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const resetPasswordMutation = trpc.auth.resetPassword.useMutation();

  useEffect(() => {
    // Extract token from URL query parameter
    const params = new URLSearchParams(search);
    const tokenParam = params.get("token");
    if (tokenParam) {
      setToken(tokenParam);
    }
  }, [search]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("Invalid reset link");
      return;
    }

    if (!newPassword || !confirmPassword) {
      setError("All fields are required");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    try {
      const result = await resetPasswordMutation.mutateAsync({
        token,
        newPassword,
      });

      if (result.success) {
        setSuccess(true);
        // Redirect to login after 2 seconds
        setTimeout(() => {
          setLocation("/login");
        }, 2000);
      }
    } catch (err: any) {
      setError(err.message || "Failed to reset password");
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-black flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-900 border-indigo-500/20">
          <CardHeader>
            <CardTitle className="text-green-400 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Password Reset Successful
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-green-500/30 bg-green-500/10">
              <AlertCircle className="h-4 w-4 text-green-400" />
              <AlertDescription className="text-green-400">
                Your password has been reset successfully. Redirecting to login...
              </AlertDescription>
            </Alert>

            <Button
              onClick={() => setLocation("/login")}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              Go to Login
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
          <CardDescription>Enter your new password</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleReset} className="space-y-4">
            {error && (
              <Alert className="border-red-500/30 bg-red-500/10">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <AlertDescription className="text-red-400">{error}</AlertDescription>
              </Alert>
            )}

            {!token && (
              <Alert className="border-yellow-500/30 bg-yellow-500/10">
                <AlertCircle className="h-4 w-4 text-yellow-400" />
                <AlertDescription className="text-yellow-400">
                  No reset token found. Please check your email link.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">New Password</label>
              <Input
                type="password"
                placeholder="At least 8 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Confirm Password</label>
              <Input
                type="password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                required
              />
            </div>

            <Button
              type="submit"
              disabled={!token || resetPasswordMutation.isPending}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
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

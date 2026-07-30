import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function Signup() {
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [verificationToken, setVerificationToken] = useState("");

  const signupMutation = trpc.auth.signup.useMutation();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!email || !password || !confirmPassword) {
      setError("All fields are required");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    try {
      const result = await signupMutation.mutateAsync({
        email,
        password,
        name: name || undefined,
      });

      if (result.success) {
        setSuccess(true);
        setVerificationToken(result.verificationToken);
        // Clear form
        setEmail("");
        setPassword("");
        setConfirmPassword("");
        setName("");
      }
    } catch (err: any) {
      setError(err.message || "Failed to create account");
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-black flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-900 border-indigo-500/20">
          <CardHeader>
            <CardTitle className="text-green-400 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Account Created!
            </CardTitle>
            <CardDescription>Verify your email to continue</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-green-500/30 bg-green-500/10">
              <AlertCircle className="h-4 w-4 text-green-400" />
              <AlertDescription className="text-green-400">
                We've sent a verification link to <strong>{email}</strong>
              </AlertDescription>
            </Alert>

            <div className="bg-slate-800 p-4 rounded-lg border border-indigo-500/20">
              <p className="text-sm text-slate-400 mb-2">For testing, your verification token is:</p>
              <code className="text-xs text-indigo-300 break-all">{verificationToken}</code>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-slate-400">
                Click the link in your email to verify your account, then you can log in.
              </p>
            </div>

            <Button
              onClick={() => setLocation("/verify-email")}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              Go to Verification
            </Button>

            <Button
              onClick={() => setLocation("/login")}
              variant="outline"
              className="w-full border-indigo-500/30 hover:bg-indigo-500/10"
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
          <CardTitle>Create Account</CardTitle>
          <CardDescription>Join IvorVerse AI and start creating</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            {error && (
              <Alert className="border-red-500/30 bg-red-500/10">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <AlertDescription className="text-red-400">{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Name (Optional)</label>
              <Input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
              />
            </div>

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
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              disabled={signupMutation.isPending}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              {signupMutation.isPending ? "Creating account..." : "Sign Up"}
            </Button>

            <div className="text-center text-sm">
              <span className="text-slate-400">Already have an account? </span>
              <button
                type="button"
                onClick={() => setLocation("/login")}
                className="text-indigo-400 hover:text-indigo-300 font-medium"
              >
                Sign In
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

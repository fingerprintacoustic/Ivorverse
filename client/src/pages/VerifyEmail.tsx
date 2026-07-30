import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function VerifyEmail() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [token, setToken] = useState("");
  const [manualToken, setManualToken] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const verifyEmailMutation = trpc.auth.verifyEmail.useMutation();

  useEffect(() => {
    // Extract token from URL query parameter
    const params = new URLSearchParams(search);
    const tokenParam = params.get("token");
    if (tokenParam) {
      setToken(tokenParam);
      // Auto-verify if token is in URL
      handleVerify(tokenParam);
    }
  }, [search]);

  const handleVerify = async (verifyToken?: string) => {
    const tokenToUse = verifyToken || manualToken || token;
    setError("");

    if (!tokenToUse) {
      setError("Please enter your verification token");
      return;
    }

    setIsVerifying(true);

    try {
      const result = await verifyEmailMutation.mutateAsync({
        token: tokenToUse,
      });

      if (result.success) {
        setSuccess(true);
        // Redirect to login after 2 seconds
        setTimeout(() => {
          setLocation("/login");
        }, 2000);
      }
    } catch (err: any) {
      setError(err.message || "Failed to verify email");
    } finally {
      setIsVerifying(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-black flex items-center justify-center p-4">
        <Card className="w-full max-w-md bg-slate-900 border-indigo-500/20">
          <CardHeader>
            <CardTitle className="text-green-400 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Email Verified!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className="border-green-500/30 bg-green-500/10">
              <AlertCircle className="h-4 w-4 text-green-400" />
              <AlertDescription className="text-green-400">
                Your email has been verified successfully. Redirecting to login...
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
          <CardTitle>Verify Email</CardTitle>
          <CardDescription>Enter your verification token</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleVerify();
            }}
            className="space-y-4"
          >
            {error && (
              <Alert className="border-red-500/30 bg-red-500/10">
                <AlertCircle className="h-4 w-4 text-red-400" />
                <AlertDescription className="text-red-400">{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-300">Verification Token</label>
              <Input
                type="text"
                placeholder="Paste your verification token"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 font-mono text-xs"
              />
              <p className="text-xs text-slate-500">
                You received this token in your signup confirmation email
              </p>
            </div>

            <Button
              type="submit"
              disabled={isVerifying || verifyEmailMutation.isPending}
              className="w-full bg-indigo-600 hover:bg-indigo-700"
            >
              {isVerifying || verifyEmailMutation.isPending ? "Verifying..." : "Verify Email"}
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

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { authenticateUser } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const authFn = useServerFn(authenticateUser);
  const [step, setStep] = useState<"email" | "password">("email");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || "Failed to sign in with Google");
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || "Failed to sign in with Apple");
      setLoading(false);
    }
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setError(null);
    setStep("password");
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError(null);

    try {
      // Try to log in first
      let res: any = await authFn({ data: { email, password, action: "login" } });

      if (res.error) {
        if (res.code === "USER_NOT_FOUND") {
          // Auto-signup new user
          res = await authFn({ data: { email, password, action: "signup" } });
          if (res.error) throw new Error(res.error);
          localStorage.setItem("custom_session", JSON.stringify(res.user));
          window.dispatchEvent(new Event("auth_changed"));
          toast.success("Signup successful! You are now logged in.");
          navigate({ to: "/" });
        } else if (res.code === "BAD_PASSWORD") {
          throw new Error("Incorrect password. Please try again.");
        } else {
          throw new Error(res.error);
        }
      } else {
        localStorage.setItem("custom_session", JSON.stringify(res.user));
        window.dispatchEvent(new Event("auth_changed"));
        toast.success("Successfully logged in!");
        navigate({ to: "/" });
      }
    } catch (err: any) {
      const errMsg = err.message || "An error occurred during authentication.";
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4 py-12 relative overflow-hidden">
      {/* Background flair */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-accent/10 via-background to-background" />

      <div className="relative z-10 w-full max-w-[400px] border border-border bg-card rounded-2xl p-8 shadow-2xl flex flex-col items-center">
        
        {step === "email" ? (
          <>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground mb-2 text-center mt-2">
              Log in or sign up
            </h1>
            <p className="text-sm text-muted-foreground text-center mb-8 px-4">
              You'll get smarter responses and can upload files, images, and more.
            </p>

            <div className="w-full space-y-3 mb-6">
              <Button 
                variant="outline" 
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full h-12 bg-background hover:bg-accent/10 text-foreground border-border justify-center text-sm font-medium transition-colors"
              >
                <svg className="mr-3 size-4" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </Button>
              <Button 
                variant="outline" 
                onClick={handleAppleSignIn}
                disabled={loading}
                className="w-full h-12 bg-background hover:bg-accent/10 text-foreground border-border justify-center text-sm font-medium transition-colors"
              >
                <svg className="mr-3 size-4 fill-current text-foreground" viewBox="0 0 24 24" width="16" height="16">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C3.79 16.32 3.24 10.9 6.55 7.63c1.6-1.57 3.34-1.52 4.45-.98 1.25.6 2.08.57 3.12 0 1.27-.68 3-.8 4.2.43.8 1.02 1.48 2.37 1.48 4.38 0 4.19-2.58 6.22-2.75 8.82zm-2.86-15c-.1 2.3 1.94 4.12 4.13 3.98.24-2.45-1.92-4.32-4.13-3.98z"/>
                </svg>
                Continue with Apple
              </Button>
              <Button variant="outline" className="w-full h-12 bg-background hover:bg-accent/10 text-foreground border-border justify-center text-sm font-medium transition-colors">
                Continue with phone
              </Button>
            </div>

            <div className="flex w-full items-center gap-4 mb-6">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-medium text-muted-foreground">OR</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={handleEmailSubmit} className="w-full space-y-4">
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email address"
                className="h-14 rounded-xl border-border bg-transparent text-base text-foreground focus-visible:ring-accent placeholder:text-muted-foreground px-4"
              />
              <Button
                type="submit"
                disabled={!email}
                className="h-14 w-full rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-base font-semibold transition-colors disabled:opacity-50"
              >
                Continue
              </Button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground mb-2 text-center mt-2">
              Enter your password
            </h1>
            <p className="text-sm text-muted-foreground text-center mb-8 px-4">
              You'll use this password to log in to the app.
            </p>

            <form onSubmit={handlePasswordSubmit} className="w-full space-y-4">
              <div className="relative">
                <Input
                  type="email"
                  disabled
                  value={email}
                  className="h-14 rounded-xl border-border bg-transparent text-base text-muted-foreground pr-16 px-4"
                />
                <button
                  type="button"
                  onClick={() => setStep("email")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-accent hover:text-accent/80 font-medium"
                >
                  Edit
                </button>
              </div>

              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Password"
                  className={`h-14 rounded-xl bg-transparent text-base text-foreground focus-visible:ring-accent placeholder:text-muted-foreground px-4 pr-12 ${
                    error 
                      ? "border-destructive focus-visible:ring-destructive" 
                      : "border-border"
                  }`}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>

              {error && (
                <p className="text-xs text-destructive text-left font-medium px-1 animate-fadeIn">
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={loading || !password}
                className="h-14 w-full rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-base font-semibold transition-colors disabled:opacity-50 mt-2"
              >
                {loading ? <Loader2 className="size-5 animate-spin" /> : "Continue"}
              </Button>
            </form>

            <div className="flex w-full items-center gap-4 my-6">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs font-medium text-muted-foreground">OR</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Button variant="outline" className="w-full h-12 bg-transparent hover:bg-accent/10 text-muted-foreground border-border justify-center text-sm font-medium transition-colors mb-6 rounded-xl">
              Sign up with a one-time code
            </Button>

            <div className="text-center text-xs text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">Terms of Use</a>
              <span className="mx-2">|</span>
              <a href="#" className="hover:text-foreground transition-colors">Privacy Policy</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

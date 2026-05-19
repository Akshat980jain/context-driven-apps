import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { authenticateUser } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

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

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setStep("password");
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);

    try {
      try {
        // Try to log in first using our new custom backend
        const res = await authFn({ data: { email, password, action: "login" } });
        localStorage.setItem("custom_session", JSON.stringify(res.user));
        
        // Dispatch custom event so the index page knows auth changed
        window.dispatchEvent(new Event("auth_changed"));
        
        toast.success("Successfully logged in!");
        navigate({ to: "/" });
      } catch (signInError: any) {
        if (signInError.message?.includes("Invalid login credentials")) {
          // Attempt sign up as fallback
          const res = await authFn({ data: { email, password, action: "signup" } });
          localStorage.setItem("custom_session", JSON.stringify(res.user));
          
          window.dispatchEvent(new Event("auth_changed"));
          
          toast.success("Signup successful! You are now logged in.");
          navigate({ to: "/" });
        } else {
          throw signInError;
        }
      }
    } catch (error: any) {
      toast.error(error.message || "An error occurred during authentication.");
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
              <Button variant="outline" className="w-full h-12 bg-background hover:bg-accent/10 text-foreground border-border justify-center text-sm font-medium transition-colors">
                {/* SVG for Google could go here, omitting for simplicity */}
                Continue with Google
              </Button>
              <Button variant="outline" className="w-full h-12 bg-background hover:bg-accent/10 text-foreground border-border justify-center text-sm font-medium transition-colors">
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
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="h-14 rounded-xl border-border bg-transparent text-base text-foreground focus-visible:ring-accent placeholder:text-muted-foreground px-4 pr-12"
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

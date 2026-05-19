import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { User, Settings, Sparkles, UserCog, HelpCircle, Loader2, CheckCircle2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerFn } from "@tanstack/react-start";
import { updateUserProfile, deleteUserAccount, upgradeUserPlan } from "@/lib/auth.functions";
export function SettingsModal({ 
  open, 
  onOpenChange, 
  defaultTab = "profile" 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  defaultTab?: string;
}) {
  const [user, setUser] = useState<any>(null);
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);

  const updateFn = useServerFn(updateUserProfile);
  const deleteFn = useServerFn(deleteUserAccount);
  const upgradeFn = useServerFn(upgradeUserPlan);
  const [deleting, setDeleting] = useState(false);

  const handleUpgrade = async (plan: string) => {
    if (!user) {
      toast.error("Please log in to upgrade your plan.");
      return;
    }
    try {
      const res = await upgradeFn({ data: { id: user.id, plan } });
      localStorage.setItem("custom_session", JSON.stringify(res.user));
      setUser(res.user);
      window.dispatchEvent(new Event("auth_changed"));
      toast.success(`Successfully updated plan to ${plan}!`);
    } catch (err: any) {
      toast.error(err.message || "Failed to update plan");
    }
  };

  useEffect(() => {
    if (open) {
      const stored = localStorage.getItem("custom_session");
      if (stored) {
        const u = JSON.parse(stored);
        setUser(u);
        setFullName(u.user_metadata?.full_name || "");
      } else {
        setUser(null);
        setFullName("");
      }
    }
  }, [open]);

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const res = await updateFn({ data: { id: user.id, fullName } });
      // Update local storage
      localStorage.setItem("custom_session", JSON.stringify(res.user));
      setUser(res.user);
      
      // Dispatch event to update other components
      window.dispatchEvent(new Event("auth_changed"));
      
      toast.success("Profile updated successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async () => {
    if (!user) return;
    if (!window.confirm("Are you sure you want to completely delete your account? This action cannot be undone.")) return;
    
    setDeleting(true);
    try {
      await deleteFn({ data: { id: user.id } });
      localStorage.removeItem("custom_session");
      window.dispatchEvent(new Event("auth_changed"));
      onOpenChange(false);
      toast.success("Account deleted successfully.");
    } catch (err: any) {
      toast.error(err.message || "Failed to delete account");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden bg-card border-border text-foreground shadow-2xl rounded-2xl">
        <div className="flex h-[500px]">
          <Tabs defaultValue={defaultTab} className="flex w-full h-full">
            {/* Sidebar Navigation */}
            <div className="w-[200px] border-r border-border bg-background/50 p-4 space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground mb-4 px-2 uppercase tracking-wider">Settings</h2>
              <TabsList className="flex flex-col h-auto bg-transparent items-start space-y-1 p-0">
                <TabsTrigger value="profile" className="w-full justify-start gap-3 px-3 py-2.5 rounded-lg data-[state=active]:bg-accent/20 data-[state=active]:text-accent text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors">
                  <User className="size-4" /> Profile
                </TabsTrigger>
                <TabsTrigger value="personalization" className="w-full justify-start gap-3 px-3 py-2.5 rounded-lg data-[state=active]:bg-accent/20 data-[state=active]:text-accent text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors">
                  <UserCog className="size-4" /> Personalization
                </TabsTrigger>
                <TabsTrigger value="plan" className="w-full justify-start gap-3 px-3 py-2.5 rounded-lg data-[state=active]:bg-accent/20 data-[state=active]:text-accent text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors">
                  <Sparkles className="size-4" /> Upgrade Plan
                </TabsTrigger>
                <TabsTrigger value="settings" className="w-full justify-start gap-3 px-3 py-2.5 rounded-lg data-[state=active]:bg-accent/20 data-[state=active]:text-accent text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors">
                  <Settings className="size-4" /> General
                </TabsTrigger>
                <TabsTrigger value="help" className="w-full justify-start gap-3 px-3 py-2.5 rounded-lg data-[state=active]:bg-accent/20 data-[state=active]:text-accent text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors">
                  <HelpCircle className="size-4" /> Help & FAQ
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Content Area */}
            <div className="flex-1 p-8 overflow-y-auto bg-transparent">
              {/* Profile */}
              <TabsContent value="profile" className="m-0 space-y-6 outline-none">
                <DialogHeader className="mb-6">
                  <DialogTitle className="text-xl font-medium text-foreground">My Profile</DialogTitle>
                  <DialogDescription className="text-muted-foreground">Manage your account information and email.</DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 max-w-md">
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Email Address</Label>
                    <Input 
                      disabled 
                      value={user?.email || ""} 
                      className="bg-background/50 border-border text-muted-foreground opacity-70"
                    />
                    <p className="text-xs text-muted-foreground/70">Your email cannot be changed at this time.</p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Display Name</Label>
                    <Input 
                      value={fullName} 
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Akshat Jain"
                      className="bg-background/50 border-border text-foreground focus-visible:ring-accent"
                    />
                  </div>
                  
                  <Button 
                    onClick={saveProfile} 
                    disabled={saving || !user}
                    className="bg-accent hover:bg-accent/90 text-accent-foreground font-medium px-6 mt-4"
                  >
                    {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                    Save Changes
                  </Button>
                </div>
              </TabsContent>

              {/* Personalization */}
              <TabsContent value="personalization" className="m-0 space-y-6 outline-none">
                <DialogHeader className="mb-6">
                  <DialogTitle className="text-xl font-medium text-foreground">Personalization</DialogTitle>
                  <DialogDescription className="text-muted-foreground">Customize how your default AI generations are formatted.</DialogDescription>
                </DialogHeader>

                <div className="space-y-6 max-w-md">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-foreground">Default Tone</Label>
                    <Select defaultValue="Professional">
                      <SelectTrigger className="w-full bg-background/50 border-border">
                        <SelectValue placeholder="Select a tone" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border text-foreground">
                        <SelectItem value="Professional">Professional</SelectItem>
                        <SelectItem value="Casual">Casual</SelectItem>
                        <SelectItem value="Technical">Technical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-foreground">Default Format</Label>
                    <Select defaultValue="Deep Dive">
                      <SelectTrigger className="w-full bg-background/50 border-border">
                        <SelectValue placeholder="Select a format" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border text-foreground">
                        <SelectItem value="Deep Dive">Deep Dive</SelectItem>
                        <SelectItem value="Listicle">Listicle</SelectItem>
                        <SelectItem value="Summary">Summary</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <Button className="bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium">
                    Save Preferences
                  </Button>
                </div>
              </TabsContent>

              {/* Plan */}
              <TabsContent value="plan" className="m-0 outline-none">
                <DialogHeader className="mb-6">
                  <DialogTitle className="text-xl font-medium text-foreground">Subscription Plan</DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    You are currently on the <span className="font-semibold text-accent">{user?.user_metadata?.plan || "Free"}</span> plan.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid grid-cols-2 gap-4 mt-6">
                  <div className={`border rounded-xl p-5 relative overflow-hidden transition-all ${
                    (user?.user_metadata?.plan || "Free") === "Free" 
                      ? "border-accent/40 bg-accent/5 shadow-inner" 
                      : "border-border bg-background/50"
                  }`}>
                    <h3 className="text-lg font-semibold text-foreground mb-1">Free</h3>
                    <p className="text-2xl font-bold text-foreground mb-4">$0<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                    <ul className="space-y-2 text-sm text-muted-foreground mb-6">
                      <li className="flex gap-2"><CheckCircle2 className="size-4 text-muted-foreground/50" /> 15 generations / month</li>
                      <li className="flex gap-2"><CheckCircle2 className="size-4 text-muted-foreground/50" /> Standard AI models</li>
                      <li className="flex gap-2"><CheckCircle2 className="size-4 text-muted-foreground/50" /> Basic templates</li>
                    </ul>
                    <Button 
                      disabled={(user?.user_metadata?.plan || "Free") === "Free"} 
                      onClick={() => handleUpgrade("Free")} 
                      variant="outline" 
                      className="w-full border-border text-muted-foreground bg-transparent hover:bg-accent/10"
                    >
                      {(user?.user_metadata?.plan || "Free") === "Free" ? "Current Plan" : "Downgrade to Free"}
                    </Button>
                  </div>
                  
                  <div className={`border rounded-xl p-5 relative overflow-hidden transition-all ${
                    (user?.user_metadata?.plan || "Free") === "Pro" 
                      ? "border-accent/50 bg-accent/5 shadow-lg" 
                      : "border-border/50 bg-background/30"
                  }`}>
                    <div className="absolute top-0 right-0 bg-accent text-[10px] text-accent-foreground font-bold px-2 py-1 uppercase tracking-wider rounded-bl-lg">Popular</div>
                    <h3 className="text-lg font-semibold text-accent mb-1">Pro</h3>
                    <p className="text-2xl font-bold text-foreground mb-4">$15<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                    <ul className="space-y-2 text-sm text-muted-foreground mb-6">
                      <li className="flex gap-2 text-foreground"><CheckCircle2 className="size-4 text-accent" /> Unlimited generations</li>
                      <li className="flex gap-2 text-foreground"><CheckCircle2 className="size-4 text-accent" /> GPT-4o & Claude 3.5 Sonnet</li>
                      <li className="flex gap-2 text-foreground"><CheckCircle2 className="size-4 text-accent" /> Custom templates & webhooks</li>
                    </ul>
                    <Button 
                      disabled={(user?.user_metadata?.plan || "Free") === "Pro"}
                      onClick={() => handleUpgrade("Pro")} 
                      className="w-full bg-accent hover:bg-accent/90 text-accent-foreground disabled:bg-muted disabled:text-muted-foreground"
                    >
                      {(user?.user_metadata?.plan || "Free") === "Pro" ? "Current Plan" : "Upgrade Now"}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* General Settings */}
              <TabsContent value="settings" className="m-0 space-y-6 outline-none">
                <DialogHeader className="mb-6">
                  <DialogTitle className="text-xl font-medium text-foreground">General Settings</DialogTitle>
                  <DialogDescription className="text-muted-foreground">Configure app behavior and interface.</DialogDescription>
                </DialogHeader>
                
                <div className="space-y-6 max-w-md">
                  <div className="flex items-center justify-between border-b border-border pb-4">
                    <div>
                      <p className="font-medium text-sm text-foreground">Theme</p>
                      <p className="text-xs text-muted-foreground">Choose between light and dark mode.</p>
                    </div>
                    <Select defaultValue="dark">
                      <SelectTrigger className="w-[120px] bg-background/50 border-border">
                        <SelectValue placeholder="Theme" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border text-foreground">
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="system">System</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="flex items-center justify-between border-b border-border pb-4">
                    <div>
                      <p className="font-medium text-sm text-foreground">Delete Account</p>
                      <p className="text-xs text-muted-foreground">Permanently delete your account and all data.</p>
                    </div>
                    <Button 
                      onClick={deleteAccount}
                      disabled={deleting}
                      variant="destructive" 
                      className="bg-destructive/10 hover:bg-destructive text-destructive border border-destructive/20 hover:text-destructive-foreground"
                    >
                      {deleting ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                      Delete
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* Help */}
              <TabsContent value="help" className="m-0 space-y-6 outline-none">
                <DialogHeader className="mb-6">
                  <DialogTitle className="text-xl font-medium text-foreground">Help & Support</DialogTitle>
                  <DialogDescription className="text-muted-foreground">Get assistance and read FAQs.</DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4">
                  <div className="bg-background/50 border border-border rounded-lg p-4">
                    <h4 className="font-medium text-foreground mb-1">How does billing work?</h4>
                    <p className="text-sm text-muted-foreground">Your subscription is billed monthly. You can cancel at any time from the 'Plan' tab.</p>
                  </div>
                  <div className="bg-background/50 border border-border rounded-lg p-4">
                    <h4 className="font-medium text-foreground mb-1">How do I change my email?</h4>
                    <p className="text-sm text-muted-foreground">Currently, email changes require contacting support for security verification.</p>
                  </div>
                  <div className="mt-8">
                    <p className="text-sm text-muted-foreground mb-2">Still need help?</p>
                    <Button 
                      onClick={() => {
                        onOpenChange(false);
                        // Trigger opening of floating AI support chatbot widget
                        setTimeout(() => {
                          window.dispatchEvent(new Event("open_support_chat"));
                        }, 200);
                      }}
                      className="bg-accent text-accent-foreground hover:bg-accent/90 font-medium"
                    >
                      Contact Support Chatbot
                    </Button>
                  </div>
                </div>
              </TabsContent>

            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}

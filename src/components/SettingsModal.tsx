import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { User, Settings, Sparkles, UserCog, HelpCircle, Loader2, CheckCircle2, CreditCard, Lock, Smartphone, QrCode, Check, Globe } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServerFn } from "@tanstack/react-start";
import { useCustomDialog } from "@/hooks/use-custom-dialog";
import { updateUserProfile, deleteUserAccount, upgradeUserPlan, updateUserIntegrations, updateUserBrandVoice } from "@/lib/auth.functions";
export function SettingsModal({ 
  open, 
  onOpenChange, 
  defaultTab = "profile" 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  defaultTab?: string;
}) {
  const { showConfirm } = useCustomDialog();
  const [user, setUser] = useState<any>(null);
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  
  const [devtoKey, setDevtoKey] = useState("");
  const [mediumToken, setMediumToken] = useState("");
  const [hashnodeToken, setHashnodeToken] = useState("");
  const [savingIntegrations, setSavingIntegrations] = useState(false);

  // Brand Voice State definitions
  const [brandVoiceEnabled, setBrandVoiceEnabled] = useState(false);
  const [bvDepth, setBvDepth] = useState(50);
  const [bvExuberance, setBvExuberance] = useState(50);
  const [bvDirectness, setBvDirectness] = useState(50);
  const [bvPrefer, setBvPrefer] = useState("");
  const [bvAvoid, setBvAvoid] = useState("");
  const [bvSampleText, setBvSampleText] = useState("");
  const [savingBrandVoice, setSavingBrandVoice] = useState(false);

  const updateFn = useServerFn(updateUserProfile);
  const deleteFn = useServerFn(deleteUserAccount);
  const upgradeFn = useServerFn(upgradeUserPlan);
  const updateIntegrationsFn = useServerFn(updateUserIntegrations);
  const updateBrandVoiceFn = useServerFn(updateUserBrandVoice);
  const [deleting, setDeleting] = useState(false);

  const [showPayment, setShowPayment] = useState(false);
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [cardZip, setCardZip] = useState("");
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"card" | "upi">("card");
  const [upiId, setUpiId] = useState("");
  const [selectedUpiProvider, setSelectedUpiProvider] = useState<"gpay" | "phonepe" | "paytm" | "bhim" | "">("");
  const [paymentStatusText, setPaymentStatusText] = useState("Processing...");

  const upiIdVal = upiId || "cgndgtgh";
  const upiAppSuffixes: Record<string, string> = {
    gpay: "okaxis",
    phonepe: "ybl",
    paytm: "paytm",
    bhim: "upi"
  };
  const defaultSuffix = upiAppSuffixes[selectedUpiProvider] || "upi";
  const fullUpiId = upiIdVal.includes("@") ? upiIdVal : `${upiIdVal}@${defaultSuffix}`;
  const upiUrl = `upi://pay?pa=${encodeURIComponent(fullUpiId)}&pn=Scribe%20Pro&am=999&cu=INR`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiUrl)}`;

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || "";
    const parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length > 0) {
      return parts.join(" ");
    } else {
      return v.substring(0, 19);
    }
  };

  const formatExpiry = (value: string) => {
    const v = value.replace(/\s+/g, "").replace(/[^0-9]/gi, "");
    if (v.length >= 2) {
      return `${v.substring(0, 2)}/${v.substring(2, 4)}`;
    }
    return v.substring(0, 5);
  };

  const handleUpgrade = async (plan: string) => {
    if (!user) {
      toast.error("Please log in to upgrade your plan.");
      return;
    }
    if (plan === "Pro") {
      setShowPayment(true);
      return;
    }
    // Downgrade to free
    const confirmed = await showConfirm(
      "Are you sure you want to downgrade to the Free plan? Your usage will be capped at 10 generations and workspaces.",
      {
        title: "Downgrade Subscription",
        confirmText: "Yes, Downgrade",
        cancelText: "Keep Pro",
        isDestructive: true,
      }
    );
    if (!confirmed) return;
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await upgradeFn({ data: { id: user.id, plan, accessToken: token } });
      localStorage.setItem("custom_session", JSON.stringify(res.user));
      setUser(res.user);
      window.dispatchEvent(new Event("auth_changed"));
      toast.success("Downgraded to Free plan successfully.");
    } catch (err: any) {
      toast.error(err.message || "Failed to update plan");
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (paymentMethod === "card") {
      if (!cardNumber || !cardExpiry || !cardCvc || !cardZip) {
        toast.error("Please fill in all card details.");
        return;
      }
      setPaymentLoading(true);
      setPaymentStatusText("Verifying card...");
      
      setTimeout(() => {
        setPaymentStatusText("Authorizing transaction...");
      }, 1000);

      setTimeout(async () => {
        try {
          const token = (await supabase.auth.getSession()).data.session?.access_token;
          const res = await upgradeFn({ data: { id: user.id, plan: "Pro", accessToken: token } });
          localStorage.setItem("custom_session", JSON.stringify(res.user));
          setUser(res.user);
          window.dispatchEvent(new Event("auth_changed"));
          setShowPayment(false);
          // Clear payment fields
          setCardNumber("");
          setCardExpiry("");
          setCardCvc("");
          setCardZip("");
          toast.success("Payment successful! Welcome to Scribe Pro!");
        } catch (err: any) {
          toast.error(err.message || "Payment verification failed");
        } finally {
          setPaymentLoading(false);
        }
      }, 2500);
    } else {
      if (!selectedUpiProvider) {
        toast.error("Please select a UPI app.");
        return;
      }
      if (!upiId) {
        toast.error("Please enter your UPI ID.");
        return;
      }
      if (!upiId.includes("@")) {
        toast.error("Please enter a valid UPI ID (e.g. name@upi).");
        return;
      }

      setPaymentLoading(true);
      setPaymentStatusText("Connecting to UPI Gateway...");

      setTimeout(() => {
        const appNames = {
          gpay: "Google Pay",
          phonepe: "PhonePe",
          paytm: "Paytm",
          bhim: "BHIM"
        };
        const appName = appNames[selectedUpiProvider] || "UPI app";
        setPaymentStatusText(`Awaiting authorization on ${appName}...`);
      }, 1000);

      setTimeout(() => {
        setPaymentStatusText("Completing subscription setup...");
      }, 2000);

      setTimeout(async () => {
        try {
          const token = (await supabase.auth.getSession()).data.session?.access_token;
          const res = await upgradeFn({ data: { id: user.id, plan: "Pro", accessToken: token } });
          localStorage.setItem("custom_session", JSON.stringify(res.user));
          setUser(res.user);
          window.dispatchEvent(new Event("auth_changed"));
          setShowPayment(false);
          // Clear fields
          setUpiId("");
          setSelectedUpiProvider("");
          toast.success("UPI payment verified! Welcome to Scribe Pro!");
        } catch (err: any) {
          toast.error(err.message || "UPI payment verification failed");
        } finally {
          setPaymentLoading(false);
        }
      }, 3000);
    }
  };

  useEffect(() => {
    if (open) {
      const stored = localStorage.getItem("custom_session");
      if (stored) {
        const u = JSON.parse(stored);
        setUser(u);
        setFullName(u.user_metadata?.full_name || "");
        
        const ints = u.user_metadata?.integrations || {};
        setDevtoKey(ints.devto || "");
        setMediumToken(ints.medium || "");
        setHashnodeToken(ints.hashnode || "");

        // Load Brand Voice from user metadata
        const bv = u.user_metadata?.brand_voice || {};
        setBrandVoiceEnabled(bv.enabled || false);
        setBvDepth(bv.sliders?.depth ?? 50);
        setBvExuberance(bv.sliders?.exuberance ?? 50);
        setBvDirectness(bv.sliders?.directness ?? 50);
        setBvPrefer(bv.vocabulary?.prefer || "");
        setBvAvoid(bv.vocabulary?.avoid || "");
        setBvSampleText(bv.sampleText || "");
      } else {
        setUser(null);
        setFullName("");
        setDevtoKey("");
        setMediumToken("");
        setHashnodeToken("");

        // Guest local storage fallback
        const localBv = localStorage.getItem("guest_brand_voice");
        if (localBv) {
          const bv = JSON.parse(localBv);
          setBrandVoiceEnabled(bv.enabled || false);
          setBvDepth(bv.sliders?.depth ?? 50);
          setBvExuberance(bv.sliders?.exuberance ?? 50);
          setBvDirectness(bv.sliders?.directness ?? 50);
          setBvPrefer(bv.vocabulary?.prefer || "");
          setBvAvoid(bv.vocabulary?.avoid || "");
          setBvSampleText(bv.sampleText || "");
        } else {
          setBrandVoiceEnabled(false);
          setBvDepth(50);
          setBvExuberance(50);
          setBvDirectness(50);
          setBvPrefer("");
          setBvAvoid("");
          setBvSampleText("");
        }
      }
    }
  }, [open]);

  const saveIntegrations = async () => {
    if (!user) {
      toast.error("Please log in to configure integrations.");
      return;
    }
    setSavingIntegrations(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await updateIntegrationsFn({
        data: {
          id: user.id,
          devto: devtoKey,
          medium: mediumToken,
          hashnode: hashnodeToken,
          accessToken: token
        }
      });
      localStorage.setItem("custom_session", JSON.stringify(res.user));
      setUser(res.user);
      
      window.dispatchEvent(new Event("auth_changed"));
      toast.success("Blog publishing integrations saved successfully!");
    } catch (err: any) {
      toast.error(err.message || "Failed to save integrations");
    } finally {
      setSavingIntegrations(false);
    }
  };

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await updateFn({ data: { id: user.id, fullName, accessToken: token } });
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

  const saveBrandVoice = async () => {
    const bvData = {
      enabled: brandVoiceEnabled,
      vocabulary: {
        prefer: bvPrefer,
        avoid: bvAvoid
      },
      sliders: {
        depth: Number(bvDepth),
        exuberance: Number(bvExuberance),
        directness: Number(bvDirectness)
      },
      sampleText: bvSampleText
    };

    setSavingBrandVoice(true);
    try {
      if (user) {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        await updateBrandVoiceFn({
          data: {
            id: user.id,
            brandVoice: bvData,
            accessToken: token
          }
        });
        // Merge bvData into the stored session without dispatching auth_changed
        // (auth_changed would trigger a user re-read which could reset the toggle)
        const stored = localStorage.getItem("custom_session");
        if (stored) {
          const currentSession = JSON.parse(stored);
          const updatedSession = {
            ...currentSession,
            user_metadata: {
              ...(currentSession.user_metadata || {}),
              brand_voice: bvData
            }
          };
          localStorage.setItem("custom_session", JSON.stringify(updatedSession));
          setUser(updatedSession);
        }
        toast.success("Brand Voice Clone saved to cloud profile successfully!");
      } else {
        localStorage.setItem("guest_brand_voice", JSON.stringify(bvData));
        toast.success("Brand Voice Clone saved locally to guest browser!");
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save Brand Voice settings");
    } finally {
      setSavingBrandVoice(false);
    }
  };

  const deleteAccount = async () => {
    if (!user) return;
    const confirmed = await showConfirm(
      "Are you sure you want to permanently delete your account? All of your saved custom templates, workspace folders, and generation history will be lost forever. This action cannot be undone.",
      {
        title: "Permanently Delete Account",
        confirmText: "Delete My Account",
        cancelText: "Cancel",
        isDestructive: true,
      }
    );
    if (!confirmed) return;
    
    setDeleting(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      await deleteFn({ data: { id: user.id, accessToken: token } });
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
    <>
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
                <TabsTrigger value="integrations" className="w-full justify-start gap-3 px-3 py-2.5 rounded-lg data-[state=active]:bg-accent/20 data-[state=active]:text-accent text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors">
                  <Globe className="size-4" /> Integrations
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
                      placeholder="e.g. Jane Doe"
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

              {/* Personalization / Brand Voice Studio */}
              <TabsContent value="personalization" className="m-0 space-y-6 outline-none">
                <DialogHeader className="mb-4">
                  <DialogTitle className="text-xl font-medium text-foreground flex items-center gap-2">
                    <UserCog className="size-5 text-accent animate-pulse" />
                    Multi-Modal Brand Voice Clone
                  </DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    Train a custom AI writing persona. Scribe will mimic your exact tone parameters, vocabulary choices, and sentence rhythm during blog post generation.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 pb-6">
                  {/* Status Toggle Card */}
                  <div className={`p-4 rounded-xl border transition-all duration-300 ${brandVoiceEnabled ? 'bg-accent/10 border-accent/30 shadow-soft' : 'bg-background/40 border-border/40'}`}>
                    <div className="flex items-center justify-between">
                      <div className="space-y-1 pr-4">
                        <Label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                          🎙️ Voice Cloning Status
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {brandVoiceEnabled 
                            ? "Active — Scribe will apply your personal clone signature to new blog generations." 
                            : "Inactive — Generations will default to standard tone selections."}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBrandVoiceEnabled(!brandVoiceEnabled)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${brandVoiceEnabled ? 'bg-accent' : 'bg-muted'}`}
                      >
                        <span
                          className={`pointer-events-none inline-block size-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${brandVoiceEnabled ? 'translate-x-5' : 'translate-x-0'}`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Sliders Grid */}
                  <div className="space-y-4 bg-background/30 p-5 rounded-xl border border-border/40">
                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Style Dimension Vectors</h3>
                    
                    {/* Technical Depth */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <Label className="font-medium text-foreground">Technical Depth</Label>
                        <span className="text-accent font-semibold">{bvDepth}% ({bvDepth < 30 ? "Beginner" : bvDepth > 70 ? "Advanced Developer" : "Balanced"})</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={bvDepth} 
                        onChange={(e) => setBvDepth(Number(e.target.value))}
                        className="w-full h-1 bg-border rounded-lg appearance-none cursor-pointer accent-accent" 
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground/60 px-0.5">
                        <span>Beginner-friendly</span>
                        <span>Expert / Detailed</span>
                      </div>
                    </div>

                    {/* Exuberance / Energy */}
                    <div className="space-y-1.5 pt-2">
                      <div className="flex justify-between text-xs">
                        <Label className="font-medium text-foreground">Exuberance & Humor</Label>
                        <span className="text-accent font-semibold">{bvExuberance}% ({bvExuberance < 30 ? "Academic" : bvExuberance > 70 ? "Humorous / Casual" : "Warm"})</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={bvExuberance} 
                        onChange={(e) => setBvExuberance(Number(e.target.value))}
                        className="w-full h-1 bg-border rounded-lg appearance-none cursor-pointer accent-accent" 
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground/60 px-0.5">
                        <span>Strict / Factual</span>
                        <span>Casual / Highly Energetic</span>
                      </div>
                    </div>

                    {/* Directness / Clarity */}
                    <div className="space-y-1.5 pt-2">
                      <div className="flex justify-between text-xs">
                        <Label className="font-medium text-foreground">Directness & Pacing</Label>
                        <span className="text-accent font-semibold">{bvDirectness}% ({bvDirectness < 30 ? "Storyteller" : bvDirectness > 70 ? "Brief / Bullets" : "Standard"})</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="100" 
                        value={bvDirectness} 
                        onChange={(e) => setBvDirectness(Number(e.target.value))}
                        className="w-full h-1 bg-border rounded-lg appearance-none cursor-pointer accent-accent" 
                      />
                      <div className="flex justify-between text-[10px] text-muted-foreground/60 px-0.5">
                        <span>Narrative & Elaborate</span>
                        <span>Ultra-Direct / Bulleted</span>
                      </div>
                    </div>
                  </div>

                  {/* Vocabulary Controls */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preferred Terms</Label>
                      <Input 
                        value={bvPrefer} 
                        onChange={(e) => setBvPrefer(e.target.value)}
                        placeholder="e.g. robust, cryptographic, paradigm" 
                        className="bg-background/50 border-border text-foreground text-xs h-10 focus-visible:ring-accent"
                      />
                      <p className="text-[10px] text-muted-foreground/70">Preferred words or developer jargon.</p>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Avoided Buzzwords</Label>
                      <Input 
                        value={bvAvoid} 
                        onChange={(e) => setBvAvoid(e.target.value)}
                        placeholder="e.g. delve, game-changing, testament" 
                        className="bg-background/50 border-border text-foreground text-xs h-10 focus-visible:ring-accent"
                      />
                      <p className="text-[10px] text-muted-foreground/70">AI patterns or phrases to ban.</p>
                    </div>
                  </div>

                  {/* Prose Writing Sample */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Writing Style Sample</Label>
                      <span className="text-[10px] text-muted-foreground/60">{bvSampleText.length} / 4000 chars</span>
                    </div>
                    <textarea
                      value={bvSampleText}
                      onChange={(e) => setBvSampleText(e.target.value.slice(0, 4000))}
                      placeholder="Paste 1-3 paragraphs of your original newsletters, blogs, or video scripts. Scribe will analyze your sentence structures, exclamation choices, and prose rhythm to mirror your style."
                      className="w-full min-h-[90px] max-h-[140px] p-3 rounded-xl border border-border bg-background/50 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-accent resize-y font-sans transition-all"
                    />
                  </div>

                  {/* Action Button */}
                  <div className="flex items-center justify-between pt-2">
                    {!user && (
                      <p className="text-[10px] text-accent font-medium">Guest mode: Saved locally to browser</p>
                    )}
                    {user && (
                      <p className="text-[10px] text-muted-foreground/70">Synced securely to your encrypted cloud profile</p>
                    )}
                    <Button 
                      onClick={saveBrandVoice} 
                      disabled={savingBrandVoice}
                      className="bg-accent hover:bg-accent/90 text-accent-foreground font-medium px-6"
                    >
                      {savingBrandVoice ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                      Save Voice Clone
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* Publishing Integrations */}
              <TabsContent value="integrations" className="m-0 space-y-6 outline-none">
                <DialogHeader className="mb-4">
                  <DialogTitle className="text-xl font-medium text-foreground flex items-center gap-2">
                    <Globe className="size-5 text-accent animate-pulse" />
                    Publishing Integrations
                  </DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    Connect Scribe with your blogging platforms to publish drafts directly with a single click.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 max-w-lg pb-6">
                  {/* Dev.to */}
                  <div className="space-y-2 border-b border-border/40 pb-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <svg className="size-4 shrink-0 rounded" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <rect width="24" height="24" rx="4" fill="#09090b" />
                          <text x="50%" y="58%" dominantBaseline="middle" textAnchor="middle" fill="#ffffff" fontSize="9" fontFamily="Inter, system-ui, sans-serif" fontWeight="900">DEV</text>
                        </svg>
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dev.to API Key</Label>
                      </div>
                      <a 
                        href="https://dev.to/settings/extensions" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-[10px] text-accent hover:underline flex items-center gap-1 font-medium"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          window.open("https://dev.to/settings/extensions", "_blank");
                        }}
                      >
                        Get Key <Lock className="size-2.5" />
                      </a>
                    </div>
                    <Input 
                      type="password"
                      placeholder="Enter dev.to API key (e.g. devto_...)"
                      value={devtoKey} 
                      onChange={(e) => setDevtoKey(e.target.value)}
                      className="bg-background/50 border-border text-foreground focus-visible:ring-accent font-mono text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground/75">Stored securely in your encrypted cloud user profile.</p>
                  </div>

                  {/* Medium */}
                  <div className="space-y-2 border-b border-border/40 pb-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <svg className="size-4 shrink-0 text-foreground" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                          <circle cx="5" cy="12" r="5" />
                          <ellipse cx="14" cy="12" rx="2.5" ry="5" />
                          <ellipse cx="20.5" cy="12" rx="1" ry="4.7" />
                        </svg>
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Medium Integration Token</Label>
                      </div>
                      <a 
                        href="https://medium.com/me/settings/security" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-[10px] text-accent hover:underline flex items-center gap-1 font-medium"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          window.open("https://medium.com/me/settings/security", "_blank");
                        }}
                      >
                        Get Token <Lock className="size-2.5" />
                      </a>
                    </div>
                    <Input 
                      type="password"
                      placeholder="Enter Medium Integration Token"
                      value={mediumToken} 
                      onChange={(e) => setMediumToken(e.target.value)}
                      className="bg-background/50 border-border text-foreground focus-visible:ring-accent font-mono text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground/75">Required to authenticate your self-publishing requests on Medium.</p>
                  </div>

                  {/* Hashnode */}
                  <div className="space-y-2 border-b border-border/40 pb-4">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <rect width="24" height="24" rx="5" fill="#2962FF" />
                          <circle cx="12" cy="12" r="4.5" stroke="#ffffff" strokeWidth="2.5" />
                        </svg>
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hashnode Developer Token</Label>
                      </div>
                      <a 
                        href="https://hashnode.com/settings/developer" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-[10px] text-accent hover:underline flex items-center gap-1 font-medium"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          window.open("https://hashnode.com/settings/developer", "_blank");
                        }}
                      >
                        Get Token <Lock className="size-2.5" />
                      </a>
                    </div>
                    <Input 
                      type="password"
                      placeholder="Enter Hashnode Personal Access Token"
                      value={hashnodeToken} 
                      onChange={(e) => setHashnodeToken(e.target.value)}
                      className="bg-background/50 border-border text-foreground focus-visible:ring-accent font-mono text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground/75">Enables seamless drafts delivery directly into your Hashnode dashboard.</p>
                  </div>
                  
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-muted-foreground flex items-center gap-1.5 bg-accent/5 px-2.5 py-1 rounded-md border border-accent/10">
                      <Lock className="size-3 text-accent" /> API credentials are encrypted and strictly private.
                    </span>
                    <Button 
                      onClick={saveIntegrations} 
                      disabled={savingIntegrations || !user}
                      className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold px-6"
                    >
                      {savingIntegrations ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                      Save API Keys
                    </Button>
                  </div>
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
                    <p className="text-2xl font-bold text-foreground mb-4">₹0<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
                    <ul className="space-y-2 text-sm text-muted-foreground mb-6">
                      <li className="flex gap-2"><CheckCircle2 className="size-4 text-muted-foreground/50" /> 10 generations / month</li>
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
                    <p className="text-2xl font-bold text-foreground mb-4">₹999<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
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

    <Dialog open={showPayment} onOpenChange={setShowPayment}>
      <DialogContent className="max-w-md p-6 bg-card border-border text-foreground shadow-2xl rounded-2xl">
        <DialogHeader className="mb-4">
          <DialogTitle className="flex items-center gap-2 text-xl font-semibold text-foreground">
            <CreditCard className="size-5 text-accent" />
            Scribe Pro Checkout
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Enter your payment details below to subscribe to the Scribe Pro plan.
          </DialogDescription>
        </DialogHeader>

        {/* Pricing Summary Card */}
        <div className="bg-accent/10 border border-accent/20 rounded-xl p-4 mb-6 flex justify-between items-center">
          <div>
            <p className="font-semibold text-sm text-foreground">Scribe Pro Monthly</p>
            <p className="text-xs text-muted-foreground">Billed monthly. Cancel anytime.</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-accent">₹999.00</p>
            <p className="text-[10px] text-muted-foreground">per month</p>
          </div>
        </div>

        {/* Payment Method Selector */}
        <div className="grid grid-cols-2 gap-2 bg-background/50 p-1 rounded-xl border border-border/60 mb-6">
          <button
            type="button"
            onClick={() => setPaymentMethod("card")}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              paymentMethod === "card"
                ? "bg-accent text-accent-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/5"
            }`}
          >
            <CreditCard className="size-4" />
            Card Payment
          </button>
          <button
            type="button"
            onClick={() => setPaymentMethod("upi")}
            className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${
              paymentMethod === "upi"
                ? "bg-accent text-accent-foreground shadow-md"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/5"
            }`}
          >
            <Smartphone className="size-4" />
            UPI Payment
          </button>
        </div>

        <form onSubmit={handlePaymentSubmit} className="space-y-4">
          {paymentMethod === "card" ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cardholder Name</Label>
                <Input
                  type="text"
                  placeholder="Jane Doe"
                  defaultValue={fullName || user?.user_metadata?.full_name || ""}
                  required
                  className="bg-background border-border text-foreground focus-visible:ring-accent"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Card Number</Label>
                <div className="relative">
                  <CreditCard className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground shrink-0" />
                  <Input
                    type="text"
                    placeholder="4111 1111 1111 1111"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    required
                    maxLength={19}
                    className="bg-background border-border text-foreground pl-10 focus-visible:ring-accent font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Expiry Date</Label>
                  <Input
                    type="text"
                    placeholder="MM/YY"
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(formatExpiry(e.target.value))}
                    required
                    maxLength={5}
                    className="bg-background border-border text-foreground focus-visible:ring-accent font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">CVC</Label>
                  <Input
                    type="text"
                    placeholder="123"
                    value={cardCvc}
                    onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, "").substring(0, 3))}
                    required
                    maxLength={3}
                    className="bg-background border-border text-foreground focus-visible:ring-accent font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Billing Postal Code</Label>
                <Input
                  type="text"
                  placeholder="10001"
                  value={cardZip}
                  onChange={(e) => setCardZip(e.target.value.replace(/\D/g, "").substring(0, 5))}
                  required
                  maxLength={5}
                  className="bg-background border-border text-foreground focus-visible:ring-accent font-mono"
                />
              </div>
            </>
          ) : (
            <>
              {/* UPI App Selection Grid */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select UPI App</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedUpiProvider("gpay")}
                    className={`relative flex flex-col items-start p-3 rounded-xl border transition-all ${
                      selectedUpiProvider === "gpay"
                        ? "border-accent bg-accent/10 text-accent font-medium shadow-md shadow-accent/5"
                        : "border-border/60 bg-background/40 hover:bg-accent/5 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {selectedUpiProvider === "gpay" && <Check className="absolute top-3 right-3 size-4" />}
                    <span className="text-xs font-semibold tracking-wide">Google Pay</span>
                    <span className="text-[9px] opacity-75 mt-0.5">Instant pay</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedUpiProvider("phonepe")}
                    className={`relative flex flex-col items-start p-3 rounded-xl border transition-all ${
                      selectedUpiProvider === "phonepe"
                        ? "border-accent bg-accent/10 text-accent font-medium shadow-md shadow-accent/5"
                        : "border-border/60 bg-background/40 hover:bg-accent/5 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {selectedUpiProvider === "phonepe" && <Check className="absolute top-3 right-3 size-4" />}
                    <span className="text-xs font-semibold tracking-wide">PhonePe</span>
                    <span className="text-[9px] opacity-75 mt-0.5">Secure pay</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedUpiProvider("paytm")}
                    className={`relative flex flex-col items-start p-3 rounded-xl border transition-all ${
                      selectedUpiProvider === "paytm"
                        ? "border-accent bg-accent/10 text-accent font-medium shadow-md shadow-accent/5"
                        : "border-border/60 bg-background/40 hover:bg-accent/5 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {selectedUpiProvider === "paytm" && <Check className="absolute top-3 right-3 size-4" />}
                    <span className="text-xs font-semibold tracking-wide">Paytm</span>
                    <span className="text-[9px] opacity-75 mt-0.5">Fast checkout</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedUpiProvider("bhim")}
                    className={`relative flex flex-col items-start p-3 rounded-xl border transition-all ${
                      selectedUpiProvider === "bhim"
                        ? "border-accent bg-accent/10 text-accent font-medium shadow-md shadow-accent/5"
                        : "border-border/60 bg-background/40 hover:bg-accent/5 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {selectedUpiProvider === "bhim" && <Check className="absolute top-3 right-3 size-4" />}
                    <span className="text-xs font-semibold tracking-wide">BHIM UPI</span>
                    <span className="text-[9px] opacity-75 mt-0.5">Secure gateway</span>
                  </button>
                </div>
              </div>

              {/* QR Code Container */}
              <div className="flex flex-col items-center justify-center p-4 bg-background/50 border border-border/60 rounded-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-tr from-accent/5 via-transparent to-accent/5 opacity-50"></div>
                <div className="relative p-3 bg-white rounded-xl shadow-lg border border-white mb-2 transition-transform duration-300 group-hover:scale-105 size-36 flex items-center justify-center">
                  <img
                    src={qrCodeUrl}
                    alt="UPI Scan QR"
                    className="size-32 object-contain"
                    onError={(e) => {
                      e.currentTarget.src = `https://quickchart.io/chart?cht=qr&chs=200x200&chl=${encodeURIComponent(upiUrl)}`;
                    }}
                  />
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground tracking-wider uppercase flex items-center gap-1.5">
                  <QrCode className="size-3 text-accent animate-pulse" />
                  Scan QR to pay ₹999 instantly
                </span>
              </div>

              {/* UPI ID (VPA) Input */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">UPI ID (VPA)</Label>
                <div className="relative">
                  <Smartphone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground shrink-0" />
                  <Input
                    type="text"
                    placeholder="e.g. mobile@upi or name@okaxis"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value.trim())}
                    required
                    className="bg-background border-border text-foreground pl-10 focus-visible:ring-accent font-mono text-sm"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground/80 mt-1">We will send a payment request to this VPA.</p>
              </div>
            </>
          )}

          <div className="flex gap-2 items-center text-xs text-muted-foreground/80 mt-2 bg-background/30 p-2.5 rounded-lg border border-border/40">
            <Lock className="size-3.5 text-accent shrink-0" />
            <span>Payments are simulated and securely processed.</span>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border/40">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowPayment(false)}
              className="hover:bg-accent/10 hover:text-foreground text-muted-foreground font-medium"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={paymentLoading}
              className="bg-accent hover:bg-accent/90 text-accent-foreground font-medium px-6"
            >
              {paymentLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  {paymentStatusText}
                </>
              ) : (
                "Pay & Subscribe"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </>
  );
}

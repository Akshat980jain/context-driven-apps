import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { convertVideo } from "@/lib/convert.functions";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SettingsModal } from "@/components/SettingsModal";
import { SupportChat } from "@/components/SupportChat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { 
  getUserDashboardData, 
  saveGenerationHistory, 
  deleteGenerationHistory, 
  createWorkspaceFolder, 
  deleteWorkspaceFolder, 
  createCustomTemplate, 
  deleteCustomTemplate,
  moveGenerationWorkspace
} from "@/lib/auth.functions";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Copy,
  Download,
  Loader2,
  Sparkles,
  Youtube,
  FileText,
  CheckCircle2,
  RotateCw,
  Zap,
  Search,
  PenLine,
  Clock,
  Plus,
  Folder,
  Pin,
  Settings,
  Trash2,
  LogOut,
  MoreHorizontal,
  User,
  HelpCircle,
  UserCog,
  ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Scribe — Turn YouTube videos into polished blog posts" },
      {
        name: "description",
        content:
          "Paste a YouTube link and get a publish-ready, SEO-optimized blog post in seconds. Powered by AI.",
      },
      { property: "og:title", content: "Scribe — YouTube to Blog Post" },
      {
        property: "og:description",
        content: "Repurpose any YouTube video into a polished blog article.",
      },
    ],
  }),
  component: Index,
});

type Tone = "Professional" | "Casual" | "Technical" | "Educational";
type Length = "Short" | "Medium" | "Long";
type BlogFormat = "How-to Guide" | "Listicle" | "Deep Dive" | "Summary";

type SeoData = {
  title?: string;
  metaDescription?: string;
  tags?: string[];
  readingTime?: string;
};

const STEPS = [
  { key: "fetch", label: "Fetching transcript" },
  { key: "analyse", label: "Analysing content" },
  { key: "write", label: "Writing blog post" },
] as const;

function Index() {
  const run = useServerFn(convertVideo);
  const [url, setUrl] = useState("");
  const [tone, setTone] = useState<Tone>("Professional");
  const [length, setLength] = useState<Length>("Medium");
  const [format, setFormat] = useState<BlogFormat>("Deep Dive");

  const [loading, setLoading] = useState(false);
  const [stepIdx, setStepIdx] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [markdown, setMarkdown] = useState<string>("");
  const [user, setUser] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("profile");

  const openSettings = (tab: string) => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  // Dynamic States for History, Workspaces, and Templates
  const [generations, setGenerations] = useState<any[]>([]);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [searchHistoryQuery, setSearchHistoryQuery] = useState("");
  const [selectedGenId, setSelectedGenId] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [seo, setSeo] = useState<SeoData>({});
  const [view, setView] = useState<"preview" | "markdown">("preview");

  const getDashboardFn = useServerFn(getUserDashboardData);
  const saveGenFn = useServerFn(saveGenerationHistory);
  const deleteGenFn = useServerFn(deleteGenerationHistory);
  const createWsFn = useServerFn(createWorkspaceFolder);
  const deleteWsFn = useServerFn(deleteWorkspaceFolder);
  const createTplFn = useServerFn(createCustomTemplate);
  const deleteTplFn = useServerFn(deleteCustomTemplate);
  const moveGenWsFn = useServerFn(moveGenerationWorkspace);

  useEffect(() => {
    const checkSession = () => {
      const stored = localStorage.getItem("custom_session");
      if (stored) {
        setUser(JSON.parse(stored));
      } else {
        setUser(null);
      }
    };
    
    checkSession();
    window.addEventListener("auth_changed", checkSession);

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && !localStorage.getItem("custom_session")) {
        setUser(session.user);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user && !localStorage.getItem("custom_session")) {
        setUser(session.user);
      }
    });

    return () => {
      window.removeEventListener("auth_changed", checkSession);
      subscription.unsubscribe();
    };
  }, []);

  // Load dashboard data whenever user changes
  useEffect(() => {
    const loadData = async () => {
      if (user) {
        try {
          const res = await getDashboardFn({ data: { userId: user.id } });
          setGenerations(res.generations || []);
          setWorkspaces(res.workspaces || []);
          setTemplates(res.templates || []);

          // Sync real plan from DB — fixes stale "Pro" showing for Free accounts
          const freshPlan = res.plan || "Free";
          const currentPlan = user.user_metadata?.plan;
          if (currentPlan !== freshPlan) {
            const updatedUser = {
              ...user,
              user_metadata: {
                ...(user.user_metadata || {}),
                plan: freshPlan,
              },
            };
            localStorage.setItem("custom_session", JSON.stringify(updatedUser));
            setUser(updatedUser);
          }
        } catch (err) {
          console.error("Failed to load dashboard data", err);
        }
      } else {
        // Guest user local storage
        const localGens = localStorage.getItem("guest_generations");
        const localWs = localStorage.getItem("guest_workspaces");
        const localTpls = localStorage.getItem("guest_templates");
        setGenerations(localGens ? JSON.parse(localGens) : []);
        setWorkspaces(localWs ? JSON.parse(localWs) : []);
        setTemplates(localTpls ? JSON.parse(localTpls) : []);
      }
    };
    loadData();
  }, [user?.id]);

  const handleLogout = async () => {
    localStorage.removeItem("custom_session");
    window.dispatchEvent(new Event("auth_changed"));
    await supabase.auth.signOut();
  };

  // Operations
  const handleSaveGeneration = async (gen: {
    url: string;
    tone: string;
    length: string;
    format: string;
    title: string;
    markdown: string;
    seo: any;
  }) => {
    if (user) {
      try {
        const res = await saveGenFn({ 
          data: { 
            userId: user.id, 
            ...gen,
            workspaceId: selectedWorkspaceId || undefined
          } 
        });
        setGenerations(prev => [res.generation, ...prev]);
        setSelectedGenId(res.generation.id);
        toast.success("Generation saved to your history!");
      } catch (err) {
        console.error("Failed to save generation on backend", err);
      }
    } else {
      const newGen = {
        id: crypto.randomUUID(),
        ...gen,
        workspaceId: selectedWorkspaceId || undefined,
        createdAt: new Date().toISOString()
      };
      const updated = [newGen, ...generations];
      setGenerations(updated);
      setSelectedGenId(newGen.id);
      localStorage.setItem("guest_generations", JSON.stringify(updated));
      toast.success("Saved to local guest history!");
    }
  };

  const handleCreateWorkspace = async () => {
    const name = window.prompt("Enter workspace folder name:");
    if (!name || !name.trim()) return;
    if (user) {
      try {
        const res = await createWsFn({ data: { userId: user.id, name: name.trim() } });
        setWorkspaces(prev => [...prev, res.workspace]);
        toast.success(`Workspace "${name}" created!`);
      } catch (err) {
        console.error(err);
      }
    } else {
      const newWs = { id: crypto.randomUUID(), name: name.trim() };
      const updated = [...workspaces, newWs];
      setWorkspaces(updated);
      localStorage.setItem("guest_workspaces", JSON.stringify(updated));
      toast.success(`Workspace "${name}" created!`);
    }
  };

  const handleDeleteWorkspace = async (wsId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete this workspace folder? The generations will remain but will be removed from this folder.")) return;
    if (user) {
      try {
        await deleteWsFn({ data: { userId: user.id, wsId } });
        setWorkspaces(prev => prev.filter(w => w.id !== wsId));
        setGenerations(prev => prev.map(g => g.workspaceId === wsId ? { ...g, workspaceId: undefined } : g));
        if (selectedWorkspaceId === wsId) setSelectedWorkspaceId(null);
        toast.success("Workspace deleted");
      } catch (err) {
        console.error(err);
      }
    } else {
      const updatedWs = workspaces.filter(w => w.id !== wsId);
      setWorkspaces(updatedWs);
      localStorage.setItem("guest_workspaces", JSON.stringify(updatedWs));
      
      const updatedGens = generations.map(g => g.workspaceId === wsId ? { ...g, workspaceId: undefined } : g);
      setGenerations(updatedGens);
      localStorage.setItem("guest_generations", JSON.stringify(updatedGens));
      if (selectedWorkspaceId === wsId) setSelectedWorkspaceId(null);
      toast.success("Workspace deleted");
    }
  };

  const handleCreateTemplate = async () => {
    const name = window.prompt("Enter template name:");
    if (!name || !name.trim()) return;
    const tplData = { name: name.trim(), tone, length, format };
    if (user) {
      try {
        const res = await createTplFn({ data: { userId: user.id, ...tplData } });
        setTemplates(prev => [...prev, res.template]);
        toast.success(`Template "${name}" created!`);
      } catch (err) {
        console.error(err);
      }
    } else {
      const newTpl = { id: crypto.randomUUID(), ...tplData };
      const updated = [...templates, newTpl];
      setTemplates(updated);
      localStorage.setItem("guest_templates", JSON.stringify(updated));
      toast.success(`Template "${name}" created!`);
    }
  };

  const handleDeleteTemplate = async (templateId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete this template?")) return;
    if (user) {
      try {
        await deleteTplFn({ data: { userId: user.id, templateId } });
        setTemplates(prev => prev.filter(t => t.id !== templateId));
        toast.success("Template deleted");
      } catch (err) {
        console.error(err);
      }
    } else {
      const updated = templates.filter(t => t.id !== templateId);
      setTemplates(updated);
      localStorage.setItem("guest_templates", JSON.stringify(updated));
      toast.success("Template deleted");
    }
  };

  const handleDeleteGeneration = async (genId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete this generation from history?")) return;
    if (user) {
      try {
        await deleteGenFn({ data: { userId: user.id, genId } });
        setGenerations(prev => prev.filter(g => g.id !== genId));
        if (selectedGenId === genId) {
          setSelectedGenId(null);
          setUrl("");
          setMarkdown("");
          setSeo({});
        }
        toast.success("Generation deleted");
      } catch (err) {
        console.error(err);
      }
    } else {
      const updated = generations.filter(g => g.id !== genId);
      setGenerations(updated);
      localStorage.setItem("guest_generations", JSON.stringify(updated));
      if (selectedGenId === genId) {
        setSelectedGenId(null);
        setUrl("");
        setMarkdown("");
        setSeo({});
      }
      toast.success("Generation deleted");
    }
  };

  const handleSelectGeneration = (gen: any) => {
    setSelectedGenId(gen.id);
    setUrl(gen.url);
    setTone(gen.tone as Tone);
    setLength(gen.length as Length);
    setFormat(gen.format as BlogFormat);
    setMarkdown(gen.markdown);
    setSeo(gen.seo || {});
  };

  const handleApplyTemplate = (tpl: any) => {
    setTone(tpl.tone as Tone);
    setLength(tpl.length as Length);
    setFormat(tpl.format as BlogFormat);
    toast.success(`Applied template "${tpl.name}"`);
  };

  const handleMoveToWorkspace = async (genId: string, wsId: string | null) => {
    const updatedGens = generations.map(g => g.id === genId ? { ...g, workspaceId: wsId || undefined } : g);
    setGenerations(updatedGens);
    
    if (user) {
      try {
        await moveGenWsFn({ data: { userId: user.id, genId, wsId } });
      } catch(err) {
        console.error(err);
      }
    } else {
      localStorage.setItem("guest_generations", JSON.stringify(updatedGens));
    }
    toast.success("Moved generation");
  };

  const displayName = user ? (user.user_metadata?.full_name || user.email?.split("@")[0] || "User") : "Guest User";
  const avatarInitials = user ? displayName.substring(0, 2).toUpperCase() : "G";
  const displayPlan = user ? (user.user_metadata?.plan || user.plan || "Free") : "Free";

  const validUrl = useMemo(
    () => /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/i.test(url.trim()),
    [url],
  );

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!validUrl || loading) return;
    setLoading(true);
    setError(null);
    setMarkdown("");
    setSeo({});
    setStepIdx(0);

    const stepTimer = setInterval(() => {
      setStepIdx((i) => (i < STEPS.length - 1 ? i + 1 : i));
    }, 2500);

    try {
      const res = await run({
        data: { url: url.trim(), tone, length, format },
      });
      if (res.error) {
        setError(res.error);
      } else {
        setMarkdown(res.markdown ?? "");
        setSeo(res.seo ?? {});
        setStepIdx(STEPS.length);

        // Save to dynamic history
        const title = res.seo?.title || `Article: ${url.replace(/https?:\/\/(www\.)?/, "").substring(0, 30)}`;
        await handleSaveGeneration({
          url: url.trim(),
          tone,
          length,
          format,
          title,
          markdown: res.markdown ?? "",
          seo: res.seo ?? {}
        });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      clearInterval(stepTimer);
      setLoading(false);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = (kind: "md" | "txt") => {
    const blob = new Blob([markdown], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(seo.title ?? "blog-post").replace(/[^\w-]+/g, "-").toLowerCase()}.${kind}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };  return (
    <div className="flex h-screen w-full bg-background overflow-hidden">
      {/* ── CHATGPT-STYLE LEFT SIDEBAR ── */}
      <aside className="hidden md:flex w-[260px] flex-col border-r border-border/40 bg-card/20 backdrop-blur">
        {/* New Button & Search */}
        <div className="p-3 space-y-3">
          <Button 
            variant="outline" 
            className="h-10 w-full justify-start gap-2 border-border/50 bg-background/50 hover:bg-accent/10" 
            onClick={() => { 
              setUrl(""); 
              setMarkdown(""); 
              setSeo({}); 
              setSelectedGenId(null); 
            }}
          >
            <Plus className="size-4" /> New generation
          </Button>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input 
              placeholder="Search history..." 
              value={searchHistoryQuery}
              onChange={(e) => setSearchHistoryQuery(e.target.value)}
              className="h-8 bg-background/40 border-border/50 text-xs pl-8 rounded-md"
            />
          </div>
        </div>

        {/* Sidebar Content (Scrollable) */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-6">
          
          {/* Templates */}
          <div>
            <div className="flex items-center justify-between mb-2 px-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Templates</p>
              <button 
                onClick={handleCreateTemplate}
                title="Save current config as template"
                className="text-muted-foreground hover:text-accent transition-colors"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
            
            <div 
              onClick={() => handleApplyTemplate({ name: "Default Deep Dive", tone: "Professional", length: "Medium", format: "Deep Dive" })}
              className="cursor-pointer flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/5 hover:text-foreground"
            >
              <Zap className="size-3 text-accent" /> Default Deep Dive
            </div>
            <div 
              onClick={() => handleApplyTemplate({ name: "LinkedIn Summary", tone: "Casual", length: "Short", format: "Summary" })}
              className="mt-0.5 cursor-pointer flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/5 hover:text-foreground"
            >
              <Pin className="size-3 text-accent" /> LinkedIn Summary
            </div>

            {templates.map(tpl => (
              <div 
                key={tpl.id}
                onClick={() => handleApplyTemplate(tpl)}
                className="group mt-0.5 cursor-pointer flex items-center justify-between rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/5 hover:text-foreground"
              >
                <div className="flex items-center gap-2 truncate">
                  <Zap className="size-3 text-accent/70" /> 
                  <span className="truncate">{tpl.name}</span>
                </div>
                <button 
                  onClick={(e) => handleDeleteTemplate(tpl.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Folders/Workspaces */}
          <div>
            <div className="flex items-center justify-between mb-2 px-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Workspaces</p>
              <button 
                onClick={handleCreateWorkspace}
                title="Create Workspace Folder"
                className="text-muted-foreground hover:text-accent transition-colors"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
            
            <div 
              onClick={() => setSelectedWorkspaceId(null)}
              className={`cursor-pointer flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors ${!selectedWorkspaceId ? "bg-accent/10 text-accent font-medium" : "text-muted-foreground hover:bg-accent/5 hover:text-foreground"}`}
            >
              <Folder className="size-3" /> All Workspaces
            </div>

            {workspaces.map(ws => (
              <div 
                key={ws.id}
                onClick={() => setSelectedWorkspaceId(ws.id)}
                className={`group mt-0.5 cursor-pointer flex items-center justify-between rounded-md px-3 py-1.5 text-xs transition-colors ${selectedWorkspaceId === ws.id ? "bg-accent/10 text-accent font-medium" : "text-muted-foreground hover:bg-accent/5 hover:text-foreground"}`}
              >
                <div className="flex items-center gap-2 truncate">
                  <Folder className="size-3" /> 
                  <span className="truncate">{ws.name}</span>
                </div>
                <button 
                  onClick={(e) => handleDeleteWorkspace(ws.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
          </div>

          {/* History */}
          <div>
            <div className="flex items-center justify-between mb-2 px-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                {selectedWorkspaceId 
                  ? `History (${workspaces.find(w => w.id === selectedWorkspaceId)?.name})` 
                  : "History"}
              </p>
              {selectedWorkspaceId && (
                <button 
                  onClick={() => setSelectedWorkspaceId(null)}
                  className="text-[10px] text-accent hover:underline"
                >
                  Clear filter
                </button>
              )}
            </div>

            <div className="space-y-0.5 max-h-[220px] overflow-y-auto pr-1">
              {generations
                .filter(g => !selectedWorkspaceId || g.workspaceId === selectedWorkspaceId)
                .filter(g => !searchHistoryQuery || g.title.toLowerCase().includes(searchHistoryQuery.toLowerCase()))
                .map(gen => (
                  <div 
                    key={gen.id}
                    onClick={() => handleSelectGeneration(gen)}
                    className={`group cursor-pointer flex items-center justify-between rounded-lg px-2.5 py-2 text-xs transition-all ${selectedGenId === gen.id ? "bg-accent/15 text-accent font-medium border-l-2 border-accent pl-2" : "text-muted-foreground hover:bg-accent/5 hover:text-foreground"}`}
                  >
                    <span className="truncate flex-1 pr-1">{gen.title}</span>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                      {/* Move to Workspace Dropdown */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button onClick={(e) => e.stopPropagation()} className="p-0.5 rounded hover:bg-accent/10">
                            <MoreHorizontal className="size-3" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-[160px] bg-card border-border text-foreground rounded-xl shadow-lg p-1" align="end">
                          <p className="text-[9px] font-semibold text-muted-foreground px-2 py-1 uppercase tracking-wider">Move to Folder</p>
                          <DropdownMenuItem 
                            onClick={() => handleMoveToWorkspace(gen.id, null)} 
                            className="text-xs gap-2 rounded-lg cursor-pointer py-1.5 hover:bg-accent/10 focus:bg-accent/10 focus:text-accent"
                          >
                            <Folder className="size-3 text-muted-foreground" /> Unassigned
                          </DropdownMenuItem>
                          {workspaces.map(ws => (
                            <DropdownMenuItem 
                              key={ws.id}
                              onClick={() => handleMoveToWorkspace(gen.id, ws.id)}
                              className="text-xs gap-2 rounded-lg cursor-pointer py-1.5 hover:bg-accent/10 focus:bg-accent/10 focus:text-accent"
                            >
                              <Folder className="size-3 text-muted-foreground" /> {ws.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <button 
                        onClick={(e) => handleDeleteGeneration(gen.id, e)}
                        className="p-0.5 rounded hover:bg-accent/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  </div>
                ))}

              {generations.filter(g => !selectedWorkspaceId || g.workspaceId === selectedWorkspaceId).length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground/60 bg-accent/5 rounded-xl border border-dashed border-border/40">
                  {selectedWorkspaceId 
                    ? "No history inside folder" 
                    : "No generations yet"}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Usage & User Area */}
        <div className="p-3 border-t border-border/40 bg-background/20">
          
          {/* Usage Tracker */}
          <div className="mb-4 px-2">
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">Generations</span>
              <span className="font-medium text-muted-foreground">{generations.length} / {user ? 50 : 15}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
              <div 
                className="h-full bg-accent transition-all duration-500" 
                style={{ width: `${Math.min(100, (generations.length / (user ? 50 : 15)) * 100)}%` }}
              ></div>
            </div>
            {!user && (
              <Link to="/auth" className="mt-2 block text-xs text-accent hover:underline w-full text-left font-medium">
                Sign up for 50 free generations
              </Link>
            )}
          </div>


          {/* Profile Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex cursor-pointer items-center gap-3 rounded-xl p-2 transition-colors hover:bg-accent/10">
                <div className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${user ? 'bg-accent' : 'bg-accent/20 text-accent'}`}>
                  {avatarInitials}
                </div>
                <div className="flex-1 truncate">
                  <p className="text-sm font-semibold">{displayName}</p>
                  <p className="text-xs text-muted-foreground">{displayPlan}</p>
                </div>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-[260px] mb-2 p-2 bg-card border-border rounded-2xl shadow-xl text-foreground" align="start" side="top">
              
              <div className="flex items-center justify-between p-2 hover:bg-accent/10 cursor-pointer rounded-xl transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${user ? 'bg-accent' : 'bg-accent/20 text-accent'}`}>
                    {avatarInitials}
                  </div>
                  <div className="flex-1 truncate leading-tight">
                    <p className="text-sm font-medium">{displayName}</p>
                    <p className="text-xs text-muted-foreground">{user?.email || "Not logged in"}</p>
                  </div>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </div>

              <DropdownMenuSeparator className="bg-border my-2" />
              
              <DropdownMenuItem onClick={() => openSettings("settings")} className="gap-3 cursor-pointer py-3 rounded-lg hover:bg-accent/10 focus:bg-accent/10 focus:text-accent transition-colors">
                <Settings className="size-4" /> 
                <span className="text-sm">Settings</span>
              </DropdownMenuItem>

              {!user ? (
                <>
                  <DropdownMenuSeparator className="bg-border my-2" />
                  <DropdownMenuItem asChild className="gap-3 cursor-pointer py-3 rounded-lg hover:bg-accent/10 focus:bg-accent/10 focus:text-accent transition-colors">
                    <Link to="/auth" className="flex w-full items-center gap-3"><User className="size-4" /><span className="text-sm font-medium">Log In</span></Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="gap-3 cursor-pointer py-3 rounded-lg hover:bg-accent/10 focus:bg-accent/10 focus:text-accent transition-colors">
                    <Link to="/auth" className="flex w-full items-center gap-3"><UserCog className="size-4" /><span className="text-sm font-medium">Sign Up</span></Link>
                  </DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => openSettings("plan")} className="gap-3 cursor-pointer py-3 rounded-lg hover:bg-accent/10 focus:bg-accent/10 focus:text-accent transition-colors">
                    <Sparkles className="size-4" /> 
                    <span className="text-sm">Upgrade plan</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openSettings("personalization")} className="gap-3 cursor-pointer py-3 rounded-lg hover:bg-accent/10 focus:bg-accent/10 focus:text-accent transition-colors">
                    <UserCog className="size-4" /> 
                    <span className="text-sm">Personalization</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => openSettings("profile")} className="gap-3 cursor-pointer py-3 rounded-lg hover:bg-accent/10 focus:bg-accent/10 focus:text-accent transition-colors">
                    <User className="size-4" /> 
                    <span className="text-sm">Profile</span>
                  </DropdownMenuItem>
                  
                  <DropdownMenuSeparator className="bg-border my-2" />
                  
                  <DropdownMenuItem onClick={() => window.dispatchEvent(new Event("open_support_chat"))} className="gap-3 cursor-pointer py-3 rounded-lg hover:bg-accent/10 focus:bg-accent/10 focus:text-accent transition-colors justify-between flex">
                    <div className="flex items-center gap-3">
                      <HelpCircle className="size-4" /> 
                      <span className="text-sm">Help & Support Bot</span>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem onClick={handleLogout} className="gap-3 cursor-pointer py-3 rounded-lg hover:bg-accent/10 focus:bg-accent/10 focus:text-accent transition-colors">
                    <LogOut className="size-4" /> 
                    <span className="text-sm">Log out</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 flex flex-col h-full overflow-y-auto relative min-w-0">
        <div className="w-full px-6 py-12 md:px-12 lg:px-24 xl:px-32 flex-1">
          <header className="mb-10 text-center">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              <Sparkles className="size-3 text-accent" />
              AI-powered content repurposing
            </div>
            <h1 className="font-display text-4xl leading-none tracking-tight md:text-6xl">
              Turn any <span className="italic text-accent">YouTube</span> video
              <br />
              into a polished blog post.
            </h1>
          </header>

          <Card className="border-border/60 bg-card/60 p-6 backdrop-blur md:p-8 shadow-soft">
            <form onSubmit={submit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="url" className="text-xs uppercase tracking-wider text-muted-foreground">
                  YouTube URL
                </Label>
                <div className="relative">
                  <Youtube className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="h-14 rounded-xl border-border bg-background/60 pl-12 text-base shadow-inner"
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <OptionSelect label="Tone" value={tone} onChange={(v) => setTone(v as Tone)} options={["Professional", "Casual", "Technical", "Educational"]} disabled={loading} />
                <OptionSelect label="Length" value={length} onChange={(v) => setLength(v as Length)} options={["Short", "Medium", "Long"]} disabled={loading} />
                <OptionSelect label="Format" value={format} onChange={(v) => setFormat(v as BlogFormat)} options={["How-to Guide", "Listicle", "Deep Dive", "Summary"]} disabled={loading} />
              </div>

              <Button
                type="submit"
                disabled={!validUrl || loading}
                className="h-14 w-full rounded-xl bg-accent text-base font-semibold text-accent-foreground transition hover:bg-accent/90 disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 size-5 animate-spin" /> Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 size-5" /> Convert to blog post
                  </>
                )}
              </Button>
            </form>

            {(loading || markdown) && (
              <div className="mt-8 grid gap-3">
                {STEPS.map((s, i) => {
                  const done = i < stepIdx || (!loading && markdown);
                  const active = loading && i === stepIdx;
                  return (
                    <div
                      key={s.key}
                      className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/40 px-4 py-3 text-sm"
                    >
                      {done ? (
                        <CheckCircle2 className="size-5 text-accent" />
                      ) : active ? (
                        <Loader2 className="size-5 animate-spin text-accent" />
                      ) : (
                        <div className="size-5 rounded-full border border-border" />
                      )}
                      <span className={done || active ? "text-foreground" : "text-muted-foreground"}>
                        {s.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {error && (
              <div className="mt-6 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive-foreground">
                {error}
              </div>
            )}
          </Card>

          {markdown && (
            <section className="mt-10 space-y-6">
              {(seo.title || seo.metaDescription || seo.tags?.length) && (
                <Card className="border-border/60 bg-card/60 p-6 backdrop-blur shadow-sm">
                  <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                    <FileText className="size-3.5" /> SEO metadata
                  </div>
                  {seo.title && <h2 className="font-display text-2xl leading-tight md:text-3xl">{seo.title}</h2>}
                  {seo.metaDescription && (
                    <p className="mt-2 text-sm text-muted-foreground">{seo.metaDescription}</p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {seo.tags?.map((t) => (
                      <Badge key={t} variant="secondary" className="rounded-full">
                        #{t}
                      </Badge>
                    ))}
                    {seo.readingTime && (
                      <span className="ml-auto text-xs text-muted-foreground">{seo.readingTime}</span>
                    )}
                  </div>
                </Card>
              )}

              <Card className="border-border/60 bg-card/60 p-6 backdrop-blur md:p-8 shadow-sm">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex rounded-lg border border-border bg-background/60 p-1">
                    <button
                      onClick={() => setView("preview")}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${view === "preview" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Preview
                    </button>
                    <button
                      onClick={() => setView("markdown")}
                      className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${view === "markdown" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      Markdown
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={copy} className="bg-background/50">
                      <Copy className="mr-1.5 size-3.5" /> {copied ? "Copied!" : "Copy"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => download("md")} className="bg-background/50">
                      <Download className="mr-1.5 size-3.5" /> .md
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => submit()} disabled={loading} className="bg-background/50">
                      <RotateCw className="mr-1.5 size-3.5" /> Regenerate
                    </Button>
                  </div>
                </div>

                {view === "preview" ? (
                  <article className="prose-blog">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
                  </article>
                ) : (
                  <pre className="max-h-[600px] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background/60 p-4 font-mono text-xs text-muted-foreground">
                    {markdown}
                  </pre>
                )}
              </Card>
            </section>
          )}

          {!markdown && !loading && (
            <div className="mt-12 text-center">
              <p className="mb-6 text-xs uppercase tracking-widest text-muted-foreground">What you can do</p>
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  { icon: <Youtube className="size-4 text-accent" />, title: "Summarize Tutorials", desc: "Turn long coding walkthroughs into easy-to-follow text steps." },
                  { icon: <Search className="size-4 text-accent" />, title: "Generate SEO Assets", desc: "Automatically create titles, descriptions, and hashtags." },
                  { icon: <PenLine className="size-4 text-accent" />, title: "Multiple Formats", desc: "Output as Listicles, Deep Dives, or Quick Summaries." },
                  { icon: <Clock className="size-4 text-accent" />, title: "Save Time", desc: "Get a draft ready for publishing in less than 30 seconds." },
                ].map((feat) => (
                  <div key={feat.title} className="flex gap-4 rounded-xl border border-border/40 bg-card/20 p-4 text-left transition hover:bg-card/40">
                    <div className="mt-0.5 shrink-0 inline-flex size-8 items-center justify-center rounded-lg bg-background/50 border border-border/40">
                      {feat.icon}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{feat.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{feat.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} defaultTab={settingsTab} key={settingsTab} />
      <SupportChat />
    </div>
  );
}

function OptionSelect({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-11 rounded-lg border-border bg-background/60 text-foreground">
          <span className="truncate">{value}</span>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

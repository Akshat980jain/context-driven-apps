import { createFileRoute, Link } from "@tanstack/react-router";
import { useCustomDialog } from "@/hooks/use-custom-dialog";
import { useServerFn } from "@tanstack/react-start";
import { convertVideo } from "@/lib/convert.functions";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { SettingsModal } from "@/components/SettingsModal";
import { SupportChat } from "@/components/SupportChat";
import { InlineEditor } from "@/components/InlineEditor";
import { BatchQueue } from "@/components/BatchQueue";
import { RepurposeDropdown } from "@/components/RepurposeDropdown";
import { SeoScoreDashboard } from "@/components/SeoScoreDashboard";
import { DocumentEditor } from "@/components/DocumentEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  getUserDashboardData, 
  saveGenerationHistory, 
  updateGenerationContent,
  deleteGenerationHistory, 
  createWorkspaceFolder, 
  deleteWorkspaceFolder, 
  createCustomTemplate, 
  deleteCustomTemplate,
  moveGenerationWorkspace,
  publishContentToPlatform,
  updateUserBrandVoice
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
  Globe,
  ExternalLink,
  Layers,
  Save,
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
  const { showConfirm, showPrompt, showAlert } = useCustomDialog();
  const run = useServerFn(convertVideo);
  const [url, setUrl] = useState("");
  const [tone, setTone] = useState<Tone>("Professional");
  const [length, setLength] = useState<Length>("Medium");
  const [format, setFormat] = useState<BlogFormat>("Deep Dive");
  const [useBrandVoice, setUseBrandVoice] = useState(false);

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
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [seo, setSeo] = useState<SeoData>({});
  const [view, setView] = useState<"preview" | "markdown" | "editor">("preview");
  const [batchOpen, setBatchOpen] = useState(false);
  const articleRef = useRef<HTMLElement>(null);

  const usageCount = useMemo(() => {
    return generations.length + workspaces.length;
  }, [generations, workspaces]);

  const activeGen = useMemo(() => {
    return generations.find(g => g.id === selectedGenId) || null;
  }, [generations, selectedGenId]);

  const activeVersions = useMemo(() => {
    if (!activeGen) return [];
    if (activeGen.versions && activeGen.versions.length > 0) {
      return activeGen.versions;
    }
    return [{
      id: "root-fallback-version",
      tone: activeGen.tone,
      length: activeGen.length,
      format: activeGen.format,
      title: activeGen.title,
      markdown: activeGen.markdown || "",
      seo: activeGen.seo || {},
      createdAt: activeGen.createdAt || ""
    }];
  }, [activeGen]);

  const activeVersion = useMemo(() => {
    if (activeVersions.length === 0) return null;
    const matched = activeVersions.find((v: any) => v.id === selectedVersionId);
    if (matched) return matched;
    const defaultVer = activeVersions.find((v: any) => v.id === activeGen?.activeVersionId);
    return defaultVer || activeVersions[activeVersions.length - 1];
  }, [activeVersions, selectedVersionId, activeGen?.activeVersionId]);

  useEffect(() => {
    if (activeVersion) {
      setTone(activeVersion.tone as Tone);
      setLength(activeVersion.length as Length);
      setFormat(activeVersion.format as BlogFormat);
      setMarkdown(activeVersion.markdown);
      setSeo(activeVersion.seo || {});
    }
  }, [activeVersion?.id]);

  const getDashboardFn = useServerFn(getUserDashboardData);
  const saveGenFn = useServerFn(saveGenerationHistory);
  const deleteGenFn = useServerFn(deleteGenerationHistory);
  const createWsFn = useServerFn(createWorkspaceFolder);
  const deleteWsFn = useServerFn(deleteWorkspaceFolder);
  const createTplFn = useServerFn(createCustomTemplate);
  const deleteTplFn = useServerFn(deleteCustomTemplate);
  const moveGenWsFn = useServerFn(moveGenerationWorkspace);
  const updateGenContentFn = useServerFn(updateGenerationContent);
  const publishContentFn = useServerFn(publishContentToPlatform);
  const updateBrandVoiceFn = useServerFn(updateUserBrandVoice);

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
      if (session?.user) {
        const stored = localStorage.getItem("custom_session");
        const existingMetadata = stored ? JSON.parse(stored).user_metadata || {} : {};
        const customSession = {
          id: session.user.id,
          email: session.user.email,
          user_metadata: {
            full_name: session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "User",
            plan: "Free",
            integrations: { devto: "", medium: "", hashnode: "" },
            ...existingMetadata
          }
        };
        if (!localStorage.getItem("custom_session")) {
          localStorage.setItem("custom_session", JSON.stringify(customSession));
        }
        setUser(customSession);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const stored = localStorage.getItem("custom_session");
        const existingMetadata = stored ? JSON.parse(stored).user_metadata || {} : {};
        const customSession = {
          id: session.user.id,
          email: session.user.email,
          user_metadata: {
            full_name: session.user.user_metadata?.full_name || session.user.email?.split("@")[0] || "User",
            plan: "Free",
            integrations: { devto: "", medium: "", hashnode: "" },
            ...existingMetadata
          }
        };
        localStorage.setItem("custom_session", JSON.stringify(customSession));
        setUser(customSession);
      }
    });

    return () => {
      window.removeEventListener("auth_changed", checkSession);
      subscription.unsubscribe();
    };
  }, []);

  // Synchronize active useBrandVoice toggle with configured brand_voice status
  useEffect(() => {
    if (user) {
      setUseBrandVoice(user.user_metadata?.brand_voice?.enabled || false);
    } else {
      const guestBv = localStorage.getItem("guest_brand_voice");
      if (guestBv) {
        setUseBrandVoice(JSON.parse(guestBv).enabled || false);
      } else {
        setUseBrandVoice(false);
      }
    }
  }, [user?.id]);

  // Load dashboard data whenever user changes
  useEffect(() => {
    const loadData = async () => {
      if (user) {
        try {
          const token = (await supabase.auth.getSession()).data.session?.access_token;
          const res = await getDashboardFn({ data: { userId: user.id, accessToken: token } });
          setGenerations(res.generations || []);
          setWorkspaces(res.workspaces || []);
          setTemplates(res.templates || []);

          // Sync real plan, integrations, AND brand_voice from DB
          const freshPlan = res.plan || "Free";
          const freshIntegrations = res.integrations || { devto: "", medium: "", hashnode: "" };
          const freshBrandVoice = res.brandVoice || { enabled: false, vocabulary: { prefer: "", avoid: "" }, sliders: { depth: 50, exuberance: 50, directness: 50 }, sampleText: "" };
          const currentPlan = user.user_metadata?.plan;
          const currentIntegrations = user.user_metadata?.integrations;
          const currentBrandVoice = user.user_metadata?.brand_voice;

          const planChanged = currentPlan !== freshPlan;
          const integrationsChanged = JSON.stringify(currentIntegrations) !== JSON.stringify(freshIntegrations);
          const brandVoiceChanged = JSON.stringify(currentBrandVoice) !== JSON.stringify(freshBrandVoice);

          if (planChanged || integrationsChanged || brandVoiceChanged) {
            const updatedUser = {
              ...user,
              user_metadata: {
                ...(user.user_metadata || {}),
                plan: freshPlan,
                integrations: freshIntegrations,
                brand_voice: freshBrandVoice,
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
    id?: string;
    url: string;
    tone: string;
    length: string;
    format: string;
    title: string;
    markdown: string;
    seo: any;
    workspaceId?: string;
  }) => {
    const { workspaceId, ...restGen } = gen;
    if (user) {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        const res = await saveGenFn({ 
          data: { 
            userId: user.id, 
            id: gen.id,
            ...restGen,
            workspaceId: workspaceId || selectedWorkspaceId || undefined,
            accessToken: token
          } 
        });
        
        // TanStack router useServerFn response is structurally matched
        const resTyped = res as { generation: any; isUpdate: boolean };
        if (resTyped.isUpdate) {
          setGenerations(prev => prev.map(g => g.id === resTyped.generation.id ? resTyped.generation : g));
          setSelectedVersionId(resTyped.generation.activeVersionId);
          toast.success("Generation version added inside the same workspace!");
        } else {
          setGenerations(prev => [resTyped.generation, ...prev]);
          setSelectedGenId(resTyped.generation.id);
          setSelectedVersionId(resTyped.generation.activeVersionId);
          toast.success("Generation saved to your history!");
        }

        const targetWsId = workspaceId || selectedWorkspaceId;
        const currentWs = workspaces.find(w => w.id === targetWsId);
        if (currentWs) {
          showAlert(`Your blog post "${restGen.title}" has been successfully saved in the "${currentWs.name}" workspace folder!`, {
            title: "Saved to Workspace",
            confirmText: "Awesome",
            icon: "success"
          });
        } else {
          showAlert(`Your blog post "${restGen.title}" has been saved to your history.`, {
            title: "Saved to History",
            confirmText: "Awesome",
            icon: "success"
          });
        }
      } catch (err) {
        console.error("Failed to save generation on backend", err);
      }
    } else {
      if (gen.id) {
        // Update existing guest generation with a new version
        const updated = generations.map(g => {
          if (g.id === gen.id) {
            let versions = g.versions || [];
            if (versions.length === 0) {
              versions = [{
                id: crypto.randomUUID(),
                tone: g.tone || "Professional",
                length: g.length || "Medium",
                format: g.format || "Deep Dive",
                title: g.title || "Version 1",
                markdown: g.markdown || "",
                seo: g.seo || {},
                createdAt: g.createdAt || new Date().toISOString()
              }];
            }
            const newVersionId = crypto.randomUUID();
            const newVersion = {
              id: newVersionId,
              tone: restGen.tone,
              length: restGen.length,
              format: restGen.format,
              title: restGen.title,
              markdown: restGen.markdown,
              seo: restGen.seo,
              createdAt: new Date().toISOString()
            };
            const updatedGen = {
              ...g,
              ...restGen,
              versions: [...versions, newVersion],
              activeVersionId: newVersionId,
              workspaceId: workspaceId || g.workspaceId
            };
            // Set selectedVersionId to new version ID
            setTimeout(() => setSelectedVersionId(newVersionId), 0);
            return updatedGen;
          }
          return g;
        });
        setGenerations(updated);
        localStorage.setItem("guest_generations", JSON.stringify(updated));
        toast.success("New regenerated version saved in guest history!");

        const targetWsId = workspaceId || selectedWorkspaceId;
        const currentWs = workspaces.find(w => w.id === targetWsId);
        if (currentWs) {
          showAlert(`Your blog post "${restGen.title}" has been successfully saved in the "${currentWs.name}" workspace folder!`, {
            title: "Saved to Workspace",
            confirmText: "Awesome",
            icon: "success"
          });
        } else {
          showAlert(`Your blog post "${restGen.title}" has been saved.`, {
            title: "Version Saved",
            confirmText: "Awesome",
            icon: "success"
          });
        }
      } else {
        const newVersionId = crypto.randomUUID();
        const newVersion = {
          id: newVersionId,
          tone: restGen.tone,
          length: restGen.length,
          format: restGen.format,
          title: restGen.title,
          markdown: restGen.markdown,
          seo: restGen.seo,
          createdAt: new Date().toISOString()
        };
        const newGen = {
          id: crypto.randomUUID(),
          ...restGen,
          versions: [newVersion],
          activeVersionId: newVersionId,
          workspaceId: workspaceId || selectedWorkspaceId || undefined,
          createdAt: new Date().toISOString()
        };
        const updated = [newGen, ...generations];
        setGenerations(updated);
        setSelectedGenId(newGen.id);
        setSelectedVersionId(newVersionId);
        localStorage.setItem("guest_generations", JSON.stringify(updated));
        toast.success("Saved to local guest history!");

        const targetWsId = workspaceId || selectedWorkspaceId;
        const currentWs = workspaces.find(w => w.id === targetWsId);
        if (currentWs) {
          showAlert(`Your blog post "${restGen.title}" has been successfully saved in the "${currentWs.name}" workspace folder!`, {
            title: "Saved to Workspace",
            confirmText: "Awesome",
            icon: "success"
          });
        } else {
          showAlert(`Your blog post "${restGen.title}" has been saved to your local guest history.`, {
            title: "Saved to History",
            confirmText: "Awesome",
            icon: "success"
          });
        }
      }
    }
  };

  const handleCreateWorkspace = async () => {
    if (!isPro && workspaces.length >= 1) {
      toast.error("Free users are limited to 1 workspace folder. Please upgrade to Pro in Settings for unlimited folders!");
      return;
    }
    const name = await showPrompt("Give your new workspace folder a name to organize your generations.", {
      title: "Create Workspace Folder",
      placeholder: "e.g. Tech Blog Articles",
      confirmText: "Create Folder",
    });
    if (!name || !name.trim()) return;
    if (user) {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        const res = await createWsFn({ data: { userId: user.id, name: name.trim(), accessToken: token } });
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
    const confirmed = await showConfirm(
      "Are you sure you want to delete this workspace folder? The generations inside it will remain in your history but will be removed from this folder.",
      {
        title: "Delete Workspace",
        confirmText: "Delete Workspace",
        cancelText: "Keep Folder",
        isDestructive: true,
      }
    );
    if (!confirmed) return;
    if (user) {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        await deleteWsFn({ data: { userId: user.id, wsId, accessToken: token } });
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
    const name = await showPrompt(
      "Give this template a name so you can quickly apply these settings to future video imports.",
      {
        title: "Save Config as Template",
        placeholder: "e.g. My Weekly Newsletter",
        confirmText: "Save Template",
      }
    );
    if (!name || !name.trim()) return;
    const tplData = { name: name.trim(), tone, length, format };
    if (user) {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        const res = await createTplFn({ data: { userId: user.id, ...tplData, accessToken: token } });
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
    const confirmed = await showConfirm("Are you sure you want to delete this custom template?", {
      title: "Delete Template",
      confirmText: "Delete",
      cancelText: "Cancel",
      isDestructive: true,
    });
    if (!confirmed) return;
    if (user) {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        await deleteTplFn({ data: { userId: user.id, templateId, accessToken: token } });
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
    const confirmed = await showConfirm(
      "Are you sure you want to permanently delete this generation from your history? This action cannot be undone.",
      {
        title: "Delete Generation",
        confirmText: "Delete Permanently",
        cancelText: "Keep Generation",
        isDestructive: true,
      }
    );
    if (!confirmed) return;
    if (user) {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        await deleteGenFn({ data: { userId: user.id, genId, accessToken: token } });
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
    setSelectedVersionId(gen.activeVersionId || null);
    setUrl(gen.url);
    setTone(gen.tone as Tone);
    setLength(gen.length as Length);
    setFormat(gen.format as BlogFormat);
    setMarkdown(gen.markdown);
    setSeo(gen.seo || {});
  };

  const handleDocumentEdit = (newMd: string) => {
    setMarkdown(newMd);
    if (selectedGenId) {
      setGenerations(prev => prev.map(g => {
        if (g.id === selectedGenId) {
          const vId = selectedVersionId || g.activeVersionId;
          let updatedVersions = g.versions || [];
          if (updatedVersions.length > 0) {
            updatedVersions = updatedVersions.map((v: any) => 
              v.id === vId ? { ...v, markdown: newMd } : v
            );
          }
          return {
            ...g,
            markdown: newMd,
            versions: updatedVersions
          };
        }
        return g;
      }));
    }
  };

  const handleSaveDraft = async (newMd: string) => {
    if (!selectedGenId) return;
    const toastId = toast.loading("Saving changes to history...");
    if (user) {
      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        const res = await updateGenContentFn({
          data: {
            userId: user.id,
            genId: selectedGenId,
            versionId: selectedVersionId || undefined,
            markdown: newMd,
            title: activeVersion?.title,
            seo: activeVersion?.seo,
            accessToken: token
          }
        });
        if (res.success && res.generation) {
          setGenerations(prev => prev.map(g => g.id === selectedGenId ? res.generation : g));
          toast.success("Draft saved successfully!", { id: toastId });
          
          showAlert(`Your draft modifications for "${activeVersion?.title || 'this blog post'}" have been successfully saved to Scribe!`, {
            title: "Draft Saved Successfully",
            confirmText: "Excellent",
            icon: "success"
          });
        } else {
          toast.error(res.error || "Failed to save draft", { id: toastId });
        }
      } catch (err) {
        toast.error("An error occurred while saving your changes.", { id: toastId });
      }
    } else {
      const updated = generations.map(g => {
        if (g.id === selectedGenId) {
          const vId = selectedVersionId || g.activeVersionId;
          let updatedVersions = g.versions || [];
          if (updatedVersions.length > 0) {
            updatedVersions = updatedVersions.map((v: any) => 
              v.id === vId ? { ...v, markdown: newMd } : v
            );
          }
          return {
            ...g,
            markdown: newMd,
            versions: updatedVersions
          };
        }
        return g;
      });
      setGenerations(updated);
      localStorage.setItem("guest_generations", JSON.stringify(updated));
      toast.success("Saved locally to guest history!", { id: toastId });

      showAlert(`Your draft modifications for "${activeVersion?.title || 'this blog post'}" have been saved locally to your guest history!`, {
        title: "Draft Saved Locally",
        confirmText: "Perfect",
        icon: "success"
      });
    }
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
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        await moveGenWsFn({ data: { userId: user.id, genId, wsId, accessToken: token } });
      } catch(err) {
        console.error(err);
      }
    } else {
      localStorage.setItem("guest_generations", JSON.stringify(updatedGens));
    }
    toast.success("Moved generation");
  };

  const handleToggleBrandVoice = async () => {
    const nextVal = !useBrandVoice;
    setUseBrandVoice(nextVal);

    if (user) {
      const stored = localStorage.getItem("custom_session");
      const currentMetadata = stored ? JSON.parse(stored).user_metadata || {} : {};
      
      const updatedBrandVoice = {
        ...(currentMetadata.brand_voice || {
          vocabulary: { prefer: "", avoid: "" },
          sliders: { depth: 50, exuberance: 50, directness: 50 },
          sampleText: ""
        }),
        enabled: nextVal
      };

      const updatedUser = {
        ...user,
        user_metadata: {
          ...currentMetadata,
          brand_voice: updatedBrandVoice
        }
      };

      localStorage.setItem("custom_session", JSON.stringify(updatedUser));
      setUser(updatedUser);
      
      window.dispatchEvent(new Event("auth_changed"));

      try {
        const token = (await supabase.auth.getSession()).data.session?.access_token;
        await updateBrandVoiceFn({
          data: {
            id: user.id,
            brandVoice: updatedBrandVoice,
            accessToken: token
          }
        });
      } catch (err) {
        console.error("Failed to sync brand voice toggle to database:", err);
      }
    } else {
      const guestBv = localStorage.getItem("guest_brand_voice");
      const currentGuestBv = guestBv ? JSON.parse(guestBv) : {
        vocabulary: { prefer: "", avoid: "" },
        sliders: { depth: 50, exuberance: 50, directness: 50 },
        sampleText: ""
      };
      currentGuestBv.enabled = nextVal;
      localStorage.setItem("guest_brand_voice", JSON.stringify(currentGuestBv));
      window.dispatchEvent(new Event("auth_changed"));
    }

    toast.success(nextVal ? "Brand Voice Clone activated!" : "Brand Voice Clone deactivated.");
  };

  const displayName = user ? (user.user_metadata?.full_name || user.email?.split("@")[0] || "User") : "Guest User";
  const avatarInitials = user ? displayName.substring(0, 2).toUpperCase() : "G";
  const displayPlan = user ? (user.user_metadata?.plan || user.plan || "Free") : "Free";
  const isPro = displayPlan === "Pro";

  const validUrl = useMemo(
    () => /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/i.test(url.trim()),
    [url],
  );

  const submit = async (e?: React.FormEvent, isRegen = false) => {
    e?.preventDefault();
    if (!validUrl || loading) return;

    if (!isRegen && !isPro && usageCount >= 10) {
      toast.error("You've reached your free usage limit of 10 (generations + workspaces). Please upgrade to Pro in Settings for unlimited access!");
      setError("Free usage limit (10) reached. Upgrade to Pro for unlimited access.");
      return;
    }

    if (isRegen && !isPro) {
      if (selectedGenId) {
        const gen = generations.find(g => g.id === selectedGenId);
        const versionsCount = gen?.versions?.length || 0;
        if (versionsCount >= 4) {
          toast.error("Free users are limited to 3 regenerations per post. Please upgrade to Pro in Settings for unlimited regenerations!");
          setError("Regeneration limit (3) reached. Upgrade to Pro for unlimited regenerations.");
          return;
        }
      }
    }

    setLoading(true);
    setError(null);
    setMarkdown("");
    setSeo({});
    setStepIdx(0);

    const stepTimer = setInterval(() => {
      setStepIdx((i) => (i < STEPS.length - 1 ? i + 1 : i));
    }, 2500);

    try {
      let activeBvData: any = undefined;
      if (useBrandVoice) {
        if (user) {
          const bv = user.user_metadata?.brand_voice;
          if (bv) {
            activeBvData = { ...bv, enabled: true };
          }
        } else {
          const guestBv = localStorage.getItem("guest_brand_voice");
          if (guestBv) {
            activeBvData = { ...JSON.parse(guestBv), enabled: true };
          } else {
            // Default guest fallback
            activeBvData = {
              enabled: true,
              vocabulary: { prefer: "", avoid: "" },
              sliders: { depth: 50, exuberance: 50, directness: 50 },
              sampleText: ""
            };
          }
        }
      }

      const res = await run({
        data: { 
          url: url.trim(), 
          tone, 
          length, 
          format,
          brandVoice: activeBvData
        },
      });
      if (res.error) {
        setError(res.error);
      } else {
        setMarkdown(res.markdown ?? "");
        setSeo(res.seo ?? {});
        setStepIdx(STEPS.length);

        // Save or update history
        const title = res.seo?.title || `Article: ${url.replace(/https?:\/\/(www\.)?/, "").substring(0, 30)}`;
        
        let targetWorkspaceId = selectedWorkspaceId || undefined;
        if (isRegen && selectedGenId) {
          const existing = generations.find(g => g.id === selectedGenId);
          if (existing?.workspaceId) {
            targetWorkspaceId = existing.workspaceId;
          }
        }

        await handleSaveGeneration({
          id: (isRegen && selectedGenId) ? selectedGenId : undefined,
          url: url.trim(),
          tone,
          length,
          format,
          title,
          markdown: res.markdown ?? "",
          seo: res.seo ?? {},
          workspaceId: targetWorkspaceId
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

    showAlert("The complete blog post markdown has been copied to your clipboard. You can now paste it directly into your CMS or text editor!", {
      title: "Copied to Clipboard",
      confirmText: "Got it",
      icon: "success"
    });
  };

  const download = (kind: "md" | "txt") => {
    const blob = new Blob([markdown], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const fileName = `${(seo.title ?? "blog-post").replace(/[^\w-]+/g, "-").toLowerCase()}.${kind}`;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);

    showAlert(`Your blog post has been successfully downloaded as "${fileName}"!`, {
      title: "Download Started",
      confirmText: "Excellent",
      icon: "success"
    });
  };

  const handlePublish = async (platform: "devto" | "medium" | "hashnode") => {
    if (!user) {
      toast.error("Please log in to publish drafts directly to your blog platforms.", {
        action: {
          label: "Log In",
          onClick: () => window.location.href = "/auth"
        }
      });
      return;
    }

    const ints = user.user_metadata?.integrations || {};
    const hasKey = ints[platform] && ints[platform].trim().length > 0;

    if (!hasKey) {
      const platformName = platform === "devto" ? "Dev.to" : platform === "medium" ? "Medium" : "Hashnode";
      const keyLabel = platform === "devto" ? "API Key" : "Integration Token";
      toast.error(`No ${platformName} ${keyLabel} found`, {
        description: `Add your ${platformName} ${keyLabel} in Settings → Integrations to publish drafts directly.`,
        duration: 6000,
        action: {
          label: "Add API Key →",
          onClick: () => openSettings("integrations")
        }
      });
      return;
    }

    const platformLabel = platform === "devto" ? "Dev.to" : platform === "medium" ? "Medium" : "Hashnode";
    const toastId = toast.loading(`Connecting to ${platformLabel} self-publishing API...`);

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const result = await publishContentFn({
        data: {
          userId: user.id,
          platform,
          title: seo.title || "Untitled Post",
          markdown,
          tags: seo.tags || [],
          accessToken: token
        }
      });

      if (result.success) {
        toast.success(`Draft published to ${platformLabel}! Click "Open Drafts" to view it.`, {
          id: toastId,
          duration: 8000,
          action: {
            label: "Open Drafts ↗",
            onClick: () => {
              window.open(result.url, "_blank", "noopener,noreferrer");
            }
          }
        });

        showAlert(`Draft published successfully to ${platformLabel}! You can now open your ${platformLabel} drafts dashboard to review and schedule it.`, {
          title: `Published to ${platformLabel}`,
          confirmText: "Superb",
          icon: "success"
        });
      }
    } catch (err: any) {
      toast.error(err.message || `Failed to publish draft to ${platformLabel}.`, { id: toastId });
    }
  };

  return (
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
          {isPro ? (
            <div className="mb-4 px-2">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-muted-foreground">Generations</span>
                <span className="font-semibold text-accent">Unlimited</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-accent/20 overflow-hidden">
                <div className="h-full bg-accent w-full"></div>
              </div>
            </div>
          ) : (
            <div className="mb-4 px-2">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-muted-foreground">Generations & Workspaces</span>
                <span className="font-medium text-muted-foreground">{usageCount} / 10</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                <div 
                  className="h-full bg-accent transition-all duration-500" 
                  style={{ width: `${Math.min(100, (usageCount / 10) * 100)}%` }}
                ></div>
              </div>
              {!user && (
                <Link to="/auth" className="mt-2 block text-xs text-accent hover:underline w-full text-left font-medium">
                  Sign up for a free cloud account
                </Link>
              )}
            </div>
          )}


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

              <div className="grid gap-4 md:grid-cols-4">
                <OptionSelect label="Tone" value={tone} onChange={(v) => setTone(v as Tone)} options={["Professional", "Casual", "Technical", "Educational"]} disabled={loading || useBrandVoice} />
                <OptionSelect label="Length" value={length} onChange={(v) => setLength(v as Length)} options={["Short", "Medium", "Long"]} disabled={loading} />
                <OptionSelect label="Format" value={format} onChange={(v) => setFormat(v as BlogFormat)} options={["How-to Guide", "Listicle", "Deep Dive", "Summary"]} disabled={loading} />
                
                {/* Brand Voice Toggle Card */}
                <div className={`flex flex-col justify-between p-3.5 rounded-xl border backdrop-blur-sm transition-all duration-300 ${useBrandVoice ? 'bg-accent/10 border-accent/30 shadow-soft' : 'bg-background/40 border-border/40'}`}>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 font-semibold">
                      🎙️ Voice Clone
                    </Label>
                    <span className="relative flex size-2">
                      <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${useBrandVoice ? 'bg-accent' : 'bg-muted-foreground/35'}`}></span>
                      <span className={`relative inline-flex rounded-full size-2 ${useBrandVoice ? 'bg-accent' : 'bg-muted-foreground/50'}`}></span>
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between mt-2 gap-2">
                    <button
                      type="button"
                      onClick={handleToggleBrandVoice}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all duration-200 ${useBrandVoice ? 'bg-accent/15 border-accent/30 text-accent' : 'bg-secondary/40 border-border/40 text-muted-foreground hover:bg-secondary/60 hover:text-foreground'}`}
                      disabled={loading}
                    >
                      {useBrandVoice ? "Active" : "Off"}
                    </button>
                    <button
                      type="button"
                      onClick={() => openSettings("personalization")}
                      className="text-[10px] text-muted-foreground hover:text-accent hover:underline flex items-center gap-0.5"
                    >
                      Configure →
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  type="submit"
                  disabled={!validUrl || loading}
                  className="h-14 flex-1 rounded-xl bg-accent text-base font-semibold text-accent-foreground transition hover:bg-accent/90 disabled:opacity-50"
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setBatchOpen(true)}
                  className="h-14 px-5 rounded-xl border-border/60 bg-background/50 hover:bg-accent/10 hover:border-accent/30 transition-all"
                  title="Batch process multiple videos"
                >
                  <Layers className="size-5 text-accent" />
                </Button>
              </div>
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

              <SeoScoreDashboard markdown={markdown} seo={seo} />

              <Card className="border-border/60 bg-card/60 p-6 backdrop-blur md:p-8 shadow-sm">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
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
                      <button
                        onClick={() => setView("editor")}
                        className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${view === "editor" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
                      >
                        📝 Document Editor
                      </button>
                    </div>

                    {activeVersions.length > 1 && (
                      <div className="inline-flex items-center gap-1.5 bg-background/40 border border-border/40 rounded-lg p-1">
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold pl-2 pr-0.5 select-none">
                          Versions
                        </span>
                        <div className="flex gap-0.5">
                          {activeVersions.map((ver: any, idx: number) => {
                            const isSelected = activeVersion?.id === ver.id;
                            return (
                              <button
                                key={ver.id}
                                onClick={() => setSelectedVersionId(ver.id)}
                                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                                  isSelected
                                    ? "bg-accent/15 text-accent border border-accent/25"
                                    : "text-muted-foreground hover:text-foreground hover:bg-accent/5 border border-transparent"
                                }`}
                              >
                                v{idx + 1}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeGen && (
                      <Button 
                        variant="default" 
                        size="sm" 
                        onClick={() => handleSaveDraft(markdown)} 
                        className="bg-accent text-accent-foreground hover:bg-accent/90 shadow-sm transition-all duration-200"
                      >
                        <Save className="mr-1.5 size-3.5" /> Save Draft
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={copy} className="bg-background/50">
                      <Copy className="mr-1.5 size-3.5" /> {copied ? "Copied!" : "Copy"}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => download("md")} className="bg-background/50">
                      <Download className="mr-1.5 size-3.5" /> .md
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="bg-background/50 border-accent/20 hover:border-accent/40 text-foreground">
                          <Globe className="mr-1.5 size-3.5 text-accent animate-pulse" /> Publish
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-[180px] bg-card border-border text-foreground rounded-xl shadow-lg p-1" align="end">
                        <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground px-2 py-1 uppercase tracking-wider">Publish Draft</DropdownMenuLabel>
                        <DropdownMenuSeparator className="bg-border" />
                        <DropdownMenuItem 
                          onSelect={() => handlePublish("devto")}
                          className="text-xs gap-2.5 rounded-lg cursor-pointer py-2 hover:bg-accent/10 focus:bg-accent/10 focus:text-accent font-semibold transition-colors"
                        >
                          <svg className="size-4 shrink-0 rounded" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect width="24" height="24" rx="4" fill="#09090b" />
                            <text x="50%" y="58%" dominantBaseline="middle" textAnchor="middle" fill="#ffffff" fontSize="9" fontFamily="Inter, system-ui, sans-serif" fontWeight="900">DEV</text>
                          </svg>
                          Dev.to Draft
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onSelect={() => handlePublish("medium")}
                          className="text-xs gap-2.5 rounded-lg cursor-pointer py-2 hover:bg-accent/10 focus:bg-accent/10 focus:text-accent font-semibold transition-colors"
                        >
                          <svg className="size-4 shrink-0 text-foreground" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="5" cy="12" r="5" />
                            <ellipse cx="14" cy="12" rx="2.5" ry="5" />
                            <ellipse cx="20.5" cy="12" rx="1" ry="4.7" />
                          </svg>
                          Medium Draft
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onSelect={() => handlePublish("hashnode")}
                          className="text-xs gap-2.5 rounded-lg cursor-pointer py-2 hover:bg-accent/10 focus:bg-accent/10 focus:text-accent font-semibold transition-colors"
                        >
                          <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect width="24" height="24" rx="5" fill="#2962FF" />
                            <circle cx="12" cy="12" r="4.5" stroke="#ffffff" strokeWidth="2.5" />
                          </svg>
                          Hashnode Draft
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <RepurposeDropdown markdown={markdown} seo={seo} />
                    <Button variant="outline" size="sm" onClick={() => submit(undefined, true)} disabled={loading} className="bg-background/50">
                      <RotateCw className="mr-1.5 size-3.5" /> Regenerate
                    </Button>
                  </div>
                </div>

                {view === "preview" ? (
                  <>
                    <article ref={articleRef} className="prose-blog">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{markdown}</ReactMarkdown>
                    </article>
                    <InlineEditor
                      markdown={markdown}
                      onEdit={handleDocumentEdit}
                      containerRef={articleRef}
                    />
                  </>
                ) : view === "editor" ? (
                  <DocumentEditor
                    markdown={markdown}
                    onEdit={handleDocumentEdit}
                    onSave={() => handleSaveDraft(markdown)}
                  />
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
      <BatchQueue
        open={batchOpen}
        onOpenChange={setBatchOpen}
        onSaveGeneration={(gen) => handleSaveGeneration(gen)}
        isPro={isPro}
        generationCount={usageCount}
      />
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

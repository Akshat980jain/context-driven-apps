import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { repurposeContent } from "@/lib/ai.functions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Share2, Twitter, Linkedin, Mail, Copy, CheckCircle2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useCustomDialog } from "@/hooks/use-custom-dialog";

interface RepurposeDropdownProps {
  markdown: string;
  seo: {
    title?: string;
    tags?: string[];
  };
}

type Platform = "twitter" | "linkedin" | "newsletter";

const PLATFORMS: Array<{
  key: Platform;
  label: string;
  icon: React.ReactNode;
  description: string;
  color: string;
}> = [
  {
    key: "twitter",
    label: "Twitter/X Thread",
    icon: <Twitter className="size-4" />,
    description: "Numbered thread with hooks",
    color: "text-sky-400",
  },
  {
    key: "linkedin",
    label: "LinkedIn Post",
    icon: <Linkedin className="size-4" />,
    description: "Professional engagement post",
    color: "text-blue-500",
  },
  {
    key: "newsletter",
    label: "Newsletter Snippet",
    icon: <Mail className="size-4" />,
    description: "Email-ready with subject line",
    color: "text-amber-400",
  },
];

export function RepurposeDropdown({ markdown, seo }: RepurposeDropdownProps) {
  const { showAlert } = useCustomDialog();
  const [resultOpen, setResultOpen] = useState(false);
  const [resultContent, setResultContent] = useState("");
  const [resultPlatform, setResultPlatform] = useState<Platform | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const repurposeFn = useServerFn(repurposeContent);

  const handleRepurpose = async (platform: Platform) => {
    setLoading(true);
    setResultPlatform(platform);
    setResultContent("");
    setResultOpen(true);

    const platformLabel = PLATFORMS.find((p) => p.key === platform)?.label || platform;
    const toastId = toast.loading(`Generating ${platformLabel}...`);

    setTimeout(() => {
      toast.loading(`Analyzing content structure...`, { id: toastId });
    }, 800);

    setTimeout(() => {
      toast.loading(`Writing ${platformLabel.toLowerCase()}...`, { id: toastId });
    }, 1800);

    try {
      const result = await repurposeFn({
        data: {
          markdown,
          title: seo.title,
          tags: seo.tags,
          platform,
        },
      });

      if (result.error) {
        toast.error(`Failed: ${result.error}`, { id: toastId });
        setResultContent(`Error: ${result.error}`);
      } else {
        toast.success(`${platformLabel} generated!`, { id: toastId, duration: 3000 });
        setResultContent(result.content);
        
        showAlert(`Your blog post has been successfully repurposed into a ${platformLabel}!`, {
          title: "Repurposing Successful",
          confirmText: "View Post",
          icon: "success"
        });
      }
    } catch (err) {
      toast.error("Repurpose failed. Please try again.", { id: toastId });
      setResultContent(`Error: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(resultContent);
    setCopied(true);
    toast.success("Copied to clipboard!");
    setTimeout(() => setCopied(false), 1500);

    const platformLabel = PLATFORMS.find((p) => p.key === resultPlatform)?.label || "content";
    showAlert(`The generated ${platformLabel} has been copied to your clipboard!`, {
      title: "Copied successfully",
      confirmText: "Awesome",
      icon: "success"
    });
  };

  const platformConfig = PLATFORMS.find((p) => p.key === resultPlatform);

  // Calculate stats for the result
  const wordCount = resultContent.split(/\s+/).filter(Boolean).length;
  const charCount = resultContent.length;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="bg-background/50 border-accent/20 hover:border-accent/40 text-foreground"
          >
            <Share2 className="mr-1.5 size-3.5 text-accent" /> Repurpose
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[220px] bg-card border-border text-foreground rounded-xl shadow-lg p-1"
          align="end"
        >
          <DropdownMenuLabel className="text-[10px] font-bold text-muted-foreground px-2 py-1 uppercase tracking-wider">
            Repurpose as...
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-border" />
          {PLATFORMS.map((platform) => (
            <DropdownMenuItem
              key={platform.key}
              onSelect={() => handleRepurpose(platform.key)}
              className="text-xs gap-2.5 rounded-lg cursor-pointer py-2.5 hover:bg-accent/10 focus:bg-accent/10 focus:text-accent font-semibold transition-colors"
            >
              <span className={platform.color}>{platform.icon}</span>
              <div className="flex flex-col gap-0.5">
                <span>{platform.label}</span>
                <span className="text-[10px] font-normal text-muted-foreground">
                  {platform.description}
                </span>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Result Modal */}
      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="max-w-lg p-0 overflow-hidden bg-card border-border text-foreground shadow-2xl rounded-2xl">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-border/40">
            <DialogHeader className="space-y-0">
              <DialogTitle className="flex items-center gap-2 text-base font-semibold text-foreground">
                {platformConfig && (
                  <span className={platformConfig.color}>{platformConfig.icon}</span>
                )}
                {platformConfig?.label || "Repurposed Content"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {loading
                  ? "AI is generating your content..."
                  : `${wordCount} words · ${charCount.toLocaleString()} chars`}
              </DialogDescription>
            </DialogHeader>
            {!loading && resultContent && (
              <Button
                size="sm"
                onClick={handleCopy}
                className="bg-accent hover:bg-accent/90 text-accent-foreground gap-1.5 font-semibold"
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="size-3.5" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="size-3.5" /> Copy
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Content Area */}
          <div className="p-5 max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="relative">
                  <div className="size-12 rounded-full border-2 border-accent/20 border-t-accent animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    {platformConfig && (
                      <span className={`${platformConfig.color} animate-pulse`}>
                        {platformConfig.icon}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground animate-pulse">
                  Transforming your blog post...
                </p>
              </div>
            ) : (
              <div
                className={`whitespace-pre-wrap text-sm leading-relaxed font-sans ${
                  resultPlatform === "twitter"
                    ? "space-y-0"
                    : ""
                }`}
              >
                {resultPlatform === "twitter" ? (
                  // Special rendering for Twitter threads
                  <div className="space-y-3">
                    {resultContent.split(/\n(?=\d+\/)/).map((tweet, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-border/40 bg-background/40 p-3 text-xs leading-relaxed"
                      >
                        {tweet.trim()}
                      </div>
                    ))}
                  </div>
                ) : resultPlatform === "newsletter" ? (
                  // Special rendering for newsletter
                  <div className="space-y-3">
                    {resultContent.split("\n").map((line, idx) => {
                      if (line.startsWith("Subject:")) {
                        return (
                          <div key={idx} className="rounded-lg bg-accent/10 border border-accent/20 px-3 py-2">
                            <span className="text-[10px] uppercase tracking-wider font-bold text-accent">Subject</span>
                            <p className="text-sm font-semibold text-foreground mt-0.5">
                              {line.replace("Subject:", "").trim()}
                            </p>
                          </div>
                        );
                      }
                      if (line.startsWith("Preview text:")) {
                        return (
                          <div key={idx} className="rounded-lg bg-background/60 border border-border/40 px-3 py-2">
                            <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Preview</span>
                            <p className="text-xs text-muted-foreground mt-0.5 italic">
                              {line.replace("Preview text:", "").trim()}
                            </p>
                          </div>
                        );
                      }
                      return (
                        <p key={idx} className="text-xs leading-relaxed text-foreground/90">
                          {line}
                        </p>
                      );
                    })}
                  </div>
                ) : (
                  // Default (LinkedIn)
                  <p className="text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap">
                    {resultContent}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          {!loading && resultContent && (
            <div className="px-5 py-3 border-t border-border/40 bg-background/30 flex items-center justify-between">
              <p className="text-[10px] text-muted-foreground">
                Generated from "{seo.title?.slice(0, 40) || "Untitled"}..."
              </p>
              <button
                onClick={() => setResultOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { batchConvertVideo } from "@/lib/ai.functions";
import { convertVideo } from "@/lib/convert.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Layers,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  Copy,
  Download,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

interface BatchQueueProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveGeneration: (gen: {
    url: string;
    tone: string;
    length: string;
    format: string;
    title: string;
    markdown: string;
    seo: any;
  }) => void;
  isPro: boolean;
  generationCount: number;
}

type BatchItemStatus = "queued" | "processing" | "done" | "error";

interface BatchItem {
  url: string;
  status: BatchItemStatus;
  markdown?: string;
  seo?: any;
  error?: string;
  expanded?: boolean;
}

const URL_REGEX = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/i;

export function BatchQueue({
  open,
  onOpenChange,
  onSaveGeneration,
  isPro,
  generationCount,
}: BatchQueueProps) {
  const [rawUrls, setRawUrls] = useState("");
  const [tone, setTone] = useState("Professional");
  const [length, setLength] = useState("Medium");
  const [format, setFormat] = useState("Deep Dive");
  const [processing, setProcessing] = useState(false);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [phase, setPhase] = useState<"input" | "progress">("input");

  const convertFn = useServerFn(convertVideo);

  const maxBatch = isPro ? 20 : 5;
  const remainingGens = isPro ? Infinity : 10 - generationCount;

  const parsedUrls = useMemo(() => {
    return rawUrls
      .split("\n")
      .map((u) => u.trim())
      .filter((u) => u.length > 0);
  }, [rawUrls]);

  const validUrls = useMemo(() => parsedUrls.filter((u) => URL_REGEX.test(u)), [parsedUrls]);
  const invalidUrls = useMemo(() => parsedUrls.filter((u) => !URL_REGEX.test(u)), [parsedUrls]);

  const canStart =
    validUrls.length > 0 &&
    validUrls.length <= maxBatch &&
    (isPro || validUrls.length <= remainingGens);

  const handleStart = async () => {
    if (!canStart || processing) return;

    const batchItems: BatchItem[] = validUrls.map((url) => ({
      url,
      status: "queued" as BatchItemStatus,
    }));

    setItems(batchItems);
    setPhase("progress");
    setProcessing(true);

    const toastId = toast.loading(
      `Processing ${validUrls.length} video${validUrls.length > 1 ? "s" : ""}...`
    );

    let userId: string | undefined = undefined;
    // Retrieve active Brand Voice Clone settings if enabled
    let activeBvData: any = undefined;
    const stored = localStorage.getItem("custom_session");
    if (stored) {
      const u = JSON.parse(stored);
      userId = u.id;
      const bv = u.user_metadata?.brand_voice;
      if (bv && bv.enabled) {
        activeBvData = bv;
      }
    } else {
      const guestBv = localStorage.getItem("guest_brand_voice");
      if (guestBv) {
        const parsed = JSON.parse(guestBv);
        if (parsed.enabled) {
          activeBvData = parsed;
        }
      }
    }

    try {
      const activeTasks = [...validUrls];
      let completedCount = 0;
      let successCount = 0;
      let errorCount = 0;

      const runTask = async (url: string, index: number) => {
        setItems((prev) =>
          prev.map((item, idx) => (idx === index ? { ...item, status: "processing" as BatchItemStatus } : item))
        );

        try {
          const token = userId ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
          const res = await convertFn({
            data: {
              url,
              tone: tone as any,
              length: length as any,
              format: format as any,
              brandVoice: activeBvData,
              userId,
              accessToken: token
            }
          });

          if (res.error) {
            setItems((prev) =>
              prev.map((item, idx) => (idx === index ? { ...item, status: "error" as BatchItemStatus, error: res.error } : item))
            );
            errorCount++;
          } else {
            setItems((prev) =>
              prev.map((item, idx) => (idx === index ? { ...item, status: "done" as BatchItemStatus, markdown: res.markdown, seo: res.seo } : item))
            );
            successCount++;
          }
        } catch (err: any) {
          setItems((prev) =>
            prev.map((item, idx) => (idx === index ? { ...item, status: "error" as BatchItemStatus, error: err.message } : item))
          );
          errorCount++;
        } finally {
          completedCount++;
          toast.loading(`Processed ${completedCount}/${validUrls.length} videos...`, { id: toastId });
        }
      };

      // Process tasks with a concurrency limit of 3
      const limit = 3;
      const workers: Promise<void>[] = [];
      
      const pool = async () => {
        while (activeTasks.length > 0) {
          const url = activeTasks.shift()!;
          const index = validUrls.indexOf(url);
          await runTask(url, index);
        }
      };

      for (let w = 0; w < Math.min(limit, validUrls.length); w++) {
        workers.push(pool());
      }

      await Promise.all(workers);

      if (errorCount === 0) {
        toast.success(`All ${successCount} blog posts generated successfully!`, {
          id: toastId,
          duration: 5000,
        });
      } else {
        toast.warning(`${successCount} succeeded, ${errorCount} failed.`, {
          id: toastId,
          duration: 5000,
        });
      }
    } catch (err) {
      toast.error("Batch processing failed.", { id: toastId });
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveItem = (item: BatchItem) => {
    if (!item.markdown) return;
    const title =
      item.seo?.title ||
      `Article: ${item.url.replace(/https?:\/\/(www\.)?/, "").substring(0, 30)}`;
    onSaveGeneration({
      url: item.url,
      tone,
      length,
      format,
      title,
      markdown: item.markdown,
      seo: item.seo || {},
    });
    toast.success(`"${title.slice(0, 40)}..." saved to history!`);
  };

  const handleSaveAll = () => {
    const doneItems = items.filter((i) => i.status === "done" && i.markdown);
    doneItems.forEach((item) => handleSaveItem(item));
    toast.success(`${doneItems.length} blog posts saved to history!`);
  };

  const toggleExpand = (idx: number) => {
    setItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, expanded: !item.expanded } : item))
    );
  };

  const handleReset = () => {
    setPhase("input");
    setItems([]);
    setRawUrls("");
  };

  const doneCount = items.filter((i) => i.status === "done").length;
  const errorCount = items.filter((i) => i.status === "error").length;
  const totalCount = items.length;

  const statusIcon = (status: BatchItemStatus) => {
    switch (status) {
      case "queued":
        return <Clock className="size-3.5 text-muted-foreground" />;
      case "processing":
        return <Loader2 className="size-3.5 text-accent animate-spin" />;
      case "done":
        return <CheckCircle2 className="size-3.5 text-emerald-500" />;
      case "error":
        return <XCircle className="size-3.5 text-destructive" />;
    }
  };

  const statusBadge = (status: BatchItemStatus) => {
    const variants: Record<BatchItemStatus, string> = {
      queued: "bg-muted text-muted-foreground",
      processing: "bg-accent/15 text-accent border-accent/30",
      done: "bg-emerald-500/10 text-emerald-500 border-emerald-500/30",
      error: "bg-destructive/10 text-destructive border-destructive/30",
    };
    const labels: Record<BatchItemStatus, string> = {
      queued: "Queued",
      processing: "Processing",
      done: "Done",
      error: "Failed",
    };
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${variants[status]}`}>
        {statusIcon(status)}
        {labels[status]}
      </span>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden bg-card border-border text-foreground shadow-2xl rounded-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-border/40">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <div className="inline-flex size-8 items-center justify-center rounded-lg bg-accent/10 border border-accent/20">
                <Layers className="size-4 text-accent" />
              </div>
              Batch Queue
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              {phase === "input"
                ? `Paste multiple YouTube URLs (one per line) to generate blog posts in batch. Max ${maxBatch} per batch.`
                : `Processing ${totalCount} video${totalCount > 1 ? "s" : ""} — ${doneCount} done, ${errorCount} failed.`}
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {phase === "input" ? (
            <div className="space-y-5">
              {/* URL Input */}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  YouTube URLs (one per line)
                </Label>
                <textarea
                  value={rawUrls}
                  onChange={(e) => setRawUrls(e.target.value)}
                  placeholder={"https://www.youtube.com/watch?v=abc123\nhttps://youtu.be/def456\nhttps://www.youtube.com/watch?v=ghi789"}
                  className="w-full h-32 rounded-xl border border-border bg-background/60 px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
                />
                <div className="flex items-center gap-3 text-xs">
                  {validUrls.length > 0 && (
                    <span className="text-emerald-500 flex items-center gap-1">
                      <CheckCircle2 className="size-3" />
                      {validUrls.length} valid URL{validUrls.length > 1 ? "s" : ""}
                    </span>
                  )}
                  {invalidUrls.length > 0 && (
                    <span className="text-destructive flex items-center gap-1">
                      <XCircle className="size-3" />
                      {invalidUrls.length} invalid
                    </span>
                  )}
                  {validUrls.length > maxBatch && (
                    <span className="text-amber-400 flex items-center gap-1">
                      <AlertCircle className="size-3" />
                      Max {maxBatch} URLs per batch ({isPro ? "Pro" : "Free"})
                    </span>
                  )}
                  {!isPro && validUrls.length > remainingGens && remainingGens > 0 && (
                    <span className="text-amber-400 flex items-center gap-1">
                      <AlertCircle className="size-3" />
                      Only {remainingGens} generation{remainingGens > 1 ? "s" : ""} remaining
                    </span>
                  )}
                </div>
              </div>

              {/* Settings Row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Tone
                  </Label>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger className="h-9 rounded-lg border-border bg-background/60 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["Professional", "Casual", "Technical", "Educational"].map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Length
                  </Label>
                  <Select value={length} onValueChange={setLength}>
                    <SelectTrigger className="h-9 rounded-lg border-border bg-background/60 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["Short", "Medium", "Long"].map((l) => (
                        <SelectItem key={l} value={l}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                    Format
                  </Label>
                  <Select value={format} onValueChange={setFormat}>
                    <SelectTrigger className="h-9 rounded-lg border-border bg-background/60 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["How-to Guide", "Listicle", "Deep Dive", "Summary"].map((f) => (
                        <SelectItem key={f} value={f}>
                          {f}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Overall Progress */}
              {processing && (
                <div className="mb-4">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">Overall Progress</span>
                    <span className="font-semibold text-foreground">
                      {doneCount + errorCount}/{totalCount}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-border/50 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all duration-500 batch-progress-bar"
                      style={{
                        width: `${((doneCount + errorCount) / totalCount) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Items List */}
              {items.map((item, idx) => (
                <div
                  key={idx}
                  className={`rounded-xl border transition-all ${
                    item.status === "processing"
                      ? "border-accent/30 bg-accent/5"
                      : item.status === "done"
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : item.status === "error"
                          ? "border-destructive/20 bg-destructive/5"
                          : "border-border/40 bg-background/30"
                  }`}
                >
                  {/* Item Header */}
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer"
                    onClick={() => item.status === "done" && toggleExpand(idx)}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {statusBadge(item.status)}
                      <span className="text-xs text-foreground truncate font-mono">
                        {item.seo?.title || item.url.replace(/https?:\/\/(www\.)?/, "").substring(0, 50)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {item.status === "done" && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSaveItem(item);
                            }}
                            className="text-[10px] font-semibold text-accent hover:underline"
                          >
                            Save
                          </button>
                          {item.expanded ? (
                            <ChevronUp className="size-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="size-3.5 text-muted-foreground" />
                          )}
                        </>
                      )}
                      {item.status === "error" && (
                        <span className="text-[10px] text-destructive max-w-[150px] truncate">
                          {item.error}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expanded Preview */}
                  {item.expanded && item.markdown && (
                    <div className="px-4 pb-4 border-t border-border/30">
                      <div className="mt-3 flex items-center gap-2 mb-2">
                        {item.seo?.tags?.slice(0, 3).map((tag: string) => (
                          <Badge key={tag} variant="secondary" className="text-[10px] rounded-full">
                            #{tag}
                          </Badge>
                        ))}
                        {item.seo?.readingTime && (
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {item.seo.readingTime}
                          </span>
                        )}
                      </div>
                      <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background/60 p-3 font-mono text-[10px] text-muted-foreground">
                        {item.markdown.slice(0, 1000)}
                        {item.markdown.length > 1000 ? "\n\n... (truncated)" : ""}
                      </pre>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(item.markdown || "");
                            toast.success("Copied to clipboard!");
                          }}
                          className="text-[10px] font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                        >
                          <Copy className="size-3" /> Copy
                        </button>
                        <button
                          onClick={() => {
                            const blob = new Blob([item.markdown || ""], { type: "text/plain" });
                            const a = document.createElement("a");
                            a.href = URL.createObjectURL(blob);
                            a.download = `${(item.seo?.title || "blog").replace(/[^\w-]+/g, "-").toLowerCase()}.md`;
                            a.click();
                          }}
                          className="text-[10px] font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                        >
                          <Download className="size-3" /> Download .md
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-border/40 bg-background/20 flex items-center justify-between">
          {phase === "input" ? (
            <>
              <p className="text-[10px] text-muted-foreground">
                {isPro ? "Pro: up to 20 URLs" : `Free: up to ${Math.min(maxBatch, remainingGens)} URLs`}
              </p>
              <Button
                onClick={handleStart}
                disabled={!canStart}
                className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold gap-2"
              >
                <Zap className="size-4" />
                Generate {validUrls.length > 0 ? validUrls.length : ""} Blog Post
                {validUrls.length !== 1 ? "s" : ""}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={handleReset} disabled={processing}>
                ← New Batch
              </Button>
              <div className="flex items-center gap-2">
                {doneCount > 0 && !processing && (
                  <Button
                    onClick={handleSaveAll}
                    className="bg-accent hover:bg-accent/90 text-accent-foreground font-semibold gap-1.5"
                    size="sm"
                  >
                    <CheckCircle2 className="size-3.5" />
                    Save All ({doneCount})
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useServerFn } from "@tanstack/react-start";
import { refineText } from "@/lib/ai.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  Minus,
  Plus,
  Lightbulb,
  Feather,
  Smile,
  Briefcase,
  Code2,
  SpellCheck,
  Loader2,
  X,
  Wand2,
  PenLine,
  Check,
  ChevronLeft,
} from "lucide-react";

interface InlineEditorProps {
  markdown: string;
  onEdit: (newMarkdown: string) => void;
  containerRef: React.RefObject<HTMLElement | null>;
  user?: any;
}

type ActionType =
  | "shorten"
  | "lengthen"
  | "example"
  | "simplify"
  | "casual"
  | "professional"
  | "technical"
  | "grammar";

const ACTIONS: Array<{ key: ActionType; label: string; icon: React.ReactNode; color: string }> = [
  { key: "shorten", label: "Shorter", icon: <Minus className="size-3" />, color: "text-blue-400" },
  { key: "lengthen", label: "Longer", icon: <Plus className="size-3" />, color: "text-emerald-400" },
  { key: "example", label: "Example", icon: <Lightbulb className="size-3" />, color: "text-amber-400" },
  { key: "simplify", label: "Simplify", icon: <Feather className="size-3" />, color: "text-purple-400" },
  { key: "casual", label: "Casual", icon: <Smile className="size-3" />, color: "text-pink-400" },
  { key: "professional", label: "Pro Tone", icon: <Briefcase className="size-3" />, color: "text-sky-400" },
  { key: "technical", label: "Technical", icon: <Code2 className="size-3" />, color: "text-orange-400" },
  { key: "grammar", label: "Fix Grammar", icon: <SpellCheck className="size-3" />, color: "text-teal-400" },
];

export function InlineEditor({ markdown, onEdit, containerRef, user }: InlineEditorProps) {
  const [selectedText, setSelectedText] = useState("");
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [isManualEditing, setIsManualEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const toolbarRef = useRef<HTMLDivElement>(null);
  const refineFn = useServerFn(refineText);

  const handleMouseUp = useCallback(() => {
    // Small delay to let the browser finalize the selection
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !containerRef.current) {
        return;
      }

      const text = selection.toString().trim();
      if (text.length < 10) {
        // Too short to meaningfully edit
        setSelectedText("");
        setToolbarPos(null);
        return;
      }

      // Check that the selection is inside our container
      const range = selection.getRangeAt(0);
      if (!containerRef.current.contains(range.commonAncestorContainer)) {
        return;
      }

      const rect = range.getBoundingClientRect();
      setSelectedText(text);
      setEditText(text);
      setIsManualEditing(false);
      setToolbarPos({
        top: rect.top + window.scrollY - 8,
        left: rect.left + window.scrollX + rect.width / 2,
      });
    }, 10);
  }, [containerRef]);

  const handleManualSave = () => {
    if (!editText.trim()) return;
    const newMarkdown = replaceInMarkdown(markdown, selectedText, editText);
    onEdit(newMarkdown);
    setToolbarPos(null);
    setSelectedText("");
    setIsManualEditing(false);
  };

  // Dismiss toolbar when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        toolbarRef.current &&
        !toolbarRef.current.contains(e.target as Node) &&
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setToolbarPos(null);
        setSelectedText("");
        setIsManualEditing(false);
      }
    };

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        if (!loading && !isManualEditing) {
          setToolbarPos(null);
          setSelectedText("");
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [loading, isManualEditing, containerRef]);

  // Attach mouseup listener to container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("mouseup", handleMouseUp);
    return () => el.removeEventListener("mouseup", handleMouseUp);
  }, [containerRef, handleMouseUp]);

  const handleAction = async (action: ActionType) => {
    if (!selectedText || loading) return;

    setLoading(true);
    setActiveAction(action);

    try {
      const token = user ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
      const result = await refineFn({
        data: {
          text: selectedText,
          action,
          context: markdown.slice(0, 3000),
          userId: user?.id || undefined,
          accessToken: token
        },
      });

      if (result.error) {
        console.error("Refine error:", result.error);
        return;
      }

      if (result.refined) {
        // Find and replace the selected text in the markdown
        // We need to find the closest match in the raw markdown since the rendered
        // text may differ (no markdown syntax). We try an exact match first.
        const newMarkdown = replaceInMarkdown(markdown, selectedText, result.refined);
        onEdit(newMarkdown);
        setToolbarPos(null);
        setSelectedText("");
      }
    } catch (err) {
      console.error("Inline edit failed:", err);
    } finally {
      setLoading(false);
      setActiveAction(null);
    }
  };

  if (!toolbarPos) return null;

  return createPortal(
    <div
      ref={toolbarRef}
      className="inline-editor-toolbar select-none"
      style={{
        position: "absolute",
        top: `${toolbarPos.top}px`,
        left: `${toolbarPos.left}px`,
        transform: "translate(-50%, -100%)",
        zIndex: 9999,
      }}
    >
      {isManualEditing ? (
        <div className="flex flex-col w-[340px] p-3 rounded-2xl bg-card/98 backdrop-blur-xl border border-border/60 shadow-2xl text-foreground select-text">
          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-border/40">
            <div className="flex items-center gap-1.5">
              <PenLine className="size-3.5 text-accent animate-pulse" />
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Edit Selection
              </span>
            </div>
            <button
              onClick={() => {
                setToolbarPos(null);
                setSelectedText("");
                setIsManualEditing(false);
              }}
              className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors"
            >
              <X className="size-3" />
            </button>
          </div>
          <textarea
            autoFocus
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleManualSave();
              }
            }}
            placeholder="Type your manual changes here..."
            className="w-full h-24 p-2 bg-background/60 border border-border/50 rounded-xl text-xs text-foreground placeholder-muted-foreground resize-none focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-all font-sans leading-relaxed"
          />
          <div className="flex items-center justify-between mt-2.5 pt-1.5 border-t border-border/30">
            <button
              onClick={() => setIsManualEditing(false)}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all hover:bg-accent/10 text-muted-foreground hover:text-foreground hover:scale-[1.02] active:scale-95"
            >
              <ChevronLeft className="size-3.5" />
              Back to AI
            </button>
            <div className="flex gap-2 items-center">
              <span className="text-[8px] text-muted-foreground font-mono select-none hidden sm:inline">
                Ctrl+Enter to save
              </span>
              <button
                onClick={handleManualSave}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent text-accent-foreground text-[10px] font-bold transition-all hover:bg-accent/90 hover:scale-[1.02] active:scale-95 shadow-md shadow-accent/10"
              >
                <Check className="size-3" />
                Apply Edit
              </button>
            </div>
          </div>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-card/95 backdrop-blur-xl border border-accent/30 shadow-2xl">
          <Loader2 className="size-3.5 animate-spin text-accent" />
          <span className="text-xs font-medium text-foreground">
            {ACTIONS.find((a) => a.key === activeAction)?.label || "Processing"}…
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-0.5 px-2 py-1.5 rounded-2xl bg-card/95 backdrop-blur-xl border border-border/60 shadow-2xl">
          <div className="flex items-center gap-1 px-1.5 pr-2 border-r border-border/40 mr-0.5">
            <Wand2 className="size-3 text-accent" />
            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground select-none">
              AI Edit
            </span>
          </div>
          {ACTIONS.map((action) => (
            <button
              key={action.key}
              onClick={() => handleAction(action.key)}
              className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-xl text-[10px] font-semibold transition-all hover:bg-accent/15 hover:text-foreground text-muted-foreground hover:scale-105 active:scale-95 ${action.color}`}
              title={action.label}
            >
              {action.icon}
              <span className="hidden lg:inline">{action.label}</span>
            </button>
          ))}
          <button
            onClick={() => setIsManualEditing(true)}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-xl text-[10px] font-semibold transition-all hover:bg-accent/15 text-amber-400 hover:text-amber-300 hover:scale-105 active:scale-95 border-l border-border/40 pl-2.5 ml-1"
            title="Edit manually"
          >
            <PenLine className="size-3" />
            <span className="hidden lg:inline">Edit Manually</span>
          </button>
          <button
            onClick={() => {
              setToolbarPos(null);
              setSelectedText("");
            }}
            className="ml-1 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-colors"
          >
            <X className="size-3" />
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}

/**
 * Replace selected rendered text inside the raw markdown.
 * Since the rendered text has markdown syntax stripped, we find the best
 * approximate match in the raw markdown and replace it.
 */
function cleanWord(w: string): string {
  return w
    .replace(/^[#*_~`[\]()!"'.,;?:]+|[#*_~`[\]()!"'.,;?:]+$/g, "")
    .toLowerCase();
}

/**
 * Replace selected rendered text inside the raw markdown.
 * Since the rendered text has markdown syntax stripped, we find the best
 * approximate match in the raw markdown and replace it.
 */
function replaceInMarkdown(markdown: string, selectedText: string, replacement: string): string {
  // 1. Try exact match first
  if (markdown.includes(selectedText)) {
    return markdown.replace(selectedText, replacement);
  }

  // 2. Try matching by splitting paragraphs and finding the best token-level match
  const paragraphs = markdown.split(/\n\n+/);
  const selectedClean = selectedText.replace(/\s+/g, " ").trim().toLowerCase();
  const selectedWords = selectedClean.split(" ").filter(Boolean);

  if (selectedWords.length > 0) {
    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i];
      // Tokenize paragraph by spaces, preserving spaces in the array
      const tokens = para.split(/(\s+)/);
      
      // Extract clean words with their index in the token array
      interface WordToken {
        tokenIndex: number;
        cleaned: string;
      }
      const wordTokens: WordToken[] = [];
      for (let j = 0; j < tokens.length; j++) {
        const t = tokens[j];
        if (t.trim()) {
          wordTokens.push({ tokenIndex: j, cleaned: cleanWord(t) });
        }
      }

      // Slide window of size selectedWords.length to find the best match
      let bestScore = 0;
      let bestStart = -1;
      let bestEnd = -1;

      const len = selectedWords.length;
      for (let startIdx = 0; startIdx <= wordTokens.length - len; startIdx++) {
        let score = 0;
        for (let k = 0; k < len; k++) {
          if (wordTokens[startIdx + k].cleaned === selectedWords[k]) {
            score++;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestStart = wordTokens[startIdx].tokenIndex;
          bestEnd = wordTokens[startIdx + len - 1].tokenIndex;
        }
      }

      // If we matched at least 40% of the selection words (minimum of 2 matches)
      if (bestStart !== -1 && bestScore >= Math.min(2, len * 0.4)) {
        tokens[bestStart] = replacement;
        for (let k = bestStart + 1; k <= bestEnd; k++) {
          tokens[k] = "";
        }
        paragraphs[i] = tokens.join("");
        return paragraphs.join("\n\n");
      }
    }
  }

  // 3. Fallback: find closest substring match using sliding window
  const words = selectedClean.split(" ");
  const firstFewWords = words.slice(0, 5).join(" ");

  const mdLower = markdown.toLowerCase();
  const startIdx = mdLower.indexOf(firstFewWords);

  if (startIdx !== -1) {
    // Find the end of the paragraph
    let endIdx = markdown.indexOf("\n\n", startIdx);
    if (endIdx === -1) endIdx = markdown.length;

    const before = markdown.slice(0, startIdx);
    const after = markdown.slice(endIdx);
    return before + replacement + after;
  }

  // 4. Last resort: append a note
  return markdown + "\n\n" + replacement;
}

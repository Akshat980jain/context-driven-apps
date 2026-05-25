import React, { useState, useRef, useEffect, useCallback } from "react";
import { markdownToHtml, htmlToMarkdown } from "./editorUtils";
import {
  Undo,
  Redo,
  Copy,
  Scissors,
  Clipboard,
  Paintbrush,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Subscript,
  Superscript,
  Palette,
  Highlighter,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Indent,
  Outdent,
  Mic,
  MicOff,
  Search,
  Replace,
  FileText,
  Trash2,
  HelpCircle,
  Sparkles,
  ChevronDown,
  CaseSensitive,
  Pilcrow,
  SortAsc,
  Lock,
  Unlock,
  Shield,
  Smile,
  Image as ImageIcon,
  Video,
  Plus,
  Eraser,
  Grid,
  X,
  Check,
  ChevronRight,
  BarChart3,
  BookOpen,
  EyeOff,
  Printer,
  Save
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";

interface DocumentEditorProps {
  markdown: string;
  onEdit: (newMd: string) => void;
  onSave?: () => void;
}

export function DocumentEditor({ markdown, onEdit, onSave }: DocumentEditorProps) {
  // Use contentEditable div instead of textarea for real rich-text rendering
  const editorRef = useRef<HTMLDivElement>(null);
  // Keep textareaRef as alias so legacy helpers that reference it still compile
  const textareaRef = editorRef as unknown as React.RefObject<HTMLTextAreaElement>;
  const overlayRef = useRef<HTMLDivElement>(null);
  // Track whether the editor content change was triggered by our code (not user)
  const isInternalUpdate = useRef(false);

  // Local History stack for Undo/Redo
  const [history, setHistory] = useState<string[]>([markdown]);
  const [historyIdx, setHistoryIdx] = useState(0);

  // Find and Replace state
  const [findOpen, setFindOpen] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [gotoLine, setGotoLine] = useState("");

  // Split Dropdown States
  const [pasteDropdownOpen, setPasteDropdownOpen] = useState(false);
  const [copyDropdownOpen, setCopyDropdownOpen] = useState(false);
  const [underlineDropdownOpen, setUnderlineDropdownOpen] = useState(false);
  const [bulletDropdownOpen, setBulletDropdownOpen] = useState(false);
  const [numberDropdownOpen, setNumberDropdownOpen] = useState(false);
  const [shadingDropdownOpen, setShadingDropdownOpen] = useState(false);
  const [borderDropdownOpen, setBorderDropdownOpen] = useState(false);
  const [typographyDropdownOpen, setTypographyDropdownOpen] = useState(false);

  // Format painter state
  const [copiedFormat, setCopiedFormat] = useState<{
    prefix?: string;
    suffix?: string;
    class?: string;
    style?: Record<string, string>;
  } | null>(null);
  // formatPainterState: "idle", "active_single", "active_double"
  const [formatPainterState, setFormatPainterState] = useState<"idle" | "active_single" | "active_double">("idle");
  const formatPainterClickTimeout = useRef<NodeJS.Timeout | null>(null);

  // Font Settings
  const [fontFamily, setFontFamily] = useState("Inter");
  const [fontSize, setFontSize] = useState("12pt");
  const [lineSpacing, setLineSpacing] = useState("1.6");

  // Dictation / Voice State
  const [isDictating, setIsDictating] = useState(false);
  const [dictationLanguage, setDictationLanguage] = useState("en-US");
  const [recognition, setRecognition] = useState<any>(null);

  // Show/Hide ¶ Formatting Marks
  const [showPilcrow, setShowPilcrow] = useState(false);

  // Sensitivity Locks
  const [sensitivity, setSensitivity] = useState<"public" | "general" | "confidential" | "highly">("public");
  const [isLocked, setIsLocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  // Collapsible Double Right Panel Drawer
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [rightPanelTab, setRightPanelTab] = useState<"ai" | "addins">("ai");
  const [stylesDrawerOpen, setStylesDrawerOpen] = useState(false);

  // Add-ins Tools State
  const [ytUrl, setYtUrl] = useState("");
  const [unsplashQuery, setUnsplashQuery] = useState("");
  const [unsplashResults, setUnsplashResults] = useState<string[]>([]);
  const [searchingUnsplash, setSearchingUnsplash] = useState(false);

  // Synchronize internal state with history
  const updateContent = useCallback((newText: string) => {
    onEdit(newText);
    
    const nextHistory = history.slice(0, historyIdx + 1);
    nextHistory.push(newText);
    if (nextHistory.length > 50) nextHistory.shift();
    
    setHistory(nextHistory);
    setHistoryIdx(nextHistory.length - 1);
  }, [history, historyIdx, onEdit]);

  const historyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Read HTML from contentEditable, convert to markdown, propagate up
  const flushEditorContent = useCallback((immediate = true) => {
    const el = editorRef.current;
    if (!el) return;
    const md = htmlToMarkdown(el);
    isInternalUpdate.current = true;
    onEdit(md);
    
    if (historyTimeoutRef.current) {
      clearTimeout(historyTimeoutRef.current);
      historyTimeoutRef.current = null;
    }

    const pushToHistory = () => {
      setHistory(prev => {
        const currentVersion = prev[historyIdx];
        if (currentVersion === md) return prev; // Avoid duplicates
        const nextHistory = prev.slice(0, historyIdx + 1);
        nextHistory.push(md);
        if (nextHistory.length > 50) nextHistory.shift();
        setHistoryIdx(nextHistory.length - 1);
        return nextHistory;
      });
    };

    if (immediate) {
      pushToHistory();
    } else {
      historyTimeoutRef.current = setTimeout(pushToHistory, 1000);
    }
  }, [historyIdx, onEdit]);

  const flushRef = useRef(flushEditorContent);
  useEffect(() => {
    flushRef.current = flushEditorContent;
  }, [flushEditorContent]);

  // Undo / Redo — use native execCommand for contentEditable
  const handleUndo = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand('undo', false);
    setTimeout(() => flushEditorContent(), 0);
    toast.info("Undo action");
  };

  const handleRedo = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand('redo', false);
    setTimeout(() => flushEditorContent(), 0);
    toast.info("Redo action");
  };

  // Initialize contentEditable with markdown as HTML on mount / when markdown prop changes externally
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    
    // Only update if the content is genuinely different (avoid cursor reset on every keystroke)
    const currentMd = htmlToMarkdown(el).trim();
    if (currentMd !== markdown.trim()) {
      el.innerHTML = markdownToHtml(markdown);
    }
  }, [markdown]);

  // Go To Line — scroll to approximate position in contentEditable
  const handleGoTo = () => {
    const el = editorRef.current;
    const lineNum = parseInt(gotoLine);
    if (!el || isNaN(lineNum) || lineNum <= 0) {
      toast.warning("Enter valid line number");
      return;
    }
    const lineHeight = parseFloat(lineSpacing) * parseInt(getFontSizePx(fontSize));
    el.scrollTop = (lineNum - 1) * lineHeight;
    toast.success(`Scrolled to line ${lineNum}`);
    setGotoLine("");
  };

  // Save the current selection so toolbar clicks don't lose it
  const savedRange = useRef<Range | null>(null);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRange.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (sel && savedRange.current) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  };

  // Execute a rich-text command on the saved selection
  const execFmt = (command: string, value?: string) => {
    restoreSelection();
    document.execCommand(command, false, value || undefined);
    setTimeout(() => flushEditorContent(), 0);
  };

  // Insert raw HTML at cursor position
  const insertHtmlAtCursor = (html: string) => {
    restoreSelection();
    document.execCommand('insertHTML', false, html);
    setTimeout(() => flushEditorContent(), 0);
  };

  // ── Legacy wrapSelection shim (kept for clipboard / find-replace that still use it) ──
  const wrapSelection = (prefix: string, suffix: string = "") => {
    // For contentEditable, insert HTML directly
    const cleanPrefix = prefix.replace(/\*\*/g, '').replace(/\*/g, '').replace(/~~/g, '');
    const cleanSuffix = suffix.replace(/\*\*/g, '').replace(/\*/g, '').replace(/~~/g, '');
    restoreSelection();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      const selectedText = range.toString();
      document.execCommand('insertHTML', false, `${prefix}${selectedText}${suffix}`);
    } else {
      document.execCommand('insertHTML', false, prefix + suffix);
    }
    setTimeout(() => flushEditorContent(), 0);
  };

  // Format current block/paragraph lines via execCommand
  const formatSelectedLines = (modifier: (line: string, index: number) => string) => {
    // For contentEditable we use insertHTML with modified content
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const selectedText = range.toString();
    const lines = selectedText.split('\n');
    const modified = lines.map((line, i) => modifier(line, i)).join('\n');
    document.execCommand('insertHTML', false, modified.replace(/\n/g, '<br>'));
    setTimeout(() => flushEditorContent(), 0);
  };

  // Clipboard Cut helper — use execCommand for contentEditable
  const handleCutRaw = async () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      toast.warning("Please select text to cut");
      return;
    }
    const selectedText = sel.toString();
    try {
      await navigator.clipboard.writeText(selectedText);
      restoreSelection();
      document.execCommand('delete', false);
      setTimeout(() => flushEditorContent(), 0);
      toast.success("Cut text to clipboard");
    } catch {
      // Fallback to native
      restoreSelection();
      document.execCommand('cut', false);
      setTimeout(() => flushEditorContent(), 0);
      toast.success("Cut text to clipboard");
    }
  };

  // Paragraph alignment via execCommand — applies to current block
  const handleAlign = (alignment: "left" | "center" | "right" | "justify") => {
    restoreSelection();
    const cmdMap = { left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight', justify: 'justifyFull' };
    document.execCommand(cmdMap[alignment], false);
    setTimeout(() => flushEditorContent(), 0);
    toast.success(`Aligned text: ${alignment}`);
  };

  // Find using window.find() on contentEditable
  const handleFind = () => {
    if (!findText) { toast.warning("Enter search text"); return; }
    const found = (window as any).find(findText, false, false, true);
    if (!found) {
      // Wrap around
      const sel = window.getSelection();
      if (sel) { sel.removeAllRanges(); }
      (window as any).find(findText, false, false, true);
    }
    if (!found) toast.error(`'${findText}' not found`);
    else toast.info(`Found: "${findText}"`);
  };

  const handleReplace = () => {
    if (!findText) { toast.warning("Enter search text"); return; }
    const sel = window.getSelection();
    if (sel && sel.toString().toLowerCase() === findText.toLowerCase()) {
      document.execCommand('insertText', false, replaceText);
      setTimeout(() => flushEditorContent(), 0);
      toast.success("Replaced occurrence");
      handleFind();
    } else {
      handleFind();
    }
  };

  const handleReplaceAll = () => {
    if (!findText) { toast.warning("Enter search text"); return; }
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    let count = 0;
    while ((window as any).find(findText, false, false, false)) {
      document.execCommand('insertText', false, replaceText);
      count++;
      if (count > 1000) break;
    }
    setTimeout(() => flushEditorContent(), 0);
    if (count > 0) toast.success(`Replaced ${count} occurrence(s)`);
    else toast.error('No occurrences found');
  };

  // Clipboard Split-Button Paste Helpers
  const handlePasteRaw = async (type: "source" | "text" | "special") => {
    try {
      let clipboardText = await navigator.clipboard.readText();
      restoreSelection();
      if (type === "text") {
        // Plain text only — strip HTML
        clipboardText = clipboardText.replace(/<[^>]*>/g, "");
        document.execCommand('insertText', false, clipboardText);
      } else if (type === "special") {
        const quoted = `<blockquote>${clipboardText.replace(/\n/g, '<br>')}</blockquote>`;
        document.execCommand('insertHTML', false, quoted);
      } else {
        // Source — preserve as-is
        document.execCommand('insertText', false, clipboardText);
      }
      setTimeout(() => flushEditorContent(), 0);
      toast.success(`Pasted as: ${type === "source" ? "Source Formatting" : type === "text" ? "Plain Text Only" : "Special Quote Block"}`);
    } catch {
      toast.error("Clipboard permission blocked. Use standard Paste.");
    }
    setPasteDropdownOpen(false);
  };

  // Copy Dropdown helper — read from contentEditable selection
  const handleCopySpecial = async (type: "markdown" | "html") => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      toast.warning("Highlight text to copy");
      return;
    }
    const range = sel.getRangeAt(0);
    const fragment = range.cloneContents();
    const div = document.createElement('div');
    div.appendChild(fragment);

    let result = '';
    if (type === 'html') {
      result = div.innerHTML;
    } else {
      // Markdown
      result = div.innerText || sel.toString();
    }
    try {
      await navigator.clipboard.writeText(result);
      toast.success(`Copied selection as ${type.toUpperCase()}`);
    } catch {
      toast.error("Failed to copy");
    }
    setCopyDropdownOpen(false);
  };

  // Format Painter trigger (Single or Double click lock)
  const handleFormatPainterClick = () => {
    if (formatPainterClickTimeout.current) {
      // It's a double click!
      clearTimeout(formatPainterClickTimeout.current);
      formatPainterClickTimeout.current = null;
      triggerFormatPainter(true);
    } else {
      // Wait to see if it's a single or double click
      formatPainterClickTimeout.current = setTimeout(() => {
        formatPainterClickTimeout.current = null;
        triggerFormatPainter(false);
      }, 250);
    }
  };

  const triggerFormatPainter = (isDouble: boolean) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      toast.warning("Highlight formatted text first to copy style!");
      return;
    }
    const range = sel.getRangeAt(0);
    const container = range.commonAncestorContainer as HTMLElement;
    const el = container.nodeType === Node.TEXT_NODE ? container.parentElement! : container;
    const computed = window.getComputedStyle(el);
    setCopiedFormat({
      prefix: '',
      suffix: '',
      class: '',
      style: {
        fontWeight: computed.fontWeight,
        fontStyle: computed.fontStyle,
        textDecoration: computed.textDecoration,
        color: computed.color,
        backgroundColor: computed.backgroundColor,
        fontSize: computed.fontSize,
        fontFamily: computed.fontFamily,
      }
    });
    setFormatPainterState(isDouble ? "active_double" : "active_single");
    toast.success(
      isDouble
        ? "🖌️ Double-clicked! Format Painter is LOCKED. Apply multiple times."
        : "🖌️ Format copied! Apply to your next text selection."
    );
  };

  // Apply format painter onto selection
  const applyCopiedFormat = () => {
    if (!copiedFormat) return;
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) { toast.warning("Select text to apply format"); return; }
    const text = sel.getRangeAt(0).toString();
    if (!text) return;
    const s = (copiedFormat as any).style;
    if (s) {
      const styleStr = Object.entries(s).map(([k, v]) => `${k.replace(/([A-Z])/g, '-$1').toLowerCase()}:${v}`).join(';');
      document.execCommand('insertHTML', false, `<span style="${styleStr}">${text}</span>`);
    } else if (copiedFormat.prefix) {
      document.execCommand('insertHTML', false, `${copiedFormat.prefix}${text}${copiedFormat.suffix}`);
    }
    setTimeout(() => flushEditorContent(), 0);
    if (formatPainterState === "active_single") {
      setFormatPainterState("idle");
      setCopiedFormat(null);
      toast.info("Format applied (painter deactivated)");
    } else {
      toast.success("Format applied (double-click painter active)");
    }
  };



  // Font styling options
  const handleUnderlineStyle = (style: "solid" | "double" | "thick" | "dotted" | "dashed" | "wavy") => {
    setUnderlineDropdownOpen(false);
    restoreSelection();
    if (style === "solid") {
      document.execCommand('underline', false);
      setTimeout(() => flushEditorContent(), 0);
    } else {
      // For special underline styles, wrap with span
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
        const text = sel.getRangeAt(0).toString();
        const cls = style === 'wavy' ? 'underline-wavy' : `underline-${style}`;
        document.execCommand('insertHTML', false,
          `<span class="${cls}" style="text-decoration:underline;text-decoration-style:${style === 'wavy' ? 'wavy' : style}">${text}</span>`);
        setTimeout(() => flushEditorContent(), 0);
      } else {
        document.execCommand('underline', false);
        setTimeout(() => flushEditorContent(), 0);
      }
    }
    toast.success(`Underline style: ${style}`);
  };

  const handleTypographyEffect = (effect: "glow" | "shadow" | "gold" | "outline") => {
    setTypographyDropdownOpen(false);
    restoreSelection();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const text = sel.getRangeAt(0).toString();
      document.execCommand('insertHTML', false,
        `<span class="typography-${effect}">${text}</span>`);
      setTimeout(() => flushEditorContent(), 0);
    }
    toast.success(`Applied typography: ${effect}`);
  };

  // ── REAL Rich-Text Formatting Commands (like MS Word) ──
  const handleBold = () => execFmt('bold');
  const handleItalic = () => execFmt('italic');
  const handleStrikethrough = () => execFmt('strikeThrough');
  const handleSubscript = () => execFmt('subscript');
  const handleSuperscript = () => execFmt('superscript');

  // Highlighter & Color tools — real execCommand on selection only
  const handleHighlight = (color: string) => {
    execFmt('hiliteColor', color);
  };

  const handleTextColor = (color: string) => {
    execFmt('foreColor', color);
  };

  // Apply font size to SELECTION only — not the whole editor
  const applyFontSizeToSelection = (sizePx: string) => {
    restoreSelection();
    // Use fontSize=7 as a temp marker, then replace <font> tags with <span style>
    document.execCommand('fontSize', false, '7');
    const el = editorRef.current;
    if (el) {
      el.querySelectorAll('font[size="7"]').forEach(f => {
        const span = document.createElement('span');
        span.style.fontSize = sizePx;
        span.innerHTML = (f as HTMLElement).innerHTML;
        f.replaceWith(span);
      });
    }
    setTimeout(() => flushEditorContent(), 0);
  };

  // Font Size increment/decrement — applies to SELECTION only
  const handleFontSizeChange = (direction: "up" | "down") => {
    const ptValues = [9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];
    const currentPt = parseInt(fontSize);
    let index = ptValues.indexOf(currentPt);
    if (index === -1) index = 3;

    let newPt = currentPt;
    if (direction === "up" && index < ptValues.length - 1) newPt = ptValues[index + 1];
    else if (direction === "down" && index > 0) newPt = ptValues[index - 1];
    setFontSize(`${newPt}pt`);
    applyFontSizeToSelection(getFontSizePx(`${newPt}pt`));
  };

  // Change Case — operate on selected text in contentEditable
  const handleChangeCase = (caseType: "upper" | "lower" | "title" | "sentence" | "toggle") => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      toast.warning("Please select text to change case");
      return;
    }
    restoreSelection();
    const selectedText = sel.toString();
    if (!selectedText) return;

    let modified = selectedText;
    if (caseType === "upper") modified = selectedText.toUpperCase();
    else if (caseType === "lower") modified = selectedText.toLowerCase();
    else if (caseType === "title") modified = selectedText.replace(/\b\w/g, c => c.toUpperCase());
    else if (caseType === "sentence") modified = selectedText.replace(/(^\s*|[.!?]\s+)([a-z])/g, (_, p1, p2) => p1 + p2.toUpperCase());
    else if (caseType === "toggle") modified = selectedText.split('').map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join('');

    document.execCommand('insertText', false, modified);
    setTimeout(() => flushEditorContent(), 0);
  };

  // Clear Formatting — remove all inline styles from selection
  const handleClearFormatting = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      toast.warning("Please select text to strip formatting");
      return;
    }
    restoreSelection();
    document.execCommand('removeFormat', false);
    setTimeout(() => flushEditorContent(), 0);
    toast.success("Cleared all formatting");
  };

  // Lists — real execCommand list insertion
  const handleListStyle = (style: "disc" | "circle" | "square" | "check" | "standard" | "roman" | "alpha") => {
    setBulletDropdownOpen(false);
    setNumberDropdownOpen(false);
    restoreSelection();
    if (style === 'standard' || style === 'roman' || style === 'alpha') {
      document.execCommand('insertOrderedList', false);
    } else if (style === 'check') {
      // Insert checklist as HTML
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const text = sel.isCollapsed ? 'Item' : sel.getRangeAt(0).toString();
        document.execCommand('insertHTML', false,
          `<ul style="list-style:none;padding-left:1.2em"><li><input type="checkbox"> ${text}</li></ul>`);
      }
    } else {
      document.execCommand('insertUnorderedList', false);
    }
    setTimeout(() => flushEditorContent(), 0);
    toast.success(`List style applied`);
  };

  // Multilevel list helper
  const handleMultilevelList = () => {
    restoreSelection();
    document.execCommand('insertOrderedList', false);
    setTimeout(() => flushEditorContent(), 0);
    toast.success("Inserted Multilevel Template");
  };

  // Indent increase / decrease via execCommand
  const handleIndent = (direction: "increase" | "decrease") => {
    restoreSelection();
    document.execCommand(direction === 'increase' ? 'indent' : 'outdent', false);
    setTimeout(() => flushEditorContent(), 0);
  };

  // Spacing selector — set line-height on editor container
  const handleSpacing = (spacing: string) => {
    if (spacing === "before" || spacing === "after") {
      restoreSelection();
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const mt = spacing === 'before' ? 'margin-top:18px;' : 'margin-bottom:0px;';
        const text = sel.isCollapsed ? '' : sel.getRangeAt(0).toString();
        document.execCommand('insertHTML', false, `<span style="display:inline-block;${mt}">${text}</span>`);
        setTimeout(() => flushEditorContent(), 0);
      }
    } else {
      setLineSpacing(spacing);
      // Apply to whole editor container (line-height is a container property, this is correct)
      const el = editorRef.current;
      if (el) el.style.lineHeight = spacing;
      toast.success(`Line spacing: ${spacing}`);
    }
  };

  // Alphabetical sort — sort selected lines in contentEditable
  const handleSortSelection = (order: "asc" | "desc") => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      toast.warning("Please highlight lines of text to sort");
      return;
    }
    restoreSelection();
    const text = sel.toString();
    const lines = text.split('\n').filter(l => l.trim());
    lines.sort((a, b) => order === 'asc' ? a.trim().localeCompare(b.trim()) : b.trim().localeCompare(a.trim()));
    document.execCommand('insertText', false, lines.join('\n'));
    setTimeout(() => flushEditorContent(), 0);
    toast.success(`Sorted (${order === 'asc' ? 'A-Z' : 'Z-A'})`);
  };

  const selectedTextNotEmpty = (text: string, start: number, end: number) => {
    return text.substring(start, end).trim().length > 0;
  };

  // Paint Bucket Shading — wrap selection in styled span/div
  const handleShading = (color: string, label: string) => {
    setShadingDropdownOpen(false);
    restoreSelection();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const text = sel.getRangeAt(0).toString();
      document.execCommand('insertHTML', false,
        `<span style="background-color:${color};padding:2px 4px;border-radius:4px;">${text}</span>`);
    } else {
      document.execCommand('backColor', false, color);
    }
    setTimeout(() => flushEditorContent(), 0);
    toast.success(`Block Shading: ${label}`);
  };

  // Border Dropdown styling — wrap selection in bordered span
  const handleBorders = (type: string) => {
    setBorderDropdownOpen(false);
    const styleMap: Record<string, string> = {
      bottom: 'border-bottom:2.5px solid currentColor;padding-bottom:4px;',
      top: 'border-top:2.5px solid currentColor;padding-top:4px;',
      left: 'border-left:4px solid #3b82f6;padding-left:10px;',
      right: 'border-right:2.5px solid currentColor;padding-right:4px;',
      all: 'border:1px solid #6b7280;padding:6px;border-radius:4px;',
      outside: 'border:2px solid #3b82f6;padding:10px;border-radius:6px;display:inline-block;',
    };
    const style = styleMap[type];
    if (!style) return;
    restoreSelection();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const text = sel.getRangeAt(0).toString();
      document.execCommand('insertHTML', false, `<span style="${style}">${text}</span>`);
    }
    setTimeout(() => flushEditorContent(), 0);
    toast.success(`Border applied: ${type}`);
  };

  // Heading presets — use execCommand formatBlock for real heading rendering
  const handlePresetStyle = (style: "title" | "h1" | "h2" | "subtitle" | "nospace" | "normal") => {
    restoreSelection();
    const blockMap: Record<string, string> = {
      title: 'h1', h1: 'h2', h2: 'h3', subtitle: 'blockquote', nospace: 'p', normal: 'p'
    };
    document.execCommand('formatBlock', false, blockMap[style] || 'p');
    if (style === 'subtitle') {
      // Also italicise
      document.execCommand('italic', false);
    }
    setTimeout(() => flushEditorContent(), 0);
    toast.success(`Style applied: ${style.toUpperCase()}`);
  };



  // Select dropdown options for contentEditable
  const handleSelectOptions = (type: "all" | "line" | "clear") => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    if (type === "all") {
      document.execCommand('selectAll', false);
      toast.info("Selected entire document");
    } else if (type === "clear") {
      const sel = window.getSelection();
      if (sel) sel.removeAllRanges();
      toast.info("Selection cleared");
    } else if (type === "line") {
      // Select the block element at cursor
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        let block = range.startContainer as HTMLElement;
        // Walk up to block-level element
        while (block && block !== el && !['DIV','P','H1','H2','H3','H4','H5','H6','LI','BLOCKQUOTE'].includes(block.nodeName)) {
          block = block.parentElement as HTMLElement;
        }
        if (block && block !== el) {
          const r = document.createRange();
          r.selectNodeContents(block);
          sel.removeAllRanges();
          sel.addRange(r);
          toast.info("Selected current paragraph");
        }
      }
    }
  };

  // Dictation Speech Recognition Setup
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = true;
        rec.interimResults = false;
        rec.lang = dictationLanguage;

        rec.onresult = (event: any) => {
          const transcript = event.results[event.results.length - 1][0].transcript;
          const el = editorRef.current;
          if (el) {
            el.focus();
            document.execCommand('insertText', false, ' ' + transcript + ' ');
            flushRef.current();
          }
        };

        rec.onerror = (e: any) => {
          console.error("Speech Error", e);
          setIsDictating(false);
          toast.error("Dictation interrupted or mic permission denied");
        };

        rec.onend = () => {
          setIsDictating(false);
        };

        setRecognition(rec);
      }
    }
  }, [dictationLanguage]);

  const toggleDictation = () => {
    if (!recognition) {
      toast.error("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }

    if (isDictating) {
      recognition.stop();
      setIsDictating(false);
      toast.info("Dictation stopped");
    } else {
      try {
        recognition.lang = dictationLanguage;
        recognition.start();
        setIsDictating(true);
        toast.success(`Voice recognition active (${dictationLanguage})! Speak now.`);
      } catch (err) {
        toast.error("Mic already active or error starting recognition");
      }
    }
  };

  // Sensitivity lock screen handler
  const handleLockDocument = (level: typeof sensitivity) => {
    setSensitivity(level);
    if (level === "confidential" || level === "highly") {
      setIsLocked(true);
      toast.warning(`Document locked under ${level.toUpperCase()} sensitivity scale!`);
    } else {
      setIsLocked(false);
      toast.success(`Sensitivity changed to: ${level.toUpperCase()}`);
    }
  };

  const attemptUnlock = () => {
    if (passwordInput.toLowerCase() === "scribe") {
      setIsLocked(false);
      setPasswordError(false);
      setPasswordInput("");
      toast.success("Document unlocked successfully!");
    } else {
      setPasswordError(true);
      toast.error("Invalid passcode. Hint: Use 'scribe' to unlock!");
    }
  };

  // Real-time Text Analytical calculations
  const calculateAnalysis = () => {
    const words = markdown.trim() ? markdown.trim().split(/\s+/).length : 0;
    const chars = markdown.length;
    const readTime = Math.max(1, Math.ceil(words / 200));

    // Dynamic suggestions based on text content
    const suggestions: { title: string; desc: string; fixText: string; replaceWord: string }[] = [];
    
    if (markdown.toLowerCase().includes("utilize")) {
      suggestions.push({
        title: "Cliché word 'utilize' detected",
        desc: "Consider replacing with 'use' to increase clarity.",
        fixText: "Replace 'utilize' with 'use'",
        replaceWord: "utilize"
      });
    }

    if (markdown.toLowerCase().includes("very unique")) {
      suggestions.push({
        title: "Redundant adjective 'very unique'",
        desc: "'Unique' means one of a kind. Avoid 'very unique'.",
        fixText: "Change to 'unique'",
        replaceWord: "very unique"
      });
    }

    if (markdown.toLowerCase().includes("was created by")) {
      suggestions.push({
        title: "Passive voice alert",
        desc: "'was created by' is passive. Convert to active voice if possible.",
        fixText: "Make active: 'created'",
        replaceWord: "was created by"
      });
    }

    if (markdown.toLowerCase().includes("their are")) {
      suggestions.push({
        title: "Grammar spelling error",
        desc: "Did you mean 'there are' instead of 'their are'?",
        fixText: "Correct to 'there are'",
        replaceWord: "their are"
      });
    }

    const baseScore = 100 - (suggestions.length * 15);
    const score = Math.max(45, baseScore);

    // Tone calculation
    let professional = 50;
    let casual = 30;
    let informative = 20;

    const professionalKeywords = ["furthermore", "analysis", "significant", "implement", "consequently", "essential"];
    const casualKeywords = ["awesome", "guy", "cool", "epic", "heck", "stuff"];
    
    professionalKeywords.forEach(k => {
      if (markdown.toLowerCase().includes(k)) professional += 10;
    });
    casualKeywords.forEach(k => {
      if (markdown.toLowerCase().includes(k)) casual += 10;
    });

    const total = professional + casual + informative;
    professional = Math.round((professional / total) * 100);
    casual = Math.round((casual / total) * 100);
    informative = 100 - professional - casual;

    // SEO checks
    const kwYouTube = (markdown.match(/youtube/gi) || []).length;
    const kwVideo = (markdown.match(/video/gi) || []).length;
    const seoHealth = kwYouTube > 0 && kwVideo > 0 ? "High" : kwYouTube > 0 || kwVideo > 0 ? "Moderate" : "Needs Keywords";

    return {
      words,
      chars,
      readTime,
      score,
      suggestions,
      tone: { professional, casual, informative },
      seo: { kwYouTube, kwVideo, seoHealth }
    };
  };

  const analysis = calculateAnalysis();

  const handleQuickFix = (replaceWord: string, fixText: string) => {
    let replacedVal = "";
    if (replaceWord === "utilize") {
      replacedVal = "use";
    } else if (replaceWord === "very unique") {
      replacedVal = "unique";
    } else if (replaceWord === "was created by") {
      replacedVal = "created";
    } else if (replaceWord === "their are") {
      replacedVal = "there are";
    }

    if (replacedVal) {
      const regex = new RegExp(replaceWord, "gi");
      const nextContent = markdown.replace(regex, replacedVal);
      updateContent(nextContent);
      toast.success(`Quick fix applied: ${fixText}`);
    }
  };

  // Add-ins Helpers
  const handleEmbedYoutube = () => {
    if (!ytUrl) {
      toast.warning("Paste a YouTube URL");
      return;
    }
    let vidId = "";
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = ytUrl.match(regExp);
    if (match && match[2].length === 11) {
      vidId = match[2];
    }

    if (!vidId) {
      toast.error("Could not parse YouTube Video ID");
      return;
    }

    const embedCode = `\n\n<div align="center" style="margin: 20px 0;"><iframe width="560" height="315" src="https://www.youtube.com/embed/${vidId}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius:12px; box-shadow:0 8px 30px rgba(0,0,0,0.5);"></iframe></div>\n\n`;
    
    wrapSelection(embedCode);
    setYtUrl("");
    toast.success("YouTube responsive media embedded successfully!");
  };

  const handleSearchUnsplash = () => {
    if (!unsplashQuery) return;
    setSearchingUnsplash(true);
    // Mocking stunning high-quality photography cards loaded from Unsplash
    setTimeout(() => {
      const techPhotos = [
        "https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=600&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&auto=format&fit=crop&q=80"
      ];
      const generalPhotos = [
        "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=600&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=600&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=600&auto=format&fit=crop&q=80"
      ];
      setUnsplashResults(unsplashQuery.toLowerCase().includes("tech") ? techPhotos : generalPhotos);
      setSearchingUnsplash(false);
      toast.success("Photos fetched!");
    }, 800);
  };

  const handleEmbedPhoto = (url: string) => {
    const embedMd = `\n\n![Premium Photography Embed](${url})\n\n`;
    wrapSelection(embedMd);
    toast.success("Unsplash image inserted at cursor!");
  };

  const handlePrintPdf = () => {
    toast.loading("Preparing high-fidelity printable page layout...");
    setTimeout(() => {
      window.print();
    }, 1500);
  };

  // Convert font sizing pt to px for UI display
  const getFontSizePx = (pt: string) => {
    switch (pt) {
      case "9pt": return "12px";
      case "10pt": return "13px";
      case "11pt": return "14px";
      case "12pt": return "16px";
      case "14pt": return "18px";
      case "16pt": return "21px";
      case "18pt": return "24px";
      case "20pt": return "27px";
      case "24pt": return "32px";
      case "28pt": return "37px";
      case "36pt": return "48px";
      case "48pt": return "64px";
      case "72pt": return "96px";
      default: return "16px";
    }
  };

  // Font family apply to selection
  const handleFontFamilyChange = (font: string) => {
    setFontFamily(font);
    restoreSelection();
    document.execCommand('fontName', false, getFontFamilyStyle(font));
    setTimeout(() => flushEditorContent(), 0);
  };

  // Font size select dropdown — applies only to selection
  const handleFontSizeSelect = (sz: string) => {
    setFontSize(sz);
    applyFontSizeToSelection(getFontSizePx(sz));
  };

  const getFontFamilyStyle = (font: string) => {
    switch (font) {
      case "Arial": return "Arial, sans-serif";
      case "Calibri": return "Calibri, sans-serif";
      case "Georgia": return "Georgia, serif";
      case "Times New Roman": return "Times New Roman, Times, serif";
      case "Courier New": return "Courier New, Courier, monospace";
      case "Segoe UI": return "Segoe UI, sans-serif";
      case "JetBrains Mono": return "JetBrains Mono, monospace";
      default: return "Inter, sans-serif";
    }
  };

  // Escape HTML tags and translate formatting marks for the simulation overlay
  const renderPilcrowMarks = (text: string) => {
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    
    return escaped
      .replace(/ /g, '<span class="pilcrow-space">·</span>')
      .replace(/\n/g, '<span class="pilcrow-char">¶</span>\n');
  };

  return (
    <div className="flex flex-col h-full border border-border/40 rounded-2xl bg-card/40 backdrop-blur shadow-soft overflow-hidden document-paper-container">
      
      {/* ── MS WORD FORMATTING RIBBON ── */}
      <div className="flex flex-col border-b border-border/40 bg-background/30 p-2 select-none">
        
        {/* Ribbon Tab Titles / Groups Row */}
        <div className="flex flex-wrap items-center gap-1 xl:gap-2 pb-2 mb-2 border-b border-border/20 overflow-x-auto scrollbar-none">
          
          {/* Group 1: Clipboard & History */}
          <div className="flex items-center gap-0.5 px-2 border-r border-border/30">
            {onSave && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-accent hover:bg-accent/15"
                title="Save Draft (Ctrl+S)"
                onClick={onSave}
              >
                <Save className="size-4 text-accent" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Undo (Ctrl+Z)"
              onClick={handleUndo}
            >
              <Undo className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Redo (Ctrl+Y)"
              onClick={handleRedo}
            >
              <Redo className="size-4" />
            </Button>

            {/* Paste Split Button */}
            <div className="relative flex items-center">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-r-none border-r border-border/20"
                title="Paste (Insert from Clipboard)"
                onClick={() => handlePasteRaw("source")}
              >
                <Clipboard className="size-4" />
              </Button>
              <button
                className="h-8 w-4 text-muted-foreground hover:text-foreground hover:bg-accent/10 flex items-center justify-center rounded-r-lg"
                onClick={() => setPasteDropdownOpen(!pasteDropdownOpen)}
              >
                <ChevronDown className="size-3" />
              </button>
              {pasteDropdownOpen && (
                <div className="absolute top-9 left-0 w-52 bg-card border border-border rounded-xl shadow-xl p-1 z-50 animate-in fade-in duration-100">
                  <p className="text-[9px] font-bold text-muted-foreground px-2 py-1 uppercase tracking-widest">Paste Options</p>
                  <div className="h-[1px] bg-border my-1" />
                  <button onClick={() => handlePasteRaw("source")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors font-medium">📋 Keep Source Formatting</button>
                  <button onClick={() => handlePasteRaw("text")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors font-medium">📄 Paste Text Only (Unformatted)</button>
                  <button onClick={() => handlePasteRaw("special")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors font-medium">💬 Paste Special (Blockquote)</button>
                </div>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Cut Selection"
              onClick={handleCutRaw}
            >
              <Scissors className="size-4" />
            </Button>

            {/* Copy Dropdown */}
            <div className="relative flex items-center">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-r-none border-r border-border/20"
                title="Copy Selection"
                onClick={() => handleCopySpecial("markdown")}
              >
                <Copy className="size-4" />
              </Button>
              <button
                className="h-8 w-4 text-muted-foreground hover:text-foreground hover:bg-accent/10 flex items-center justify-center rounded-r-lg"
                onClick={() => setCopyDropdownOpen(!copyDropdownOpen)}
              >
                <ChevronDown className="size-3" />
              </button>
              {copyDropdownOpen && (
                <div className="absolute top-9 left-0 w-48 bg-card border border-border rounded-xl shadow-xl p-1 z-50 animate-in fade-in duration-100">
                  <p className="text-[9px] font-bold text-muted-foreground px-2 py-1 uppercase tracking-widest">Copy Formats</p>
                  <div className="h-[1px] bg-border my-1" />
                  <button onClick={() => handleCopySpecial("markdown")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors font-medium">📝 Copy as Markdown</button>
                  <button onClick={() => handleCopySpecial("html")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors font-medium">🌐 Copy as HTML</button>
                </div>
              )}
            </div>

            {/* Double-Click Format Painter */}
            <Button
              variant={formatPainterState !== "idle" ? "secondary" : "ghost"}
              size="icon"
              className={`h-8 w-8 transition ${formatPainterState === "active_double" ? "text-accent bg-accent/25 ring-2 ring-accent" : formatPainterState === "active_single" ? "text-accent bg-accent/15 animate-pulse" : "text-muted-foreground hover:text-foreground"}`}
              title="Format Painter (Single-click / Double-click to Lock)"
              onClick={handleFormatPainterClick}
            >
              <Paintbrush className="size-4" />
            </Button>
          </div>

          {/* Group 2: Font Selection & Size */}
          <div className="flex items-center gap-1 px-2 border-r border-border/30">
            {/* Font Family selector */}
            <div className="relative">
              <select
                value={fontFamily}
                onChange={(e) => handleFontFamilyChange(e.target.value)}
                className="h-8 pl-2 pr-6 text-xs bg-background/50 border border-border/30 rounded-lg text-foreground font-semibold focus:outline-none appearance-none cursor-pointer"
              >
                <option value="Inter">Inter (Sans)</option>
                <option value="Calibri">Calibri</option>
                <option value="Arial">Arial</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Georgia">Georgia</option>
                <option value="Courier New">Courier New</option>
                <option value="Segoe UI">Segoe UI</option>
                <option value="JetBrains Mono">JetBrains Mono</option>
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            </div>

            {/* Font Size Selector */}
            <div className="relative">
              <select
                value={fontSize}
                onChange={(e) => handleFontSizeSelect(e.target.value)}
                className="h-8 w-16 pl-2 pr-6 text-xs bg-background/50 border border-border/30 rounded-lg text-foreground font-semibold focus:outline-none appearance-none cursor-pointer"
              >
                {["9pt", "10pt", "11pt", "12pt", "14pt", "16pt", "18pt", "20pt", "24pt", "28pt", "36pt", "48pt", "72pt"].map(sz => (
                  <option key={sz} value={sz}>{sz}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground font-bold text-xs"
              title="Increase Font Size"
              onClick={() => handleFontSizeChange("up")}
            >
              A<sup>+</sup>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground font-bold text-xs"
              title="Decrease Font Size"
              onClick={() => handleFontSizeChange("down")}
            >
              A<sub>-</sub>
            </Button>
          </div>

          {/* Group 3: Font Styles & Colors */}
          <div className="flex items-center gap-0.5 px-2 border-r border-border/30">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground font-bold"
              title="Bold"
              onClick={handleBold}
            >
              <Bold className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Italic"
              onClick={handleItalic}
            >
              <Italic className="size-4" />
            </Button>

            {/* Underline Selector Split Dropdown */}
            <div className="relative flex items-center">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-r-none border-r border-border/20"
                title="Underline Style"
                onClick={() => handleUnderlineStyle("solid")}
              >
                <Underline className="size-4" />
              </Button>
              <button
                className="h-8 w-4 text-muted-foreground hover:text-foreground hover:bg-accent/10 flex items-center justify-center rounded-r-lg"
                onClick={() => setUnderlineDropdownOpen(!underlineDropdownOpen)}
              >
                <ChevronDown className="size-3" />
              </button>
              {underlineDropdownOpen && (
                <div className="absolute top-9 left-0 w-44 bg-card border border-border rounded-xl shadow-xl p-1 z-50 animate-in fade-in duration-100">
                  <p className="text-[9px] font-bold text-muted-foreground px-2 py-1 uppercase tracking-widest">Underline Options</p>
                  <div className="h-[1px] bg-border my-1" />
                  <button onClick={() => handleUnderlineStyle("solid")} className="w-full text-left rounded-lg px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors font-medium border-b border-border/10 pb-1">⎯ Solid Underline</button>
                  <button onClick={() => handleUnderlineStyle("double")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors font-medium border-b border-border/10">‗ Double Underline</button>
                  <button onClick={() => handleUnderlineStyle("thick")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors font-medium border-b border-border/10">━ Thick Underline</button>
                  <button onClick={() => handleUnderlineStyle("dotted")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors font-medium border-b border-border/10">⋯ Dotted Underline</button>
                  <button onClick={() => handleUnderlineStyle("dashed")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors font-medium border-b border-border/10">╍ Dashed Underline</button>
                  <button onClick={() => handleUnderlineStyle("wavy")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors font-medium">〰 Wave Underline</button>
                </div>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Strikethrough"
              onClick={handleStrikethrough}
            >
              <Strikethrough className="size-4" />
            </Button>
            
            {/* Subscript / Superscript */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Subscript (X₂)"
              onClick={handleSubscript}
            >
              <Subscript className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Superscript (X²)"
              onClick={handleSuperscript}
            >
              <Superscript className="size-4" />
            </Button>

            {/* Change Case Dropdown */}
            <DropdownButton
              icon={<CaseSensitive className="size-4" />}
              title="Change Case (Aa)"
              options={[
                { label: "Sentence case.", onClick: () => handleChangeCase("sentence") },
                { label: "lowercase", onClick: () => handleChangeCase("lower") },
                { label: "UPPERCASE", onClick: () => handleChangeCase("upper") },
                { label: "Capitalize Each Word", onClick: () => handleChangeCase("title") },
                { label: "tOGGLE cASE (Invert)", onClick: () => handleChangeCase("toggle") }
              ]}
            />

            {/* Custom Typography & Effects Selector */}
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-blue-400 hover:text-blue-300"
                title="Text Effects & Typography"
                onClick={() => setTypographyDropdownOpen(!typographyDropdownOpen)}
              >
                <span className="font-extrabold text-sm border border-blue-400/30 rounded px-1 text-outline-classic">A</span>
              </Button>
              {typographyDropdownOpen && (
                <div className="absolute top-9 left-0 w-52 bg-card border border-border rounded-xl shadow-xl p-1 z-50 animate-in fade-in duration-100">
                  <p className="text-[9px] font-bold text-muted-foreground px-2 py-1 uppercase tracking-widest">Typography Presets</p>
                  <div className="h-[1px] bg-border my-1" />
                  <button onClick={() => handleTypographyEffect("glow")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-blue-400 hover:bg-accent/10 transition-colors font-semibold">🔵 Blue Glow Text</button>
                  <button onClick={() => handleTypographyEffect("shadow")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-foreground hover:bg-accent/10 transition-colors font-semibold">⚫ Soft Blur Shadow</button>
                  <button onClick={() => handleTypographyEffect("gold")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-amber-500 hover:bg-accent/10 transition-colors font-bold italic">🟡 Golden Reflection</button>
                  <button onClick={() => handleTypographyEffect("outline")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-blue-500 hover:bg-accent/10 transition-colors font-black text-outline-classic">🌐 Classic Outline</button>
                </div>
              )}
            </div>

            {/* Highlight color presets */}
            <DropdownButton
              icon={<Highlighter className="size-4 text-amber-400" />}
              title="Text Highlight Color"
              options={[
                { label: "💛 Yellow Highlight", onClick: () => handleHighlight("#fef08a") },
                { label: "💚 Green Highlight", onClick: () => handleHighlight("#bbf7d0") },
                { label: "💙 Blue Highlight", onClick: () => handleHighlight("#bfdbfe") },
                { label: "💖 Pink Highlight", onClick: () => handleHighlight("#fbcfe8") },
                { label: "🧡 Orange Highlight", onClick: () => handleHighlight("#fed7aa") }
              ]}
            />

            {/* Text Color presets */}
            <DropdownButton
              icon={<Palette className="size-4 text-accent" />}
              title="Font Color"
              options={[
                { label: "🔴 Red Font", onClick: () => handleTextColor("#ef4444") },
                { label: "🔵 Blue Font", onClick: () => handleTextColor("#3b82f6") },
                { label: "🟢 Green Font", onClick: () => handleTextColor("#22c55e") },
                { label: "🟡 Yellow Font", onClick: () => handleTextColor("#eab308") },
                { label: "🟠 Amber Font", onClick: () => handleTextColor("#f97316") },
                { label: "🟣 Purple Font", onClick: () => handleTextColor("#a855f7") }
              ]}
            />

            {/* Clear Formatting A + Eraser */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:bg-destructive/15"
              title="Clear All Formatting (A+Eraser)"
              onClick={handleClearFormatting}
            >
              <Eraser className="size-4" />
            </Button>
          </div>

          {/* Group 4: Paragraph & Alignment */}
          <div className="flex items-center gap-0.5 px-2 border-r border-border/30">
            
            {/* Bullet Dropdown Option */}
            <div className="relative flex items-center">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-r-none border-r border-border/20"
                title="Bulleted List"
                onClick={() => handleListStyle("disc")}
              >
                <List className="size-4" />
              </Button>
              <button
                className="h-8 w-4 text-muted-foreground hover:text-foreground hover:bg-accent/10 flex items-center justify-center rounded-r-lg"
                onClick={() => setBulletDropdownOpen(!bulletDropdownOpen)}
              >
                <ChevronDown className="size-3" />
              </button>
              {bulletDropdownOpen && (
                <div className="absolute top-9 left-0 w-44 bg-card border border-border rounded-xl shadow-xl p-1 z-50 animate-in fade-in duration-100">
                  <p className="text-[9px] font-bold text-muted-foreground px-2 py-1 uppercase tracking-widest">Bullet Presets</p>
                  <div className="h-[1px] bg-border my-1" />
                  <button onClick={() => handleListStyle("disc")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors font-medium">• Standard Disc</button>
                  <button onClick={() => handleListStyle("circle")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors font-medium">◦ Hollow Circle</button>
                  <button onClick={() => handleListStyle("square")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors font-medium">▪ Filled Square</button>
                  <button onClick={() => handleListStyle("check")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors font-medium">☑ Interactive Checklist</button>
                </div>
              )}
            </div>

            {/* Number List Dropdown Option */}
            <div className="relative flex items-center">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-r-none border-r border-border/20"
                title="Numbered List"
                onClick={() => handleListStyle("standard")}
              >
                <ListOrdered className="size-4" />
              </Button>
              <button
                className="h-8 w-4 text-muted-foreground hover:text-foreground hover:bg-accent/10 flex items-center justify-center rounded-r-lg"
                onClick={() => setNumberDropdownOpen(!numberDropdownOpen)}
              >
                <ChevronDown className="size-3" />
              </button>
              {numberDropdownOpen && (
                <div className="absolute top-9 left-0 w-44 bg-card border border-border rounded-xl shadow-xl p-1 z-50 animate-in fade-in duration-100">
                  <p className="text-[9px] font-bold text-muted-foreground px-2 py-1 uppercase tracking-widest">Number Presets</p>
                  <div className="h-[1px] bg-border my-1" />
                  <button onClick={() => handleListStyle("standard")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors font-medium">1. Standard Decimal</button>
                  <button onClick={() => handleListStyle("roman")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors font-medium">I. Roman Numerals</button>
                  <button onClick={() => handleListStyle("alpha")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors font-medium">A. Alphabetical (Capital)</button>
                </div>
              )}
            </div>

            {/* Multilevel List Dropdown */}
            <DropdownButton
              icon={<Grid className="size-4" />}
              title="Multilevel List"
              options={[
                { label: "🔢 Standard Multilevel (1., a., i.)", onClick: handleMultilevelList }
              ]}
            />

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Align Left"
              onClick={() => handleAlign("left")}
            >
              <AlignLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Align Center"
              onClick={() => handleAlign("center")}
            >
              <AlignCenter className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Align Right"
              onClick={() => handleAlign("right")}
            >
              <AlignRight className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Justify Text"
              onClick={() => handleAlign("justify")}
            >
              <AlignJustify className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Decrease Indent"
              onClick={() => handleIndent("decrease")}
            >
              <Outdent className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Increase Indent"
              onClick={() => handleIndent("increase")}
            >
              <Indent className="size-4" />
            </Button>

            {/* Spacing Selector */}
            <DropdownButton
              icon={
                <svg className="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 6H3" />
                  <path d="M21 12H9" />
                  <path d="M21 18H3" />
                  <path d="M6 10l-3 3M6 10l3 3M6 10v4" />
                </svg>
              }
              title="Line and Paragraph Spacing"
              options={[
                { label: "1.0 Single Spacing", onClick: () => handleSpacing("1.0") },
                { label: "1.15 Balanced Spacing", onClick: () => handleSpacing("1.15") },
                { label: "1.5 Comfortable Spacing", onClick: () => handleSpacing("1.5") },
                { label: "2.0 Double Spacing", onClick: () => handleSpacing("2.0") },
                { label: "2.5 Extreme Spacing", onClick: () => handleSpacing("2.5") },
                { label: "3.0 Word Spacing Preset", onClick: () => handleSpacing("3.0") },
                { label: "🔝 Add Space Before Paragraph", onClick: () => handleSpacing("before") },
                { label: "🔙 Remove Space After Paragraph", onClick: () => handleSpacing("after") }
              ]}
            />

            {/* A-Z Sort Alphabetical */}
            <DropdownButton
              icon={<SortAsc className="size-4" />}
              title="Sort Paragraphs Alphabetically"
              options={[
                { label: "🔤 Sort Ascending (A to Z)", onClick: () => handleSortSelection("asc") },
                { label: "🔤 Sort Descending (Z to A)", onClick: () => handleSortSelection("desc") }
              ]}
            />

            {/* Show/Hide Paragraph Guides ¶ */}
            <Button
              variant={showPilcrow ? "secondary" : "ghost"}
              size="icon"
              className={`h-8 w-8 transition ${showPilcrow ? "text-accent bg-accent/20" : "text-muted-foreground hover:text-foreground"}`}
              title="Show/Hide Editing Formatting Marks (¶)"
              onClick={() => {
                setShowPilcrow(!showPilcrow);
                toast.info(`Formatting Paragraph guides (¶) ${!showPilcrow ? "Enabled" : "Disabled"}`);
              }}
            >
              <Pilcrow className="size-4" />
            </Button>

            {/* Paint Bucket Shading */}
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                title="Shading Block Colors"
                onClick={() => setShadingDropdownOpen(!shadingDropdownOpen)}
              >
                <Palette className="size-4 text-emerald-400" />
              </Button>
              {shadingDropdownOpen && (
                <div className="absolute top-9 left-0 w-44 bg-card border border-border rounded-xl shadow-xl p-1 z-50 animate-in fade-in duration-100">
                  <p className="text-[9px] font-bold text-muted-foreground px-2 py-1 uppercase tracking-widest">Paragraph Shading</p>
                  <div className="h-[1px] bg-border my-1" />
                  <button onClick={() => handleShading("rgba(148, 163, 184, 0.15)", "Soft Gray")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-slate-500/10">⚫ Soft Gray Block</button>
                  <button onClick={() => handleShading("rgba(239, 68, 68, 0.15)", "Soft Red")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10">🔴 Soft Red Block</button>
                  <button onClick={() => handleShading("rgba(59, 130, 246, 0.15)", "Soft Blue")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-blue-400 hover:bg-blue-500/10">🔵 Soft Blue Block</button>
                  <button onClick={() => handleShading("rgba(34, 197, 94, 0.15)", "Soft Green")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-green-400 hover:bg-green-500/10">🟢 Soft Green Block</button>
                  <button onClick={() => handleShading("rgba(168, 85, 247, 0.15)", "Soft Purple")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-purple-400 hover:bg-purple-500/10">🟣 Soft Purple Block</button>
                </div>
              )}
            </div>

            {/* Borders Grid Dropdown */}
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                title="Borders Grid"
                onClick={() => setBorderDropdownOpen(!borderDropdownOpen)}
              >
                <Grid className="size-4 text-sky-400" />
              </Button>
              {borderDropdownOpen && (
                <div className="absolute top-9 left-0 w-44 bg-card border border-border rounded-xl shadow-xl p-1 z-50 animate-in fade-in duration-100">
                  <p className="text-[9px] font-bold text-muted-foreground px-2 py-1 uppercase tracking-widest">Borders Preset</p>
                  <div className="h-[1px] bg-border my-1" />
                  <button onClick={() => handleBorders("bottom")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/10">➖ Bottom Border</button>
                  <button onClick={() => handleBorders("top")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/10">➖ Top Border</button>
                  <button onClick={() => handleBorders("left")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-blue-400 hover:bg-accent/10 font-bold border-l-4 border-l-blue-400 pl-1">🪟 Left Accent Border</button>
                  <button onClick={() => handleBorders("right")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/10">➖ Right Border</button>
                  <button onClick={() => handleBorders("all")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/10">📦 All Thin Borders</button>
                  <button onClick={() => handleBorders("outside")} className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-blue-400 hover:bg-accent/10 font-semibold">🟦 Thick Outside Border</button>
                </div>
              )}
            </div>

          </div>

          {/* Group 5: Presets Styles Gallery Carousel */}
          <div className="flex items-center gap-1 px-2 border-r border-border/30 overflow-x-auto max-w-[280px] scrollbar-none">
            {/* Style Cards */}
            <div className="flex gap-1.5">
              <button
                onClick={() => handlePresetStyle("normal")}
                className="h-9 px-2 py-1 rounded bg-background/50 border border-border/20 text-left hover:bg-accent/10 min-w-[64px]"
              >
                <p className="text-[10px] font-bold text-foreground">AaBbCc</p>
                <p className="text-[8px] text-muted-foreground font-semibold">Normal</p>
              </button>
              <button
                onClick={() => handlePresetStyle("title")}
                className="h-9 px-2 py-1 rounded bg-background/50 border border-t-2 border-t-accent/60 border-border/20 text-left hover:bg-accent/10 min-w-[64px]"
              >
                <p className="text-[10px] font-bold text-accent">Title</p>
                <p className="text-[8px] text-muted-foreground font-semibold">Heading 1</p>
              </button>
              <button
                onClick={() => handlePresetStyle("h1")}
                className="h-9 px-2 py-1 rounded bg-background/50 border border-border/20 text-left hover:bg-accent/10 min-w-[64px]"
              >
                <p className="text-[10px] font-extrabold text-foreground">H1 Block</p>
                <p className="text-[8px] text-muted-foreground font-semibold">Heading 2</p>
              </button>
              <button
                onClick={() => handlePresetStyle("h2")}
                className="h-9 px-2 py-1 rounded bg-background/50 border border-border/20 text-left hover:bg-accent/10 min-w-[64px]"
              >
                <p className="text-[10px] font-semibold text-foreground">H2 Style</p>
                <p className="text-[8px] text-muted-foreground font-semibold">Heading 3</p>
              </button>
              <button
                onClick={() => handlePresetStyle("subtitle")}
                className="h-9 px-2 py-1 rounded bg-background/50 border border-border/20 text-left hover:bg-accent/10 min-w-[64px]"
              >
                <p className="text-[10px] font-medium italic text-muted-foreground">Subtitle</p>
                <p className="text-[8px] text-muted-foreground font-semibold">Subtitle</p>
              </button>
              <button
                onClick={() => handlePresetStyle("nospace")}
                className="h-9 px-2 py-1 rounded bg-background/50 border border-border/20 text-left hover:bg-accent/10 min-w-[64px]"
              >
                <p className="text-[10px] font-light leading-none">No Spac</p>
                <p className="text-[8px] text-muted-foreground font-semibold">Compact</p>
              </button>
            </div>
            {/* Style Expand Launcher */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-6 text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => setStylesDrawerOpen(!stylesDrawerOpen)}
              title="Expand Style Preset Menu"
            >
              <ChevronRight className={`size-4 transform transition-transform ${stylesDrawerOpen ? "rotate-90" : ""}`} />
            </Button>
          </div>

          {/* Group 6: Sensitivity Lock & Advanced Select */}
          <div className="flex items-center gap-1.5 px-2 border-r border-border/30">
            {/* Sensitivity Levels Selector */}
            <DropdownButton
              icon={<Shield className={`size-4 ${sensitivity === "confidential" || sensitivity === "highly" ? "text-red-400" : "text-emerald-400"}`} />}
              title={`Sensitivity Lock: ${sensitivity.toUpperCase()}`}
              options={[
                { label: "🟢 Public (Default)", onClick: () => handleLockDocument("public") },
                { label: "🔵 General (Internal)", onClick: () => handleLockDocument("general") },
                { label: "🟡 Confidential (Lock Shield)", onClick: () => handleLockDocument("confidential") },
                { label: "🔴 Highly Confidential (Restricted)", onClick: () => handleLockDocument("highly") }
              ]}
            />

            {/* Advanced Select Dropdown */}
            <DropdownButton
              icon={
                <svg className="size-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M21 7.5H3" />
                  <path d="M7.5 21V3" />
                </svg>
              }
              title="Select Area"
              options={[
                { label: "📖 Select Entire Document", onClick: () => handleSelectOptions("all") },
                { label: "✏️ Select Current Paragraph", onClick: () => handleSelectOptions("line") },
                { label: "❌ Clear Selection", onClick: () => handleSelectOptions("clear") }
              ]}
            />
          </div>

          {/* Group 7: Advanced Editing, PDF & Voice Dictation */}
          <div className="flex items-center gap-1.5 px-2">
            <Button
              variant={findOpen ? "secondary" : "ghost"}
              size="icon"
              className={`h-8 w-8 transition ${findOpen ? "text-accent bg-accent/20" : "text-muted-foreground hover:text-foreground"}`}
              title="Find & Replace Panel"
              onClick={() => setFindOpen(!findOpen)}
            >
              <Search className="size-4" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-accent border border-accent/20 hover:bg-accent/10"
              title="Create a PDF layout print"
              onClick={handlePrintPdf}
            >
              <FileText className="size-4" />
            </Button>

            {/* Dictation With Language Preference Selector */}
            <div className="flex items-center gap-0.5">
              <Button
                variant={isDictating ? "destructive" : "outline"}
                size="sm"
                onClick={toggleDictation}
                className={`h-8 gap-1 rounded-full px-2.5 transition-all ${
                  isDictating 
                    ? "bg-red-500/20 text-red-400 border-red-500/50 animate-pulse hover:bg-red-500/30" 
                    : "border-border hover:bg-accent/10 text-muted-foreground hover:text-foreground"
                }`}
                title="Dictate with Web Speech voice recognition"
              >
                {isDictating ? (
                  <>
                    <MicOff className="size-3.5 text-red-400" />
                    <span className="text-[10px] font-semibold">Rec...</span>
                  </>
                ) : (
                  <>
                    <Mic className="size-3.5 text-accent" />
                    <span className="text-[10px] font-semibold">Dictate</span>
                  </>
                )}
              </Button>
              <select
                value={dictationLanguage}
                onChange={(e) => {
                  setDictationLanguage(e.target.value);
                  toast.info(`Voice recognition dictation language: ${e.target.value}`);
                }}
                className="h-6 text-[8px] bg-background/50 border border-border/20 rounded text-foreground font-semibold px-0.5"
              >
                <option value="en-US">EN</option>
                <option value="es-ES">ES</option>
                <option value="fr-FR">FR</option>
                <option value="de-DE">DE</option>
                <option value="hi-IN">HI</option>
              </select>
            </div>
          </div>

          {/* Group 8: AI Circular Score Toggle Icon */}
          <div className="ml-auto flex items-center px-1">
            <Button
              variant={rightPanelOpen ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setRightPanelOpen(!rightPanelOpen)}
              className="h-8 gap-1.5 text-xs font-bold rounded-lg border border-accent/20"
              title="AI Score & Add-ins drawer toggle"
            >
              <Sparkles className="size-3.5 text-accent animate-pulse" />
              <span>AI Score & Add-ins</span>
              <span className={`inline-flex items-center justify-center size-5 rounded-full text-[9px] font-extrabold ml-1 bg-accent/20 ${analysis.score >= 90 ? "text-emerald-400" : "text-amber-400"}`}>
                {analysis.score}
              </span>
            </Button>
          </div>

        </div>

        {/* Live Ribbon Context Bar */}
        <div className="flex items-center justify-between px-2 text-[10px] text-muted-foreground font-semibold">
          <div className="flex items-center gap-3">
            <span>Font: <strong className="text-foreground">{fontFamily}</strong></span>
            <span>Size: <strong className="text-foreground">{fontSize}</strong></span>
            <span>Spacing: <strong className="text-foreground">{lineSpacing}x</strong></span>
            <span>Security: <strong className={`uppercase ${sensitivity !== "public" ? "text-red-400 font-bold" : "text-emerald-400"}`}>{sensitivity}</strong></span>
            {formatPainterState !== "idle" && <span className="text-accent animate-pulse font-bold">🖌️ Format Painter: {formatPainterState.toUpperCase()}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <Sparkles className="size-3 text-accent animate-spin" />
            <span>Premium Word Processor Suite</span>
          </div>
        </div>

      </div>

      {/* ── FIND, REPLACE & GO-TO DRAWER PANEL ── */}
      {findOpen && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-background/50 border-b border-border/40 animate-in slide-in-from-top duration-200 find-replace-drawer">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground uppercase">Find:</span>
            <input
              type="text"
              placeholder="Text to search..."
              value={findText}
              onChange={(e) => setFindText(e.target.value)}
              className="h-8 px-2 text-xs bg-background/80 border border-border/50 rounded-lg text-foreground focus:outline-none focus:border-accent w-48"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold bg-background/50"
              onClick={handleFind}
            >
              <Search className="size-3 mr-1" /> Find Next
            </Button>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-muted-foreground uppercase">Replace:</span>
            <input
              type="text"
              placeholder="Replacement text..."
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              className="h-8 px-2 text-xs bg-background/80 border border-border/50 rounded-lg text-foreground focus:outline-none focus:border-accent w-48"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold bg-background/50"
              onClick={handleReplace}
            >
              <Replace className="size-3 mr-1" /> Replace
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold bg-background/50 border-accent/20 text-accent hover:bg-accent/10"
              onClick={handleReplaceAll}
            >
              Replace All
            </Button>
          </div>

          {/* Go To Line */}
          <div className="flex items-center gap-2 border-l border-border/30 pl-3 ml-2">
            <span className="text-xs font-bold text-muted-foreground uppercase">Go To Line:</span>
            <input
              type="number"
              placeholder="Line #"
              value={gotoLine}
              onChange={(e) => setGotoLine(e.target.value)}
              className="h-8 w-16 px-2 text-xs bg-background/80 border border-border/50 rounded-lg text-foreground focus:outline-none focus:border-accent"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold bg-background/50 border-accent/10"
              onClick={handleGoTo}
            >
              Go!
            </Button>
          </div>
        </div>
      )}

      {/* ── CORE WORKSPACE AREA (SHEET + OPTIONAL SIDEBAR) ── */}
      <div className="flex flex-1 overflow-hidden min-h-[400px]">
        
        {/* ── DIGITAL PAPER SHEET WRAPPER ── */}
        <div className="flex-1 overflow-y-auto p-4 md:p-10 bg-zinc-900/30 flex justify-center items-start relative">
          
          {/* Realistic Page Shadow & Layout */}
          <div className="w-full max-w-[812px] bg-background/70 border border-border/30 rounded-2xl shadow-soft p-6 md:p-12 relative flex flex-col min-h-[600px] border-t-4 border-t-accent/60 document-paper-sheet overflow-hidden">
            
            {/* Physical Header Margin Indicator lines */}
            <div className="absolute top-3 left-8 right-8 flex justify-between text-[9px] text-muted-foreground/40 font-bold uppercase select-none tracking-widest border-b border-border/10 pb-1 z-10">
              <span>Scribe Word-Processor Page</span>
              <span>Margin Width: Standard A4</span>
            </div>

            {/* SENSITIVITY LOCK SHIELD OVERLAY */}
            {isLocked ? (
              <div className="absolute inset-0 bg-background/80 backdrop-blur-md flex flex-col items-center justify-center z-50 p-6 animate-in fade-in duration-200">
                <div className="max-w-md w-full bg-card/60 border border-border/40 rounded-2xl p-8 flex flex-col items-center text-center shadow-2xl relative">
                  <div className="size-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/30 mb-4 animate-bounce-slow">
                    <Lock className="size-7 text-red-400" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-1 uppercase tracking-widest">Confidential Lock Activated</h3>
                  <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
                    This file is classified under <strong className="text-red-400">{sensitivity.toUpperCase()}</strong> security guidelines. Enter the passcode to unlock and display text editor details.
                  </p>

                  <div className="w-full flex flex-col gap-2.5">
                    <input
                      type="password"
                      placeholder="Enter security password (scribe)"
                      value={passwordInput}
                      onChange={(e) => setPasswordInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && attemptUnlock()}
                      className={`h-10 w-full px-3 text-sm bg-background border rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-accent ${passwordError ? "border-red-500 ring-2 ring-red-500/20" : "border-border"}`}
                    />
                    {passwordError && (
                      <span className="text-[10px] text-red-400 font-bold animate-pulse">passcode is incorrect. Try: "scribe"</span>
                    )}
                    <Button
                      onClick={attemptUnlock}
                      className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-bold"
                    >
                      Verify & Unlock Page
                    </Button>
                  </div>
                  <button 
                    onClick={() => {
                      setSensitivity("public");
                      setIsLocked(false);
                      toast.info("Document reverted to public mode");
                    }}
                    className="mt-6 text-[10px] text-muted-foreground/60 hover:text-foreground font-semibold underline"
                  >
                    Cancel and make document Public
                  </button>
                </div>
              </div>
            ) : null}

            {/* RICH TEXT WRITING CANVAS — contentEditable gives MS Word-style per-selection formatting */}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={() => flushEditorContent(false)}
              onMouseUp={saveSelection}
              onKeyUp={saveSelection}
              onMouseDown={() => setTimeout(saveSelection, 0)}
              onKeyDown={(e) => {
                if (e.ctrlKey || e.metaKey) {
                  if (e.key === 's') { e.preventDefault(); onSave?.(); }
                  if (e.key === 'b') { e.preventDefault(); execFmt('bold'); }
                  if (e.key === 'i') { e.preventDefault(); execFmt('italic'); }
                  if (e.key === 'u') { e.preventDefault(); execFmt('underline'); }
                  if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo(); }
                  if ((e.key === 'y') || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); handleRedo(); }
                }
              }}
              onCopy={sensitivity === "highly" ? (e) => { e.preventDefault(); toast.error("Copy operation restricted on HIGHLY CONFIDENTIAL settings!"); } : undefined}
              onPaste={sensitivity === "highly" ? (e) => { e.preventDefault(); toast.error("Paste operation restricted on HIGHLY CONFIDENTIAL settings!"); } : undefined}
              className="flex-1 w-full bg-transparent text-foreground text-sm focus:outline-none overflow-y-auto min-h-[500px] mt-4"
              style={{
                fontFamily: getFontFamilyStyle(fontFamily),
                lineHeight: lineSpacing,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
              spellCheck
            />

            {/* Word & Character counts at page footer */}
            <div className="mt-6 flex justify-between items-center text-[10px] text-muted-foreground/60 font-semibold border-t border-border/20 pt-3 select-none z-10">
              <div className="flex items-center gap-3">
                <span>Words: <strong>{analysis.words}</strong></span>
                <span>Characters: <strong>{analysis.chars}</strong></span>
                <span>Read Time: <strong>{analysis.readTime} min</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <span>Mode: <strong className="text-accent uppercase">Markdown Suite</strong></span>
              </div>
            </div>

          </div>

        </div>

        {/* ── EXPANDED FLOATING STYLES DRAWER SIDEBAR ── */}
        {stylesDrawerOpen && (
          <div className="w-[280px] border-l border-border/40 bg-card/60 backdrop-blur-md p-4 flex flex-col justify-start gap-4 animate-in slide-in-from-right duration-200 z-30 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border/20 pb-2">
              <span className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1">
                <Grid className="size-4 text-accent" /> Styles Library
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setStylesDrawerOpen(false)}>
                <X className="size-4" />
              </Button>
            </div>
            
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              Quickly apply pre-configured typographic alignments and scaling. Scribe structures them perfectly into standard clean Markdown!
            </p>

            <div className="flex flex-col gap-2 mt-2">
              {[
                { label: "Normal (Body Style)", code: "normal", desc: "Clean body text alignment" },
                { label: "H1 Document Title", code: "title", desc: "Huge bold title text header" },
                { label: "H2 Topic Title", code: "h1", desc: "Medium large header" },
                { label: "H3 Subtopic Style", code: "h2", desc: "Subsection small header" },
                { label: "Italic Subtitle", code: "subtitle", desc: "Soft elegant paragraph subtitle" },
                { label: "No Spacing Paragraph", code: "nospace", desc: "Removes line spacing buffer" },
              ].map(st => (
                <button
                  key={st.code}
                  onClick={() => handlePresetStyle(st.code as any)}
                  className="w-full text-left rounded-xl p-2.5 bg-background/30 hover:bg-accent/10 border border-border/20 hover:border-accent/20 transition-all group"
                >
                  <p className="text-xs font-bold text-foreground group-hover:text-accent transition-colors">{st.label}</p>
                  <p className="text-[9px] text-muted-foreground mt-0.5 leading-tight">{st.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── COLLAPSIBLE DOUBLE SIDEBAR DRAGGER (AI SCORE & ADD-INS) ── */}
        {rightPanelOpen && (
          <div className="w-[340px] border-l border-border/40 bg-card/50 backdrop-blur-md flex flex-col animate-in slide-in-from-right duration-200 z-20">
            
            {/* Double Tab Switcher Row */}
            <div className="flex border-b border-border/30 bg-background/25">
              <button
                onClick={() => setRightPanelTab("ai")}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 ${rightPanelTab === "ai" ? "border-b-2 border-accent text-foreground bg-accent/5" : "text-muted-foreground hover:text-foreground hover:bg-accent/5"}`}
              >
                <Sparkles className="size-3.5 text-accent animate-pulse" />
                AI Edit Score
              </button>
              <button
                onClick={() => setRightPanelTab("addins")}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5 ${rightPanelTab === "addins" ? "border-b-2 border-accent text-foreground bg-accent/5" : "text-muted-foreground hover:text-foreground hover:bg-accent/5"}`}
              >
                <Plus className="size-3.5 text-sky-400" />
                Add-ins Panel
              </button>
              <button
                onClick={() => setRightPanelOpen(false)}
                className="px-3 text-muted-foreground hover:text-foreground hover:bg-red-500/10"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* TAB CONTENT: AI EDITOR SCORE */}
            {rightPanelTab === "ai" ? (
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
                
                {/* 1. GORGEOUS CIRCULAR SCORE GAUGE */}
                <div className="flex flex-col items-center p-4 bg-background/30 rounded-2xl border border-border/20 text-center relative overflow-hidden">
                  <div className="absolute top-2 left-2 flex items-center gap-1 text-[8px] font-bold text-accent uppercase tracking-widest">
                    <BarChart3 className="size-2.5 text-accent" /> Analysis Dashboard
                  </div>
                  
                  {/* Circle SVG */}
                  <div className="relative size-28 mt-2 flex items-center justify-center select-none">
                    <svg className="size-full transform -rotate-90">
                      {/* Background circle */}
                      <circle
                        cx="56"
                        cy="56"
                        r="48"
                        className="stroke-muted/40 fill-none"
                        strokeWidth="8"
                      />
                      {/* Active Circle gauge */}
                      <circle
                        cx="56"
                        cy="56"
                        r="48"
                        className={`fill-none stroke-accent transition-all duration-500 ${analysis.score >= 90 ? "stroke-emerald-400" : "stroke-amber-400"}`}
                        strokeWidth="8"
                        strokeDasharray={2 * Math.PI * 48}
                        strokeDashoffset={2 * Math.PI * 48 * (1 - analysis.score / 100)}
                        strokeLinecap="round"
                      />
                    </svg>
                    
                    {/* Centered Score */}
                    <div className="absolute flex flex-col items-center justify-center">
                      <span className="text-2xl font-black text-foreground tracking-tighter">{analysis.score}</span>
                      <span className="text-[8px] font-bold text-muted-foreground/80 uppercase tracking-widest">Editor Score</span>
                    </div>
                  </div>

                  <p className="text-[10px] text-muted-foreground mt-3 font-semibold">
                    {analysis.suggestions.length > 0 
                      ? `⚠️ ${analysis.suggestions.length} spelling & grammar recommendations detected.`
                      : "🎉 Grammar, Tone & SEO readability scores are perfect!"}
                  </p>
                </div>

                {/* 2. DYNAMIC REAL-TIME CHECKS SUGGESTIONS CHECKLIST */}
                <div className="flex flex-col gap-2.5">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Real-time Grammar Checks</span>
                  
                  {analysis.suggestions.length === 0 ? (
                    <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col items-center text-center">
                      <Check className="size-6 text-emerald-400 mb-1" />
                      <p className="text-xs font-bold text-foreground">Zero grammar issues found!</p>
                      <p className="text-[9px] text-muted-foreground/80 mt-0.5">Your content is clean, clear, and highly engaging.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 animate-in fade-in duration-200">
                      {analysis.suggestions.map((sug, i) => (
                        <div key={i} className="p-3 bg-background/40 border border-border/20 rounded-xl flex flex-col gap-2 shadow-sm relative hover:border-accent/30 transition-colors">
                          <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                            <span className="size-2 rounded-full bg-amber-400 shrink-0" />
                            {sug.title}
                          </p>
                          <p className="text-[10px] text-muted-foreground/95 leading-relaxed">{sug.desc}</p>
                          <button
                            onClick={() => handleQuickFix(sug.replaceWord, sug.fixText)}
                            className="w-full h-7 rounded bg-accent/10 border border-accent/20 text-[10px] font-bold text-accent hover:bg-accent hover:text-accent-foreground transition-all uppercase tracking-wider flex items-center justify-center gap-1"
                          >
                            <Sparkles className="size-3" /> {sug.fixText}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3. TONALITY CLASSIFICATION ANALYZER */}
                <div className="flex flex-col gap-2 bg-background/20 rounded-xl p-4 border border-border/10">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                    <BookOpen className="size-3 text-sky-400" /> Content Tonality
                  </span>
                  
                  <div className="flex flex-col gap-2 mt-1">
                    <div>
                      <div className="flex justify-between text-[9px] font-bold text-foreground mb-0.5">
                        <span>👔 Professional Scale</span>
                        <span>{analysis.tone.professional}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-background rounded-full overflow-hidden">
                        <div className="h-full bg-sky-400 rounded-full transition-all duration-500" style={{ width: `${analysis.tone.professional}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[9px] font-bold text-foreground mb-0.5">
                        <span>🌴 Casual / Engaging</span>
                        <span>{analysis.tone.casual}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-background rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full transition-all duration-500" style={{ width: `${analysis.tone.casual}%` }} />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[9px] font-bold text-foreground mb-0.5">
                        <span>📊 Informative Density</span>
                        <span>{analysis.tone.informative}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-background rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-400 rounded-full transition-all duration-500" style={{ width: `${analysis.tone.informative}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* 4. SEO HEALTH KWD CHECK */}
                <div className="bg-background/20 rounded-xl p-4 border border-border/10 flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">SEO Keyword Check</span>
                  <div className="flex justify-between items-center mt-1 text-xs">
                    <span className="text-muted-foreground">SEO Health Score:</span>
                    <span className={`font-bold px-2 py-0.5 rounded-full text-[9px] uppercase ${analysis.seo.seoHealth === "High" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}>
                      {analysis.seo.seoHealth}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="p-2 rounded bg-background/40 border border-border/10 text-center">
                      <p className="text-[10px] text-muted-foreground">"YouTube"</p>
                      <p className="text-xs font-bold text-foreground mt-0.5">{analysis.seo.kwYouTube} occurrences</p>
                    </div>
                    <div className="p-2 rounded bg-background/40 border border-border/10 text-center">
                      <p className="text-[10px] text-muted-foreground">"Video"</p>
                      <p className="text-xs font-bold text-foreground mt-0.5">{analysis.seo.kwVideo} occurrences</p>
                    </div>
                  </div>
                </div>

              </div>
            ) : (
              /* TAB CONTENT: ADD-INS PANEL */
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
                
                {/* A. YOUTUBE VIDEO EMBEDDER */}
                <div className="p-4 bg-background/30 rounded-2xl border border-border/20 flex flex-col gap-2.5">
                  <span className="text-xs font-bold text-foreground uppercase tracking-widest flex items-center gap-1.5 border-b border-border/10 pb-1">
                    <Video className="size-3.5 text-red-500" /> YouTube Media Embedder
                  </span>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Paste any YouTube video link here to automatically compile a gorgeous responsive, embedded iframe markdown block!
                  </p>
                  <input
                    type="text"
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={ytUrl}
                    onChange={(e) => setYtUrl(e.target.value)}
                    className="h-8 w-full px-2 text-xs bg-background border border-border/40 rounded-lg text-foreground focus:outline-none focus:border-accent"
                  />
                  <Button
                    onClick={handleEmbedYoutube}
                    className="h-8 w-full bg-red-500 hover:bg-red-600 text-white font-bold text-xs gap-1"
                  >
                    <Plus className="size-3" /> Embed Video Block
                  </Button>
                </div>

                {/* B. UNSPLASH IMAGE FINDER */}
                <div className="p-4 bg-background/30 rounded-2xl border border-border/20 flex flex-col gap-2.5">
                  <span className="text-xs font-bold text-foreground uppercase tracking-widest flex items-center gap-1.5 border-b border-border/10 pb-1">
                    <ImageIcon className="size-3.5 text-sky-400" /> Unsplash Photo Engine
                  </span>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Search and instantly embed premium, license-free photography to make your layout feel 100% complete!
                  </p>
                  
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="Search (e.g. tech, design)"
                      value={unsplashQuery}
                      onChange={(e) => setUnsplashQuery(e.target.value)}
                      className="h-8 flex-1 px-2 text-xs bg-background border border-border/40 rounded-lg text-foreground focus:outline-none focus:border-accent"
                    />
                    <Button
                      onClick={handleSearchUnsplash}
                      className="h-8 bg-sky-400 hover:bg-sky-500 text-slate-900 font-bold text-xs shrink-0"
                    >
                      Search
                    </Button>
                  </div>

                  {searchingUnsplash ? (
                    <div className="flex flex-col items-center justify-center p-6 bg-background/20 rounded border border-dashed border-border/20 animate-pulse">
                      <span className="text-[10px] font-semibold text-muted-foreground">Searching Unsplash API...</span>
                    </div>
                  ) : unsplashResults.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2 mt-1 animate-in fade-in duration-200">
                      {unsplashResults.map((url, i) => (
                        <div
                          key={i}
                          onClick={() => handleEmbedPhoto(url)}
                          className="h-20 rounded-lg overflow-hidden border border-border/30 relative cursor-pointer group shadow-sm hover:ring-2 hover:ring-accent transition-all"
                        >
                          <img src={url} alt="Unsplash preview" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Plus className="size-5 text-white" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1 mt-1 justify-center">
                      {["Tech", "Design", "Aesthetic", "Minimalist"].map(cat => (
                        <button
                          key={cat}
                          onClick={() => {
                            setUnsplashQuery(cat);
                            setTimeout(handleSearchUnsplash, 50);
                          }}
                          className="px-2 py-1 text-[9px] font-bold rounded bg-background hover:bg-accent/15 border border-border/30 hover:border-accent/40 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          🏷️ {cat}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* C. INTERACTIVE EMOJI PICKER */}
                <div className="p-4 bg-background/30 rounded-2xl border border-border/20 flex flex-col gap-2.5">
                  <span className="text-xs font-bold text-foreground uppercase tracking-widest flex items-center gap-1.5 border-b border-border/10 pb-1">
                    <Smile className="size-3.5 text-yellow-400" /> Interactive Emoji Grid
                  </span>
                  
                  <div className="grid grid-cols-6 gap-2 max-h-[140px] overflow-y-auto pr-1">
                    {[
                      "😀", "😃", "😄", "😁", "😆", "😅", "😂", "🤣", "😊", "😇", 
                      "🙂", "🙃", "😉", "😌", "😍", "🥰", "😘", "😗", "😙", "😚", 
                      "😋", "😛", "😝", "😜", "🤪", "🤨", "🧐", "🤓", "😎", "🤩", 
                      "🥳", "😏", "😒", "😞", "😔", "😟", "✍️", "📝", "💻", "🔥", 
                      "🚀", "💡", "🧠", "🎯", "⭐", "🎉", "✨", "📌", "⚙️", "✅"
                    ].map(em => (
                      <button
                        key={em}
                        onClick={() => wrapSelection(em)}
                        className="text-base h-8 rounded bg-background/50 hover:bg-accent/20 border border-border/20 hover:border-accent/40 flex items-center justify-center transition-all scale-active"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>

              </div>
            )}

          </div>
        )}

      </div>

    </div>
  );
}

/* ── COMPACT FLOATING DROPDOWN PRESET SELECTOR BUTTON ── */
interface DropdownButtonProps {
  icon: React.ReactNode;
  title: string;
  options: { label: string; onClick: () => void }[];
}

function DropdownButton({ icon, title, options }: DropdownButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const clickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", clickOutside);
    return () => document.removeEventListener("mousedown", clickOutside);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        title={title}
        onClick={() => setOpen(!open)}
      >
        {icon}
      </Button>

      {open && (
        <div className="absolute left-0 mt-1.5 w-[200px] bg-card border border-border text-foreground rounded-xl shadow-xl p-1 z-50 animate-in fade-in duration-100">
          <p className="text-[9px] font-bold text-muted-foreground px-2 py-1 uppercase tracking-widest">{title}</p>
          <div className="h-[1px] bg-border my-1" />
          {options.map((opt) => (
            <button
              key={opt.label}
              onClick={() => {
                opt.onClick();
                setOpen(false);
              }}
              className="w-full text-left rounded-lg px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-accent/10 hover:text-foreground transition-colors font-medium border-b border-border/10 pb-1"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

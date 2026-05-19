import { useState, useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare, X, SendHorizontal, Bot, Sparkles, User, HelpCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupportBotResponse } from "@/lib/auth.functions";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export function SupportChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi! 👋 I am the **Scribe Support Assistant**. Ask me anything about workspaces, custom templates, billing, or YouTube transcription features!",
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const getResponseFn = useServerFn(getSupportBotResponse);

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Support listening for global trigger events to open support chatbot from other menus
  useEffect(() => {
    const handleOpenSupport = () => {
      setIsOpen(true);
    };
    window.addEventListener("open_support_chat", handleOpenSupport);
    return () => {
      window.removeEventListener("open_support_chat", handleOpenSupport);
    };
  }, []);

  const handleSend = async (textToSend?: string) => {
    const query = (textToSend || input).trim();
    if (!query) return;

    if (!textToSend) setInput("");

    // Add user message
    const updatedMessages = [...messages, { role: "user" as const, content: query }];
    setMessages(updatedMessages);
    setIsTyping(true);

    try {
      // Send chat log history
      const response = await getResponseFn({ data: { messages: updatedMessages } });
      
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: response.reply || "I'm having trouble connecting to support. Please try again shortly." },
      ]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Oops! We encountered an error sending your query. Please check your connection and try again." },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const PRESETS = [
    { label: "Upgrade & Plans 💳", text: "What plans do you offer and how do I upgrade?" },
    { label: "Workspace folders 📂", text: "How do workspace folders work?" },
    { label: "Saving Templates 🎨", text: "How do I save custom tone/format templates?" },
  ];

  return (
    <div className="fixed bottom-6 right-6 z-[9999] font-sans antialiased">
      {/* Expanded Chat Box */}
      {isOpen && (
        <div className="mb-4 flex h-[500px] w-[380px] flex-col overflow-hidden rounded-2xl border border-border/80 bg-card/95 backdrop-blur-xl shadow-2xl transition-all duration-300">
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/60 bg-accent/5 p-4">
            <div className="flex items-center gap-3">
              <div className="relative flex size-10 items-center justify-center rounded-xl bg-accent border border-accent/20 text-accent-foreground shadow-md shadow-accent/10">
                <Bot className="size-5" />
                <span className="absolute bottom-0 right-0 size-2.5 rounded-full border-2 border-card bg-emerald-500"></span>
              </div>
              <div className="leading-tight">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  Scribe Assistant
                  <Sparkles className="size-3.5 text-accent animate-pulse" />
                </h3>
                <p className="text-[11px] text-muted-foreground">Ask support anything • Online</p>
              </div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 rounded-lg text-muted-foreground hover:bg-accent/10 hover:text-foreground"
              onClick={() => setIsOpen(false)}
            >
              <X className="size-4" />
            </Button>
          </div>

          {/* Message List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-3 max-w-[85%] ${
                  msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"
                }`}
              >
                <div
                  className={`flex size-7 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold ${
                    msg.role === "user"
                      ? "bg-accent border-accent/20 text-accent-foreground"
                      : "bg-background/80 border-border/40 text-muted-foreground"
                  }`}
                >
                  {msg.role === "user" ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
                </div>
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                    msg.role === "user"
                      ? "bg-accent/10 border border-accent/20 text-foreground rounded-tr-none"
                      : "bg-background border border-border/30 text-foreground rounded-tl-none"
                  }`}
                >
                  <article className="prose-support text-xs leading-relaxed max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </article>
                </div>
              </div>
            ))}

            {/* Typing Loader */}
            {isTyping && (
              <div className="flex gap-3 max-w-[85%] mr-auto items-center">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border bg-background/80 border-border/40 text-muted-foreground">
                  <Bot className="size-3.5" />
                </div>
                <div className="flex items-center gap-1 bg-background border border-border/30 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin text-accent" />
                  Scribe Support is writing...
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Presets / Suggestions */}
          {messages.length === 1 && (
            <div className="px-4 py-2 border-t border-border/30 bg-background/40">
              <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1.5">Common questions</p>
              <div className="flex flex-col gap-1.5">
                {PRESETS.map((preset, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(preset.text)}
                    className="w-full text-left text-xs bg-background/50 hover:bg-accent/15 border border-border/40 hover:border-accent/30 text-foreground/80 hover:text-foreground rounded-lg px-2.5 py-1.5 transition"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Form Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex gap-2 border-t border-border/40 bg-background/80 p-3"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask support a question..."
              disabled={isTyping}
              className="h-10 rounded-xl bg-background/60 border-border focus-visible:ring-accent text-sm"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || isTyping}
              className="size-10 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 shrink-0"
            >
              <SendHorizontal className="size-4" />
            </Button>
          </form>
        </div>
      )}

      {/* Floating Circular Launcher Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`group flex size-14 items-center justify-center rounded-full bg-accent border border-accent/20 text-accent-foreground shadow-2xl transition hover:scale-105 active:scale-95 ${
          isOpen ? "bg-card border-border/80 text-muted-foreground" : "animate-bounce-slow"
        }`}
      >
        {isOpen ? (
          <X className="size-6 transition-transform group-hover:rotate-90 duration-200" />
        ) : (
          <div className="relative">
            <MessageSquare className="size-6" />
            <span className="absolute -top-1 -right-1 flex size-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex size-3 rounded-full bg-emerald-500"></span>
            </span>
          </div>
        )}
      </button>
    </div>
  );
}

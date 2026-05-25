import React, { createContext, useContext, useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, HelpCircle, Info, CheckCircle2 } from "lucide-react";

interface ConfirmOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  icon?: "info" | "success" | "warning";
}

interface PromptOptions extends ConfirmOptions {
  placeholder?: string;
  defaultValue?: string;
}

interface AlertOptions {
  title?: string;
  confirmText?: string;
  icon?: "info" | "success" | "warning";
}

interface CustomDialogContextType {
  showConfirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
  showPrompt: (message: string, options?: PromptOptions) => Promise<string | null>;
  showAlert: (message: string, options?: AlertOptions) => Promise<void>;
}

const CustomDialogContext = createContext<CustomDialogContextType | undefined>(undefined);

export function CustomDialogProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<"confirm" | "prompt" | "alert">("confirm");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [placeholder, setPlaceholder] = useState("");
  const [inputValue, setInputValue] = useState("");
  const [confirmText, setConfirmText] = useState("Confirm");
  const [cancelText, setCancelText] = useState("Cancel");
  const [isDestructive, setIsDestructive] = useState(false);
  const [dialogIcon, setDialogIcon] = useState<"info" | "success" | "warning">("info");

  const resolverRef = useRef<((value: any) => void) | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when prompt is shown
  useEffect(() => {
    if (isOpen && type === "prompt") {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isOpen, type]);

  const showConfirm = (msg: string, options?: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setMessage(msg);
      setTitle(options?.title || "Are you sure?");
      setConfirmText(options?.confirmText || "Confirm");
      setCancelText(options?.cancelText || "Cancel");
      setIsDestructive(options?.isDestructive || false);
      setDialogIcon(options?.icon || (options?.isDestructive ? "warning" : "info"));
      setType("confirm");
      setIsOpen(true);
    });
  };

  const showPrompt = (msg: string, options?: PromptOptions): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve;
      setMessage(msg);
      setTitle(options?.title || "Input Required");
      setPlaceholder(options?.placeholder || "Type here...");
      setInputValue(options?.defaultValue || "");
      setConfirmText(options?.confirmText || "Submit");
      setCancelText(options?.cancelText || "Cancel");
      setIsDestructive(options?.isDestructive || false);
      setDialogIcon(options?.icon || "info");
      setType("prompt");
      setIsOpen(true);
    });
  };

  const showAlert = (msg: string, options?: AlertOptions): Promise<void> => {
    return new Promise<void>((resolve) => {
      resolverRef.current = resolve;
      setMessage(msg);
      setTitle(options?.title || "Notification");
      setConfirmText(options?.confirmText || "OK");
      setCancelText("");
      setIsDestructive(false);
      setDialogIcon(options?.icon || "success");
      setType("alert");
      setIsOpen(true);
    });
  };

  const handleConfirm = () => {
    if (resolverRef.current) {
      if (type === "prompt") {
        resolverRef.current(inputValue);
      } else if (type === "confirm") {
        resolverRef.current(true);
      } else {
        resolverRef.current(undefined);
      }
    }
    setIsOpen(false);
  };

  const handleCancel = () => {
    if (resolverRef.current) {
      if (type === "prompt") {
        resolverRef.current(null);
      } else if (type === "confirm") {
        resolverRef.current(false);
      } else {
        resolverRef.current(undefined);
      }
    }
    setIsOpen(false);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      handleCancel();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  return (
    <CustomDialogContext.Provider value={{ showConfirm, showPrompt, showAlert }}>
      {children}
      
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-[420px] p-6 bg-card/95 backdrop-blur-xl border border-border/60 text-foreground shadow-2xl rounded-2xl overflow-hidden transition-all duration-300">
          {/* Subtle Glowing Background Accent */}
          <div className="absolute -top-10 -right-10 w-32 h-32 bg-accent/10 rounded-full blur-3xl pointer-events-none" />
          
          <DialogHeader className="space-y-3">
            <div className="flex items-center gap-3 text-left">
              <div className={`p-2.5 rounded-xl shrink-0 ${
                dialogIcon === "warning"
                  ? "bg-destructive/10 text-destructive border border-destructive/20" 
                  : dialogIcon === "success"
                  ? "bg-green-500/10 text-green-500 border border-green-500/20"
                  : "bg-accent/10 text-accent border border-accent/20"
              }`}>
                {dialogIcon === "warning" ? (
                  <AlertTriangle className="size-5 shrink-0" />
                ) : dialogIcon === "success" ? (
                  <CheckCircle2 className="size-5 shrink-0" />
                ) : type === "prompt" ? (
                  <HelpCircle className="size-5 shrink-0" />
                ) : (
                  <Info className="size-5 shrink-0" />
                )}
              </div>
              <DialogTitle className="font-display text-xl tracking-tight font-medium text-foreground">
                {title}
              </DialogTitle>
            </div>
            
            <DialogDescription className="text-left text-sm text-muted-foreground leading-relaxed pt-1">
              {message}
            </DialogDescription>
          </DialogHeader>

          {type === "prompt" && (
            <div className="py-3">
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                className="w-full bg-background/50 border-border text-foreground focus-visible:ring-accent focus-visible:ring-offset-0 focus-visible:border-accent rounded-xl px-4 py-2.5"
              />
            </div>
          )}

          <DialogFooter className="flex flex-row justify-end gap-2.5 mt-4 sm:space-x-0">
            {type !== "alert" && (
              <Button
                variant="outline"
                onClick={handleCancel}
                className="flex-1 sm:flex-none border-border/60 bg-transparent hover:bg-accent/5 hover:text-foreground text-muted-foreground transition-all duration-150 rounded-xl px-5 h-10 cursor-pointer active:scale-97"
              >
                {cancelText}
              </Button>
            )}
            <Button
              variant={isDestructive ? "destructive" : "default"}
              onClick={handleConfirm}
              className={`flex-1 sm:flex-none font-semibold transition-all duration-150 rounded-xl px-5 h-10 cursor-pointer active:scale-97 ${
                type === "alert" ? "w-full" : ""
              } ${
                isDestructive 
                  ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground" 
                  : "bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg shadow-accent/10"
              }`}
            >
              {confirmText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CustomDialogContext.Provider>
  );
}

export function useCustomDialog() {
  const context = useContext(CustomDialogContext);
  if (context === undefined) {
    throw new Error("useCustomDialog must be used within a CustomDialogProvider");
  }
  return context;
}

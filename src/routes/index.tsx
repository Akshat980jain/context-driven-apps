import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { convertVideo } from "@/lib/convert.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Copy,
  Download,
  Loader2,
  Sparkles,
  Youtube,
  FileText,
  CheckCircle2,
  RotateCw,
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
  const [seo, setSeo] = useState<SeoData>({});
  const [view, setView] = useState<"preview" | "markdown">("preview");
  const [copied, setCopied] = useState(false);

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
  };

  return (
    <main className="relative mx-auto max-w-5xl px-6 py-12 md:py-20">
      <header className="mb-12 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/50 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
          <Sparkles className="size-3 text-accent" />
          AI-powered content repurposing
        </div>
        <h1 className="font-display text-5xl leading-none tracking-tight md:text-7xl">
          Turn any <span className="italic text-accent">YouTube</span> video
          <br />
          into a polished blog post.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base text-muted-foreground md:text-lg">
          Paste a link. Pick a voice. Get a publish-ready article with SEO metadata in seconds.
        </p>
      </header>

      <Card className="border-border/60 bg-card/60 p-6 backdrop-blur md:p-8">
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
                className="h-14 rounded-xl border-border bg-background/60 pl-12 text-base"
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
        <section className="mt-12 space-y-6">
          {(seo.title || seo.metaDescription || seo.tags?.length) && (
            <Card className="border-border/60 bg-card/60 p-6 backdrop-blur">
              <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <FileText className="size-3.5" /> SEO metadata
              </div>
              {seo.title && <h2 className="font-display text-3xl leading-tight">{seo.title}</h2>}
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

          <Card className="border-border/60 bg-card/60 p-6 backdrop-blur md:p-10">
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
                <Button variant="outline" size="sm" onClick={copy}>
                  <Copy className="mr-1.5 size-3.5" /> {copied ? "Copied!" : "Copy"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => download("md")}>
                  <Download className="mr-1.5 size-3.5" /> .md
                </Button>
                <Button variant="outline" size="sm" onClick={() => download("txt")}>
                  <Download className="mr-1.5 size-3.5" /> .txt
                </Button>
                <Button variant="outline" size="sm" onClick={() => submit()} disabled={loading}>
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

      <footer className="mt-20 text-center text-xs text-muted-foreground">
        Built with Lovable AI · Transcripts via Supadata
      </footer>
    </main>
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
        <SelectTrigger className="h-11 rounded-lg border-border bg-background/60">
          <SelectValue />
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

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Outbound API Connectivity Timeout Helper
async function fetchWithTimeout(resource: string, options: RequestInit & { timeout?: number } = {}) {
  const { timeout = 25000 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error: any) {
    clearTimeout(id);
    if (error.name === "AbortError" || error.message?.includes("aborted")) {
      throw new Error(`Timeout: Outbound connection to external service timed out after ${timeout / 1000}s.`);
    }
    throw error;
  }
}


const InputSchema = z.object({
  url: z.string().url().min(1).max(500),
  tone: z.enum(["Professional", "Casual", "Technical", "Educational"]).default("Professional"),
  length: z.enum(["Short", "Medium", "Long"]).default("Medium"),
  format: z.enum(["How-to Guide", "Listicle", "Deep Dive", "Summary"]).default("Deep Dive"),
  brandVoice: z.object({
    enabled: z.boolean(),
    vocabulary: z.object({
      prefer: z.string(),
      avoid: z.string()
    }),
    sliders: z.object({
      depth: z.number().min(0).max(100),
      exuberance: z.number().min(0).max(100),
      directness: z.number().min(0).max(100)
    }),
    sampleText: z.string()
  }).optional()
});

const LENGTH_WORDS: Record<string, string> = {
  Short: "400 words",
  Medium: "800 words",
  Long: "1500 words",
};

export const convertVideo = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => InputSchema.parse(data))
  .handler(async ({ data }) => {
    const supadataKey = process.env.SUPADATA_API_KEY;
    const lovableKey = process.env.LOVABLE_API_KEY;
    const openrouterKey = process.env.OPENROUTER_API_KEY;

    if (!supadataKey) return { error: "Missing SUPADATA_API_KEY." };
    if (!lovableKey && !openrouterKey) {
      return { error: "Missing either LOVABLE_API_KEY or OPENROUTER_API_KEY." };
    }

    // 1. Fetch transcript
    let transcript = "";
    try {
      const tRes = await fetchWithTimeout(
        `https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(data.url)}&text=true`,
        { 
          headers: { "x-api-key": supadataKey },
          timeout: 20000
        },
      );
      if (!tRes.ok) {
        const body = await tRes.text();
        return { error: `Transcript fetch failed (${tRes.status}). ${body.slice(0, 200)}` };
      }
      const tJson = (await tRes.json()) as { content?: string };
      transcript = (tJson.content ?? "").trim();
      if (!transcript) return { error: "No transcript available for this video." };
    } catch (e) {
      return { error: `Failed to fetch transcript: ${(e as Error).message}` };
    }

    // Cap transcript to avoid blowing token budget
    const MAX_CHARS = 60_000;
    if (transcript.length > MAX_CHARS) transcript = transcript.slice(0, MAX_CHARS);

    // 2. Generate blog
    let brandVoiceInstructions = "";
    if (data.brandVoice && data.brandVoice.enabled) {
      const bv = data.brandVoice;
      const instructions: string[] = [];

      // Technical Depth slider
      if (bv.sliders.depth < 30) {
        instructions.push("- Simplify complex technical concepts into very simple, beginner-friendly terms. Use clear analogies and avoid dense technical jargon.");
      } else if (bv.sliders.depth > 70) {
        instructions.push("- Write with extreme technical precision and depth, targeting advanced readers. Do not oversimplify, use precise domain-specific terminology, and provide highly detailed insights.");
      }

      // Exuberance / Energy slider
      if (bv.sliders.exuberance < 30) {
        instructions.push("- Maintain a strictly dry, factual, objective, and academic tone. Do not use exclamations, casual remarks, or humor.");
      } else if (bv.sliders.exuberance > 70) {
        instructions.push("- Infuse high energy, personal enthusiasm, and highly conversational developer humor. Use expressive language, bold hooks, and engaging analogies.");
      }

      // Directness / Clarity slider
      if (bv.sliders.directness < 30) {
        instructions.push("- Write in a descriptive, elaborate, and narrative-focused storytelling style. Connect ideas with smooth transitions and deep background context.");
      } else if (bv.sliders.directness > 70) {
        instructions.push("- Be extremely direct, concise, and structured. Get straight to the point, use short sentences, minimal filler words, and clean bullet lists for high readability.");
      }

      // Vocabulary lists
      if (bv.vocabulary.prefer.trim()) {
        instructions.push(`- Frequently prioritize using the following terms and concepts naturally in your writing: ${bv.vocabulary.prefer}`);
      }
      if (bv.vocabulary.avoid.trim()) {
        instructions.push(`- CRITICAL: Completely avoid using the following buzzwords or expressions: ${bv.vocabulary.avoid}`);
      }

      // Prose writing sample
      if (bv.sampleText.trim()) {
        instructions.push(`- Closely emulate the sentence structures, tone, syntax rhythm, and stylistic flow demonstrated in the following writing sample:\n"""\n${bv.sampleText.slice(0, 4000)}\n"""`);
      }

      if (instructions.length > 0) {
        brandVoiceInstructions = `\n\n─── CRITICAL BRAND VOICE CLONING PARAMETERS ───\nApply the following styling commands to override standard tone guidelines:\n${instructions.join("\n")}\n─────────────────────────────────────────────\n`;
      }
    }

    const system = `You are a professional blog writer and content strategist with expertise in SEO.
Your job is to convert YouTube video transcripts into polished, engaging blog posts.

Rules:
- Write in a clear, engaging, human tone (not robotic)
- Structure with proper headings (H1, H2, H3)
- Add an intro paragraph that hooks the reader
- Include a conclusion with key takeaways
- Bold important terms
- Add a "Key Takeaways" bullet list at the end
- Generate 5 relevant SEO tags
- Generate a meta description (max 160 characters)
- Do NOT mention "this video" or "the speaker says" — write as a standalone article
- Tone: ${data.tone}
- Format style: ${data.format}
- Length: approximately ${LENGTH_WORDS[data.length]}
- Output format: Markdown${brandVoiceInstructions}`;

    const user = `Here is the transcript from a YouTube video:

---
${transcript}
---

Please convert this into a complete blog post following all the rules.
Respond ONLY with the blog post in Markdown format.
At the end, append a JSON block exactly like this (after the blog content):

\`\`\`json
{
  "title": "...",
  "metaDescription": "...",
  "tags": ["tag1","tag2","tag3","tag4","tag5"],
  "readingTime": "X min read"
}
\`\`\``;

    try {
      const endpoint = openrouterKey 
        ? "https://openrouter.ai/api/v1/chat/completions"
        : "https://ai.gateway.lovable.dev/v1/chat/completions";

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (openrouterKey) {
        headers["Authorization"] = `Bearer ${openrouterKey}`;
        // Optional headers for OpenRouter rankings
        headers["HTTP-Referer"] = "http://localhost:8080";
        headers["X-Title"] = "YTBlog Converter";
      } else {
        headers["Authorization"] = `Bearer ${lovableKey}`;
      }

      const model = openrouterKey 
        ? "openrouter/free" // Automatically routes to the best available 100% free model
        : "google/gemini-3-flash-preview";

      const aiRes = await fetchWithTimeout(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        timeout: 25000
      });

      if (aiRes.status === 429) return { error: "Rate limit hit. Try again in a moment." };
      if (aiRes.status === 402)
        return { error: "AI credits exhausted. Add credits in Workspace → Usage." };
      if (!aiRes.ok) {
        const body = await aiRes.text();
        return { error: `AI request failed (${aiRes.status}). ${body.slice(0, 200)}` };
      }

      const aiJson = (await aiRes.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const raw = aiJson.choices?.[0]?.message?.content ?? "";

      const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/);
      let seo: {
        title?: string;
        metaDescription?: string;
        tags?: string[];
        readingTime?: string;
      } = {};
      if (jsonMatch) {
        try {
          seo = JSON.parse(jsonMatch[1]);
        } catch {
          // ignore
        }
      }
      const markdown = raw.replace(/```json[\s\S]*?```/, "").trim();

      return { markdown, seo, error: null as string | null };
    } catch (e) {
      return { error: `AI generation failed: ${(e as Error).message}` };
    }
  });

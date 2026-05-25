import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { assertAuthorized } from "./auth.functions";

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

// ─── Shared AI Helpers ───────────────────────────────────────────────


function getAiConfig() {
  const openrouterKey = process.env.OPENROUTER_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;

  if (!openrouterKey && !lovableKey) {
    return null;
  }

  const endpoint = openrouterKey
    ? "https://openrouter.ai/api/v1/chat/completions"
    : "https://ai.gateway.lovable.dev/v1/chat/completions";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (openrouterKey) {
    headers["Authorization"] = `Bearer ${openrouterKey}`;
    headers["HTTP-Referer"] = "http://localhost:8080";
    headers["X-Title"] = "YTBlog Converter";
  } else {
    headers["Authorization"] = `Bearer ${lovableKey}`;
  }

  const model = openrouterKey ? "openrouter/free" : "google/gemini-3-flash-preview";

  return { endpoint, headers, model };
}

async function callAi(
  system: string,
  user: string,
  maxTokens = 2000
): Promise<{ content: string; error?: string }> {
  const config = getAiConfig();
  if (!config) {
    return { content: "", error: "Missing API key (OPENROUTER_API_KEY or LOVABLE_API_KEY)." };
  }

  try {
    const res = await fetchWithTimeout(config.endpoint, {
      method: "POST",
      headers: config.headers,
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: maxTokens,
      }),
      timeout: 25000
    });

    if (res.status === 429) return { content: "", error: "Rate limit hit. Try again in a moment." };
    if (res.status === 402) return { content: "", error: "AI credits exhausted." };
    if (!res.ok) {
      const body = await res.text();
      return { content: "", error: `AI request failed (${res.status}). ${body.slice(0, 200)}` };
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    return { content };
  } catch (e) {
    return { content: "", error: `AI call failed: ${(e as Error).message}` };
  }
}

// ─── 1. Inline AI Text Refinement ────────────────────────────────────

const RefineSchema = z.object({
  text: z.string().min(1).max(10000),
  action: z.enum([
    "shorten",
    "lengthen",
    "example",
    "simplify",
    "casual",
    "professional",
    "technical",
    "grammar",
  ]),
  context: z.string().optional(),
  userId: z.string().optional(),
  accessToken: z.string().optional()
});

const ACTION_PROMPTS: Record<string, string> = {
  shorten:
    "Rewrite the following text to be significantly shorter and more concise while preserving all key information. Output ONLY the rewritten text, nothing else.",
  lengthen:
    "Expand the following text with more detail, examples, and elaboration while keeping the same tone. Output ONLY the rewritten text, nothing else.",
  example:
    "Add a clear, relevant, practical example to illustrate the point made in the following text. Integrate it naturally. Output ONLY the full rewritten text with the example included, nothing else.",
  simplify:
    "Rewrite the following text using simpler language that a beginner could understand. Avoid jargon. Output ONLY the rewritten text, nothing else.",
  casual:
    "Rewrite the following text in a friendly, casual, conversational tone. Output ONLY the rewritten text, nothing else.",
  professional:
    "Rewrite the following text in a polished, professional tone suitable for a business audience. Output ONLY the rewritten text, nothing else.",
  technical:
    "Rewrite the following text with more technical precision and depth, using appropriate domain terminology. Output ONLY the rewritten text, nothing else.",
  grammar:
    "Fix all grammar, spelling, and punctuation errors in the following text. Improve sentence structure where needed. Output ONLY the corrected text, nothing else.",
};

export const refineText = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => RefineSchema.parse(data))
  .handler(async ({ data }) => {
    if (data.userId) {
      try {
        await assertAuthorized(data.userId, data.accessToken);
      } catch (err: any) {
        return { refined: "", error: err.message || "Unauthorized" };
      }
    }

    const system = ACTION_PROMPTS[data.action] || ACTION_PROMPTS.grammar;
    const userPrompt = data.context
      ? `Context of the full article:\n---\n${data.context.slice(0, 3000)}\n---\n\nText to rewrite:\n${data.text}`
      : data.text;

    const result = await callAi(system, userPrompt, 1500);
    if (result.error) {
      return { refined: "", error: result.error };
    }
    return { refined: result.content.trim(), error: null as string | null };
  });

// ─── 2. Repurpose Content ────────────────────────────────────────────

const RepurposeSchema = z.object({
  markdown: z.string().min(1),
  title: z.string().optional(),
  tags: z.array(z.string()).optional(),
  platform: z.enum(["twitter", "linkedin", "newsletter"]),
  userId: z.string().optional(),
  accessToken: z.string().optional()
});

const REPURPOSE_PROMPTS: Record<string, string> = {
  twitter: `You are an expert social media content creator.
Convert the following blog post into a compelling Twitter/X thread.

Rules:
- Start with a strong hook tweet that grabs attention (use an emoji)
- Break into 6-10 numbered tweets (each under 280 characters)
- Format each tweet as: "1/ tweet content" on its own line
- Use line breaks between tweets
- End with a CTA tweet inviting engagement
- Include 2-3 relevant hashtags in the final tweet only
- Keep the voice punchy, direct, and conversational
- Do NOT include any preamble — start directly with "1/"

Output ONLY the thread, nothing else.`,

  linkedin: `You are an expert LinkedIn content strategist.
Convert the following blog post into a compelling LinkedIn post.

Rules:
- Start with a bold, attention-grabbing opening line (the "hook")
- Use short paragraphs (1-2 sentences each) for readability
- Include 1-2 relevant emojis per section (not overdone)
- Add strategic line breaks for LinkedIn's feed format
- End with a thought-provoking question to drive comments
- Add 3-5 relevant hashtags at the bottom
- Keep it between 200-400 words
- Tone: professional but approachable
- Do NOT include any preamble — start directly with the post

Output ONLY the post, nothing else.`,

  newsletter: `You are an expert newsletter writer.
Convert the following blog post into a polished email newsletter snippet.

Rules:
- Start with a brief, engaging subject line on the first line in format: "Subject: ..."
- Then a "Preview text: ..." line (40-90 chars, the inbox preview)
- Then the newsletter body:
  - Greeting: "Hey there 👋"
  - Brief intro hook (1-2 sentences)
  - 3-5 key highlights as bullet points
  - A "Read more" CTA
  - Sign-off
- Keep the total body under 300 words
- Tone: warm, personal, informative
- Do NOT include any preamble

Output ONLY the newsletter, nothing else.`,
};

export const repurposeContent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => RepurposeSchema.parse(data))
  .handler(async ({ data }) => {
    if (data.userId) {
      try {
        await assertAuthorized(data.userId, data.accessToken);
      } catch (err: any) {
        return { content: "", error: err.message || "Unauthorized" };
      }
    }

    const system = REPURPOSE_PROMPTS[data.platform];
    const userPrompt = `Blog title: ${data.title || "Untitled"}\nTags: ${(data.tags || []).join(", ")}\n\n---\n${data.markdown.slice(0, 8000)}\n---`;

    const result = await callAi(system, userPrompt, 2000);
    if (result.error) {
      return { content: "", error: result.error };
    }
    return { content: result.content.trim(), error: null as string | null };
  });

// ─── 3. Batch Convert Multiple Videos ────────────────────────────────

const LENGTH_WORDS: Record<string, string> = {
  Short: "400 words",
  Medium: "800 words",
  Long: "1500 words",
};

const BatchSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(20),
  tone: z.string(),
  length: z.string(),
  format: z.string(),
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
  }).optional(),
  userId: z.string().optional(),
  accessToken: z.string().optional()
});

export const batchConvertVideo = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => BatchSchema.parse(data))
  .handler(async ({ data }) => {
    if (data.userId) {
      try {
        await assertAuthorized(data.userId, data.accessToken);
      } catch (err: any) {
        return { results: data.urls.map((url) => ({ url, error: err.message || "Unauthorized" })) };
      }
    }

    const supadataKey = process.env.SUPADATA_API_KEY;
    if (!supadataKey) {
      return { results: data.urls.map((url) => ({ url, error: "Missing SUPADATA_API_KEY." })) };
    }

    const config = getAiConfig();
    if (!config) {
      return {
        results: data.urls.map((url) => ({ url, error: "Missing AI API key." })),
      };
    }

    // Compile Brand Voice Cloner Instructions
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
- Length: approximately ${LENGTH_WORDS[data.length] || "800 words"}
- Output format: Markdown${brandVoiceInstructions}`;

    const results: Array<{
      url: string;
      markdown?: string;
      seo?: { title?: string; metaDescription?: string; tags?: string[]; readingTime?: string };
      error?: string;
    }> = [];

    for (const url of data.urls) {
      try {
        // 1. Fetch transcript
        const tRes = await fetchWithTimeout(
          `https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(url)}&text=true`,
          { 
            headers: { "x-api-key": supadataKey },
            timeout: 20000
          }
        );

        if (!tRes.ok) {
          const body = await tRes.text();
          results.push({ url, error: `Transcript fetch failed (${tRes.status}). ${body.slice(0, 100)}` });
          continue;
        }

        const tJson = (await tRes.json()) as { content?: string };
        let transcript = (tJson.content ?? "").trim();
        if (!transcript) {
          results.push({ url, error: "No transcript available for this video." });
          continue;
        }

        // Cap transcript
        if (transcript.length > 60_000) transcript = transcript.slice(0, 60_000);

        // 2. Generate blog
        const userPrompt = `Here is the transcript from a YouTube video:\n\n---\n${transcript}\n---\n\nPlease convert this into a complete blog post following all the rules.\nRespond ONLY with the blog post in Markdown format.\nAt the end, append a JSON block exactly like this (after the blog content):\n\n\`\`\`json\n{\n  "title": "...",\n  "metaDescription": "...",\n  "tags": ["tag1","tag2","tag3","tag4","tag5"],\n  "readingTime": "X min read"\n}\n\`\`\``;

        const aiRes = await fetchWithTimeout(config.endpoint, {
          method: "POST",
          headers: config.headers,
          body: JSON.stringify({
            model: config.model,
            messages: [
              { role: "system", content: system },
              { role: "user", content: userPrompt },
            ],
          }),
          timeout: 25000
        });

        if (!aiRes.ok) {
          const body = await aiRes.text();
          results.push({ url, error: `AI request failed (${aiRes.status}). ${body.slice(0, 100)}` });
          continue;
        }

        const aiJson = (await aiRes.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const raw = aiJson.choices?.[0]?.message?.content ?? "";

        const jsonMatch = raw.match(/```json\s*([\s\S]*?)\s*```/);
        let seo: { title?: string; metaDescription?: string; tags?: string[]; readingTime?: string } = {};
        if (jsonMatch) {
          try {
            seo = JSON.parse(jsonMatch[1]);
          } catch {
            // ignore
          }
        }
        const markdown = raw.replace(/```json[\s\S]*?```/, "").trim();

        results.push({ url, markdown, seo });
      } catch (e) {
        results.push({ url, error: `Failed: ${(e as Error).message}` });
      }
    }

    return { results };
  });

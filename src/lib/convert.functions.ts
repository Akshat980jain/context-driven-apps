import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  url: z.string().url().min(1).max(500),
  tone: z.enum(["Professional", "Casual", "Technical", "Educational"]).default("Professional"),
  length: z.enum(["Short", "Medium", "Long"]).default("Medium"),
  format: z.enum(["How-to Guide", "Listicle", "Deep Dive", "Summary"]).default("Deep Dive"),
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
      const tRes = await fetch(
        `https://api.supadata.ai/v1/youtube/transcript?url=${encodeURIComponent(data.url)}&text=true`,
        { headers: { "x-api-key": supadataKey } },
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
- Output format: Markdown`;

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

      const aiRes = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
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

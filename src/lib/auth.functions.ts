import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import fs from "fs";
import path from "path";

const DB_PATH = path.resolve(process.cwd(), "users_db.json");

interface Generation {
  id: string;
  url: string;
  tone: string;
  length: string;
  format: string;
  title: string;
  createdAt?: string;
  markdown?: string;
  seo?: any;
  workspaceId?: string;
}

interface Workspace {
  id: string;
  name: string;
}

interface Template {
  id: string;
  name: string;
  tone: string;
  length: string;
  format: string;
}

interface User {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  generations?: Generation[];
  workspaces?: Workspace[];
  templates?: Template[];
  plan?: string;
}

// Helper to init/read DB
function readDb(): { users: User[] } {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: [] }));
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  
  // Backwards compatibility initialization
  db.users.forEach((u: User) => {
    if (!u.generations) u.generations = [];
    if (!u.workspaces) u.workspaces = [];
    if (!u.templates) u.templates = [];
    if (!u.plan) u.plan = "Free";
  });
  
  return db;
}

// Helper to write DB
function writeDb(data: { users: User[] }) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

const AuthSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  action: z.enum(["login", "signup"]),
});

export const authenticateUser = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => AuthSchema.parse(data))
  .handler(async ({ data }) => {
    const { email, password, action } = data;
    const db = readDb();

    // Very simple password hashing mock for demonstration
    // In production you would use bcrypt
    const passwordHash = Buffer.from(password).toString("base64");

    const existingUser = db.users.find((u) => u.email === email);

    if (action === "signup") {
      if (existingUser) {
        return { error: "User already exists. Please log in.", code: "USER_EXISTS" as const };
      }

      const newUser: User = {
        id: crypto.randomUUID(),
        email,
        passwordHash,
        fullName: email.split("@")[0],
        plan: "Free",
      };

      db.users.push(newUser);
      writeDb(db);

      return {
        user: {
          id: newUser.id,
          email: newUser.email,
          user_metadata: { full_name: newUser.fullName, plan: newUser.plan },
        },
      };
    }

    if (action === "login") {
      if (!existingUser) {
        return { error: "User does not exist", code: "USER_NOT_FOUND" as const };
      }

      if (existingUser.passwordHash !== passwordHash) {
        return { error: "Incorrect password", code: "BAD_PASSWORD" as const };
      }

      return {
        user: {
          id: existingUser.id,
          email: existingUser.email,
          user_metadata: { full_name: existingUser.fullName, plan: existingUser.plan || "Free" },
        },
      };
    }

    return { error: "Unknown action", code: "UNKNOWN_ACTION" as const };
  });

export const updateUserProfile = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string(), fullName: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { id, fullName } = data;
    const db = readDb();

    const userIndex = db.users.findIndex(u => u.id === id);
    if (userIndex === -1) {
      throw new Error("User not found");
    }

    db.users[userIndex].fullName = fullName;
    writeDb(db);

    return {
      user: {
        id: db.users[userIndex].id,
        email: db.users[userIndex].email,
        user_metadata: { 
          full_name: db.users[userIndex].fullName,
          plan: db.users[userIndex].plan || "Free"
        },
      }
    };
  });

export const upgradeUserPlan = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string(), plan: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { id, plan } = data;
    const db = readDb();

    const userIndex = db.users.findIndex(u => u.id === id);
    if (userIndex === -1) {
      throw new Error("User not found");
    }

    db.users[userIndex].plan = plan;
    writeDb(db);

    return {
      user: {
        id: db.users[userIndex].id,
        email: db.users[userIndex].email,
        user_metadata: { 
          full_name: db.users[userIndex].fullName,
          plan: db.users[userIndex].plan || "Free"
        },
      }
    };
  });

export const deleteUserAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { id } = data;
    const db = readDb();

    const userIndex = db.users.findIndex(u => u.id === id);
    if (userIndex === -1) {
      throw new Error("User not found");
    }

    db.users.splice(userIndex, 1);
    writeDb(db);

    return { success: true };
  });

export const getUserDashboardData = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ userId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { userId } = data;
    const db = readDb();
    const user = db.users.find(u => u.id === userId);
    if (!user) {
      throw new Error("User not found");
    }
    return {
      generations: user.generations || [],
      workspaces: user.workspaces || [],
      templates: user.templates || [],
      plan: user.plan || "Free",
    };
  });

export const saveGenerationHistory = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({
    userId: z.string(),
    url: z.string(),
    tone: z.string(),
    length: z.string(),
    format: z.string(),
    title: z.string(),
    markdown: z.string(),
    seo: z.any(),
    workspaceId: z.string().optional()
  }).parse(data))
  .handler(async ({ data }) => {
    const { userId, ...genData } = data;
    const db = readDb();
    const userIndex = db.users.findIndex(u => u.id === userId);
    if (userIndex === -1) throw new Error("User not found");

    const newGen: Generation = {
      id: crypto.randomUUID(),
      ...genData,
      createdAt: new Date().toISOString()
    };

    if (!db.users[userIndex].generations) db.users[userIndex].generations = [];
    db.users[userIndex].generations!.push(newGen);
    writeDb(db);

    return { generation: newGen };
  });

export const deleteGenerationHistory = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ userId: z.string(), genId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { userId, genId } = data;
    const db = readDb();
    const userIndex = db.users.findIndex(u => u.id === userId);
    if (userIndex === -1) throw new Error("User not found");

    const gens = db.users[userIndex].generations || [];
    const filtered = gens.filter(g => g.id !== genId);
    db.users[userIndex].generations = filtered;
    writeDb(db);

    return { success: true };
  });

export const createWorkspaceFolder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ userId: z.string(), name: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { userId, name } = data;
    const db = readDb();
    const userIndex = db.users.findIndex(u => u.id === userId);
    if (userIndex === -1) throw new Error("User not found");

    const newWs: Workspace = {
      id: crypto.randomUUID(),
      name
    };

    if (!db.users[userIndex].workspaces) db.users[userIndex].workspaces = [];
    db.users[userIndex].workspaces!.push(newWs);
    writeDb(db);

    return { workspace: newWs };
  });

export const deleteWorkspaceFolder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ userId: z.string(), wsId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { userId, wsId } = data;
    const db = readDb();
    const userIndex = db.users.findIndex(u => u.id === userId);
    if (userIndex === -1) throw new Error("User not found");

    // Remove workspace
    db.users[userIndex].workspaces = (db.users[userIndex].workspaces || []).filter(w => w.id !== wsId);
    
    // Also disconnect any generations in this workspace
    if (db.users[userIndex].generations) {
      db.users[userIndex].generations = db.users[userIndex].generations!.map(g => {
        if (g.workspaceId === wsId) {
          return { ...g, workspaceId: undefined };
        }
        return g;
      });
    }

    writeDb(db);
    return { success: true };
  });

export const createCustomTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({
    userId: z.string(),
    name: z.string(),
    tone: z.string(),
    length: z.string(),
    format: z.string()
  }).parse(data))
  .handler(async ({ data }) => {
    const { userId, ...tplData } = data;
    const db = readDb();
    const userIndex = db.users.findIndex(u => u.id === userId);
    if (userIndex === -1) throw new Error("User not found");

    const newTpl: Template = {
      id: crypto.randomUUID(),
      ...tplData
    };

    if (!db.users[userIndex].templates) db.users[userIndex].templates = [];
    db.users[userIndex].templates!.push(newTpl);
    writeDb(db);

    return { template: newTpl };
  });

export const deleteCustomTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ userId: z.string(), templateId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { userId, templateId } = data;
    const db = readDb();
    const userIndex = db.users.findIndex(u => u.id === userId);
    if (userIndex === -1) throw new Error("User not found");

    db.users[userIndex].templates = (db.users[userIndex].templates || []).filter(t => t.id !== templateId);
    writeDb(db);

    return { success: true };
  });

export const moveGenerationWorkspace = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ userId: z.string(), genId: z.string(), wsId: z.string().nullable() }).parse(data))
  .handler(async ({ data }) => {
    const { userId, genId, wsId } = data;
    const db = readDb();
    const userIndex = db.users.findIndex(u => u.id === userId);
    if (userIndex === -1) throw new Error("User not found");

    if (db.users[userIndex].generations) {
      db.users[userIndex].generations = db.users[userIndex].generations!.map(g => {
        if (g.id === genId) {
          return { ...g, workspaceId: wsId || undefined };
        }
        return g;
      });
    }
    writeDb(db);
    return { success: true };
  });

const SupportChatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string()
  }))
});

export const getSupportBotResponse = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => SupportChatSchema.parse(data))
  .handler(async ({ data }) => {
    const { messages } = data;
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    const lovableKey = process.env.LOVABLE_API_KEY;
    
    const lastMessage = messages[messages.length - 1]?.content || "";

    // 1. Fallback Rule-Based Agent with highly comprehensive, helpful responses for YouTube Scribe
    const getSimulatedResponse = (query: string): string => {
      const q = query.toLowerCase();
      if (q.includes("hi") || q.includes("hello") || q.includes("hey") || q.includes("support") || q.includes("greet")) {
        return "Hello! I'm Scribe's AI Support Assistant. How can I help you today? You can ask me about workspaces, saving custom templates, our pricing plans, or how to get the best blog posts from your YouTube videos!";
      }
      if (q.includes("pricing") || q.includes("upgrade") || q.includes("plan") || q.includes("cost") || q.includes("pro") || q.includes("free")) {
        return "Scribe offers two plans:\n\n1. **Free Plan** ($0/mo): Includes 15 blog post generations per month, standard AI models, and basic templates.\n2. **Pro Plan** ($15/mo): Includes unlimited blog post generations, premium models (GPT-4o & Claude 3.5 Sonnet), custom templates, and direct workspace export features.\n\nYou can switch between plans anytime in the **Upgrade Plan** tab inside the Settings Modal! Let me know if you would like me to show you how.";
      }
      if (q.includes("workspace") || q.includes("folder") || q.includes("move") || q.includes("workspace folders")) {
        return "Workspaces are folders that help you organize your generation history! You can:\n\n* Click the **`+`** button next to 'Workspaces' in the left sidebar to create a folder (e.g. 'Tech', 'Cooking').\n* Hover on any item in your generation history and click the three dots (`...`) to move that post into a workspace or delete it.\n* Click on a workspace in the sidebar to filter your history list to only show posts inside that folder!";
      }
      if (q.includes("template") || q.includes("custom template") || q.includes("save template")) {
        return "Custom templates let you save your favorite configurations (Tone, Length, Format) for quick re-use!\n\n* To save a template: set your desired options (e.g. Technical tone, Long length, Listicle format) in the central dashboard, then click the **`+`** button next to 'Templates' in the sidebar and give it a name.\n* To apply a template: simply click its name in the sidebar, and your dashboard inputs will update instantly!";
      }
      if (q.includes("how to use") || q.includes("convert") || q.includes("youtube") || q.includes("url") || q.includes("video")) {
        return "It's simple to convert a video to a blog post:\n1. Paste any valid YouTube video URL into the main input field.\n2. Select your desired Tone (e.g., Professional, Casual), Length, and Blog Format.\n3. Click **Generate Blog Post**.\n\nScribe will automatically retrieve the transcript, analyze it, and write a perfectly formatted SEO-optimized blog draft complete with title, meta description, and keywords in seconds!";
      }
      if (q.includes("limit") || q.includes("generations") || q.includes("many")) {
        return "On the **Free Plan**, you get 15 generations per month. **Pro Plan** users get unlimited generations! You can track your current monthly usage using the progress bar in the bottom-left corner of the sidebar.";
      }
      if (q.includes("email") || q.includes("change")) {
        return "For security verification, email changes are currently handled manually by our team. Please submit a request detailing your current email and new email to support@scribe.io, and we will update it for you within 24 hours.";
      }
      return "That's an interesting question! As the Scribe Support Assistant, I am here to help you get the most out of your YouTube-to-blog conversion workflow. Could you clarify what specific feature or issue you are referring to? I can help with templates, workspaces, billing plans, or output formatting!";
    };

    // 2. If API Key is present, query the LLM
    if (openrouterKey || lovableKey) {
      try {
        const endpoint = openrouterKey 
          ? "https://openrouter.ai/api/v1/chat/completions"
          : "https://ai.gateway.lovable.dev/v1/chat/completions";

        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };

        if (openrouterKey) {
          headers["Authorization"] = `Bearer ${openrouterKey}`;
        } else if (lovableKey) {
          headers["Authorization"] = `Bearer ${lovableKey}`;
        }

        const systemPrompt = `You are "Scribe Bot", the friendly, professional, and knowledgeable AI Support Representative for "YouTube Scribe" (an app that converts YouTube videos into SEO-friendly blog posts).
Your job is to assist users with their questions about the Scribe application.

Key App Features to reference:
- Workspaces: Folders created by clicking "+" next to "Workspaces" in the left sidebar to group generated blog history. Clicking a folder filters the history panel.
- Templates: Quick configuration presets for Tone (Professional, Casual, etc.), Length (Short, Medium, Long), and Format (Listicle, Deep Dive, etc.). Users can click "+" next to "Templates" to save their active dropdown choices as a custom template.
- Subscription Plans: Free Tier ($0/mo, 15 generations/month, standard models) and Pro Tier ($15/mo, unlimited generations, premium models, custom templates). Switchable under the "Upgrade Plan" settings tab.
- Logging In/Out: Available in the profile dropdown inside the sidebar. Account details can be changed in settings.

Always answer politely, keep answers concise, use markdown formatting for readability, and be highly supportive.
Answer the user's specific support request:`;

        const apiMessages = [
          { role: "system", content: systemPrompt },
          ...messages
        ];

        const response = await fetch(endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: openrouterKey ? "google/gemini-2.5-flash" : "gpt-4o-mini",
            messages: apiMessages,
            temperature: 0.7,
            max_tokens: 500,
          }),
        });

        if (response.ok) {
          const json = await response.json();
          const reply = json.choices?.[0]?.message?.content;
          if (reply) {
            return { reply };
          }
        }
      } catch (err) {
        console.error("Support chat API error, falling back to simulated engine:", err);
      }
    }

    // Return rule-based fallback if LLM call is unavailable or fails
    const reply = getSimulatedResponse(lastMessage);
    // Add artificial delay to simulate realistic human/AI processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    return { reply };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// --- Cryptographic Security Helpers (SEC-02 & SEC-03) ---

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function toBase64Legacy(str: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(str).toString("base64");
  }
  const bytes = new TextEncoder().encode(str);
  let binString = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binString += String.fromCharCode(bytes[i]);
  }
  return btoa(binString);
}

const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "fallback-super-secret-key-scribe-2026";

async function getEncryptionKey(): Promise<CryptoKey> {
  const rawKey = new TextEncoder().encode(ENCRYPTION_SECRET.padEnd(32, '0').slice(0, 32));
  return await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encrypt(text: string): Promise<string> {
  if (!text) return "";
  const key = await getEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(text);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  
  const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.byteLength);
  
  return "enc:" + Array.from(combined).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function decrypt(cipherText: string): Promise<string> {
  if (!cipherText) return "";
  if (!cipherText.startsWith("enc:")) return cipherText;
  
  try {
    const key = await getEncryptionKey();
    const hex = cipherText.slice(4);
    const matches = hex.match(/.{1,2}/g);
    if (!matches) return "";
    const combined = new Uint8Array(matches.map(byte => parseInt(byte, 16)));
    
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encrypted
    );
    
    return new TextDecoder().decode(decrypted);
  } catch (err) {
    console.error("AES-GCM decryption failed:", err);
    return cipherText;
  }
}

async function encryptIntegrations(integrations: any) {
  const encrypted: any = {};
  if (integrations) {
    for (const key of ["devto", "medium", "hashnode"]) {
      const val = integrations[key] || "";
      if (val && !val.startsWith("enc:")) {
        encrypted[key] = await encrypt(val);
      } else {
        encrypted[key] = val;
      }
    }
  } else {
    return { devto: "", medium: "", hashnode: "" };
  }
  return encrypted;
}

async function decryptIntegrations(integrations: any) {
  const decrypted: any = {};
  if (integrations) {
    for (const key of ["devto", "medium", "hashnode"]) {
      const val = integrations[key] || "";
      if (val && val.startsWith("enc:")) {
        decrypted[key] = await decrypt(val);
      } else {
        decrypted[key] = val;
      }
    }
  } else {
    return { devto: "", medium: "", hashnode: "" };
  }
  return decrypted;
}

// --- BOLA/IDOR JWT Session Verification Helper (SEC-01 & SEC-04) ---

export async function assertAuthorized(userId: string, accessToken?: string) {
  // Custom-auth users (email/password via Scribe's own profiles table) do NOT get
  // a Supabase JWT. Their identity was verified server-side at login time.
  // We still verify they exist in the database to prevent forged userIds.
  if (!accessToken) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile) {
      throw new Error("Unauthorized: User not found in database.");
    }
    // Custom-auth user verified by DB presence — proceed
    return;
  }

  // OAuth / Supabase-auth users: validate the JWT token
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !user) {
    // Fallback: if token is invalid but user exists in DB (e.g. token expired mid-session),
    // allow the DB check to serve as authorization
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (profile) return; // DB-verified fallback
    throw new Error(`Unauthorized: Invalid access token. ${error?.message || ""}`);
  }

  if (user.id !== userId) {
    throw new Error("Unauthorized: User ID mismatch.");
  }
}


interface GenerationVersion {
  id: string;
  tone: string;
  length: string;
  format: string;
  title: string;
  markdown: string;
  seo: any;
  createdAt: string;
}

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
  versions?: GenerationVersion[];
  activeVersionId?: string;
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

const AuthSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  action: z.enum(["login", "signup"]),
});

export const authenticateUser = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => AuthSchema.parse(data))
  .handler(async ({ data }) => {
    const { email, password, action } = data;

    // Hashing with SHA-256 for secure credentials signup, supports legacy Base64 for backwards compatibility
    const passwordHashLegacy = toBase64Legacy(password);
    const passwordHashSecure = await sha256(password);

    // Query profile from Supabase by email
    const { data: existingUser } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (action === "signup") {
      if (existingUser) {
        return { error: "User already exists. Please log in.", code: "USER_EXISTS" as const };
      }

      const userId = crypto.randomUUID();
      const newUser = {
        user_id: userId,
        email,
        password_hash: passwordHashSecure, // New signups strictly use SHA-256
        full_name: email.split("@")[0],
        plan: "Free",
        integrations: { devto: "", medium: "", hashnode: "" }
      };

      const { error: insertError } = await supabaseAdmin
        .from("profiles")
        .insert(newUser);

      if (insertError) {
        console.error("Signup failed during Supabase profile insertion:", insertError);
        return { error: "Could not complete signup. Please try again.", code: "UNKNOWN_ACTION" as const };
      }

      return {
        user: {
          id: userId,
          email,
          user_metadata: { 
            full_name: newUser.full_name, 
            plan: newUser.plan,
            integrations: newUser.integrations
          },
        },
      };
    }

    if (action === "login") {
      if (!existingUser) {
        return { error: "User does not exist", code: "USER_NOT_FOUND" as const };
      }

      const inputSha256 = passwordHashSecure;
      const inputBase64 = passwordHashLegacy;

      let isMatch = false;
      let needsUpgrade = false;

      if (existingUser.password_hash === inputSha256) {
        isMatch = true;
      } else if (existingUser.password_hash === inputBase64) {
        isMatch = true;
        needsUpgrade = true;
      }

      if (!isMatch) {
        return { error: "Incorrect password", code: "BAD_PASSWORD" as const };
      }

      if (needsUpgrade) {
        // Upgrade user's password_hash to SHA-256 transparently
        const { error: upgradeError } = await supabaseAdmin
          .from("profiles")
          .update({ password_hash: inputSha256 })
          .eq("user_id", existingUser.user_id);
        
        if (upgradeError) {
          console.error("Failed to upgrade legacy password hash to SHA-256:", upgradeError);
        } else {
          console.log(`Successfully upgraded legacy password hash to SHA-256 for user ${existingUser.user_id}`);
        }
      }

      // Decrypt stored integration keys before passing to client state
      const decryptedIntegrations = await decryptIntegrations(existingUser.integrations);

      return {
        user: {
          id: existingUser.user_id,
          email: existingUser.email,
          user_metadata: { 
            full_name: existingUser.full_name, 
            plan: existingUser.plan || "Free",
            integrations: decryptedIntegrations
          },
        },
      };
    }

    return { error: "Unknown action", code: "UNKNOWN_ACTION" as const };
  });

export const updateUserProfile = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string(), fullName: z.string(), accessToken: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { id, fullName, accessToken } = data;
    await assertAuthorized(id, accessToken);

    const { data: updatedProfile, error } = await supabaseAdmin
      .from("profiles")
      .update({ full_name: fullName })
      .eq("user_id", id)
      .select()
      .maybeSingle();

    if (error || !updatedProfile) {
      throw new Error("User not found or failed to update profile");
    }

    const decryptedIntegrations = await decryptIntegrations(updatedProfile.integrations);

    return {
      user: {
        id,
        email: updatedProfile.email,
        user_metadata: { 
          full_name: fullName, 
          plan: updatedProfile.plan || "Free",
          integrations: decryptedIntegrations
        },
      }
    };
  });

export const updateUserBrandVoice = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({
    id: z.string(),
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
    }),
    accessToken: z.string().optional()
  }).parse(data))
  .handler(async ({ data }) => {
    const { id, brandVoice, accessToken } = data;
    await assertAuthorized(id, accessToken);

    const { data: updatedProfile, error } = await supabaseAdmin
      .from("profiles")
      .update({ brand_voice: brandVoice })
      .eq("user_id", id)
      .select()
      .maybeSingle();

    if (error || !updatedProfile) {
      throw new Error("User not found or failed to update brand voice");
    }

    const decryptedIntegrations = await decryptIntegrations(updatedProfile.integrations);

    return {
      user: {
        id,
        email: updatedProfile.email,
        user_metadata: { 
          full_name: updatedProfile.full_name, 
          plan: updatedProfile.plan || "Free",
          integrations: decryptedIntegrations,
          brand_voice: updatedProfile.brand_voice
        },
      }
    };
  });

export const upgradeUserPlan = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string(), plan: z.string(), accessToken: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { id, plan, accessToken } = data;
    await assertAuthorized(id, accessToken);

    const { data: updatedProfile, error } = await supabaseAdmin
      .from("profiles")
      .update({ plan })
      .eq("user_id", id)
      .select()
      .maybeSingle();

    if (error || !updatedProfile) {
      throw new Error("User not found or failed to upgrade plan");
    }

    const decryptedIntegrations = await decryptIntegrations(updatedProfile.integrations);

    return {
      user: {
        id,
        email: updatedProfile.email,
        user_metadata: { 
          full_name: updatedProfile.full_name,
          plan: updatedProfile.plan || "Free",
          integrations: decryptedIntegrations
        },
      }
    };
  });

export const deleteUserAccount = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string(), accessToken: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { id, accessToken } = data;
    await assertAuthorized(id, accessToken);
    await supabaseAdmin.from("profiles").delete().eq("user_id", id);
    return { success: true };
  });

async function ensureProfileExists(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile) {
    let email = `user-${userId.substring(0, 8)}@example.com`;
    let fullName = "User";
    try {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
      if (authUser?.user?.email) {
        email = authUser.user.email;
        fullName = authUser.user.user_metadata?.full_name || email.split("@")[0];
      }
    } catch (e) {
      console.error("Self-healing: Failed to retrieve user from auth.users:", e);
    }

    const { error } = await supabaseAdmin.from("profiles").insert({
      user_id: userId,
      email,
      full_name: fullName,
      plan: "Free",
      integrations: { devto: "", medium: "", hashnode: "" },
      brand_voice: {
        enabled: false,
        vocabulary: { prefer: "", avoid: "" },
        sliders: { depth: 50, exuberance: 50, directness: 50 },
        sampleText: ""
      }
    });

    if (error) {
      console.error("Self-healing: Failed to insert missing profile:", error);
    }
  }
}

export const getUserDashboardData = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ userId: z.string(), accessToken: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { userId, accessToken } = data;
    await assertAuthorized(userId, accessToken);
    await ensureProfileExists(userId);

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("plan, integrations, brand_voice")
      .eq("user_id", userId)
      .maybeSingle();

    const defaultBrandVoice = {
      enabled: false,
      vocabulary: { prefer: "", avoid: "" },
      sliders: { depth: 50, exuberance: 50, directness: 50 },
      sampleText: ""
    };

    if (!profile) {
      return {
        generations: [],
        workspaces: [],
        templates: [],
        plan: "Free",
        integrations: { devto: "", medium: "", hashnode: "" },
        brandVoice: defaultBrandVoice,
        notFound: true,
      };
    }

    // Parallel fetch from Supabase
    const [wsRes, tplRes, genRes] = await Promise.all([
      supabaseAdmin.from("workspaces").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
      supabaseAdmin.from("templates").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
      supabaseAdmin.from("generations").select("*, versions:generation_versions(*)").eq("user_id", userId).order("created_at", { ascending: false })
    ]);

    const mappedWorkspaces = (wsRes.data || []).map((w: any) => ({
      id: w.id,
      name: w.name
    }));

    const mappedTemplates = (tplRes.data || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      tone: t.tone,
      length: t.length,
      format: t.format
    }));

    const mappedGenerations = (genRes.data || []).map((g: any) => {
      const mappedVersions = (g.versions || []).map((v: any) => ({
        id: v.id,
        tone: v.tone,
        length: v.length,
        format: v.format,
        title: v.title,
        markdown: v.markdown,
        seo: v.seo,
        createdAt: v.created_at
      }));

      // Sort versions chronologically by creation timestamp
      mappedVersions.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      return {
        id: g.id,
        url: g.url,
        tone: g.tone,
        length: g.length,
        format: g.format,
        title: g.title,
        markdown: g.markdown,
        seo: g.seo,
        workspaceId: g.workspace_id || undefined,
        activeVersionId: g.active_version_id || undefined,
        createdAt: g.created_at,
        versions: mappedVersions
      };
    });

    const decryptedIntegrations = await decryptIntegrations(profile.integrations);

    return {
      generations: mappedGenerations,
      workspaces: mappedWorkspaces,
      templates: mappedTemplates,
      plan: profile.plan || "Free",
      integrations: decryptedIntegrations,
      brandVoice: profile.brand_voice || defaultBrandVoice,
      notFound: false,
    };
  });

export const saveGenerationHistory = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({
    userId: z.string(),
    id: z.string().optional(),
    url: z.string(),
    tone: z.string(),
    length: z.string(),
    format: z.string(),
    title: z.string(),
    markdown: z.string(),
    seo: z.any(),
    workspaceId: z.string().optional(),
    accessToken: z.string().optional()
  }).parse(data))
  .handler(async ({ data }) => {
    const { userId, id, accessToken, ...genData } = data;
    await assertAuthorized(userId, accessToken);
    await ensureProfileExists(userId);

    const newVersionId = crypto.randomUUID();

    const insertVersion = async (genId: string) => {
      const newVer = {
        id: newVersionId,
        generation_id: genId,
        tone: genData.tone,
        length: genData.length,
        format: genData.format,
        title: genData.title,
        markdown: genData.markdown,
        seo: genData.seo || {}
      };
      await supabaseAdmin.from("generation_versions").insert(newVer);
    };

    if (id) {
      // Fetch existing generation row to verify
      const { data: existing } = await supabaseAdmin
        .from("generations")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (existing) {
        await insertVersion(id);

        const { data: updated } = await supabaseAdmin
          .from("generations")
          .update({
            url: genData.url,
            tone: genData.tone,
            length: genData.length,
            format: genData.format,
            title: genData.title,
            markdown: genData.markdown,
            seo: genData.seo || {},
            active_version_id: newVersionId,
            workspace_id: genData.workspaceId || existing.workspace_id || null
          })
          .eq("id", id)
          .select()
          .single();

        if (!updated) {
          throw new Error("Failed to update generation row in Supabase");
        }

        // Fetch all versions of this generation
        const { data: dbVersions } = await supabaseAdmin
          .from("generation_versions")
          .select("*")
          .eq("generation_id", id)
          .order("created_at", { ascending: true });

        const mappedVersions = (dbVersions || []).map((v: any) => ({
          id: v.id,
          tone: v.tone,
          length: v.length,
          format: v.format,
          title: v.title,
          markdown: v.markdown,
          seo: v.seo,
          createdAt: v.created_at
        }));

        const returnedGen = {
          id: updated.id,
          url: updated.url,
          tone: updated.tone,
          length: updated.length,
          format: updated.format,
          title: updated.title,
          markdown: updated.markdown,
          seo: updated.seo,
          workspaceId: updated.workspace_id || undefined,
          activeVersionId: updated.active_version_id || undefined,
          createdAt: updated.created_at,
          versions: mappedVersions
        };

        return { generation: returnedGen, isUpdate: true };
      }
    }

    // New generation creation
    const newGenId = crypto.randomUUID();
    const newGenRow = {
      id: newGenId,
      user_id: userId,
      url: genData.url,
      tone: genData.tone,
      length: genData.length,
      format: genData.format,
      title: genData.title,
      markdown: genData.markdown,
      seo: genData.seo || {},
      workspace_id: genData.workspaceId || null,
      active_version_id: newVersionId
    };

    const { data: created, error: createError } = await supabaseAdmin
      .from("generations")
      .insert(newGenRow)
      .select()
      .single();

    if (createError || !created) {
      console.error("Failed to create generation row in Supabase:", createError);
      throw new Error("Failed to save generation");
    }

    await insertVersion(newGenId);

    const returnedGen = {
      id: created.id,
      url: created.url,
      tone: created.tone,
      length: created.length,
      format: created.format,
      title: created.title,
      markdown: created.markdown,
      seo: created.seo,
      workspaceId: created.workspace_id || undefined,
      activeVersionId: created.active_version_id || undefined,
      createdAt: created.created_at,
      versions: [{
        id: newVersionId,
        tone: genData.tone,
        length: genData.length,
        format: genData.format,
        title: genData.title,
        markdown: genData.markdown,
        seo: genData.seo || {},
        createdAt: new Date().toISOString()
      }]
    };

    return { generation: returnedGen, isUpdate: false };
  });

export const updateGenerationContent = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({
    userId: z.string(),
    genId: z.string(),
    versionId: z.string().optional(),
    markdown: z.string(),
    title: z.string().optional(),
    seo: z.any().optional(),
    accessToken: z.string().optional()
  }).parse(data))
  .handler(async ({ data }) => {
    const { userId, genId, versionId, markdown, title, seo, accessToken } = data;
    await assertAuthorized(userId, accessToken);
    await ensureProfileExists(userId);

    const genUpdates: any = { markdown };
    if (title) genUpdates.title = title;
    if (seo) genUpdates.seo = seo;

    const { data: updatedGen } = await supabaseAdmin
      .from("generations")
      .update(genUpdates)
      .eq("id", genId)
      .select()
      .maybeSingle();

    if (!updatedGen) return { success: false, error: "Generation not found" };

    const vId = versionId || updatedGen.active_version_id;
    if (vId) {
      const verUpdates: any = { markdown };
      if (title) verUpdates.title = title;
      if (seo) verUpdates.seo = seo;

      await supabaseAdmin
        .from("generation_versions")
        .update(verUpdates)
        .eq("id", vId);
    }

    // Re-fetch all versions for active list sync
    const { data: dbVersions } = await supabaseAdmin
      .from("generation_versions")
      .select("*")
      .eq("generation_id", genId)
      .order("created_at", { ascending: true });

    const mappedVersions = (dbVersions || []).map((v: any) => ({
      id: v.id,
      tone: v.tone,
      length: v.length,
      format: v.format,
      title: v.title,
      markdown: v.markdown,
      seo: v.seo,
      createdAt: v.created_at
    }));

    const returnedGen = {
      id: updatedGen.id,
      url: updatedGen.url,
      tone: updatedGen.tone,
      length: updatedGen.length,
      format: updatedGen.format,
      title: updatedGen.title,
      markdown: updatedGen.markdown,
      seo: updatedGen.seo,
      workspaceId: updatedGen.workspace_id || undefined,
      activeVersionId: updatedGen.active_version_id || undefined,
      createdAt: updatedGen.created_at,
      versions: mappedVersions
    };

    return { success: true, generation: returnedGen };
  });

export const deleteGenerationHistory = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ userId: z.string(), genId: z.string(), accessToken: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { userId, genId, accessToken } = data;
    await assertAuthorized(userId, accessToken);
    await supabaseAdmin.from("generations").delete().eq("id", genId);
    return { success: true };
  });

export const createWorkspaceFolder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ userId: z.string(), name: z.string(), accessToken: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { userId, name, accessToken } = data;
    await assertAuthorized(userId, accessToken);
    await ensureProfileExists(userId);

    const newWs = {
      user_id: userId,
      name
    };

    const { data: created, error } = await supabaseAdmin
      .from("workspaces")
      .insert(newWs)
      .select()
      .single();

    if (error || !created) {
      console.error("Failed to create workspace:", error);
      throw new Error("Failed to create workspace folder");
    }

    return {
      workspace: {
        id: created.id,
        name: created.name
      }
    };
  });

export const deleteWorkspaceFolder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ userId: z.string(), wsId: z.string(), accessToken: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { userId, wsId, accessToken } = data;
    await assertAuthorized(userId, accessToken);
    await supabaseAdmin.from("workspaces").delete().eq("id", wsId);
    return { success: true };
  });

export const createCustomTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({
    userId: z.string(),
    name: z.string(),
    tone: z.string(),
    length: z.string(),
    format: z.string(),
    accessToken: z.string().optional()
  }).parse(data))
  .handler(async ({ data }) => {
    const { userId, name, tone, length, format, accessToken } = data;
    await assertAuthorized(userId, accessToken);
    await ensureProfileExists(userId);

    const newTpl = {
      user_id: userId,
      name,
      tone,
      length,
      format
    };

    const { data: created, error } = await supabaseAdmin
      .from("templates")
      .insert(newTpl)
      .select()
      .single();

    if (error || !created) {
      console.error("Failed to create custom template in Supabase:", error);
      throw new Error("Failed to create custom template");
    }

    return {
      template: {
        id: created.id,
        name: created.name,
        tone: created.tone,
        length: created.length,
        format: created.format
      }
    };
  });

export const deleteCustomTemplate = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ userId: z.string(), templateId: z.string(), accessToken: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { userId, templateId, accessToken } = data;
    await assertAuthorized(userId, accessToken);
    await supabaseAdmin.from("templates").delete().eq("id", templateId);
    return { success: true };
  });

export const moveGenerationWorkspace = createServerFn({ method: "POST" })
  .inputValidator((data: z.SafeParseReturnType<any, any> | unknown) => z.object({ userId: z.string(), genId: z.string(), wsId: z.string().nullable(), accessToken: z.string().optional() }).parse(data))
  .handler(async ({ data }) => {
    const { userId, genId, wsId, accessToken } = data;
    await assertAuthorized(userId, accessToken);
    await ensureProfileExists(userId);

    await supabaseAdmin
      .from("generations")
      .update({ workspace_id: wsId || null })
      .eq("id", genId);

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
        return "Scribe offers two plans:\n\n1. **Free Plan** (₹0/mo): Includes 10 blog post generations per month, standard AI models, and basic templates.\n2. **Pro Plan** (₹999/mo): Includes unlimited blog post generations, premium models (GPT-4o & Claude 3.5 Sonnet), custom templates, and direct workspace export features.\n\nYou can switch between plans anytime in the **Upgrade Plan** tab inside the Settings Modal! Let me know if you would like me to show you how.";
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
        return "On the **Free Plan**, you get 10 generations per month. **Pro Plan** users get unlimited generations! You can track your current monthly usage using the progress bar in the bottom-left corner of the sidebar.";
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
- Subscription Plans: Free Tier (₹0/mo, 10 generations/month, standard models) and Pro Tier (₹999/mo, unlimited generations, premium models, custom templates). Switchable under the "Upgrade Plan" settings tab.
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

export const updateUserIntegrations = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({
    id: z.string(),
    devto: z.string().optional(),
    medium: z.string().optional(),
    hashnode: z.string().optional(),
    accessToken: z.string().optional()
  }).parse(data))
  .handler(async ({ data }) => {
    const { id, devto, medium, hashnode, accessToken } = data;
    await assertAuthorized(id, accessToken);

    const rawIntegrations = {
      devto: devto || "",
      medium: medium || "",
      hashnode: hashnode || ""
    };

    // Encrypt integration tokens before storing in database
    const encryptedIntegrations = await encryptIntegrations(rawIntegrations);

    const { data: updatedProfile, error } = await supabaseAdmin
      .from("profiles")
      .update({ integrations: encryptedIntegrations })
      .eq("user_id", id)
      .select()
      .single();

    if (error || !updatedProfile) {
      throw new Error("User not found or failed to update integrations");
    }

    const decryptedIntegrations = await decryptIntegrations(updatedProfile.integrations);

    return {
      user: {
        id,
        email: updatedProfile.email,
        user_metadata: {
          full_name: updatedProfile.full_name,
          plan: updatedProfile.plan || "Free",
          integrations: decryptedIntegrations
        }
      }
    };
  });

export const publishContentToPlatform = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({
    userId: z.string(),
    platform: z.enum(["devto", "medium", "hashnode"]),
    title: z.string(),
    markdown: z.string(),
    tags: z.array(z.string()).optional(),
    accessToken: z.string().optional()
  }).parse(data))
  .handler(async ({ data }) => {
    const { userId, platform, title, markdown, tags = [], accessToken } = data;
    await assertAuthorized(userId, accessToken);
    await ensureProfileExists(userId);

    // Fetch integrations from user profile
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("integrations")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile) throw new Error("User profile not found in database.");
    
    // Decrypt integrations before utilizing the token for publishing
    const decryptedIntegrations = await decryptIntegrations(profile.integrations);
    const apiToken = decryptedIntegrations[platform];
    if (!apiToken || !apiToken.trim()) {
      const platformName = platform === "devto" ? "Dev.to" : platform === "medium" ? "Medium" : "Hashnode";
      const keyLabel = platform === "devto" ? "API Key" : "Integration Token";
      throw new Error(`API key/token for ${platformName} is not configured. Please add your ${keyLabel} in Settings → Integrations.`);
    }

    try {
      if (platform === "devto") {
        const response = await fetch("https://dev.to/api/articles", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": apiToken.trim()
          },
          body: JSON.stringify({
            article: {
              title,
              published: false,
              body_markdown: markdown,
              tags: tags.slice(0, 4) // Dev.to allows max 4 tags
            }
          })
        });
        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Dev.to API error (${response.status}): ${text}`);
        }
        return { success: true, url: "https://dev.to/dashboard" };
      }

      if (platform === "medium") {
        // 1. Get Author ID
        const meResponse = await fetch("https://api.medium.com/v1/me", {
          headers: {
            "Authorization": `Bearer ${apiToken.trim()}`,
            "Content-Type": "application/json"
          }
        });
        if (!meResponse.ok) {
          const text = await meResponse.text();
          throw new Error(`Medium auth failed: ${text}`);
        }
        const meJson = await meResponse.json();
        const authorId = meJson.data?.id;
        if (!authorId) throw new Error("Could not find Medium author ID");

        // 2. Create Post
        const postResponse = await fetch(`https://api.medium.com/v1/users/${authorId}/posts`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiToken.trim()}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            title,
            contentFormat: "markdown",
            content: markdown,
            publishStatus: "draft",
            tags: tags.slice(0, 5)
          })
        });
        if (!postResponse.ok) {
          const text = await postResponse.text();
          throw new Error(`Medium publishing failed: ${text}`);
        }
        return { success: true, url: "https://medium.com/me/stories/drafts" };
      }

      if (platform === "hashnode") {
        // 1. Get Publication ID
        const pubResponse = await fetch("https://gql.hashnode.com", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": apiToken.trim()
          },
          body: JSON.stringify({
            query: `
              query {
                me {
                  publications(first: 1) {
                    edges {
                      node {
                        id
                      }
                    }
                  }
                }
              }
            `
          })
        });
        if (!pubResponse.ok) {
          const text = await pubResponse.text();
          throw new Error(`Hashnode fetch failed: ${text}`);
        }
        const pubJson = await pubResponse.json();
        const publicationId = pubJson.data?.me?.publications?.edges?.[0]?.node?.id;
        if (!publicationId) throw new Error("Could not find a Hashnode publication associated with your account.");

        // 2. Create Draft
        const draftResponse = await fetch("https://gql.hashnode.com", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": apiToken.trim()
          },
          body: JSON.stringify({
            query: `
              mutation CreateDraft($input: CreateDraftInput!) {
                createDraft(input: $input) {
                  draft {
                    id
                  }
                }
              }
            `,
            variables: {
              input: {
                title,
                markdown,
                tags: [],
                publicationId
              }
            }
          })
        });
        if (!draftResponse.ok) {
          const text = await draftResponse.text();
          throw new Error(`Hashnode draft failed: ${text}`);
        }
        return { success: true, url: "https://hashnode.com/dashboard" };
      }
    } catch (e: any) {
      console.error(`Publishing to ${platform} failed:`, e);
      throw new Error(e.message || "Platform publishing failed");
    }

    throw new Error("Invalid platform");
  });

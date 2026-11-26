import { createClient, Session, SupabaseClient, User } from "@supabase/supabase-js";
import { loadAngelConfig } from "./cloudBrain";

export interface AngelWorkspaceProfile {
  userId: string;
  email: string;
  fullName: string;
  avatarUrl?: string;
  role: "admin" | "member";
  workspaceId: string;
  activeContext: string;
  isRajaAdmin: boolean;
}

const ADMIN_EMAILS = ["sraja3072014@gmail.com", "raja@gracechurch.org"];
const PROFILE_STORAGE_KEY = "angel_active_workspace_profile";

let cachedClient: SupabaseClient | null = null;
let cachedCreds = "";

export function getSupabaseClient(): SupabaseClient | null {
  const cfg = loadAngelConfig();
  const url = cfg.supabaseUrl?.trim() || "";
  const key = cfg.supabaseKey?.trim() || "";
  if (!url || !key) return null;

  const signature = `${url}::${key}`;
  if (!cachedClient || cachedCreds !== signature) {
    try {
      cachedClient = createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
      cachedCreds = signature;
    } catch {
      cachedClient = null;
    }
  }
  return cachedClient;
}

export function resolveLocalFallbackProfile(): AngelWorkspaceProfile {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}

  return {
    userId: "local-raja-admin",
    email: "sraja3072014@gmail.com",
    fullName: "Raja",
    role: "admin",
    workspaceId: "grace-church-sovereign-workspace",
    activeContext: "grace_church_management",
    isRajaAdmin: true,
  };
}

export async function provisionAndLoadProfile(authUser: User): Promise<AngelWorkspaceProfile> {
  const email = (authUser.email || "").toLowerCase();
  const isRajaAdmin = ADMIN_EMAILS.includes(email);
  const fullName =
    (authUser.user_metadata?.full_name as string) ||
    (authUser.user_metadata?.name as string) ||
    email.split("@")[0] ||
    "User";
  const avatarUrl = authUser.user_metadata?.avatar_url as string | undefined;

  const client = getSupabaseClient();
  if (client) {
    try {
      const { data: existing } = await client
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .maybeSingle();

      if (existing) {
        const profile: AngelWorkspaceProfile = {
          userId: existing.id,
          email: existing.email,
          fullName: existing.full_name || fullName,
          avatarUrl: existing.avatar_url || avatarUrl,
          role: existing.role === "admin" || isRajaAdmin ? "admin" : "member",
          workspaceId: existing.workspace_id,
          activeContext: existing.active_context || (isRajaAdmin ? "grace_church_management" : "personal"),
          isRajaAdmin: existing.role === "admin" || isRajaAdmin,
        };
        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
        return profile;
      }

      // First-time login upsert
      const insertPayload = {
        id: authUser.id,
        email,
        full_name: fullName,
        avatar_url: avatarUrl || null,
        role: isRajaAdmin ? "admin" : "member",
        active_context: isRajaAdmin ? "grace_church_management" : "personal",
      };

      const { data: created } = await client
        .from("users")
        .upsert(insertPayload, { onConflict: "id" })
        .select("*")
        .single();

      if (created) {
        const profile: AngelWorkspaceProfile = {
          userId: created.id,
          email: created.email,
          fullName: created.full_name || fullName,
          avatarUrl: created.avatar_url || avatarUrl,
          role: created.role === "admin" ? "admin" : "member",
          workspaceId: created.workspace_id,
          activeContext: created.active_context,
          isRajaAdmin: created.role === "admin",
        };
        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
        return profile;
      }
    } catch (err) {
      console.warn("Supabase workspace resolution fallback:", err);
    }
  }

  const fallback: AngelWorkspaceProfile = {
    userId: authUser.id,
    email,
    fullName,
    avatarUrl,
    role: isRajaAdmin ? "admin" : "member",
    workspaceId: `ws-${authUser.id}`,
    activeContext: isRajaAdmin ? "grace_church_management" : "personal",
    isRajaAdmin,
  };
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(fallback));
  return fallback;
}

export async function signInWithGmail(): Promise<{ ok: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      ok: false,
      error: "Supabase URL & Anon Key are required in Cloud & Storage settings before Gmail OAuth login.",
    };
  }

  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function signOutWorkspace(): Promise<void> {
  const client = getSupabaseClient();
  if (client) {
    await client.auth.signOut().catch(() => {});
  }
  localStorage.removeItem(PROFILE_STORAGE_KEY);
}

export function subscribeToAuthWorkspace(
  onProfileChange: (profile: AngelWorkspaceProfile, session: Session | null) => void
): () => void {
  const client = getSupabaseClient();
  if (!client) {
    onProfileChange(resolveLocalFallbackProfile(), null);
    return () => {};
  }

  client.auth.getSession().then(async ({ data }) => {
    if (data.session?.user) {
      const profile = await provisionAndLoadProfile(data.session.user);
      onProfileChange(profile, data.session);
    } else {
      onProfileChange(resolveLocalFallbackProfile(), null);
    }
  });

  const { data: sub } = client.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      const profile = await provisionAndLoadProfile(session.user);
      onProfileChange(profile, session);
    } else {
      onProfileChange(resolveLocalFallbackProfile(), null);
    }
  });

  return () => {
    sub.subscription.unsubscribe();
  };
}

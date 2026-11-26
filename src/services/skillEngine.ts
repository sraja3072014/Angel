import { invoke } from "@tauri-apps/api/core";
import { omniChatCompletion } from "./omniRouteClient";
import { AngelWorkspaceProfile, getSupabaseClient, resolveLocalFallbackProfile } from "./supabaseAuth";

export interface AngelSkillRecord {
  id: string;
  user_id: string;
  workspace_id: string;
  name: string;
  topic: string;
  description: string;
  skill_md: string;
  is_active: boolean;
  created_at: string;
}

export interface AngelDevTaskRecord {
  id: string;
  user_id: string;
  workspace_id: string;
  title: string;
  prompt_text: string;
  target_branch: string;
  status: "queued" | "in_progress" | "verified" | "failed";
  build_log?: string;
  source_device: string;
  created_at: string;
  completed_at?: string;
}

const LOCAL_SKILLS_KEY = "angel_dynamic_skills_v1";

export function detectCreateSkillIntent(prompt: string): string | null {
  const matchEn = prompt.match(/create\s+(?:a|an)?\s*([a-zA-Z0-9\s\-_]{2,50}?)\s+skill/i);
  if (matchEn?.[1]) return matchEn[1].trim();
  const matchTa = prompt.match(/([a-zA-Z0-9\u0B80-\u0BFF\s\-_]{2,50}?)\s*(?:skill|திறன்)\s*(?:உருவாக்கு|create)/i);
  if (matchTa?.[1]) return matchTa[1].trim();
  return null;
}

export function loadLocalSkills(): AngelSkillRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_SKILLS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveLocalSkills(skills: AngelSkillRecord[]) {
  try {
    localStorage.setItem(LOCAL_SKILLS_KEY, JSON.stringify(skills));
  } catch {}
}

export async function listActiveSkills(profile?: AngelWorkspaceProfile): Promise<AngelSkillRecord[]> {
  const activeProfile = profile || resolveLocalFallbackProfile();
  const client = getSupabaseClient();

  if (client && !activeProfile.userId.startsWith("local-")) {
    try {
      const { data } = await client
        .from("angel_skills")
        .select("*")
        .eq("user_id", activeProfile.userId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (data) {
        saveLocalSkills(data as AngelSkillRecord[]);
        return data as AngelSkillRecord[];
      }
    } catch {}
  }
  return loadLocalSkills().filter((s) => s.is_active);
}

/**
 * Dynamically generates a structured SKILL.md workflow definition for the requested topic,
 * persists it to Supabase `angel_skills` (with RLS isolation) + local cache, and returns it.
 */
export async function generateAndSaveSkill(
  topic: string,
  profile?: AngelWorkspaceProfile
): Promise<AngelSkillRecord> {
  const activeProfile = profile || resolveLocalFallbackProfile();

  let skillMd = "";
  try {
    const res = await omniChatCompletion([
      {
        role: "system",
        content:
          "You are Angel AI's Skill Architect. Generate a concise, production-ready SKILL.md workflow definition with YAML frontmatter (name, description) and clear step-by-step instructions.",
      },
      {
        role: "user",
        content: `Create a structured SKILL.md for topic: "${topic}". Keep it practical and tailored for Raja's desktop & Grace Church Management / engineering workflows where relevant.`,
      },
    ]);
    skillMd = res.text;
  } catch {
    skillMd = `---\nname: ${topic.toLowerCase().replace(/\s+/g, "-")}\ndescription: Dynamic workflow skill for ${topic}\n---\n\n# ${topic} Skill\n\n1. Analyze user request related to **${topic}**.\n2. Gather context from active window or workspace.\n3. Execute clean, verified steps and summarize results concisely in Tamil/English as requested.`;
  }

  const record: AngelSkillRecord = {
    id: crypto.randomUUID ? crypto.randomUUID() : `skill-${Date.now()}`,
    user_id: activeProfile.userId,
    workspace_id: activeProfile.workspaceId,
    name: `${topic} Skill`,
    topic,
    description: `Auto-generated skill for ${topic}`,
    skill_md: skillMd,
    is_active: true,
    created_at: new Date().toISOString(),
  };

  const local = [record, ...loadLocalSkills()];
  saveLocalSkills(local);

  const client = getSupabaseClient();
  if (client && !activeProfile.userId.startsWith("local-")) {
    try {
      const { data } = await client
        .from("angel_skills")
        .insert({
          user_id: activeProfile.userId,
          workspace_id: activeProfile.workspaceId,
          name: record.name,
          topic: record.topic,
          description: record.description,
          skill_md: record.skill_md,
          is_active: true,
        })
        .select("*")
        .single();
      if (data) return data as AngelSkillRecord;
    } catch (e) {
      console.warn("Supabase angel_skills insert fallback to local:", e);
    }
  }

  return record;
}

/**
 * Builds dynamic system prompt injection from all active skills in `angel_skills`.
 */
export async function getActiveSkillsSystemPrompt(profile?: AngelWorkspaceProfile): Promise<string> {
  const skills = await listActiveSkills(profile);
  if (skills.length === 0) return "";
  const blocks = skills
    .slice(0, 6)
    .map((s) => `### Skill: ${s.name}\n${s.skill_md.slice(0, 800)}`)
    .join("\n\n");
  return `\n[ACTIVE SELF-GENERATED SKILLS]\n${blocks}\n`;
}

/**
 * Queues an autonomous self-coding task in `angel_dev_tasks` and runs safe branch + `npm run build` verification via Rust.
 */
export async function queueAndVerifyDevTask(
  title: string,
  promptText: string,
  profile?: AngelWorkspaceProfile
): Promise<AngelDevTaskRecord> {
  const activeProfile = profile || resolveLocalFallbackProfile();
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "task";
  const targetBranch = `auto-update/${slug}`;

  const client = getSupabaseClient();
  let taskId = `dev-${Date.now()}`;

  if (client && !activeProfile.userId.startsWith("local-")) {
    try {
      const { data } = await client
        .from("angel_dev_tasks")
        .insert({
          user_id: activeProfile.userId,
          workspace_id: activeProfile.workspaceId,
          title,
          prompt_text: promptText,
          target_branch: targetBranch,
          status: "in_progress",
          source_device: "desktop",
        })
        .select("*")
        .single();
      if (data?.id) taskId = data.id;
    } catch {}
  }

  let status: AngelDevTaskRecord["status"] = "failed";
  let buildLog = "";
  try {
    const res = await invoke<{ ok: boolean; branch: string; build_output: string }>(
      "run_autonomous_dev_task",
      { taskSlug: slug }
    );
    status = res.ok ? "verified" : "failed";
    buildLog = res.build_output.slice(0, 2000);
  } catch (err: any) {
    status = "failed";
    buildLog = String(err?.message || err);
  }

  const finalRecord: AngelDevTaskRecord = {
    id: taskId,
    user_id: activeProfile.userId,
    workspace_id: activeProfile.workspaceId,
    title,
    prompt_text: promptText,
    target_branch: targetBranch,
    status,
    build_log: buildLog,
    source_device: "desktop",
    created_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  };

  if (client && !activeProfile.userId.startsWith("local-") && !taskId.startsWith("dev-")) {
    await client
      .from("angel_dev_tasks")
      .update({
        status,
        build_log: buildLog,
        completed_at: finalRecord.completed_at,
      })
      .eq("id", taskId)
      .then();
  }

  return finalRecord;
}

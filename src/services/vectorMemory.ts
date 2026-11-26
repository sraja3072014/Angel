import { loadAngelConfig } from "./cloudBrain";
import { AngelWorkspaceProfile, getSupabaseClient, resolveLocalFallbackProfile } from "./supabaseAuth";

export type MemoryCategory = "fact" | "decision" | "preference" | "grace_church";

export interface VectorMemoryItem {
  id: string;
  category: MemoryCategory;
  content: string;
  metadata?: Record<string, unknown>;
  similarity?: number;
  created_at: string;
}

const LOCAL_VECTOR_KEY = "angel_local_vector_memories_v2";
const EMBED_DIM = 768;

/**
 * Deterministic lightweight offline fallback embedding (768-d) when cloud embedding is unavailable.
 */
function computeLocalFallbackEmbedding(text: string): number[] {
  const vec = new Array<number>(EMBED_DIM).fill(0);
  const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    let h = 2166136261;
    for (let i = 0; i < token.length; i++) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % EMBED_DIM;
    vec[idx] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
  return vec.map((v) => v / norm);
}

function cosineSim(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const cfg = loadAngelConfig();
  const key = (cfg.geminiKey || "").split(/[\n,]+/)[0]?.trim();
  if (key) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: { parts: [{ text: text.slice(0, 2000) }] },
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        const vals = data?.embedding?.values;
        if (Array.isArray(vals) && vals.length === EMBED_DIM) {
          return vals;
        }
      }
    } catch {}
  }
  return computeLocalFallbackEmbedding(text);
}

function loadLocalMemories(): Array<VectorMemoryItem & { user_id: string; embedding: number[] }> {
  try {
    const raw = localStorage.getItem(LOCAL_VECTOR_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveLocalMemories(items: Array<VectorMemoryItem & { user_id: string; embedding: number[] }>) {
  try {
    localStorage.setItem(LOCAL_VECTOR_KEY, JSON.stringify(items.slice(0, 250)));
  } catch {}
}

export async function storeVectorMemory(
  content: string,
  category: MemoryCategory = "fact",
  metadata: Record<string, unknown> = {},
  profile?: AngelWorkspaceProfile
): Promise<VectorMemoryItem> {
  const activeProfile = profile || resolveLocalFallbackProfile();
  const embedding = await generateEmbedding(content);
  const item: VectorMemoryItem = {
    id: crypto.randomUUID ? crypto.randomUUID() : `mem-${Date.now()}`,
    category,
    content,
    metadata,
    created_at: new Date().toISOString(),
  };

  const local = loadLocalMemories();
  local.unshift({ ...item, user_id: activeProfile.userId, embedding });
  saveLocalMemories(local);

  const client = getSupabaseClient();
  if (client && !activeProfile.userId.startsWith("local-")) {
    try {
      const { data } = await client
        .from("user_memories")
        .insert({
          user_id: activeProfile.userId,
          workspace_id: activeProfile.workspaceId,
          category,
          content,
          metadata,
          embedding,
        })
        .select("id, category, content, metadata, created_at")
        .single();
      if (data) return data as VectorMemoryItem;
    } catch (e) {
      console.warn("pgvector insert fallback to local:", e);
    }
  }

  return item;
}

export async function recallRelevantMemories(
  query: string,
  matchCount = 5,
  matchThreshold = 0.55,
  profile?: AngelWorkspaceProfile
): Promise<VectorMemoryItem[]> {
  const activeProfile = profile || resolveLocalFallbackProfile();
  const queryEmbedding = await generateEmbedding(query);

  const client = getSupabaseClient();
  if (client && !activeProfile.userId.startsWith("local-")) {
    try {
      const { data } = await client.rpc("match_memories", {
        query_embedding: queryEmbedding,
        match_threshold: matchThreshold,
        match_count: matchCount,
      });
      if (Array.isArray(data) && data.length > 0) {
        return data as VectorMemoryItem[];
      }
    } catch (e) {
      console.warn("pgvector match_memories fallback to local:", e);
    }
  }

  // Local cosine similarity fallback strictly isolated by user_id
  const local = loadLocalMemories().filter((m) => m.user_id === activeProfile.userId);
  return local
    .map((m) => ({
      id: m.id,
      category: m.category,
      content: m.content,
      metadata: m.metadata,
      created_at: m.created_at,
      similarity: cosineSim(queryEmbedding, m.embedding),
    }))
    .filter((m) => (m.similarity || 0) >= 0.15)
    .sort((a, b) => (b.similarity || 0) - (a.similarity || 0))
    .slice(0, matchCount);
}

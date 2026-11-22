import { GoogleGenAI } from "@google/genai";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { invoke } from "@tauri-apps/api/core";

export interface AngelConfig {
  geminiKey: string;
  supabaseUrl: string;
  supabaseKey: string;
  preferredMic: string;
  avMode: "copilot" | "standalone";
}

export interface MemoryFact {
  category: string;
  mem_key: string;
  mem_value: string;
  updated_at?: string;
  device_origin?: "windows" | "android";
}

export interface RelayCommand {
  id?: string;
  command_text: string;
  device_target: "windows" | "android";
  status: "pending" | "executed";
  created_at?: string;
}

export interface LearnedRule {
  id: string;
  rule_key: string;
  rule_value: string;
  category: "preference" | "security" | "custom_skill" | "habit";
  updated_at: string;
}

export interface CloudBrainConfig {
  geminiApiKey: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  primaryModel: string;
}

export interface AIProviderConfig {
  id: string;
  name: string;
  category: "cloud" | "local" | "router";
  apiKey: string; // multi-line allowed
  endpoint: string;
  defaultModel: string;
  availableModels?: string[];
  enabled: boolean;
  status: "ready" | "missing_key" | "local_ready" | "offline" | "testing" | "verified";
  description: string;
  consoleUrl?: string;
  capabilities: string[];
}

const CONFIG_STORAGE_KEY = "angel_tauri_config_v3";
const MEMORY_STORAGE_KEY = "angel_ram_memory_v3";
const TELEMETRY_STORAGE_KEY = "angel_usage_telemetry";
export const AI_PROVIDERS_STORAGE_KEY = "angel_ai_providers";
export const AI_BRAIN_CONFIG_KEY = "angel_ai_brain_config";

export const DEFAULT_AI_PROVIDERS: AIProviderConfig[] = [
  {
    id: "auto",
    name: "Auto Smart Router",
    category: "router",
    apiKey: "",
    endpoint: "Internal Multi-Tier Router",
    defaultModel: "auto-smart",
    availableModels: ["auto-smart", "auto-fast", "auto-offline"],
    enabled: true,
    status: "ready",
    description: "Automatic routing & failover across all configured brains.",
    capabilities: ["🔄 AUTO FAILOVER", "⚡ SPEED ROUTING", "🔧 TOOL CALLING", "≋ STREAMING"],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    category: "cloud",
    apiKey: "",
    endpoint: "https://generativelanguage.googleapis.com",
    defaultModel: "gemini-3.8-flash",
    availableModels: ["gemini-3.8-flash", "gemini-3.8-flash-lite", "gemini-3.8-pro"],
    enabled: true,
    status: "missing_key",
    description: "Gemini 3.8 Flash & Pro. Native multimodal vision & audio.",
    consoleUrl: "https://aistudio.google.com/app/apikey",
    capabilities: ["🔧 TOOL CALLING", "≋ STREAMING", "👁 VISION", "</> CODE GEN"],
  },
  {
    id: "groq",
    name: "Groq",
    category: "cloud",
    apiKey: "",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    defaultModel: "llama-3.3-70b-versatile",
    availableModels: [
      "llama-3.3-70b-versatile",
      "qwen-2.5-coder-32b",
      "mixtral-8x7b-32768",
      "deepseek-r1-distill-llama-70b",
    ],
    enabled: true,
    status: "missing_key",
    description: "Fastest inference. Free tier. Llama & Qwen models.",
    consoleUrl: "https://console.groq.com/keys",
    capabilities: ["🔧 TOOL CALLING", "≋ STREAMING", "⚡ 500 T/S", "</> CODE GEN"],
  },
  {
    id: "openai",
    name: "OpenAI / Codex",
    category: "cloud",
    apiKey: "",
    endpoint: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-4.1",
    availableModels: ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "o3-mini", "codex-mini"],
    enabled: true,
    status: "missing_key",
    description: "GPT-5, GPT-4.1 and Codex. Strongest code generation.",
    consoleUrl: "https://platform.openai.com/api-keys",
    capabilities: ["🔧 TOOL CALLING", "≋ STREAMING", "👁 VISION", "</> CODE GEN"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    category: "cloud",
    apiKey: "",
    endpoint: "https://api.deepseek.com/chat/completions",
    defaultModel: "deepseek-chat",
    availableModels: ["deepseek-chat", "deepseek-reasoner"],
    enabled: true,
    status: "missing_key",
    description: "DeepSeek V4 Flash & Pro. Cheap, strong at code and reasoning.",
    consoleUrl: "https://platform.deepseek.com/api_keys",
    capabilities: ["🔧 TOOL CALLING", "≋ STREAMING", "🧠 REASONING", "</> CODE GEN"],
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    category: "cloud",
    apiKey: "",
    endpoint: "https://api.anthropic.com/v1/messages",
    defaultModel: "claude-3-7-sonnet-latest",
    availableModels: ["claude-3-7-sonnet-latest", "claude-3-5-haiku-latest", "claude-3-opus-latest"],
    enabled: true,
    status: "missing_key",
    description: "Claude Opus & Sonnet. Best long-form reasoning and refactors.",
    consoleUrl: "https://console.anthropic.com/settings/keys",
    capabilities: ["🔧 TOOL CALLING", "≋ STREAMING", "👁 VISION", "</> CODE GEN"],
  },
  {
    id: "github",
    name: "GitHub Copilot",
    category: "cloud",
    apiKey: "",
    endpoint: "https://models.inference.ai.azure.com/chat/completions",
    defaultModel: "gpt-4o",
    availableModels: ["gpt-4o", "Llama-3.3-70B-Instruct", "Mistral-large-2407"],
    enabled: true,
    status: "missing_key",
    description: "GitHub Models inference — one PAT, many models.",
    consoleUrl: "https://github.com/settings/tokens",
    capabilities: ["🔧 TOOL CALLING", "≋ STREAMING", "</> CODE GEN"],
  },
  {
    id: "openrouter",
    name: "Free LLM API",
    category: "cloud",
    apiKey: "",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    availableModels: [
      "meta-llama/llama-3.3-70b-instruct:free",
      "google/gemma-2-9b-it:free",
      "qwen/qwen-2.5-72b-instruct:free",
    ],
    enabled: true,
    status: "missing_key",
    description: "OpenRouter free-tier models — zero cost inference with free API key.",
    consoleUrl: "https://openrouter.ai/keys",
    capabilities: ["≋ STREAMING", "🆓 ZERO COST", "</> CODE GEN"],
  },
  {
    id: "ollama",
    name: "Ollama",
    category: "local",
    apiKey: "",
    endpoint: "http://localhost:11434",
    defaultModel: "llama3.2:latest",
    availableModels: ["llama3.2:latest", "qwen2.5-coder:latest", "deepseek-r1:latest"],
    enabled: true,
    status: "local_ready",
    description: "Local offline models on localhost:11434 — auto-detected, no key.",
    capabilities: ["⚡ LOCAL ENDPOINT", "🔒 100% PRIVATE", "≋ STREAMING", "</> CODE GEN"],
  },
  {
    id: "local_lmstudio",
    name: "Local LLM",
    category: "local",
    apiKey: "",
    endpoint: "http://localhost:1234/v1",
    defaultModel: "local-model",
    availableModels: ["local-model", "llama-3.2-3b-instruct"],
    enabled: true,
    status: "local_ready",
    description: "LM Studio, llama.cpp, vLLM custom endpoint — fully offline.",
    capabilities: ["⚡ LOCAL ENDPOINT", "🔒 100% PRIVATE", "≋ STREAMING", "</> CODE GEN"],
  },
];

export function extractKeysList(apiKeyRaw: string): string[] {
  if (!apiKeyRaw) return [];
  return apiKeyRaw
    .split("\n")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

export function loadAIProviders(): AIProviderConfig[] {
  try {
    const rawBrain = localStorage.getItem(AI_BRAIN_CONFIG_KEY);
    const rawLegacy = localStorage.getItem(AI_PROVIDERS_STORAGE_KEY);
    const cfg = loadAngelConfig();

    let storedProviders: AIProviderConfig[] = [];
    if (rawBrain) {
      const parsed = JSON.parse(rawBrain);
      storedProviders = parsed.providers || [];
    } else if (rawLegacy) {
      storedProviders = JSON.parse(rawLegacy);
    }

    const merged: AIProviderConfig[] = [];
    for (const def of DEFAULT_AI_PROVIDERS) {
      const existing = storedProviders.find((p) => p.id === def.id);
      if (!existing) {
        merged.push({ ...def });
      } else {
        let defModel = existing.defaultModel || def.defaultModel;
        let availModels =
          existing.availableModels && existing.availableModels.length > 0
            ? existing.availableModels
            : def.availableModels;

        // Auto-migrate deprecated/stale Gemini models to gemini-3.8-flash
        if (def.id === "gemini") {
          if (
            !defModel ||
            defModel.includes("2.5") ||
            defModel.includes("3.5") ||
            defModel.includes("2.0") ||
            defModel.includes("1.5")
          ) {
            defModel = "gemini-3.8-flash";
          }
          availModels = ["gemini-3.8-flash", "gemini-3.8-flash-lite", "gemini-3.8-pro"];
        }

        // Auto-migrate OpenRouter models to verified active free models
        if (def.id === "openrouter") {
          availModels = [
            "meta-llama/llama-3.3-70b-instruct:free",
            "google/gemma-2-9b-it:free",
            "qwen/qwen-2.5-72b-instruct:free",
          ];
          if (!availModels.includes(defModel)) {
            defModel = "meta-llama/llama-3.3-70b-instruct:free";
          }
        }

        merged.push({
          ...def,
          ...existing,
          defaultModel: defModel,
          capabilities: def.capabilities,
          consoleUrl: def.consoleUrl,
          description: def.description,
          availableModels: availModels,
        });
      }
    }

    // Auto-migrate stale saved primary model in localStorage
    try {
      const currentPrimary = localStorage.getItem("angel_primary_model");
      if (
        currentPrimary &&
        (currentPrimary.includes("2.5") ||
          currentPrimary.includes("3.5") ||
          currentPrimary.includes("2.0") ||
          currentPrimary.includes("1.5"))
      ) {
        localStorage.setItem("angel_primary_model", "gemini-3.8-flash");
      }
    } catch {}

    // Sync legacy geminiKey if needed
    const gemini = merged.find((p) => p.id === "gemini");
    if (gemini) {
      if (cfg.geminiKey && !gemini.apiKey) {
        gemini.apiKey = cfg.geminiKey;
      }
      gemini.status = extractKeysList(gemini.apiKey).length > 0 ? "ready" : "missing_key";
    }

    return merged;
  } catch {
    return DEFAULT_AI_PROVIDERS;
  }
}

export function saveAIProviders(providers: AIProviderConfig[]) {
  try {
    localStorage.setItem(AI_PROVIDERS_STORAGE_KEY, JSON.stringify(providers));
    const brainConfig = {
      providers,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(AI_BRAIN_CONFIG_KEY, JSON.stringify(brainConfig));

    const gemini = providers.find((p) => p.id === "gemini");
    if (gemini) {
      const firstKey = extractKeysList(gemini.apiKey)[0] || "";
      if (firstKey) {
        const cfg = loadAngelConfig();
        saveAngelConfig({ ...cfg, geminiKey: firstKey });
      }
    }
  } catch {}
}

export async function testProviderConnection(provider: AIProviderConfig): Promise<{
  ok: boolean;
  message: string;
  latencyMs?: number;
  models?: string[];
}> {
  const startTime = performance.now();
  try {
    if (provider.id === "ollama") {
      const baseUrl = provider.endpoint.replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/api/tags`);
      const latencyMs = Math.round(performance.now() - startTime);
      if (res.ok) {
        const data = await res.json();
        const models = (data.models || []).map((m: any) => m.name || m.model);
        return {
          ok: true,
          message:
            models.length > 0
              ? `Connected • ${latencyMs}ms (${models.length} local models)`
              : `Connected • ${latencyMs}ms (no local models; run 'ollama pull llama3.2')`,
          latencyMs,
          models,
        };
      }
      return { ok: false, message: `Ollama error HTTP ${res.status}` };
    }

    if (provider.id === "local_lmstudio") {
      let baseUrl = provider.endpoint.replace(/\/chat\/completions$/, "").replace(/\/$/, "");
      if (!baseUrl.endsWith("/v1")) baseUrl += "/v1";
      const res = await fetch(`${baseUrl}/models`);
      const latencyMs = Math.round(performance.now() - startTime);
      if (res.ok) {
        const data = await res.json();
        const models = (data.data || []).map((m: any) => m.id);
        return {
          ok: true,
          message:
            models.length > 0
              ? `Connected • ${latencyMs}ms (${models.length} model loaded)`
              : `Connected • ${latencyMs}ms (LM Studio server online)`,
          latencyMs,
          models,
        };
      }
      return { ok: false, message: `LM Studio error HTTP ${res.status}` };
    }

    const keyList = extractKeysList(provider.apiKey);
    const activeKey = keyList[0] || (provider.id === "gemini" ? loadAngelConfig().geminiKey.trim() : "");

    if (provider.id === "gemini") {
      if (!activeKey) return { ok: false, message: "Gemini API key is required" };
      const ai = new GoogleGenAI({ apiKey: activeKey });
      const rawTarget = (provider.defaultModel || "gemini-3.8-flash").replace(/^(models\/)+/, "").trim();
      const targetModel =
        rawTarget.includes("2.5") || rawTarget.includes("3.5") || rawTarget.includes("2.0") || rawTarget.includes("1.5")
          ? "gemini-3.8-flash"
          : rawTarget;
      await ai.models.generateContent({
        model: targetModel,
        contents: "Respond with 'ok'",
      });
      const latencyMs = Math.round(performance.now() - startTime);
      return { ok: true, message: `Connected • ${latencyMs}ms`, latencyMs };
    }

    if (provider.id === "anthropic") {
      if (!activeKey) return { ok: false, message: "Anthropic API key required" };
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": activeKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "dangerously-allow-browser": "true",
        },
        body: JSON.stringify({
          model: provider.defaultModel || "claude-3-5-haiku-latest",
          max_tokens: 5,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      const latencyMs = Math.round(performance.now() - startTime);
      if (res.ok) return { ok: true, message: `Connected • ${latencyMs}ms`, latencyMs };
      const err = await res.json().catch(() => ({}));
      return { ok: false, message: err?.error?.message || `HTTP ${res.status}` };
    }

    if (provider.id === "openrouter") {
      if (!activeKey || !activeKey.trim()) {
        return {
          ok: false,
          message: "OpenRouter requires a free API key (sk-or-v1-...). Paste your key above.",
        };
      }
    }

    if (!activeKey && provider.id !== "local_lmstudio") {
      return { ok: false, message: "API key or token is required" };
    }

    let targetUrl = provider.endpoint;
    if (provider.id === "local_lmstudio" && !targetUrl.includes("/chat/completions")) {
      targetUrl = `${targetUrl.replace(/\/$/, "")}/chat/completions`;
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (activeKey) {
      headers["Authorization"] = `Bearer ${activeKey.trim()}`;
    }
    if (provider.id === "openrouter") {
      headers["Authorization"] = `Bearer ${activeKey.trim()}`;
      headers["HTTP-Referer"] = "https://angel-ai.local";
      headers["X-Title"] = "Angel AI";
    }

    const res = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: provider.defaultModel,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      }),
    });

    const latencyMs = Math.round(performance.now() - startTime);
    if (res.ok) {
      return { ok: true, message: `Connected • ${latencyMs}ms`, latencyMs };
    }
    const err = await res.json().catch(() => ({}));
    return { ok: false, message: err?.error?.message || `HTTP ${res.status}` };
  } catch (err: any) {
    return { ok: false, message: err?.message || "Connection failed. Please check endpoint URL." };
  }
}

export interface UsageTelemetry {
  prompts_count: number;
  estimated_tokens: number;
  local_reflex_count: number;
  total_savings_usd: number;
  last_updated: string;
}

export function getUsageTelemetry(): UsageTelemetry {
  try {
    const raw = localStorage.getItem(TELEMETRY_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    prompts_count: 0,
    estimated_tokens: 0,
    local_reflex_count: 0,
    total_savings_usd: 0.0,
    last_updated: new Date().toISOString(),
  };
}

export function incrementUsageTelemetry(type: "prompt" | "reflex", tokenEstimate = 0) {
  try {
    const data = getUsageTelemetry();
    if (type === "prompt") {
      data.prompts_count += 1;
      data.estimated_tokens += tokenEstimate > 0 ? tokenEstimate : 380;
      data.total_savings_usd = Math.round((data.estimated_tokens / 1000) * 0.0015 * 1000) / 1000;
    } else if (type === "reflex") {
      data.local_reflex_count += 1;
      data.total_savings_usd = Math.round((data.total_savings_usd + 0.002) * 1000) / 1000;
    }
    data.last_updated = new Date().toISOString();
    localStorage.setItem(TELEMETRY_STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

export function resetUsageTelemetry() {
  try {
    localStorage.removeItem(TELEMETRY_STORAGE_KEY);
  } catch {}
}

export function loadAngelConfig(): AngelConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {
    geminiKey: "",
    supabaseUrl: "",
    supabaseKey: "",
    preferredMic: "realme Buds Wireless 5 ANC",
    avMode: "copilot",
  };
}

export function saveAngelConfig(cfg: AngelConfig) {
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(cfg));
}

export interface GeminiAskOptions {
  screenBase64?: string;
  onChunk?: (partialText: string) => void;
  onFirstSentence?: (firstSentence: string) => void;
}

export const DEFAULT_SYSTEM_INSTRUCTION = `You are Angel, an ultra-fast sovereign Windows 11 desktop AI companion built for Raja.
Reply concisely and naturally in the EXACT language the user uses (Tamil, English, or Tanglish).
When analyzing a provided screen capture, precisely point out what is displayed, diagnose any visible error dialogs, or summarize the active window.

CRITICAL SYSTEM ACTION CAPABILITY:
You can execute single or multiple sequential native OS actions by placing [ACTION:...] tags at the very end of your response.
When the user asks for multi-step tasks, chain all corresponding action tags sequentially.

Available Action Tags:
- Set Master Volume (0-100%): [ACTION:SET_VOLUME|80] or [ACTION:CONTROL_VOLUME|mute] or [ACTION:CONTROL_VOLUME|up]
- Take Desktop Screenshot: [ACTION:SCREENSHOT]
- Open App or Website: [ACTION:OPEN_TARGET|firefox https://www.youtube.com/results?search_query=tamil+songs] or [ACTION:OPEN_TARGET|notepad] or [ACTION:OPEN_TARGET|calc]
- Set Screen Brightness (0-100%): [ACTION:SET_BRIGHTNESS|75]
- Control Media Playback: [ACTION:MEDIA|play_pause] or [ACTION:MEDIA|next] or [ACTION:MEDIA|prev]
- Search User Files: [ACTION:SEARCH_FILES|project]

Multi-Action Sequential Execution Examples:
1. User: "Set volume to 80%, take a screenshot, and open Firefox with YouTube"
   Assistant: "Sure Raja, adjusting volume to 80%, capturing your screen, and launching Firefox with YouTube now. [ACTION:SET_VOLUME|80] [ACTION:SCREENSHOT] [ACTION:OPEN_TARGET|firefox https://www.youtube.com]"

2. User: "ஒலியளவை 60% ஆக்கி நோட்பேட் திற"
   Assistant: "சரி ராஜா, ஒலியளவை 60% ஆக மாற்றி Notepad-ஐ திறக்கிறேன். [ACTION:SET_VOLUME|60] [ACTION:OPEN_TARGET|notepad]"`;

export class CloudBrainService {
  private memoryCache: Record<string, MemoryFact> = {};
  private supabase: SupabaseClient | null = null;
  private isListeningRelay = false;
  // Multi-key round-robin rotation index
  private keyRotationIndex: Record<string, number> = {};

  constructor() {
    try {
      const savedMem = localStorage.getItem(MEMORY_STORAGE_KEY);
      if (savedMem) this.memoryCache = JSON.parse(savedMem);
    } catch {}
    this.initSupabase();
  }

  public initSupabase(): boolean {
    const cfg = loadAngelConfig();
    if (cfg.supabaseUrl && cfg.supabaseKey) {
      try {
        this.supabase = createClient(cfg.supabaseUrl.trim(), cfg.supabaseKey.trim());
        return true;
      } catch {
        this.supabase = null;
      }
    }
    return false;
  }

  public async syncWithSupabase(): Promise<{ ok: boolean; message: string; success?: boolean }> {
    if (!this.initSupabase() || !this.supabase) {
      return { ok: false, success: false, message: "Local Mode: Supabase URL/Key கொடுக்கப்படவில்லை." };
    }
    try {
      const localItems = Object.values(this.memoryCache);
      if (localItems.length > 0) {
        await this.supabase.from("angel_memory").upsert(localItems, { onConflict: "mem_key" });
      }
      return { ok: true, success: true, message: `Cloud Sync வெற்றி: ${localItems.length} நினைவுகள் பதிவேற்றப்பட்டன.` };
    } catch (e: any) {
      return { ok: false, success: false, message: `Sync பிழை: ${e?.message || e}` };
    }
  }

  public saveFact(category: string, key: string, value: string) {
    const fact: MemoryFact = {
      category,
      mem_key: key,
      mem_value: value,
      updated_at: new Date().toISOString(),
      device_origin: "windows",
    };
    this.memoryCache[key] = fact;
    localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(this.memoryCache));

    if (this.supabase) {
      this.supabase.from("angel_memory").upsert([fact], { onConflict: "mem_key" }).then();
    }
  }

  public getFacts(): MemoryFact[] {
    return Object.values(this.memoryCache);
  }

  public removeFact(key: string) {
    delete this.memoryCache[key];
    localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(this.memoryCache));
    if (this.supabase) {
      this.supabase.from("angel_memory").delete().eq("mem_key", key).then();
    }
  }

  public clearAllFacts() {
    this.memoryCache = {};
    localStorage.removeItem(MEMORY_STORAGE_KEY);
  }

  public saveConfig(cfg: Partial<CloudBrainConfig>) {
    const existing = loadAngelConfig();
    saveAngelConfig({
      ...existing,
      geminiKey: cfg.geminiApiKey ?? existing.geminiKey,
      supabaseUrl: cfg.supabaseUrl ?? existing.supabaseUrl,
      supabaseKey: cfg.supabaseAnonKey ?? existing.supabaseKey,
    });
    this.initSupabase();
  }

  public getLearnedRules(): LearnedRule[] {
    return Object.values(this.memoryCache).map((f) => ({
      id: f.mem_key,
      rule_key: f.mem_key,
      rule_value: f.mem_value,
      category: (f.category as any) || "preference",
      updated_at: f.updated_at || new Date().toISOString(),
    }));
  }

  public removeLearnedRule(id: string) {
    this.removeFact(id);
  }

  public startMobileRelayListener(onCommandReceived: (command: string) => void) {
    if (this.isListeningRelay || !this.supabase) return;
    this.isListeningRelay = true;

    setInterval(async () => {
      if (!this.supabase) return;
      try {
        const { data } = await this.supabase
          .from("angel_device_relay")
          .select("*")
          .eq("device_target", "windows")
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(1);

        if (data && data.length > 0) {
          const item = data[0];
          await this.supabase
            .from("angel_device_relay")
            .update({ status: "executed" })
            .eq("id", item.id);

          onCommandReceived(item.command_text);
        }
      } catch {}
    }, 5000);
  }

  public async sendMobileCommand(commandText: string): Promise<boolean> {
    if (!this.supabase) return false;
    try {
      await this.supabase.from("angel_device_relay").insert({
        command_text: commandText,
        device_target: "android",
        status: "pending",
        created_at: new Date().toISOString(),
      });
      return true;
    } catch {
      return false;
    }
  }

  public async forgeSkill(description: string): Promise<{ success: boolean; message: string }> {
    const cfg = loadAngelConfig();
    const providers = loadAIProviders();
    const gemini = providers.find((p) => p.id === "gemini");
    const geminiKeys = gemini ? extractKeysList(gemini.apiKey) : [];
    const apiKey = geminiKeys[0] || cfg.geminiKey;

    if (!apiKey) {
      return { success: false, message: "Gemini API Key needed to forge new skills." };
    }
    const ai = new GoogleGenAI({ apiKey });
    try {
      const forgePrompt = `Create a safe Windows CLI/PowerShell micro-skill JSON for this request: "${description}".
Return ONLY valid JSON with exact keys:
{"name": "Skill Name", "trigger": "short voice trigger phrase", "command_type": "powershell", "script": "safe one-line command", "description": "what it does"}
Never use destructive commands (rm, del, format).`;

      const res = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: forgePrompt,
      });
      const cleanJson = (res.text || "").replace(/```json|```/g, "").trim();
      const skillObj = JSON.parse(cleanJson);
      const savedMsg = await invoke<string>("forge_new_skill", { skill: skillObj });
      return { success: true, message: savedMsg };
    } catch (err: any) {
      return { success: false, message: `Skill Forge error: ${err?.message || err}` };
    }
  }

  private async executeActionTags(fullText: string): Promise<void> {
    // Check if tool calling is disabled by the user
    const toolCallingEnabled = localStorage.getItem("angel_tool_calling") !== "false";
    if (!toolCallingEnabled) return;

    const actionMatches = [...fullText.matchAll(/\[ACTION:([^\|\]]+)(?:\|([^\]]+))?\]/g)];
    for (const match of actionMatches) {
      const actionType = match[1]?.trim().toUpperCase();
      const actionParam = match[2]?.trim() || "";

      try {
        switch (actionType) {
          case "OPEN_TARGET":
            if (actionParam) {
              await invoke("open_system_target", { target: actionParam });
            }
            break;
          case "SET_VOLUME":
          case "CONTROL_VOLUME": {
            const vol = parseInt(actionParam, 10);
            if (!isNaN(vol)) {
              try {
                await invoke("control_system_volume", { action: "set", level: vol });
              } catch {
                await invoke("set_system_volume", { levelPercent: vol });
              }
            } else if (actionParam) {
              await invoke("control_system_volume", { action: actionParam, level: null });
            }
            break;
          }
          case "SET_BRIGHTNESS": {
            const bright = parseInt(actionParam, 10);
            if (!isNaN(bright)) {
              await invoke("set_screen_brightness", { percent: bright });
            }
            break;
          }
          case "MEDIA":
          case "MEDIA_PLAYBACK":
          case "CONTROL_MEDIA":
            if (actionParam) {
              try {
                await invoke("control_media_playback", { action: actionParam });
              } catch {
                await invoke("media_control", { action: actionParam });
              }
            }
            break;
          case "SCREENSHOT":
          case "TAKE_SCREENSHOT":
            try {
              await invoke("take_desktop_screenshot");
            } catch {
              await invoke("capture_screen_to_pictures");
            }
            break;
          case "SEARCH_FILES":
            if (actionParam) {
              await invoke("search_user_files", {
                keyword: actionParam,
                query: actionParam,
                searchDir: null,
              });
            }
            break;
        }
      } catch (e) {
        console.warn("Failed to execute action:", actionType, actionParam, e);
      }
    }
  }

  /**
   * Rotate and return keys in round-robin order for rate-limit dodging
   */
  private getRotatedKeyOrder(provider: AIProviderConfig): string[] {
    const keys = extractKeysList(provider.apiKey);
    if (keys.length <= 1) return keys;

    const currentIdx = (this.keyRotationIndex[provider.id] || 0) % keys.length;
    this.keyRotationIndex[provider.id] = (currentIdx + 1) % keys.length;

    // Return list starting with currentIdx, followed by the rest
    return [...keys.slice(currentIdx), ...keys.slice(0, currentIdx)];
  }

  private async queryGemini(
    provider: AIProviderConfig,
    prompt: string,
    screenBase64: string | undefined,
    systemInstruction: string,
    options?: GeminiAskOptions
  ): Promise<string> {
    const keyList = this.getRotatedKeyOrder(provider);
    const fallbackKey = loadAngelConfig().geminiKey.trim();
    const candidateKeys = keyList.length > 0 ? keyList : fallbackKey ? [fallbackKey] : [];

    if (candidateKeys.length === 0) throw new Error("Gemini API Key missing");

    const contentParts: any[] = [{ text: prompt }];
    if (screenBase64) {
      contentParts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: screenBase64,
        },
      });
    }

    const cleanModelName = (m: string) => m.replace(/^(models\/)+/, "").trim();
    const ladder = ["gemini-3.8-flash", "gemini-3.8-flash-lite", "gemini-3.8-pro"];
    if (provider.defaultModel) {
      const customModel = cleanModelName(provider.defaultModel);
      if (
        !customModel.includes("2.5") &&
        !customModel.includes("3.5") &&
        !customModel.includes("2.0") &&
        !customModel.includes("1.5")
      ) {
        if (!ladder.includes(customModel)) {
          ladder.unshift(customModel);
        } else {
          const idx = ladder.indexOf(customModel);
          ladder.splice(idx, 1);
          ladder.unshift(customModel);
        }
      }
    }

    // Try keys sequentially if 429 occurs
    for (const apiKey of candidateKeys) {
      const ai = new GoogleGenAI({ apiKey });

      for (const model of ladder) {
        try {
          let accumulated = "";
          let firstSentenceSpoken = false;

          const responseStream = await ai.models.generateContentStream({
            model: cleanModelName(model),
            contents: contentParts,
            config: { systemInstruction },
          });

          for await (const chunk of responseStream) {
            const chunkText = chunk.text || "";
            accumulated += chunkText;

            const displayClean = accumulated.replace(/\[ACTION:[^\]]+\]/g, "").trim();
            options?.onChunk?.(displayClean);

            if (!firstSentenceSpoken && options?.onFirstSentence) {
              const sentenceMatch = displayClean.match(/^(.*?[.!?\n])\s+/);
              if (sentenceMatch && sentenceMatch[1].length > 18) {
                firstSentenceSpoken = true;
                options.onFirstSentence(sentenceMatch[1].trim());
              }
            }
          }

          if (accumulated.trim()) {
            return accumulated.trim();
          }
        } catch (e: any) {
          const msg = e?.message || "";
          if (msg.includes("429") || msg.includes("Quota") || msg.includes("rate")) {
            console.warn(`Gemini key rate-limited, rotating to next key...`);
            break; // Try next key
          }
          continue; // Try next model in ladder
        }
      }
    }
    throw new Error("All Gemini keys and ladder models exhausted");
  }

  private async queryOpenAICompatible(
    provider: AIProviderConfig,
    prompt: string,
    systemInstruction: string,
    temperature: number,
    options?: GeminiAskOptions
  ): Promise<string> {
    const keyList = this.getRotatedKeyOrder(provider);
    const candidateKeys = keyList.length > 0 ? keyList : [""];

    let targetUrl = provider.endpoint;
    if (provider.id === "local_lmstudio" && !targetUrl.includes("/chat/completions")) {
      targetUrl = `${targetUrl.replace(/\/$/, "")}/chat/completions`;
    }

    if (provider.id === "openrouter") {
      const validKey = candidateKeys.find((k) => k && k.trim());
      if (!validKey) {
        throw new Error("OpenRouter requires a free API key (sk-or-v1-...). Paste your key above.");
      }
    }

    let lastErrorMsg = "";

    for (const key of candidateKeys) {
      if (!key && provider.id !== "local_lmstudio") {
        continue;
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (key) {
        headers["Authorization"] = `Bearer ${key.trim()}`;
      }
      if (provider.id === "openrouter") {
        headers["Authorization"] = `Bearer ${key.trim()}`;
        headers["HTTP-Referer"] = "https://angel-ai.local";
        headers["X-Title"] = "Angel AI";
      }

      try {
        const res = await fetch(targetUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: provider.defaultModel,
            messages: [
              { role: "system", content: systemInstruction },
              { role: "user", content: prompt },
            ],
            temperature,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          lastErrorMsg = errData?.error?.message || `HTTP ${res.status}`;
          if (res.status === 429) {
            console.warn(`Key for ${provider.name} rate-limited, rotating key...`);
            continue;
          }
          throw new Error(lastErrorMsg);
        }

        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content || "";
        options?.onChunk?.(reply.replace(/\[ACTION:[^\]]+\]/g, "").trim());
        return reply;
      } catch (err: any) {
        lastErrorMsg = err?.message || "Network error";
      }
    }

    throw new Error(`${provider.name} failed: ${lastErrorMsg || "No active key succeeded"}`);
  }

  private async queryAnthropic(
    provider: AIProviderConfig,
    prompt: string,
    systemInstruction: string,
    temperature: number,
    options?: GeminiAskOptions
  ): Promise<string> {
    const keyList = this.getRotatedKeyOrder(provider);
    if (keyList.length === 0) throw new Error("Anthropic API Key missing");

    let lastErr = "";
    for (const key of keyList) {
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
            "dangerously-allow-browser": "true",
          },
          body: JSON.stringify({
            model: provider.defaultModel || "claude-3-7-sonnet-latest",
            system: systemInstruction,
            messages: [{ role: "user", content: prompt }],
            max_tokens: 1500,
            temperature,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          lastErr = err?.error?.message || `HTTP ${res.status}`;
          if (res.status === 429) {
            console.warn("Anthropic key rate limited, rotating...");
            continue;
          }
          throw new Error(lastErr);
        }

        const data = await res.json();
        const reply = data.content?.[0]?.text || "";
        options?.onChunk?.(reply.replace(/\[ACTION:[^\]]+\]/g, "").trim());
        return reply;
      } catch (err: any) {
        lastErr = err?.message || "Anthropic request error";
      }
    }

    throw new Error(`Anthropic error: ${lastErr}`);
  }

  private async queryOllama(
    provider: AIProviderConfig,
    prompt: string,
    systemInstruction: string,
    temperature: number,
    options?: GeminiAskOptions
  ): Promise<string> {
    const baseUrl = provider.endpoint.replace(/\/$/, "");
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: provider.defaultModel || "llama3.2:latest",
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt },
        ],
        options: { temperature },
        stream: false,
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama local server returned HTTP ${res.status}`);
    }

    const data = await res.json();
    const reply = data.message?.content || "";
    options?.onChunk?.(reply.replace(/\[ACTION:[^\]]+\]/g, "").trim());
    return reply;
  }

  public async askGemini(userPrompt: string, options?: GeminiAskOptions): Promise<string> {
    return this.askAngelBrain(userPrompt, options);
  }

  public async askAngelBrain(
    userPrompt: string,
    options?: GeminiAskOptions
  ): Promise<string> {
    // 1. Skill Forge check
    if (/create skill|new skill|forge skill|புதிய திறன்|பிளகின் உருவாக்கு/i.test(userPrompt)) {
      const forgeRes = await this.forgeSkill(userPrompt);
      return forgeRes.message;
    }

    // 2. Screen Vision query check
    let screenImageBase64 = options?.screenBase64;
    const isScreenVisionQuery =
      /look at (?:my )?screen|what(?:'s| is) on my screen|see my screen|screen error|error on my screen|summarize this page|திரை|திரையைப் பார்|என்ன இருக்கு/i.test(
        userPrompt
      );

    if (!screenImageBase64 && isScreenVisionQuery) {
      try {
        screenImageBase64 = await invoke<string>("capture_screen_base64");
      } catch (e) {
        console.warn("Screen Vision capture note:", e);
      }
    }

    const providers = loadAIProviders();
    const activeModel = localStorage.getItem("angel_primary_model") || "Auto";
    const autoFailover = localStorage.getItem("angel_ai_failover") !== "false";
    const temperature = parseFloat(localStorage.getItem("angel_brain_temperature") || "0.7");
    const systemInstruction = localStorage.getItem("angel_custom_system_prompt") || DEFAULT_SYSTEM_INSTRUCTION;

    // Find requested target provider
    let targetProvider = providers.find(
      (p) =>
        p.id === activeModel ||
        p.name.toLowerCase() === activeModel.toLowerCase() ||
        p.defaultModel === activeModel
    );

    if (!targetProvider || activeModel === "Auto" || activeModel === "auto-smart") {
      targetProvider = providers.find((p) => p.id === "auto") || providers[0];
    }

    // Build execution list
    const executionList: AIProviderConfig[] = [];
    if (targetProvider.id === "auto") {
      const priorityOrder = ["gemini", "groq", "deepseek", "openrouter", "ollama", "local_lmstudio", "openai", "anthropic", "github"];
      for (const pid of priorityOrder) {
        const found = providers.find((p) => p.id === pid && p.enabled);
        if (found) executionList.push(found);
      }
    } else {
      executionList.push(targetProvider);
      if (autoFailover) {
        for (const p of providers) {
          if (p.id !== targetProvider.id && p.id !== "auto" && p.enabled) {
            executionList.push(p);
          }
        }
      }
    }

    let lastError: any = null;
    for (const provider of executionList) {
      try {
        let fullText = "";

        if (provider.id === "gemini") {
          fullText = await this.queryGemini(provider, userPrompt, screenImageBase64, systemInstruction, options);
        } else if (provider.id === "anthropic") {
          fullText = await this.queryAnthropic(provider, userPrompt, systemInstruction, temperature, options);
        } else if (provider.id === "ollama") {
          fullText = await this.queryOllama(provider, userPrompt, systemInstruction, temperature, options);
        } else {
          fullText = await this.queryOpenAICompatible(provider, userPrompt, systemInstruction, temperature, options);
        }

        if (fullText && fullText.trim()) {
          // Parse & execute sequential action tags (if tool calling is enabled)
          await this.executeActionTags(fullText);

          const cleanReply = fullText.replace(/\[ACTION:[^\]]+\]/g, "").trim();

          options?.onChunk?.(cleanReply);
          if (options?.onFirstSentence && cleanReply) {
            options.onFirstSentence(cleanReply);
          }

          if (/remember|ஞாபகம்|நினைவில்/i.test(userPrompt)) {
            this.saveFact("learned_rule", `rule_${Date.now()}`, userPrompt);
          }

          incrementUsageTelemetry("prompt", Math.round(userPrompt.length * 0.75 + fullText.length * 0.75));
          return cleanReply;
        }
      } catch (err: any) {
        lastError = err;
        console.warn(`Provider ${provider.name} failed:`, err?.message || err);
        if (!autoFailover) break;
      }
    }

    return `மன்னிக்கவும் ராஜா, AI மாதிரிகளுடன் தொடர்பு கொள்ள முடியவில்லை (${lastError?.message || "All providers unreachable"}). Please check your API keys or local server settings in the Menu Control Center.`;
  }
}

export const cloudBrain = new CloudBrainService();

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
  apiKey: string;
  endpoint: string;
  defaultModel: string;
  enabled: boolean;
  status: "ready" | "missing_key" | "local_ready" | "offline" | "testing" | "verified";
  description: string;
}

const CONFIG_STORAGE_KEY = "angel_tauri_config_v3";
const MEMORY_STORAGE_KEY = "angel_ram_memory_v3";
const TELEMETRY_STORAGE_KEY = "angel_usage_telemetry";
export const AI_PROVIDERS_STORAGE_KEY = "angel_ai_providers";

export const DEFAULT_AI_PROVIDERS: AIProviderConfig[] = [
  {
    id: "auto",
    name: "Auto Smart Router",
    category: "router",
    apiKey: "",
    endpoint: "Multi-Tier Smart Failover",
    defaultModel: "auto-smart",
    enabled: true,
    status: "ready",
    description: "Automatic failover across Gemini, Groq, DeepSeek, & local Ollama",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    category: "cloud",
    apiKey: "",
    endpoint: "https://generativelanguage.googleapis.com",
    defaultModel: "gemini-3.5-flash-lite",
    enabled: true,
    status: "missing_key",
    description: "Ultra-fast multimodal reasoning & native screen vision",
  },
  {
    id: "groq",
    name: "Groq LPU",
    category: "cloud",
    apiKey: "",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    defaultModel: "llama-3.3-70b-versatile",
    enabled: true,
    status: "missing_key",
    description: "Sub-second 500+ tokens/sec LPUs with Llama 3.3 70B & Mixtral",
  },
  {
    id: "deepseek",
    name: "DeepSeek AI",
    category: "cloud",
    apiKey: "",
    endpoint: "https://api.deepseek.com/chat/completions",
    defaultModel: "deepseek-chat",
    enabled: true,
    status: "missing_key",
    description: "Deep reasoning & coding intelligence via DeepSeek V3",
  },
  {
    id: "openai",
    name: "OpenAI / Codex",
    category: "cloud",
    apiKey: "",
    endpoint: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-4o",
    enabled: true,
    status: "missing_key",
    description: "State-of-the-art GPT-4o, o3-mini, and Codex automation",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    category: "cloud",
    apiKey: "",
    endpoint: "https://api.anthropic.com/v1/messages",
    defaultModel: "claude-3-7-sonnet-latest",
    enabled: true,
    status: "missing_key",
    description: "Nuanced reasoning & tool use via Claude 3.7 Sonnet & 3.5 Haiku",
  },
  {
    id: "github",
    name: "GitHub Copilot / Models",
    category: "cloud",
    apiKey: "",
    endpoint: "https://models.inference.ai.azure.com/chat/completions",
    defaultModel: "gpt-4o",
    enabled: true,
    status: "missing_key",
    description: "Free Azure AI models via your Personal Access Token (PAT)",
  },
  {
    id: "openrouter",
    name: "Free LLM API (OpenRouter)",
    category: "cloud",
    apiKey: "",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    enabled: true,
    status: "ready",
    description: "Free-tier community models including Llama 3.3 70B Free",
  },
  {
    id: "ollama",
    name: "Ollama (Offline Local)",
    category: "local",
    apiKey: "",
    endpoint: "http://localhost:11434",
    defaultModel: "llama3.2:latest",
    enabled: true,
    status: "local_ready",
    description: "100% private, sovereign offline LLM running on your Windows PC",
  },
  {
    id: "local_lmstudio",
    name: "Local LLM (LM Studio / GGUF)",
    category: "local",
    apiKey: "",
    endpoint: "http://localhost:1234/v1/chat/completions",
    defaultModel: "local-model",
    enabled: true,
    status: "local_ready",
    description: "OpenAI-compatible local inference server via LM Studio / llama.cpp",
  },
];

export function loadAIProviders(): AIProviderConfig[] {
  try {
    const raw = localStorage.getItem(AI_PROVIDERS_STORAGE_KEY);
    const cfg = loadAngelConfig();
    let providers: AIProviderConfig[] = raw ? JSON.parse(raw) : [];

    for (const def of DEFAULT_AI_PROVIDERS) {
      const existing = providers.find((p) => p.id === def.id);
      if (!existing) {
        providers.push({ ...def });
      } else {
        if (!existing.description) existing.description = def.description;
        if (!existing.category) existing.category = def.category;
        if (!existing.endpoint) existing.endpoint = def.endpoint;
      }
    }

    const gemini = providers.find((p) => p.id === "gemini");
    if (gemini) {
      if (cfg.geminiKey && !gemini.apiKey) {
        gemini.apiKey = cfg.geminiKey;
      }
      gemini.status = gemini.apiKey.trim() ? "ready" : "missing_key";
    }

    return providers;
  } catch {
    return DEFAULT_AI_PROVIDERS;
  }
}

export function saveAIProviders(providers: AIProviderConfig[]) {
  try {
    localStorage.setItem(AI_PROVIDERS_STORAGE_KEY, JSON.stringify(providers));
    const gemini = providers.find((p) => p.id === "gemini");
    if (gemini && gemini.apiKey) {
      const cfg = loadAngelConfig();
      saveAngelConfig({ ...cfg, geminiKey: gemini.apiKey.trim() });
    }
  } catch {}
}

export async function testProviderConnection(provider: AIProviderConfig): Promise<{
  ok: boolean;
  message: string;
  models?: string[];
}> {
  try {
    if (provider.id === "ollama") {
      const baseUrl = provider.endpoint.replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/api/tags`);
      if (res.ok) {
        const data = await res.json();
        const models = (data.models || []).map((m: any) => m.name || m.model);
        return {
          ok: true,
          message:
            models.length > 0
              ? `Online (${models.length} local models detected)`
              : "Ollama online (no models found; pull one with: ollama pull llama3.2)",
          models,
        };
      }
      return { ok: false, message: `Ollama error HTTP ${res.status}` };
    }

    if (provider.id === "local_lmstudio") {
      const baseUrl = provider.endpoint.replace(/\/chat\/completions$/, "").replace(/\/v1$/, "");
      const res = await fetch(`${baseUrl}/v1/models`);
      if (res.ok) {
        const data = await res.json();
        const models = (data.data || []).map((m: any) => m.id);
        return {
          ok: true,
          message: models.length > 0 ? `Online (${models.length} model loaded)` : "LM Studio server detected",
          models,
        };
      }
      return { ok: false, message: `LM Studio error HTTP ${res.status}` };
    }

    if (provider.id === "gemini") {
      const key = provider.apiKey.trim() || loadAngelConfig().geminiKey.trim();
      if (!key) return { ok: false, message: "Gemini API key is required" };
      const ai = new GoogleGenAI({ apiKey: key });
      const res = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: "Reply with 'ok'",
      });
      return { ok: true, message: `Connected to Gemini (${(res.text || "ok").trim().slice(0, 16)})` };
    }

    if (provider.id === "anthropic") {
      if (!provider.apiKey.trim()) return { ok: false, message: "Anthropic API key required" };
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": provider.apiKey.trim(),
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          "dangerously-allow-browser": "true",
        },
        body: JSON.stringify({
          model: provider.defaultModel || "claude-3-5-haiku-latest",
          max_tokens: 10,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      if (res.ok) return { ok: true, message: "Claude API connected successfully" };
      const err = await res.json().catch(() => ({}));
      return { ok: false, message: err?.error?.message || `HTTP ${res.status}` };
    }

    // OpenAI compatible: Groq, DeepSeek, OpenAI, GitHub, OpenRouter
    if (!provider.apiKey.trim() && provider.id !== "openrouter") {
      return { ok: false, message: "API Key / PAT required" };
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (provider.apiKey.trim()) {
      headers["Authorization"] = `Bearer ${provider.apiKey.trim()}`;
    }
    if (provider.id === "openrouter") {
      headers["HTTP-Referer"] = "https://projectangel.ai";
      headers["X-Title"] = "Angel AI";
    }

    const res = await fetch(provider.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: provider.defaultModel,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      }),
    });

    if (res.ok) {
      return { ok: true, message: `${provider.name} connected successfully` };
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
    const apiKey = gemini?.apiKey || cfg.geminiKey;

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
        model: "gemini-3.5-flash-lite",
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

  private async queryGemini(
    provider: AIProviderConfig,
    prompt: string,
    screenBase64: string | undefined,
    systemInstruction: string,
    options?: GeminiAskOptions
  ): Promise<string> {
    const cfg = loadAngelConfig();
    const apiKey = provider.apiKey.trim() || cfg.geminiKey.trim();
    if (!apiKey) throw new Error("Gemini API Key missing");

    const ai = new GoogleGenAI({ apiKey });
    const ladder = [provider.defaultModel || "gemini-3.5-flash-lite", "gemini-2.5-flash", "gemini-2.5-flash-lite"];

    const contentParts: any[] = [{ text: prompt }];
    if (screenBase64) {
      contentParts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: screenBase64,
        },
      });
    }

    for (const model of ladder) {
      try {
        let accumulated = "";
        let firstSentenceSpoken = false;

        const responseStream = await ai.models.generateContentStream({
          model,
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

        return accumulated.trim();
      } catch {
        continue;
      }
    }
    throw new Error("Gemini inference failed across model ladder");
  }

  private async queryOpenAICompatible(
    provider: AIProviderConfig,
    prompt: string,
    systemInstruction: string,
    temperature: number,
    options?: GeminiAskOptions
  ): Promise<string> {
    if (!provider.apiKey.trim() && provider.id !== "openrouter" && provider.id !== "local_lmstudio") {
      throw new Error(`${provider.name} API Key missing`);
    }

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (provider.apiKey.trim()) {
      headers["Authorization"] = `Bearer ${provider.apiKey.trim()}`;
    }
    if (provider.id === "openrouter") {
      headers["HTTP-Referer"] = "https://projectangel.ai";
      headers["X-Title"] = "Angel AI";
    }

    const res = await fetch(provider.endpoint, {
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
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${res.status} from ${provider.name}`);
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content || "";
    options?.onChunk?.(reply.replace(/\[ACTION:[^\]]+\]/g, "").trim());
    return reply;
  }

  private async queryAnthropic(
    provider: AIProviderConfig,
    prompt: string,
    systemInstruction: string,
    temperature: number,
    options?: GeminiAskOptions
  ): Promise<string> {
    if (!provider.apiKey.trim()) throw new Error("Anthropic API Key missing");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": provider.apiKey.trim(),
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
      throw new Error(err?.error?.message || `HTTP ${res.status} from Anthropic`);
    }

    const data = await res.json();
    const reply = data.content?.[0]?.text || "";
    options?.onChunk?.(reply.replace(/\[ACTION:[^\]]+\]/g, "").trim());
    return reply;
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

  /**
   * Unified Multi-Provider Routing Engine
   * Routes prompt to Gemini, Groq, DeepSeek, OpenAI, Claude, GitHub, OpenRouter, Ollama, or LM Studio
   */
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

    // Build execution list (with failover order)
    const executionList: AIProviderConfig[] = [];
    if (targetProvider.id === "auto") {
      // Auto Smart Router priority queue
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
          // Execute sequential action tags across all providers
          await this.executeActionTags(fullText);

          const cleanReply = fullText.replace(/\[ACTION:[^\]]+\]/g, "").trim();

          // Progress display & fast first sentence
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

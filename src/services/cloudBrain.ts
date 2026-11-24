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
    defaultModel: "gemini-2.5-pro",
    availableModels: ["gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
    enabled: true,
    status: "missing_key",
    description: "Gemini 2.5 Pro & 2.0. Native multimodal vision & ultra-fast reasoning.",
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
    id: "freellmapi",
    name: "FreeLLMAPI",
    category: "local",
    apiKey: "",
    endpoint: "http://127.0.0.1:31415/v1/chat/completions",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    availableModels: [
      "meta-llama/llama-3.3-70b-instruct:free",
      "google/gemma-2-9b-it:free",
      "qwen/qwen-2.5-72b-instruct:free",
      "deepseek/deepseek-r1:free",
    ],
    enabled: true,
    status: "missing_key",
    description: "FreeLLMAPI Local Gateway at http://127.0.0.1:31415 — Zero Cost.",
    consoleUrl: "http://127.0.0.1:31415",
    capabilities: ["⚡ LOCAL GATEWAY", "🆓 ZERO COST", "</> CODE GEN", "≋ STREAMING"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    category: "cloud",
    apiKey: "",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
    availableModels: [
      "meta-llama/llama-3.3-70b-instruct:free",
      "google/gemma-2-9b-it:free",
      "qwen/qwen-2.5-72b-instruct:free",
      "deepseek/deepseek-r1:free",
      "meta-llama/llama-3.2-3b-instruct:free",
    ],
    enabled: true,
    status: "missing_key",
    description: "OpenRouter Cloud Free Models — 100+ Free & Premium AI models.",
    consoleUrl: "https://openrouter.ai/keys",
    capabilities: ["🔧 TOOL CALLING", "≋ STREAMING", "🆓 FREE MODELS", "</> CODE GEN"],
  },
  {
    id: "ollama",
    name: "Ollama",
    category: "local",
    apiKey: "",
    endpoint: "http://localhost:11434",
    defaultModel: "qwen3.5:4b",
    availableModels: ["qwen3.5:4b", "llama3.2:latest", "qwen2.5-coder:latest", "deepseek-r1:latest"],
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
    enabled: false,
    status: "offline",
    description: "LM Studio, llama.cpp, vLLM custom endpoint — fully offline.",
    capabilities: ["⚡ LOCAL ENDPOINT", "🔒 100% PRIVATE", "≋ STREAMING", "</> CODE GEN"],
  },
];

export async function fetchGeminiLiveModels(apiKey: string): Promise<{ models: string[]; autoSelected: string }> {
  const trimmed = apiKey ? apiKey.trim() : "";
  const fallbackModels = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-1.5-flash", "gemini-1.5-pro"];
  if (!trimmed) {
    return {
      models: fallbackModels,
      autoSelected: "gemini-2.0-flash",
    };
  }

  try {
    const res = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(trimmed)}`,
      { method: "GET" },
      8000
    );
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    const rawList: any[] = data.models || [];
    const contentModels = rawList
      .filter((m) => {
        const methods: string[] = m.supportedGenerationMethods || [];
        return methods.includes("generateContent");
      })
      .map((m) => (m.name || "").replace(/^models\//, ""))
      .filter((m) => m && !m.includes("embedding") && !m.includes("aqa"));

    if (contentModels.length === 0) {
      return {
        models: fallbackModels,
        autoSelected: "gemini-2.0-flash",
      };
    }

    // Rank candidates: fast flash models first, then pro models
    const priorityCandidates = [
      "gemini-2.0-flash",
      "gemini-2.5-flash",
      "gemini-1.5-flash",
      "gemini-2.5-pro",
      "gemini-1.5-pro",
    ];

    let autoSelected = "";
    for (const cand of priorityCandidates) {
      if (contentModels.includes(cand)) {
        autoSelected = cand;
        break;
      }
    }
    if (!autoSelected) {
      const flashMatch = contentModels.find((m) => m.toLowerCase().includes("flash"));
      autoSelected = flashMatch || contentModels[0];
    }

    return {
      models: contentModels,
      autoSelected,
    };
  } catch (e) {
    console.warn("Failed to fetch live Gemini models:", e);
    return {
      models: fallbackModels,
      autoSelected: "gemini-2.0-flash",
    };
  }
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 8000
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  if (options.signal) {
    options.signal.addEventListener("abort", () => controller.abort());
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

export function extractKeysList(apiKeyRaw: any): string[] {
  if (!apiKeyRaw) return [];
  if (Array.isArray(apiKeyRaw)) {
    return apiKeyRaw
      .map((k) => (typeof k === "string" ? k.trim() : String(k).trim()))
      .filter((k) => k.length > 0);
  }
  if (typeof apiKeyRaw === "string") {
    return apiKeyRaw
      .split(/[\r\n,]+/)
      .map((k) => k.trim())
      .filter((k) => k.length > 0);
  }
  return [];
}

export function getProviderKeys(providerOrId: AIProviderConfig | string): string[] {
  try {
    const pid = typeof providerOrId === "string" ? providerOrId : providerOrId?.id;
    let directKeys: string[] = [];

    if (typeof providerOrId === "object" && providerOrId !== null) {
      directKeys = extractKeysList((providerOrId as any).keys || providerOrId.apiKey);
    }

    if (directKeys.length === 0 && pid) {
      const rawBrain = localStorage.getItem(AI_BRAIN_CONFIG_KEY);
      if (rawBrain) {
        try {
          const parsed = JSON.parse(rawBrain);
          const found = (parsed.providers || []).find((p: any) => p.id === pid);
          if (found) {
            directKeys = extractKeysList(found.keys || found.apiKey);
          }
        } catch {}
      }
    }

    if (directKeys.length === 0 && pid) {
      const rawLegacy = localStorage.getItem(AI_PROVIDERS_STORAGE_KEY);
      if (rawLegacy) {
        try {
          const parsed = JSON.parse(rawLegacy);
          const found = (parsed || []).find((p: any) => p.id === pid);
          if (found) {
            directKeys = extractKeysList(found.keys || found.apiKey);
          }
        } catch {}
      }
    }

    if (directKeys.length > 0) return directKeys;

    // Fallbacks for Gemini
    if (pid === "gemini") {
      const rawLegacy =
        localStorage.getItem("angel_gemini_key") ||
        localStorage.getItem("gemini_api_key") ||
        (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_GEMINI_API_KEY) ||
        loadAngelConfig().geminiKey;
      if (rawLegacy) {
        const fallbackList = extractKeysList(rawLegacy);
        if (fallbackList.length > 0) return fallbackList;
      }
    }

    // Fallbacks for Groq
    if (pid === "groq") {
      const rawGroq =
        localStorage.getItem("angel_groq_key") ||
        (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_GROQ_API_KEY);
      if (rawGroq) {
        const fallbackList = extractKeysList(rawGroq);
        if (fallbackList.length > 0) return fallbackList;
      }
    }
  } catch (e) {
    console.warn("Error reading provider keys:", e);
  }
  return [];
}

export function loadAIProviders(): AIProviderConfig[] {
  try {
    const rawBrain = localStorage.getItem(AI_BRAIN_CONFIG_KEY);
    const rawLegacy = localStorage.getItem(AI_PROVIDERS_STORAGE_KEY);

    let storedProviders: AIProviderConfig[] = [];
    if (rawBrain) {
      try {
        const parsed = JSON.parse(rawBrain);
        storedProviders = parsed.providers || [];
      } catch {}
    }
    if (storedProviders.length === 0 && rawLegacy) {
      try {
        storedProviders = JSON.parse(rawLegacy) || [];
      } catch {}
    }

    // Migration: separate legacy openrouter into freellmapi & pure openrouter
    const legacyOpenRouter = storedProviders.find((p) => p.id === "openrouter");
    const existingFreeLlm = storedProviders.find((p) => p.id === "freellmapi");
    if (legacyOpenRouter && !existingFreeLlm) {
      if (
        legacyOpenRouter.endpoint?.includes("127.0.0.1:31415") ||
        legacyOpenRouter.apiKey?.includes("freellmapi-") ||
        legacyOpenRouter.name?.toLowerCase().includes("freellmapi")
      ) {
        storedProviders.push({
          ...legacyOpenRouter,
          id: "freellmapi",
          name: "FreeLLMAPI",
          category: "local",
          endpoint: legacyOpenRouter.endpoint || "http://127.0.0.1:31415/v1/chat/completions",
          description: "FreeLLMAPI Local Gateway at http://127.0.0.1:31415 — Zero Cost.",
          consoleUrl: "http://127.0.0.1:31415",
          capabilities: ["⚡ LOCAL GATEWAY", "🆓 ZERO COST", "</> CODE GEN", "≋ STREAMING"],
        });
        legacyOpenRouter.endpoint = "https://openrouter.ai/api/v1/chat/completions";
        legacyOpenRouter.name = "OpenRouter";
        legacyOpenRouter.category = "cloud";
        legacyOpenRouter.description = "OpenRouter Cloud Free Models — 100+ Free & Premium AI models.";
        legacyOpenRouter.consoleUrl = "https://openrouter.ai/keys";
        if (legacyOpenRouter.apiKey?.includes("freellmapi-")) {
          legacyOpenRouter.apiKey = "";
        }
      }
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

        // Auto-migrate stale Gemini models to gemini-2.0-flash / gemini-2.5-pro
        if (def.id === "gemini") {
          if (!defModel || defModel.includes("3.8") || defModel.includes("3.5") || defModel === "gemini-2.5-flash-preview") {
            defModel = "gemini-2.0-flash";
          }
          availModels = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-1.5-flash", "gemini-1.5-pro"];
        }

        if (def.id === "freellmapi") {
          let curEndpoint = existing.endpoint || def.endpoint;
          if (!curEndpoint || curEndpoint.includes("openrouter.ai")) {
            curEndpoint = "http://127.0.0.1:31415/v1/chat/completions";
          }
          merged.push({
            ...def,
            ...existing,
            endpoint: curEndpoint,
            category: "local",
            description: "FreeLLMAPI Local Gateway at http://127.0.0.1:31415 — Zero Cost.",
            consoleUrl: "http://127.0.0.1:31415",
            capabilities: def.capabilities,
            defaultModel: defModel,
            availableModels: availModels,
          });
          continue;
        }

        if (def.id === "openrouter") {
          let curEndpoint = existing.endpoint || def.endpoint;
          if (!curEndpoint || curEndpoint.includes("127.0.0.1:31415")) {
            curEndpoint = "https://openrouter.ai/api/v1/chat/completions";
          }
          merged.push({
            ...def,
            ...existing,
            endpoint: curEndpoint,
            category: "cloud",
            description: "OpenRouter Cloud Free Models — 100+ Free & Premium AI models.",
            consoleUrl: "https://openrouter.ai/keys",
            capabilities: def.capabilities,
            defaultModel: defModel,
            availableModels: availModels,
          });
          continue;
        }

        if (def.id === "local_lmstudio") {
          const isExplicit = localStorage.getItem("angel_lmstudio_enabled") === "true";
          merged.push({
            ...def,
            ...existing,
            enabled: isExplicit && existing.status === "verified",
            status: isExplicit && existing.status === "verified" ? "verified" : "offline",
            defaultModel: defModel,
            capabilities: def.capabilities,
            consoleUrl: def.consoleUrl,
            description: def.description,
            availableModels: availModels,
          });
          continue;
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
        (currentPrimary.includes("3.8") || currentPrimary.includes("3.5") || currentPrimary === "gemini-2.5-flash")
      ) {
        localStorage.setItem("angel_primary_model", "gemini-2.5-pro");
      }
    } catch {}

    // Sync legacy geminiKey and angel_gemini_key if needed
    const gemini = merged.find((p) => p.id === "gemini");
    if (gemini) {
      const gKeys = getProviderKeys("gemini");
      if (gKeys.length > 0 && !gemini.apiKey) {
        gemini.apiKey = gKeys.join("\n");
      }
      gemini.status = getProviderKeys("gemini").length > 0 ? "ready" : "missing_key";
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
        localStorage.setItem("angel_gemini_key", firstKey);
        const cfg = loadAngelConfig();
        saveAngelConfig({ ...cfg, geminiKey: firstKey });
      }
    }
  } catch {}
}

export function isLocalEndpoint(url: string): boolean {
  return url.includes("127.0.0.1") || url.includes("localhost") || url.includes("0.0.0.0");
}

export async function proxyLocalRequest(
  url: string,
  apiKey?: string,
  payload?: any,
  timeoutSecs: number = 25
): Promise<any> {
  const payloadStr = payload ? (typeof payload === "string" ? payload : JSON.stringify(payload)) : "";
  const raw = await invoke<string>("proxy_local_llm_request", {
    url,
    apiKey: apiKey || null,
    payload: payloadStr,
    timeoutSecs,
  });
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function testProviderConnection(provider: AIProviderConfig): Promise<{
  ok: boolean;
  message: string;
  latencyMs?: number;
  models?: string[];
}> {
  const startTime = performance.now();
  try {
    if (provider.id === "auto") {
      const all = loadAIProviders();
      const priorityOrder = [
        "gemini",
        "groq",
        "freellmapi",
        "openrouter",
        "deepseek",
        "openai",
        "anthropic",
        "github",
        "ollama",
        "local_lmstudio",
      ];
      const configured = priorityOrder
        .map((pid) => all.find((p) => p.id === pid))
        .filter((p): p is AIProviderConfig => {
          if (!p || !p.enabled) return false;
          if (p.id === "ollama") return Boolean(p.endpoint && p.endpoint.trim());
          if (p.id === "local_lmstudio") {
            return Boolean(
              p.enabled &&
              p.endpoint &&
              p.endpoint.trim() &&
              localStorage.getItem("angel_lmstudio_enabled") === "true" &&
              (p.status === "verified" || p.status === "local_ready")
            );
          }
          return extractKeysList(p.apiKey).length > 0;
        });

      if (configured.length === 0) {
        return {
          ok: false,
          message: "No AI providers configured yet. Configure at least one provider (Gemini, FreeLLMAPI, Ollama, etc.) below.",
        };
      }

      let readyCount = 0;
      let firstResponding: { name: string; latencyMs: number } | null = null;
      const failures: string[] = [];

      for (const p of configured) {
        const res = await testProviderConnection(p);
        if (res.ok) {
          readyCount++;
          if (!firstResponding) {
            firstResponding = { name: p.name, latencyMs: res.latencyMs || 0 };
          }
        } else {
          failures.push(`${p.name}: ${res.message}`);
        }
      }

      const totalLatency = Math.round(performance.now() - startTime);

      if (firstResponding) {
        return {
          ok: true,
          message: `Auto Router Active • Connected via ${firstResponding.name} (${readyCount}/${configured.length} providers ready)`,
          latencyMs: firstResponding.latencyMs || totalLatency,
        };
      } else {
        return {
          ok: false,
          message: `All ${configured.length} configured providers failed (${failures.slice(0, 2).join("; ")})`,
          latencyMs: totalLatency,
        };
      }
    }

    if (provider.id === "ollama") {
      const baseUrl = provider.endpoint.replace(/\/$/, "");
      try {
        const data = await proxyLocalRequest(`${baseUrl}/api/tags`);
        const latencyMs = Math.round(performance.now() - startTime);
        const models = (data?.models || []).map((m: any) => m.name || m.model);
        return {
          ok: true,
          message:
            models.length > 0
              ? `Connected • ${latencyMs}ms (${models.length} local models)`
              : `Connected • ${latencyMs}ms (no local models; run 'ollama pull llama3.2')`,
          latencyMs,
          models,
        };
      } catch (err: any) {
        return { ok: false, message: `Ollama error: ${err?.message || err}` };
      }
    }

    if (provider.id === "local_lmstudio") {
      let baseUrl = provider.endpoint.replace(/\/chat\/completions$/, "").replace(/\/$/, "");
      if (!baseUrl.endsWith("/v1")) baseUrl += "/v1";
      try {
        const data = await proxyLocalRequest(`${baseUrl}/models`, undefined, undefined, 5);
        const latencyMs = Math.round(performance.now() - startTime);
        const models = (data?.data || []).map((m: any) => m.id);
        localStorage.setItem("angel_lmstudio_enabled", "true");
        return {
          ok: true,
          message:
            models.length > 0
              ? `Connected • ${latencyMs}ms (${models.length} model loaded)`
              : `Connected • ${latencyMs}ms (LM Studio server online)`,
          latencyMs,
          models,
        };
      } catch (err: any) {
        localStorage.removeItem("angel_lmstudio_enabled");
        return { ok: false, message: `LM Studio offline: ${err?.message || err}` };
      }
    }

    const keyList = extractKeysList(provider.apiKey);
    const activeKey = keyList[0] || (provider.id === "gemini" ? loadAngelConfig().geminiKey.trim() : "");

    if (provider.id === "gemini") {
      if (!activeKey) return { ok: false, message: "Gemini API key is required" };
      const trimmedKey = activeKey.trim();

      // Auto-discover live models
      let liveModels: string[] = [];
      let autoModel = provider.defaultModel;
      try {
        const liveRes = await fetchGeminiLiveModels(trimmedKey);
        liveModels = liveRes.models;
        if (!autoModel || autoModel.includes("3.8") || autoModel === "gemini-2.5-flash-preview") {
          autoModel = liveRes.autoSelected;
        }
      } catch {}

      const rawTarget = (autoModel || "gemini-2.0-flash").replace(/^(models\/)+/, "").trim();
      const targetModel =
        rawTarget.includes("3.8") || rawTarget === "gemini-2.5-flash-preview"
          ? "gemini-2.0-flash"
          : rawTarget;

      const modelsToTry = [targetModel];
      if (!modelsToTry.includes("gemini-2.0-flash")) modelsToTry.push("gemini-2.0-flash");
      if (!modelsToTry.includes("gemini-2.5-flash")) modelsToTry.push("gemini-2.5-flash");
      if (!modelsToTry.includes("gemini-2.5-pro")) modelsToTry.push("gemini-2.5-pro");
      if (!modelsToTry.includes("gemini-1.5-flash")) modelsToTry.push("gemini-1.5-flash");

      let lastErrMessage = "";
      for (const modelName of modelsToTry) {
        try {
          const res = await fetchWithTimeout(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(trimmedKey)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: "ping" }] }],
              }),
            },
            8000
          );
          const latencyMs = Math.round(performance.now() - startTime);
          if (res.ok) {
            return {
              ok: true,
              message: modelName === targetModel ? `Connected • ${latencyMs}ms (${modelName})` : `Connected (${modelName} fallback) • ${latencyMs}ms`,
              latencyMs,
              models: liveModels.length > 0 ? liveModels : undefined,
            };
          }
          const err = await res.json().catch(() => ({}));
          lastErrMessage = err?.error?.message || `HTTP ${res.status}`;
          if (res.status === 503 || res.status === 429 || lastErrMessage.toLowerCase().includes("high demand")) {
            console.warn(`Gemini model ${modelName} busy/high demand. Cascading to fallback model...`);
            continue;
          }
        } catch {
          try {
            const ai = new GoogleGenAI({ apiKey: trimmedKey });
            const pingPromise = ai.models.generateContent({
              model: modelName,
              contents: "Respond with 'ok'",
            });
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("Timeout")), 8000)
            );
            await Promise.race([pingPromise, timeoutPromise]);
            const latencyMs = Math.round(performance.now() - startTime);
            return {
              ok: true,
              message: modelName === targetModel ? `Connected • ${latencyMs}ms (${modelName})` : `Connected (${modelName} fallback) • ${latencyMs}ms`,
              latencyMs,
              models: liveModels.length > 0 ? liveModels : undefined,
            };
          } catch (e: any) {
            lastErrMessage = e?.message || "SDK error";
            continue;
          }
        }
      }
      return { ok: false, message: lastErrMessage || "Gemini connection failed" };
    }

    if (provider.id === "groq") {
      if (!activeKey || !activeKey.trim()) {
        return { ok: false, message: "Groq API key is required (gsk_...)" };
      }
      const trimmedKey = activeKey.trim();
      const modelToTest = provider.defaultModel || "llama-3.3-70b-versatile";
      try {
        const res = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${trimmedKey}`,
          },
          body: JSON.stringify({
            model: modelToTest,
            messages: [{ role: "user", content: "Reply with OK" }],
            max_tokens: 10,
          }),
        }, 8000);

        const latencyMs = Math.round(performance.now() - startTime);
        if (res.ok) {
          return {
            ok: true,
            message: `Connected • ${latencyMs}ms (${modelToTest})`,
            latencyMs,
          };
        }
        const err = await res.json().catch(() => ({}));
        const errMsg = err?.error?.message || `HTTP ${res.status}: ${res.statusText || "Request failed"}`;
        return { ok: false, message: `Groq error: ${errMsg}` };
      } catch (err: any) {
        return { ok: false, message: `Groq connection failed: ${err?.message || err}` };
      }
    }

    if (provider.id === "anthropic") {
      if (!activeKey) return { ok: false, message: "Anthropic API key required" };
      try {
        const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
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
        }, 8000);
        const latencyMs = Math.round(performance.now() - startTime);
        if (res.ok) return { ok: true, message: `Connected • ${latencyMs}ms`, latencyMs };
        const err = await res.json().catch(() => ({}));
        return { ok: false, message: err?.error?.message || `HTTP ${res.status}` };
      } catch (err: any) {
        return { ok: false, message: `Anthropic error: ${err?.message || err}` };
      }
    }

    if (provider.id === "freellmapi") {
      if (!activeKey || !activeKey.trim()) {
        return {
          ok: false,
          message: "FreeLLMAPI requires an API key (freellmapi-...). Paste your key above.",
        };
      }

      let baseUrl = provider.endpoint.replace(/\/chat\/completions$/, "").replace(/\/$/, "");
      if (!baseUrl.endsWith("/v1")) baseUrl += "/v1";

      let routerModels: string[] = [];
      try {
        const mData = await proxyLocalRequest(`${baseUrl}/models`, activeKey.trim());
        routerModels = (mData?.data || mData?.models || [])
          .map((m: any) => m.id || m.name || m.model)
          .filter(Boolean);
      } catch {}

      let chatUrl = provider.endpoint;
      if (!chatUrl.includes("/chat/completions")) {
        chatUrl = `${baseUrl}/chat/completions`;
      }

      try {
        const pingBody = {
          model: provider.defaultModel || (routerModels[0] || "meta-llama/llama-3.3-70b-instruct:free"),
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 5,
        };
        const data = await proxyLocalRequest(chatUrl, activeKey.trim(), pingBody);
        const latencyMs = Math.round(performance.now() - startTime);
        if (data?.choices || data?.id || data?.message) {
          return {
            ok: true,
            message:
              routerModels.length > 0
                ? `Connected • ${latencyMs}ms (${routerModels.length} models available)`
                : `Connected • ${latencyMs}ms`,
            latencyMs,
            models: routerModels.length > 0 ? routerModels : undefined,
          };
        }
        if (data?.error?.message) {
          return { ok: false, message: data.error.message };
        }
        return {
          ok: true,
          message: `Connected • ${latencyMs}ms`,
          latencyMs,
          models: routerModels.length > 0 ? routerModels : undefined,
        };
      } catch (err: any) {
        return { ok: false, message: `FreeLLMAPI Gateway error: ${err?.message || err}` };
      }
    }

    if (provider.id === "openrouter") {
      if (!activeKey || !activeKey.trim()) {
        return {
          ok: false,
          message: "OpenRouter requires an API key (sk-or-v1-...). Paste your key above.",
        };
      }
      const trimmedKey = activeKey.trim();
      const targetUrl = provider.endpoint.includes("/chat/completions")
        ? provider.endpoint
        : `${provider.endpoint.replace(/\/$/, "")}/chat/completions`;

      try {
        const res = await fetchWithTimeout(
          targetUrl,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${trimmedKey}`,
              "HTTP-Referer": "https://angel-ai.local",
              "X-Title": "Angel AI",
            },
            body: JSON.stringify({
              model: provider.defaultModel || "meta-llama/llama-3.3-70b-instruct:free",
              messages: [{ role: "user", content: "ping" }],
              max_tokens: 5,
            }),
          },
          8000
        );
        const latencyMs = Math.round(performance.now() - startTime);
        if (res.ok) {
          return {
            ok: true,
            message: `Connected • ${latencyMs}ms (OpenRouter Cloud)`,
            latencyMs,
          };
        }
        const err = await res.json().catch(() => ({}));
        return { ok: false, message: err?.error?.message || `HTTP ${res.status}` };
      } catch (err: any) {
        return { ok: false, message: `OpenRouter error: ${err?.message || err}` };
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

    const res = await fetchWithTimeout(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: provider.defaultModel,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 5,
      }),
    }, 8000);

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

export interface CloudStorageConfig {
  supabase: {
    url: string;
    anonKey: string;
  };
  discord: {
    webhookUrl: string;
    botToken: string;
    channelId: string;
  };
  github: {
    pat: string;
    gistId: string;
  };
  custom: {
    providerType: "s3" | "webdav" | "local_nas";
    endpointUrl: string;
    bucketOrFolder: string;
    accessKey: string;
  };
}

export const CLOUD_STORAGE_CONFIG_KEY = "angel_cloud_storage_config";

export function loadCloudStorageConfig(): CloudStorageConfig {
  const legacy = loadAngelConfig();
  try {
    const raw = localStorage.getItem(CLOUD_STORAGE_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        supabase: {
          url: parsed.supabase?.url || legacy.supabaseUrl || "",
          anonKey: parsed.supabase?.anonKey || legacy.supabaseKey || "",
        },
        discord: {
          webhookUrl: parsed.discord?.webhookUrl || "",
          botToken: parsed.discord?.botToken || "",
          channelId: parsed.discord?.channelId || "",
        },
        github: {
          pat: parsed.github?.pat || "",
          gistId: parsed.github?.gistId || "",
        },
        custom: {
          providerType: parsed.custom?.providerType || "s3",
          endpointUrl: parsed.custom?.endpointUrl || "",
          bucketOrFolder: parsed.custom?.bucketOrFolder || "",
          accessKey: parsed.custom?.accessKey || "",
        },
      };
    }
  } catch {}

  return {
    supabase: {
      url: legacy.supabaseUrl || "",
      anonKey: legacy.supabaseKey || "",
    },
    discord: {
      webhookUrl: "",
      botToken: "",
      channelId: "",
    },
    github: {
      pat: "",
      gistId: "",
    },
    custom: {
      providerType: "s3",
      endpointUrl: "",
      bucketOrFolder: "",
      accessKey: "",
    },
  };
}

export function saveCloudStorageConfig(cfg: CloudStorageConfig): void {
  try {
    localStorage.setItem(CLOUD_STORAGE_CONFIG_KEY, JSON.stringify(cfg));
    const legacy = loadAngelConfig();
    legacy.supabaseUrl = cfg.supabase.url.trim();
    legacy.supabaseKey = cfg.supabase.anonKey.trim();
    saveAngelConfig(legacy);
  } catch (e) {
    console.warn("Failed to save cloud storage config:", e);
  }
}

/**
 * Backup essential Angel AI data to GitHub Secret Gist
 */
export async function backupToGitHubGist(
  pat: string,
  existingGistId?: string
): Promise<{ success: boolean; gistId: string; message: string }> {
  if (!pat.trim()) {
    throw new Error("GitHub Personal Access Token (PAT) is required for backup.");
  }

  const payload = {
    angel_chat_sessions: localStorage.getItem("angel_chat_sessions") || "[]",
    angel_memory: localStorage.getItem("angel_ram_memory_v3") || "{}",
    angel_workshop_builds: localStorage.getItem("angel_workshop_builds") || "[]",
    angel_ai_brain_config: localStorage.getItem("angel_ai_brain_config") || "{}",
    backup_timestamp: new Date().toISOString(),
    angel_version: "2.0.0",
  };

  const files = {
    "angel_ai_full_backup.json": {
      content: JSON.stringify(payload, null, 2),
    },
  };

  const trimmedGistId = existingGistId?.trim();
  const url = trimmedGistId
    ? `https://api.github.com/gists/${trimmedGistId}`
    : "https://api.github.com/gists";
  const method = trimmedGistId ? "PATCH" : "POST";

  const bodyData: any = {
    description: "Angel AI Sovereign Multi-Cloud Storage Backup",
    files,
  };
  if (!trimmedGistId) {
    bodyData.public = false;
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${pat.trim()}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "Angel-AI-Assistant",
    },
    body: JSON.stringify(bodyData),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub API Error (${res.status}): ${errText}`);
  }

  const json = await res.json();
  const newGistId = json.id || trimmedGistId;
  return {
    success: true,
    gistId: newGistId,
    message: `Cloud backup stored to GitHub Secret Gist: ${newGistId}`,
  };
}

/**
 * Restore Angel AI data from GitHub Secret Gist
 */
export async function restoreFromGitHubGist(
  pat: string,
  gistId: string
): Promise<{ success: boolean; message: string }> {
  if (!pat.trim() || !gistId.trim()) {
    throw new Error("Both GitHub PAT and Secret Gist ID are required to restore.");
  }

  const res = await fetch(`https://api.github.com/gists/${gistId.trim()}`, {
    headers: {
      Authorization: `Bearer ${pat.trim()}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "Angel-AI-Assistant",
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub API Error (${res.status}): ${errText}`);
  }

  const json = await res.json();
  const backupFile = json.files?.["angel_ai_full_backup.json"];
  if (!backupFile || !backupFile.content) {
    throw new Error("No 'angel_ai_full_backup.json' file found in this Gist.");
  }

  const restored = JSON.parse(backupFile.content);
  if (restored.angel_chat_sessions) {
    localStorage.setItem("angel_chat_sessions", restored.angel_chat_sessions);
  }
  if (restored.angel_memory) {
    localStorage.setItem("angel_ram_memory_v3", restored.angel_memory);
  }
  if (restored.angel_workshop_builds) {
    localStorage.setItem("angel_workshop_builds", restored.angel_workshop_builds);
  }
  if (restored.angel_ai_brain_config) {
    localStorage.setItem("angel_ai_brain_config", restored.angel_ai_brain_config);
  }

  return {
    success: true,
    message: `Restored successfully from Gist (${restored.backup_timestamp || "Latest"}).`,
  };
}

/**
 * Test Discord remote bridge webhook via Rust backend proxy
 */
export async function testDiscordBridge(webhookUrl: string, botToken?: string): Promise<string> {
  const trimmed = webhookUrl.trim();
  if (!trimmed) {
    throw new Error("Discord Webhook URL is required.");
  }

  const payload = {
    content:
      "🚀 **Angel AI — Remote PC Bridge Test**\n✅ Connection verified from Windows 11 host.\n⏱ Timestamp: " +
      new Date().toLocaleString(),
    embeds: [
      {
        title: "Angel AI System Telemetry & Remote Hub",
        description: "Windows 11 Host Connected • Multi-Cloud Storage Hub Operational",
        color: 0x06b6d4,
        fields: [
          { name: "Bridge Status", value: "🟢 Online", inline: true },
          {
            name: "Remote Commands",
            value: botToken?.trim() ? "🤖 Bot Token Configured" : "📢 Webhook Uploads Only",
            inline: true,
          },
          { name: "Sovereign Node", value: "Windows 11 PC", inline: true },
        ],
        footer: { text: "Angel AI Sovereign Multi-Cloud Storage & Remote Bridge" },
        timestamp: new Date().toISOString(),
      },
    ],
  };

  return await invoke<string>("send_discord_webhook", {
    webhookUrl: trimmed,
    message: JSON.stringify(payload),
  });
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

// Multi-Action Sequential Execution Examples:
// 1. User: "Set volume to 80%, take a screenshot, and open Firefox with YouTube"
//    Assistant: "Sure Raja, adjusting volume to 80%, capturing your screen, and launching Firefox with YouTube now. [ACTION:SET_VOLUME|80] [ACTION:SCREENSHOT] [ACTION:OPEN_TARGET|firefox https://www.youtube.com]"
//
// 2. User: "ஒலியளவை 60% ஆக்கி நோட்பேட் திற"
//    Assistant: "சரி ராஜா, ஒலியளவை 60% ஆக மாற்றி Notepad-ஐ திறக்கிறேன். [ACTION:SET_VOLUME|60] [ACTION:OPEN_TARGET|notepad]"`;

// =========================================================================
// SMART LRU CACHE & INTELLIGENT DECISION ENGINE
// =========================================================================

export interface BrainDiagnostics {
  selectedBrain: string;
  classification: "Quick Lookup" | "Code / Reverse-Engineering" | "Defensive Security Audit" | "3D Workshop" | "Tamil/Tanglish" | "General Reasoning";
  cacheHit: boolean;
  failoverRecoveryCount: number;
  latencyMs: number;
}

interface CacheEntry {
  response: string;
  timestamp: number;
}

export class SmartLruCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxEntries = 50;
  private readonly ttlMs = 10 * 60 * 1000; // 10 minutes

  private isBypassed(prompt: string): boolean {
    const p = prompt.toLowerCase();
    if (/time|date|today|now|clock|நேரம்|மணி|நாள்|weather|climate|வானிலை/i.test(p)) return true;
    if (/battery|cpu|ram|temp|temperature|fan|telemetry|system health/i.test(p)) return true;
    if (/\[action:|launch |open |close |mute |kill |set volume/i.test(p)) return true;
    if (p.length < 5) return true;
    return false;
  }

  public get(prompt: string): string | null {
    if (this.isBypassed(prompt)) return null;
    const key = prompt.trim().toLowerCase();
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.response;
  }

  public set(prompt: string, response: string): void {
    if (this.isBypassed(prompt) || !response || response.length < 10) return;
    const key = prompt.trim().toLowerCase();
    if (this.cache.size >= this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { response, timestamp: Date.now() });
  }

  public clear(): void {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }
}

export const brainCache = new SmartLruCache();

export function classifyPromptIntent(
  prompt: string
): "Quick Lookup" | "Code / Reverse-Engineering" | "Defensive Security Audit" | "3D Workshop" | "Tamil/Tanglish" | "General Reasoning" {
  const p = prompt.toLowerCase();

  if (/[\u0B80-\u0BFF]|வணக்கம்|நன்றி|எப்படி|செய்|சொல்லு|பாரு|வேலை|என்ன/i.test(prompt)) {
    return "Tamil/Tanglish";
  }
  if (/3d|workshop|three\.js|stl|mesh|geometry|jet engine|turbofan|telemetry pc|vertex|hologram|digital twin/i.test(p)) {
    return "3D Workshop";
  }
  if (/security|antivirus|firewall|canary|ransomware|malware|quarantine|hardening|usb|ports|forensics|sha256|entropy/i.test(p)) {
    return "Defensive Security Audit";
  }
  if (/github\.com|reverse engineer|rea skill|rebuild|transpile|rust|typescript|react|crate|syntax|function|struct|def |class /i.test(p)) {
    return "Code / Reverse-Engineering";
  }
  if (p.length < 80 && /^(what is|who is|define|when did|how many|capital of|meaning of)/i.test(p)) {
    return "Quick Lookup";
  }

  return "General Reasoning";
}

export class CloudBrainService {
  private memoryCache: Record<string, MemoryFact> = {};
  private supabase: SupabaseClient | null = null;
  private isListeningRelay = false;
  // Multi-key round-robin rotation index
  private keyRotationIndex: Record<string, number> = {};
  private lastDiagnostics: BrainDiagnostics = {
    selectedBrain: "Auto Smart Router",
    classification: "General Reasoning",
    cacheHit: false,
    failoverRecoveryCount: 0,
    latencyMs: 0,
  };

  public getBrainDiagnostics(): BrainDiagnostics {
    return { ...this.lastDiagnostics };
  }

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
        model: "gemini-2.5-pro",
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
    const ladder = ["gemini-2.5-pro", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"];
    if (provider.defaultModel) {
      const customModel = cleanModelName(provider.defaultModel);
      if (
        customModel &&
        !customModel.includes("3.8") &&
        customModel !== "gemini-2.5-flash"
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

          // Wrap stream generation in timeout to prevent hanging connections
          const streamPromise = ai.models.generateContentStream({
            model: cleanModelName(model),
            contents: contentParts,
            config: { systemInstruction },
          });
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout waiting for Gemini stream (${model})`)), 10000)
          );

          const responseStream = await Promise.race([streamPromise, timeoutPromise]);

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
          console.warn(`Gemini model ${model} error (${msg}). Cascading to next model...`);
          // Automatically try next model in ladder ("gemini-3.8-flash-lite")
          continue;
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

    if (provider.id === "freellmapi") {
      const validKey = candidateKeys.find((k) => k && k.trim());
      if (!validKey) {
        throw new Error("FreeLLMAPI requires an API key (freellmapi-...). Paste your key above.");
      }
    }

    if (provider.id === "openrouter") {
      const validKey = candidateKeys.find((k) => k && k.trim());
      if (!validKey) {
        throw new Error("OpenRouter requires an API key (sk-or-v1-...). Paste your key above.");
      }
    }

    let lastErrorMsg = "";

    for (const key of candidateKeys) {
      if (!key && provider.id !== "local_lmstudio" && !isLocalEndpoint(targetUrl)) {
        continue;
      }

      // If local endpoint (FreeLLMAPI 127.0.0.1:31415, LM Studio, etc.), route via Rust proxy to bypass WebView2 CORS
      if (isLocalEndpoint(targetUrl) || provider.id === "freellmapi" || provider.id === "local_lmstudio") {
        try {
          const postBody = {
            model: provider.defaultModel,
            messages: [
              { role: "system", content: systemInstruction },
              { role: "user", content: prompt },
            ],
            temperature,
          };
          const data = await proxyLocalRequest(targetUrl, key ? key.trim() : undefined, postBody);
          if (data?.error?.message) {
            lastErrorMsg = data.error.message;
            continue;
          }
          const reply = data?.choices?.[0]?.message?.content || "";
          if (reply) {
            options?.onChunk?.(reply.replace(/\[ACTION:[^\]]+\]/g, "").trim());
            return reply;
          }
        } catch (err: any) {
          lastErrorMsg = err?.message || String(err);
          continue;
        }
      }

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (key) {
        headers["Authorization"] = `Bearer ${key.trim()}`;
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
    const model = provider.defaultModel || "qwen3.5:4b";

    // 1. Try /api/chat with think: false (disables slow chain-of-thought in qwen3.5:4b) and num_predict: 400
    try {
      const postBody = {
        model,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt },
        ],
        stream: false,
        think: false,
        options: {
          num_predict: 400,
          temperature: temperature ?? 0.7,
        },
      };
      const data = await proxyLocalRequest(`${baseUrl}/api/chat`, undefined, postBody, 30);
      if (data?.error) {
        throw new Error(data.error);
      }
      let rawReply = data?.message?.content || data?.response || "";
      // Strip any residual <think>...</think> blocks from reasoning models
      const reply = rawReply.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      if (reply) {
        options?.onChunk?.(reply.replace(/\[ACTION:[^\]]+\]/g, "").trim());
        return reply;
      }
    } catch (chatErr: any) {
      console.warn("Ollama /api/chat failed, falling back to /api/generate:", chatErr);
      // 2. Fallback to /api/generate with think: false and num_predict: 400
      try {
        const genBody = {
          model,
          prompt: `${systemInstruction}\n\nUser: ${prompt}\nAssistant:`,
          stream: false,
          think: false,
          options: {
            num_predict: 400,
            temperature: temperature ?? 0.7,
          },
        };
        const data = await proxyLocalRequest(`${baseUrl}/api/generate`, undefined, genBody, 30);
        if (data?.error) {
          throw new Error(data.error);
        }
        let rawReply = data?.response || data?.message?.content || "";
        const reply = rawReply.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        if (reply) {
          options?.onChunk?.(reply.replace(/\[ACTION:[^\]]+\]/g, "").trim());
          return reply;
        }
      } catch (genErr: any) {
        throw new Error(`Ollama error (${model}): ${chatErr?.message || genErr?.message || "unreachable"}`);
      }
      throw new Error(`Ollama (${model}) returned empty response: ${chatErr?.message || "empty"}`);
    }

    throw new Error(`Ollama local error: Model ${model} gave no output.`);
  }

  public async askGemini(userPrompt: string, options?: GeminiAskOptions): Promise<string> {
    return this.askAngelBrain(userPrompt, options);
  }

  public async askAngelBrain(
    userPrompt: string,
    options?: GeminiAskOptions
  ): Promise<string> {
    const startTime = performance.now();
    const classification = classifyPromptIntent(userPrompt);

    // 0. Smart LRU Cache (<5ms resolution for non-dynamic queries)
    const cachedResponse = brainCache.get(userPrompt);
    if (cachedResponse) {
      this.lastDiagnostics = {
        selectedBrain: "Smart LRU Cache (<5ms)",
        classification,
        cacheHit: true,
        failoverRecoveryCount: 0,
        latencyMs: Math.round(performance.now() - startTime),
      };
      options?.onChunk?.(cachedResponse);
      if (options?.onFirstSentence) {
        options.onFirstSentence(cachedResponse);
      }
      return cachedResponse;
    }

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
    const activeProviderId = localStorage.getItem("angel_active_provider") || "";
    const activeModel = localStorage.getItem("angel_primary_model") || "Auto";
    const autoFailover = localStorage.getItem("angel_ai_failover") !== "false";
    const temperature = parseFloat(localStorage.getItem("angel_brain_temperature") || "0.7");
    const systemInstruction = localStorage.getItem("angel_custom_system_prompt") || DEFAULT_SYSTEM_INSTRUCTION;

    // 1. Prioritize explicitly selected provider (e.g., "ollama", "gemini", "groq", "openrouter")
    let targetProvider: AIProviderConfig | undefined;
    if (activeProviderId && activeProviderId !== "auto") {
      targetProvider = providers.find((p) => p.id === activeProviderId);
    }
    if (!targetProvider && activeModel !== "Auto" && activeModel !== "auto-smart") {
      targetProvider = providers.find(
        (p) =>
          p.id === activeModel ||
          p.name.toLowerCase() === activeModel.toLowerCase() ||
          p.defaultModel === activeModel ||
          (p.availableModels && p.availableModels.includes(activeModel))
      );
    }
    if (!targetProvider) {
      targetProvider = providers.find((p) => p.id === "auto") || providers[0];
    }

    // Dynamic Intent-based routing order (Cloud first for fast online response, Ollama offline fallback)
    let priorityOrder = [
      "gemini",
      "groq",
      "freellmapi",
      "openrouter",
      "deepseek",
      "openai",
      "anthropic",
      "github",
      "ollama",
      "local_lmstudio",
    ];

    if (classification === "Quick Lookup") {
      priorityOrder = ["gemini", "groq", "freellmapi", "openrouter", "deepseek", "openai", "anthropic", "github", "ollama", "local_lmstudio"];
    } else if (classification === "Code / Reverse-Engineering") {
      priorityOrder = ["gemini", "groq", "deepseek", "freellmapi", "openrouter", "openai", "anthropic", "github", "ollama", "local_lmstudio"];
    } else if (classification === "Defensive Security Audit") {
      priorityOrder = ["gemini", "groq", "anthropic", "openai", "deepseek", "freellmapi", "openrouter", "github", "ollama", "local_lmstudio"];
    } else if (classification === "Tamil/Tanglish") {
      priorityOrder = ["gemini", "groq", "freellmapi", "openrouter", "deepseek", "openai", "anthropic", "github", "ollama", "local_lmstudio"];
    }

    const isConfigured = (p: AIProviderConfig) => {
      if (!p.enabled) return false;
      if (p.id === "ollama") {
        return Boolean(p.endpoint && p.endpoint.trim());
      }
      if (p.id === "local_lmstudio") {
        const isExplicit = localStorage.getItem("angel_lmstudio_enabled") === "true";
        return Boolean(p.enabled && isExplicit && p.endpoint && p.endpoint.trim() && p.status === "verified");
      }
      return extractKeysList(p.apiKey).length > 0;
    };

    const executionList: AIProviderConfig[] = [];
    if (targetProvider.id === "auto") {
      for (const pid of priorityOrder) {
        const found = providers.find((p) => p.id === pid);
        if (found && isConfigured(found)) {
          executionList.push(found);
        }
      }
    } else {
      executionList.push(targetProvider);
      if (autoFailover) {
        for (const pid of priorityOrder) {
          if (pid !== targetProvider.id) {
            const found = providers.find((p) => p.id === pid);
            if (found && isConfigured(found)) {
              executionList.push(found);
            }
          }
        }
      }
    }

    if (executionList.length === 0) {
      const anyEnabled = providers.filter((p) => p.id !== "auto" && p.enabled);
      executionList.push(...anyEnabled);
    }

    const isAutoRouting = targetProvider.id === "auto" || autoFailover;
    let lastError: any = null;
    let failoverRecoveryCount = 0;

    for (let i = 0; i < executionList.length; i++) {
      const provider = executionList[i];
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

          // Cache in SmartLruCache
          brainCache.set(userPrompt, cleanReply);

          this.lastDiagnostics = {
            selectedBrain: provider.name,
            classification,
            cacheHit: false,
            failoverRecoveryCount,
            latencyMs: Math.round(performance.now() - startTime),
          };

          incrementUsageTelemetry("prompt", Math.round(userPrompt.length * 0.75 + fullText.length * 0.75));
          return cleanReply;
        }
      } catch (err: any) {
        lastError = err;
        failoverRecoveryCount++;
        console.warn(`Provider ${provider.name} failed (${err?.message || err}). Cascading to next provider...`);
        if (!isAutoRouting) break;
      }
    }

    return `மன்னிக்கவும் ராஜா, AI மாதிரிகளுடன் தொடர்பு கொள்ள முடியவில்லை (${lastError?.message || "All providers unreachable"}). Please check your API keys or local server settings in the Menu Control Center.`;
  }
}

export const cloudBrain = new CloudBrainService();

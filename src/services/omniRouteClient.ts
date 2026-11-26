import { AI_PROVIDERS_STORAGE_KEY, AIProviderConfig, loadAngelConfig } from "./cloudBrain";
import { invoke } from "@tauri-apps/api/core";

export type OmniProviderId = "omniroute" | "gemini" | "anthropic" | "sarvam" | "ollama";

export interface OmniMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OmniChatOptions {
  preferredProvider?: OmniProviderId;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  ecoModeOffline?: boolean;
}

export interface OmniChatResult {
  text: string;
  provider: OmniProviderId;
  model: string;
  latencyMs: number;
}

interface CircuitState {
  failures: number;
  openUntil: number;
}

const CIRCUIT_FAILURE_THRESHOLD = 2;
const CIRCUIT_COOLDOWN_MS = 45_000;
const circuitBreakers: Record<OmniProviderId, CircuitState> = {
  omniroute: { failures: 0, openUntil: 0 },
  gemini: { failures: 0, openUntil: 0 },
  anthropic: { failures: 0, openUntil: 0 },
  sarvam: { failures: 0, openUntil: 0 },
  ollama: { failures: 0, openUntil: 0 },
};

function isCircuitOpen(id: OmniProviderId): boolean {
  const st = circuitBreakers[id];
  if (st.openUntil > Date.now()) return true;
  if (st.openUntil !== 0 && st.openUntil <= Date.now()) {
    st.failures = 0;
    st.openUntil = 0;
  }
  return false;
}

function recordFailure(id: OmniProviderId) {
  const st = circuitBreakers[id];
  st.failures += 1;
  if (st.failures >= CIRCUIT_FAILURE_THRESHOLD) {
    st.openUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
  }
}

function recordSuccess(id: OmniProviderId) {
  circuitBreakers[id] = { failures: 0, openUntil: 0 };
}

function getProviderConfig(id: string): AIProviderConfig | undefined {
  try {
    const raw = localStorage.getItem(AI_PROVIDERS_STORAGE_KEY);
    if (raw) {
      const list: AIProviderConfig[] = JSON.parse(raw);
      return list.find((p) => p.id === id);
    }
  } catch {}
  return undefined;
}

export function getOmniRouteEndpoint(): string {
  return (
    localStorage.getItem("angel_omniroute_endpoint") ||
    "http://127.0.0.1:20128/v1/chat/completions"
  );
}

export function getSarvamApiKey(): string {
  return (
    localStorage.getItem("angel_sarvam_api_key") ||
    getProviderConfig("sarvam")?.apiKey?.trim() ||
    ""
  );
}

async function callOmniRouteGateway(messages: OmniMessage[], model?: string, temperature = 0.6): Promise<string> {
  const endpoint = getOmniRouteEndpoint();
  const apiKey = localStorage.getItem("angel_omniroute_key") || "omniroute-local";

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || "auto",
      messages,
      temperature,
      stream: false,
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`OmniRoute HTTP ${res.status}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty OmniRoute response");
  return content;
}

async function callGeminiDirect(messages: OmniMessage[], model = "gemini-2.5-flash"): Promise<string> {
  const cfg = loadAngelConfig();
  const prov = getProviderConfig("gemini");
  const key = (prov?.apiKey || cfg.geminiKey || "").split(/[\n,]+/)[0]?.trim();
  if (!key) throw new Error("Gemini key missing");

  const systemMsg = messages.find((m) => m.role === "system")?.content || "";
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg }] } } : {}),
      contents,
    }),
    signal: AbortSignal.timeout(18_000),
  });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");
  return text;
}

async function callClaudeDirect(messages: OmniMessage[], model = "claude-3-7-sonnet-latest"): Promise<string> {
  const prov = getProviderConfig("anthropic");
  const key = (prov?.apiKey || "").split(/[\n,]+/)[0]?.trim();
  if (!key) throw new Error("Anthropic key missing");

  const systemMsg = messages.find((m) => m.role === "system")?.content || "";
  const body = {
    model,
    max_tokens: 1024,
    ...(systemMsg ? { system: systemMsg } : {}),
    messages: messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content })),
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(18_000),
  });
  if (!res.ok) throw new Error(`Claude HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.content?.[0]?.text;
  if (!text) throw new Error("Empty Claude response");
  return text;
}

async function callSarvamChat(messages: OmniMessage[]): Promise<string> {
  const key = getSarvamApiKey();
  if (!key) throw new Error("Sarvam API key missing");

  const res = await fetch("https://api.sarvam.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": key,
    },
    body: JSON.stringify({
      model: "sarvam-m",
      messages,
      temperature: 0.5,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Sarvam HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty Sarvam response");
  return text;
}

async function callOllamaLocal(messages: OmniMessage[]): Promise<string> {
  const prov = getProviderConfig("ollama");
  const model = prov?.defaultModel || "qwen3.5:4b";
  const endpoint = prov?.endpoint || "http://127.0.0.1:11434/api/chat";

  const payload = JSON.stringify({
    model,
    messages,
    stream: false,
    think: false,
  });

  try {
    const raw = await invoke<string>("proxy_local_llm_request", {
      url: endpoint,
      body: payload,
    });
    const parsed = JSON.parse(raw);
    const content = parsed?.message?.content || parsed?.response;
    if (content) return content;
  } catch {}

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.message?.content || data?.response;
  if (!text) throw new Error("Empty Ollama response");
  return text;
}

/**
 * Unified OmniRoute LLM Gateway Client with automatic circuit-breaker fallback across
 * OmniRoute -> Gemini -> Claude -> Sarvam -> Local Ollama (Offline Eco Mode).
 */
export async function omniChatCompletion(
  messages: OmniMessage[],
  options: OmniChatOptions = {}
): Promise<OmniChatResult> {
  const start = performance.now();

  const baseOrder: OmniProviderId[] = options.ecoModeOffline
    ? ["ollama"]
    : ["omniroute", "gemini", "anthropic", "sarvam", "ollama"];

  const order: OmniProviderId[] = options.preferredProvider
    ? [options.preferredProvider, ...baseOrder.filter((p) => p !== options.preferredProvider)]
    : baseOrder;

  const errors: string[] = [];

  for (const provider of order) {
    if (isCircuitOpen(provider)) continue;
    try {
      let text = "";
      if (provider === "omniroute") text = await callOmniRouteGateway(messages, options.model, options.temperature);
      else if (provider === "gemini") text = await callGeminiDirect(messages, options.model);
      else if (provider === "anthropic") text = await callClaudeDirect(messages, options.model);
      else if (provider === "sarvam") text = await callSarvamChat(messages);
      else if (provider === "ollama") text = await callOllamaLocal(messages);

      recordSuccess(provider);
      return {
        text: text.trim(),
        provider,
        model: options.model || provider,
        latencyMs: Math.round(performance.now() - start),
      };
    } catch (err: any) {
      recordFailure(provider);
      errors.push(`${provider}: ${err?.message || err}`);
    }
  }

  throw new Error(`All OmniRoute providers unavailable (${errors.join(" | ")})`);
}

/**
 * Sarvam AI Speech-to-Text (Indian Tamil / Tanglish / English).
 */
export async function sarvamSpeechToText(audioBlob: Blob, languageCode = "ta-IN"): Promise<string | null> {
  const key = getSarvamApiKey();
  if (!key) return null;

  const form = new FormData();
  form.append("file", audioBlob, "speech.wav");
  form.append("model", "saarika:v2");
  form.append("language_code", languageCode);

  const res = await fetch("https://api.sarvam.ai/speech-to-text", {
    method: "POST",
    headers: {
      "api-subscription-key": key,
    },
    body: form,
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.transcript || null;
}

/**
 * Sarvam AI Bulbul Text-to-Speech (returns base64 WAV audio if key is configured).
 */
export async function sarvamTextToSpeech(text: string, targetLanguageCode = "ta-IN"): Promise<string | null> {
  const key = getSarvamApiKey();
  if (!key) return null;

  const res = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": key,
    },
    body: JSON.stringify({
      inputs: [text.slice(0, 480)],
      target_language_code: targetLanguageCode,
      speaker: "anushka",
      model: "bulbul:v2",
      enable_preprocessing: true,
    }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.audios?.[0] || null;
}

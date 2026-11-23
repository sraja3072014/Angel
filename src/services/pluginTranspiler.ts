import { invoke } from "@tauri-apps/api/core";
import { cloudBrain, getProviderKeys } from "./cloudBrain";

export type PluginSourceType = "github" | "local_folder" | "curl_openapi" | "prompt";

export interface AngelForgedPlugin {
  id: string;
  name: string;
  trigger_phrases: string[];
  source_stack_detected: string;
  converted_runtime: "Zero-Python Native";
  action_type: "HTTP_REST" | "POWERSHELL" | "PROMPT_TOOL";
  endpoint_or_command: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  headers?: Record<string, string>;
  body_template?: string;
  description: string;
  author: string;
  created_at: string;
}

export interface SecurityAuditResult {
  safe: boolean;
  score: number;
  warnings: string[];
  action_type: string;
  target: string;
  simulated_preview: string;
}

export interface FolderInspectionSummary {
  folder_path: string;
  folder_name: string;
  detected_stack: string;
  files_scanned: string[];
  manifest_summary: string;
  readme_excerpt: string;
  detected_endpoints: string[];
  detected_cli_commands: string[];
  sample_snippet: string;
  python_files_count: number;
  purpose: string;
}

export interface GitHubInspectionSummary {
  repo_url: string;
  owner: string;
  repo: string;
  description: string;
  primary_language: string;
  detected_stack: string;
  readme_excerpt: string;
  manifest_name: string;
  manifest_content: string;
  detected_endpoints: string[];
  purpose: string;
}

/**
 * Call Rust to inspect a local folder strictly read-only
 */
export async function inspectLocalProjectFolder(folderPath: string): Promise<FolderInspectionSummary> {
  const raw = await invoke<string>("inspect_local_project_folder", { folderPath });
  return JSON.parse(raw);
}

/**
 * Call Rust to inspect a GitHub repository using Rust HTTP
 */
export async function inspectGitHubRepo(repoUrl: string): Promise<GitHubInspectionSummary> {
  const raw = await invoke<string>("inspect_github_repo", { repoUrl });
  return JSON.parse(raw);
}

/**
 * Call Rust to statically audit a plugin command/endpoint before execution
 */
export async function dryRunPluginSecurity(plugin: Partial<AngelForgedPlugin>): Promise<SecurityAuditResult> {
  const raw = await invoke<string>("dry_run_plugin_security", {
    pluginJson: JSON.stringify(plugin),
  });
  return JSON.parse(raw);
}

/**
 * Deterministically extract an HTTP_REST target from any URL, Python requests, or cURL snippet
 */
export function extractHttpRestTarget(text: string): Partial<AngelForgedPlugin> | null {
  const urlMatch = text.match(/https?:\/\/[^\s'"\)\]\>]+/i);
  if (!urlMatch) return null;

  const url = urlMatch[0].replace(/[,'"\);]+$/, "");
  const textLower = text.toLowerCase();

  // Detect method
  let method: "GET" | "POST" | "PUT" | "DELETE" = "GET";
  if (textLower.includes("requests.post") || textLower.includes("-x post") || textLower.includes("post ") || textLower.includes("method='post'") || textLower.includes('method="post"')) {
    method = "POST";
  } else if (textLower.includes("requests.put") || textLower.includes("-x put") || textLower.includes("put ")) {
    method = "PUT";
  } else if (textLower.includes("requests.delete") || textLower.includes("-x delete") || textLower.includes("delete ")) {
    method = "DELETE";
  }

  // Detect headers & API key requirement
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const groqKeys = getProviderKeys("groq");
  const geminiKeys = getProviderKeys("gemini");
  const openAiKeys = getProviderKeys("openai");

  if (url.includes("api.groq.com") || textLower.includes("groq")) {
    headers["Authorization"] = groqKeys[0] ? `Bearer ${groqKeys[0]}` : "Bearer {{GROQ_API_KEY}}";
  } else if (url.includes("generativelanguage.googleapis.com") || textLower.includes("gemini")) {
    // Gemini uses ?key= or Bearer
    if (geminiKeys[0] && !url.includes("key=")) {
      headers["x-goog-api-key"] = geminiKeys[0];
    }
  } else if (url.includes("api.openai.com") || textLower.includes("openai")) {
    headers["Authorization"] = openAiKeys[0] ? `Bearer ${openAiKeys[0]}` : "Bearer {{OPENAI_API_KEY}}";
  } else if (textLower.includes("authorization") || textLower.includes("bearer") || textLower.includes("api_key")) {
    headers["Authorization"] = "Bearer {{API_KEY}}";
  }

  // Extract body if present
  let bodyTemplate = "";
  const dataMatch = text.match(/(?:json|data|body)\s*=\s*(\{[\s\S]*?\})/i);
  if (dataMatch) {
    bodyTemplate = dataMatch[1].trim();
  }

  // Formulate friendly name and trigger phrases based on host and path
  let hostName = "API";
  try {
    const parsedUrl = new URL(url);
    hostName = parsedUrl.hostname.replace(/^api\./, "").replace(/\.[^.]+$/, "");
    hostName = hostName.charAt(0).toUpperCase() + hostName.slice(1);
    const pathSegments = parsedUrl.pathname.split("/").filter(Boolean);
    const lastSeg = pathSegments[pathSegments.length - 1] || "endpoint";
    const name = `${hostName} ${lastSeg.charAt(0).toUpperCase() + lastSeg.slice(1)} REST`;
    const trigger1 = `${lastSeg.replace(/[-_]/g, " ")} ${hostName.toLowerCase()}`.trim();
    const trigger2 = `list ${hostName.toLowerCase()} ${lastSeg}`.trim();
    const trigger3 = `check ${hostName.toLowerCase()} ${lastSeg}`.trim();

    return {
      name,
      trigger_phrases: [trigger2, trigger3, trigger1, `call ${hostName.toLowerCase()}`],
      action_type: "HTTP_REST",
      endpoint_or_command: url,
      method,
      headers,
      body_template: bodyTemplate,
      description: `Zero-Python HTTP REST bridge for ${url}`,
      source_stack_detected: `${hostName} REST API`,
      converted_runtime: "Zero-Python Native",
    };
  } catch {
    return {
      name: "REST API Endpoint",
      trigger_phrases: ["call api", "query endpoint"],
      action_type: "HTTP_REST",
      endpoint_or_command: url,
      method,
      headers,
      body_template: bodyTemplate,
      description: `Zero-Python HTTP REST bridge for ${url}`,
      source_stack_detected: "HTTP REST API",
      converted_runtime: "Zero-Python Native",
    };
  }
}

/**
 * Heuristic cURL parser to extract endpoint, method, headers, and body
 */
export function parseCurlCommand(curlText: string): Partial<AngelForgedPlugin> {
  const extracted = extractHttpRestTarget(curlText);
  if (extracted) return extracted;

  const cleaned = curlText.replace(/\\\r?\n/g, " ").trim();
  let method: "GET" | "POST" | "PUT" | "DELETE" = "GET";
  let url = "";
  const headers: Record<string, string> = {};
  let bodyTemplate = "";

  const methodMatch = cleaned.match(/(?:-X|--request)\s+([A-Z]+)/i);
  if (methodMatch) {
    method = methodMatch[1].toUpperCase() as any;
  } else if (cleaned.includes("-d ") || cleaned.includes("--data ") || cleaned.includes("--data-raw ")) {
    method = "POST";
  }

  const urlMatch = cleaned.match(/(?:curl\s+)?(?:['"])(https?:\/\/[^'"]+)(?:['"])|(?:curl\s+)(https?:\/\/[^\s]+)/i);
  if (urlMatch) {
    url = urlMatch[1] || urlMatch[2] || "";
  } else {
    const fallbackMatch = cleaned.match(/(https?:\/\/[^\s'"]+)/i);
    if (fallbackMatch) url = fallbackMatch[1];
  }

  const headerRegex = /(?:-H|--header)\s+['"]([^'"]+)['"]/gi;
  let hMatch;
  while ((hMatch = headerRegex.exec(cleaned)) !== null) {
    const parts = hMatch[1].split(":");
    if (parts.length >= 2) {
      headers[parts[0].trim()] = parts.slice(1).join(":").trim();
    }
  }

  const bodyMatch = cleaned.match(/(?:-d|--data|--data-raw)\s+['"]([\s\S]*?)['"](?:\s|$)/);
  if (bodyMatch) {
    bodyTemplate = bodyMatch[1];
  }

  return {
    name: "API Endpoint",
    trigger_phrases: ["call api", "run api request"],
    action_type: "HTTP_REST",
    endpoint_or_command: url,
    method,
    headers: Object.keys(headers).length > 0 ? headers : { "Content-Type": "application/json" },
    body_template: bodyTemplate,
    description: `Zero-Python HTTP REST plugin for ${url || "API endpoint"}`,
    source_stack_detected: "cURL / REST API Command",
    converted_runtime: "Zero-Python Native",
  };
}

/**
 * Universal Zero-Python Plugin Transpiler
 * Converts any GitHub repo, local project, or cURL/Python/OpenAPI into a Zero-Python Angel Plugin.
 */
export async function transpileToAngelPlugin(
  sourceType: PluginSourceType,
  rawContent: string,
  detectedStack: string = "Generic Project"
): Promise<AngelForgedPlugin> {
  // 1. Check for deterministic HTTP/REST URL in rawContent
  const deterministicHttp = extractHttpRestTarget(rawContent);

  const prompt = `You are the Angel AI Universal Plugin Transpiler.
Your mission is to convert the following software source into a NATIVE ZERO-PYTHON ANGEL AI PLUGIN.

CRITICAL ARCHITECTURE MANDATES:
1. STRICTLY PROHIBIT DUMMY PLACEHOLDERS: NEVER output "Write-Output 'Simulated...'" or empty stubs. Every output MUST be genuinely executable.
2. HTTP REST RULE: If the source code/request contacts an HTTP/HTTPS endpoint (e.g. Python requests.get/post, aiohttp, curl, Swagger, FastAPI, Groq, OpenAI, ComfyUI), you MUST set "action_type": "HTTP_REST".
   - "endpoint_or_command" must be the exact HTTP/HTTPS URL (e.g. "https://api.groq.com/openai/v1/models").
   - "method" must be "GET" | "POST" | "PUT" | "DELETE".
   - "headers" must include all necessary headers, using placeholders like "Bearer {{GROQ_API_KEY}}" or "Bearer {{GEMINI_API_KEY}}" where credentials are required.
3. POWERSHELL RULE: If the source is a local Windows OS automation task (e.g. process control, service restart, DNS flush, hardware info), you MUST set "action_type": "POWERSHELL" and output a real, non-interactive PowerShell command (e.g. "Restart-Service Audiosrv -Force", "Clear-DnsClientCache").
4. ZERO PYTHON RUNTIME: NEVER output any python command (no "python", "py", "pip", "python.exe", "requests.get").
5. Return ONLY valid JSON in this exact structure:
{
  "name": "Short Clear Plugin Name",
  "trigger_phrases": ["short trigger phrase 1", "trigger phrase 2", "trigger phrase 3"],
  "action_type": "HTTP_REST" | "POWERSHELL" | "PROMPT_TOOL",
  "endpoint_or_command": "https://... or PowerShell command",
  "method": "GET" | "POST",
  "headers": { "Content-Type": "application/json" },
  "body_template": "{}",
  "description": "Clear purpose of this plugin"
}

SOURCE TYPE: ${sourceType}
DETECTED TECH STACK: ${detectedStack}
RAW SOURCE CONTENT:
${rawContent.slice(0, 4000)}`;

  let parsed: any = null;

  try {
    const aiResponse = await cloudBrain.askAngelBrain(prompt);
    const cleanJson = aiResponse.replace(/```json|```/g, "").trim();
    const firstBrace = cleanJson.indexOf("{");
    const lastBrace = cleanJson.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      parsed = JSON.parse(cleanJson.substring(firstBrace, lastBrace + 1));
    }
  } catch (err) {
    console.warn("AI transpilation encountered error or offline fallback:", err);
  }

  // Sanitizer: If AI produced a dummy Write-Output or wrong action_type when HTTP target exists
  const commandStr = (parsed?.endpoint_or_command || "").toLowerCase();
  const isDummyOutput = commandStr.includes("write-output") && (commandStr.includes("simulat") || commandStr.includes("placeholder"));

  if (deterministicHttp && (isDummyOutput || parsed?.action_type === "POWERSHELL" || !parsed?.endpoint_or_command)) {
    parsed = {
      name: parsed?.name && !parsed.name.includes("Simulated") ? parsed.name : deterministicHttp.name,
      trigger_phrases: parsed?.trigger_phrases && parsed.trigger_phrases.length > 0 ? parsed.trigger_phrases : deterministicHttp.trigger_phrases,
      action_type: "HTTP_REST",
      endpoint_or_command: deterministicHttp.endpoint_or_command,
      method: deterministicHttp.method || "GET",
      headers: deterministicHttp.headers || { "Content-Type": "application/json" },
      body_template: deterministicHttp.body_template || "",
      description: deterministicHttp.description,
    };
  }

  // Fallback heuristics if parsing failed or still empty
  if (!parsed || !parsed.name || !parsed.endpoint_or_command) {
    if (deterministicHttp) {
      parsed = deterministicHttp;
    } else {
      const safeTitle = (rawContent.match(/^[#\w\s]{3,30}/m)?.[0] || "Windows Automation Tool").trim();
      parsed = {
        name: safeTitle,
        trigger_phrases: [safeTitle.toLowerCase(), "run tool", "execute automation"],
        action_type: "POWERSHELL",
        endpoint_or_command: "Get-Process | Sort-Object CPU -Descending | Select-Object -First 10",
        description: `Zero-Python Windows Automation Plugin generated from ${detectedStack}`,
      };
    }
  }

  const triggers = Array.isArray(parsed.trigger_phrases) && parsed.trigger_phrases.length > 0
    ? parsed.trigger_phrases
    : [parsed.name.toLowerCase(), `run ${parsed.name.toLowerCase()}`];

  // Sanitize command: strip trailing pipes or dangling pipe fragments and normalize user input tokens
  let cleanCommand = (parsed.endpoint_or_command || "").trim();
  while (cleanCommand.endsWith("|") || cleanCommand.endsWith(";")) {
    cleanCommand = cleanCommand.replace(/[|;\s]+$/, "").trim();
  }
  cleanCommand = cleanCommand
    .replace(/\{input\}/gi, "{{USER_INPUT}}")
    .replace(/\{query\}/gi, "{{USER_INPUT}}")
    .replace(/<input>/gi, "{{USER_INPUT}}")
    .replace(/<query>/gi, "{{USER_INPUT}}");

  const pluginId = `skill_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  return {
    id: pluginId,
    name: parsed.name,
    trigger_phrases: triggers,
    source_stack_detected: detectedStack,
    converted_runtime: "Zero-Python Native",
    action_type: parsed.action_type === "HTTP_REST" ? "HTTP_REST" : parsed.action_type === "PROMPT_TOOL" ? "PROMPT_TOOL" : "POWERSHELL",
    endpoint_or_command: cleanCommand,
    method: parsed.method || (parsed.action_type === "HTTP_REST" ? "GET" : undefined),
    headers: parsed.headers,
    body_template: parsed.body_template,
    description: parsed.description || "Zero-Python native Angel plugin",
    author: "Universal Plugin Forge AI",
    created_at: new Date().toISOString(),
  };
}

/**
 * Save forged plugin into runtime skills catalog with resolved API keys
 */
export async function installPluginToSkillForge(plugin: AngelForgedPlugin): Promise<string> {
  let resolvedHeaders = { ...(plugin.headers || {}) };

  // Resolve API key placeholders from localStorage / active keys
  const groqKeys = getProviderKeys("groq");
  const geminiKeys = getProviderKeys("gemini");
  const openAiKeys = getProviderKeys("openai");

  const groqKey = groqKeys[0] || "";
  const geminiKey = geminiKeys[0] || "";
  const openAiKey = openAiKeys[0] || "";

  for (const [k, v] of Object.entries(resolvedHeaders)) {
    if (typeof v === "string") {
      let val = v;
      if (groqKey && val.includes("{{GROQ_API_KEY}}")) {
        val = val.replace(/\{\{GROQ_API_KEY\}\}/g, groqKey);
      }
      if (geminiKey && val.includes("{{GEMINI_API_KEY}}")) {
        val = val.replace(/\{\{GEMINI_API_KEY\}\}/g, geminiKey);
      }
      if (openAiKey && val.includes("{{OPENAI_API_KEY}}")) {
        val = val.replace(/\{\{OPENAI_API_KEY\}\}/g, openAiKey);
      }
      resolvedHeaders[k] = val;
    }
  }

  // Construct structured payload for HTTP_REST
  let payload = plugin.endpoint_or_command;
  if (plugin.action_type === "HTTP_REST") {
    payload = JSON.stringify({
      url: plugin.endpoint_or_command,
      method: plugin.method || "GET",
      headers: resolvedHeaders,
      body: plugin.body_template || "",
    });
  }

  const result = await invoke<string>("forge_new_skill", {
    skill: {
      id: plugin.id,
      name: plugin.name,
      trigger: plugin.trigger_phrases[0] || plugin.name.toLowerCase(),
      trigger_phrases: plugin.trigger_phrases,
      action_type: plugin.action_type.toLowerCase(),
      payload: payload,
      endpoint_or_command: payload,
      description: plugin.description,
      source_stack_detected: plugin.source_stack_detected,
      converted_runtime: plugin.converted_runtime,
    },
  });

  return result;
}

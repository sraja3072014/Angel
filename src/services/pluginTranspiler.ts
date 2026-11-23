import { invoke } from "@tauri-apps/api/core";
import { cloudBrain } from "./cloudBrain";

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
 * Heuristic cURL parser to extract endpoint, method, headers, and body
 */
export function parseCurlCommand(curlText: string): Partial<AngelForgedPlugin> {
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

  // Extract URL (quoted or bare)
  const urlMatch = cleaned.match(/(?:curl\s+)?(?:['"])(https?:\/\/[^'"]+)(?:['"])|(?:curl\s+)(https?:\/\/[^\s]+)/i);
  if (urlMatch) {
    url = urlMatch[1] || urlMatch[2] || "";
  } else {
    const fallbackMatch = cleaned.match(/(https?:\/\/[^\s'"]+)/i);
    if (fallbackMatch) url = fallbackMatch[1];
  }

  // Extract headers
  const headerRegex = /(?:-H|--header)\s+['"]([^'"]+)['"]/gi;
  let hMatch;
  while ((hMatch = headerRegex.exec(cleaned)) !== null) {
    const parts = hMatch[1].split(":");
    if (parts.length >= 2) {
      headers[parts[0].trim()] = parts.slice(1).join(":").trim();
    }
  }

  // Extract body
  const bodyMatch = cleaned.match(/(?:-d|--data|--data-raw)\s+['"]([\s\S]*?)['"](?:\s|$)/);
  if (bodyMatch) {
    bodyTemplate = bodyMatch[1];
  }

  const endpointPath = url ? new URL(url).pathname.replace(/\//g, " ").trim() : "api";
  const name = `API ${method} ${endpointPath || "Endpoint"}`.trim();
  const trigger = endpointPath ? `call ${endpointPath}` : "run api request";

  return {
    name,
    trigger_phrases: [trigger, `trigger ${name.toLowerCase()}`],
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
 * Uses active Multi-LLM Brain to convert any GitHub repo, local project, or cURL/OpenAPI into a Zero-Python Angel Plugin.
 */
export async function transpileToAngelPlugin(
  sourceType: PluginSourceType,
  rawContent: string,
  detectedStack: string = "Generic Project"
): Promise<AngelForgedPlugin> {
  const prompt = `You are the Angel AI Universal Plugin Transpiler.
Your mission is to convert the following software source/specification into a NATIVE ZERO-PYTHON ANGEL AI PLUGIN.

CRITICAL ARCHITECTURE MANDATES:
1. STRIP ALL PYTHON DEPENDENCIES: Even if the source code, repository, or project is written in Python (FastAPI, Flask, Django, CLI, ComfyUI, etc.), convert its functionality into 100% NATIVE Zero-Python actions:
   - "HTTP_REST": For REST APIs, ComfyUI Asset Vault (e.g. http://127.0.0.1:8127), webhooks, Swagger, or cURL endpoints. Provide endpoint URL, HTTP method (GET/POST/PUT/DELETE), headers, and JSON body template.
   - "POWERSHELL": For Windows OS automation, service control, process inspection, file actions, or command-line tasks. Provide a single-line or multi-line clean PowerShell script that runs silently.
   - "PROMPT_TOOL": For analytical, cognitive, or reasoning skills that execute via AI context.
2. NEVER output any python command (no "python", "py", "pip", "python.exe").
3. Make the action completely self-contained, safe, and ready for instant voice or text reflex execution.

SOURCE TYPE: ${sourceType}
DETECTED TECH STACK: ${detectedStack}
RAW SOURCE CONTENT / INSPECTION SUMMARY:
${rawContent.slice(0, 4000)}

Return ONLY valid JSON (no markdown explanation) in this exact format:
{
  "name": "Short Clear Plugin Name",
  "trigger_phrases": ["short voice trigger phrase 1", "trigger phrase 2"],
  "action_type": "HTTP_REST" | "POWERSHELL" | "PROMPT_TOOL",
  "endpoint_or_command": "http://127.0.0.1:... or PowerShell command",
  "method": "GET" | "POST",
  "headers": { "Content-Type": "application/json" },
  "body_template": "{}",
  "description": "What this plugin does and how Angel uses it"
}`;

  let parsed: any = null;

  try {
    const aiResponse = await cloudBrain.askAngelBrain(prompt);
    const cleanJson = aiResponse.replace(/```json|```/g, "").trim();
    // Locate the outermost JSON object
    const firstBrace = cleanJson.indexOf("{");
    const lastBrace = cleanJson.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      parsed = JSON.parse(cleanJson.substring(firstBrace, lastBrace + 1));
    }
  } catch (err) {
    console.warn("AI transpilation encountered error or offline fallback:", err);
  }

  // Fallback heuristics if AI is offline or response parsing failed
  if (!parsed || !parsed.name || !parsed.endpoint_or_command) {
    if (sourceType === "curl_openapi" || rawContent.toLowerCase().includes("curl") || rawContent.toLowerCase().includes("http://")) {
      const curlParsed = parseCurlCommand(rawContent);
      parsed = {
        name: curlParsed.name || "Custom REST Plugin",
        trigger_phrases: curlParsed.trigger_phrases || ["call api", "trigger endpoint"],
        action_type: "HTTP_REST",
        endpoint_or_command: curlParsed.endpoint_or_command || "http://127.0.0.1:8000/api",
        method: curlParsed.method || "GET",
        headers: curlParsed.headers || { "Content-Type": "application/json" },
        body_template: curlParsed.body_template || "{}",
        description: curlParsed.description || "Transpiled HTTP REST Endpoint",
      };
    } else if (detectedStack.toLowerCase().includes("fastapi") || detectedStack.toLowerCase().includes("flask")) {
      parsed = {
        name: "Local Service Connector",
        trigger_phrases: ["connect local service", "query service api"],
        action_type: "HTTP_REST",
        endpoint_or_command: "http://127.0.0.1:8000/docs",
        method: "GET",
        headers: { "Accept": "application/json" },
        description: `Zero-Python HTTP REST bridge for ${detectedStack}`,
      };
    } else {
      const safeTitle = (rawContent.match(/^[#\w\s]{3,30}/m)?.[0] || "Custom System Tool").trim();
      parsed = {
        name: safeTitle,
        trigger_phrases: [safeTitle.toLowerCase(), "run tool"],
        action_type: "POWERSHELL",
        endpoint_or_command: "Get-Process | Select-Object -First 10",
        description: `Zero-Python Windows Automation Plugin generated from ${detectedStack}`,
      };
    }
  }

  const triggers = Array.isArray(parsed.trigger_phrases) && parsed.trigger_phrases.length > 0
    ? parsed.trigger_phrases
    : [parsed.name.toLowerCase(), `run ${parsed.name.toLowerCase()}`];

  const pluginId = `plugin_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  return {
    id: pluginId,
    name: parsed.name,
    trigger_phrases: triggers,
    source_stack_detected: detectedStack,
    converted_runtime: "Zero-Python Native",
    action_type: parsed.action_type === "HTTP_REST" ? "HTTP_REST" : parsed.action_type === "PROMPT_TOOL" ? "PROMPT_TOOL" : "POWERSHELL",
    endpoint_or_command: parsed.endpoint_or_command,
    method: parsed.method || (parsed.action_type === "HTTP_REST" ? "GET" : undefined),
    headers: parsed.headers,
    body_template: parsed.body_template,
    description: parsed.description || "Zero-Python native Angel plugin",
    author: "Universal Plugin Forge AI",
    created_at: new Date().toISOString(),
  };
}

/**
 * Save forged plugin into runtime skills catalog
 */
export async function installPluginToSkillForge(plugin: AngelForgedPlugin): Promise<string> {
  const payload = plugin.action_type === "HTTP_REST" && plugin.endpoint_or_command
    ? plugin.endpoint_or_command
    : plugin.endpoint_or_command;

  const result = await invoke<string>("forge_new_skill", {
    skill: {
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

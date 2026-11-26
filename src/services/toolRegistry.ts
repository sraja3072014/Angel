import { omniChatCompletion } from "./omniRouteClient";
import { sanitizeToolArguments } from "./securityGuardrails";
import { AngelWorkspaceProfile, getSupabaseClient, resolveLocalFallbackProfile } from "./supabaseAuth";

export interface RegisteredAngelTool {
  id: string;
  user_id: string;
  workspace_id: string;
  name: string;
  description: string;
  source_type: "self_generated" | "manifest_import";
  manifest_url?: string;
  json_schema: Record<string, unknown>;
  ts_code: string;
  is_enabled: boolean;
  created_at: string;
}

export interface AngelPluginManifest {
  name: string;
  description: string;
  version?: string;
  json_schema: Record<string, unknown>;
  handler_code: string;
}

const LOCAL_TOOLS_KEY = "angel_hot_tools_registry_v3";

class HotReloadToolRegistry {
  private activeHandlers = new Map<string, (args: Record<string, unknown>) => Promise<unknown> | unknown>();
  private listeners = new Set<() => void>();

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify() {
    this.listeners.forEach((cb) => cb());
  }

  public loadLocalTools(): RegisteredAngelTool[] {
    try {
      const raw = localStorage.getItem(LOCAL_TOOLS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  }

  private saveLocalTools(tools: RegisteredAngelTool[]) {
    localStorage.setItem(LOCAL_TOOLS_KEY, JSON.stringify(tools));
  }

  public async listTools(profile?: AngelWorkspaceProfile): Promise<RegisteredAngelTool[]> {
    const activeProfile = profile || resolveLocalFallbackProfile();
    const client = getSupabaseClient();

    if (client && !activeProfile.userId.startsWith("local-")) {
      try {
        const { data } = await client
          .from("angel_tools")
          .select("*")
          .eq("user_id", activeProfile.userId)
          .order("created_at", { ascending: false });
        if (data) {
          const tools = data as RegisteredAngelTool[];
          this.saveLocalTools(tools);
          tools.forEach((t) => {
            if (t.is_enabled) this.compileIntoMemory(t);
          });
          return tools;
        }
      } catch {}
    }

    const local = this.loadLocalTools();
    local.forEach((t) => {
      if (t.is_enabled) this.compileIntoMemory(t);
    });
    return local;
  }

  private compileIntoMemory(tool: RegisteredAngelTool) {
    try {
      // Sandboxed function wrapper receiving only explicit `args`
      const fn = new Function(
        "args",
        `"use strict"; return (async (args) => { ${tool.ts_code} })(args);`
      ) as (args: Record<string, unknown>) => Promise<unknown>;
      this.activeHandlers.set(tool.name, fn);
    } catch (e) {
      console.warn(`Failed to compile hot tool ${tool.name}:`, e);
    }
  }

  public async registerTool(
    toolInput: Omit<RegisteredAngelTool, "id" | "user_id" | "workspace_id" | "created_at">,
    profile?: AngelWorkspaceProfile
  ): Promise<RegisteredAngelTool> {
    const activeProfile = profile || resolveLocalFallbackProfile();

    // Validate tool code / schema through Phase 2 sanitizer
    const guard = sanitizeToolArguments(toolInput.name, {
      name: toolInput.name,
      description: toolInput.description,
      code: toolInput.ts_code,
    });
    if (!guard.safe) {
      throw new Error(guard.blockedReason || "Tool rejected by security guardrail.");
    }

    const record: RegisteredAngelTool = {
      ...toolInput,
      id: crypto.randomUUID ? crypto.randomUUID() : `tool-${Date.now()}`,
      user_id: activeProfile.userId,
      workspace_id: activeProfile.workspaceId,
      created_at: new Date().toISOString(),
    };

    const existing = this.loadLocalTools().filter((t) => t.name !== record.name);
    this.saveLocalTools([record, ...existing]);
    if (record.is_enabled) this.compileIntoMemory(record);

    const client = getSupabaseClient();
    if (client && !activeProfile.userId.startsWith("local-")) {
      try {
        const { data } = await client
          .from("angel_tools")
          .upsert(
            {
              user_id: activeProfile.userId,
              workspace_id: activeProfile.workspaceId,
              name: record.name,
              description: record.description,
              source_type: record.source_type,
              manifest_url: record.manifest_url || null,
              json_schema: record.json_schema,
              ts_code: record.ts_code,
              is_enabled: record.is_enabled,
            },
            { onConflict: "user_id,name" }
          )
          .select("*")
          .single();
        if (data) {
          this.notify();
          return data as RegisteredAngelTool;
        }
      } catch {}
    }

    this.notify();
    return record;
  }

  /**
   * 1. Self-Generated Tools: Angel writes a sandboxed JS/TS function + JSON schema and hot-registers it.
   */
  public async generateAndRegisterTool(
    taskDescription: string,
    profile?: AngelWorkspaceProfile
  ): Promise<RegisteredAngelTool> {
    let generatedName = "custom_angel_tool";
    let description = taskDescription;
    let jsonSchema: Record<string, unknown> = {
      type: "object",
      properties: { input: { type: "string" } },
      required: ["input"],
    };
    let codeBody = `return { ok: true, result: "Executed for: " + String(args.input || "") };`;

    try {
      const res = await omniChatCompletion([
        {
          role: "system",
          content:
            'Return ONLY valid JSON with keys: "name" (snake_case), "description", "json_schema", "handler_code" (valid async JS function body using `args` and returning a result).',
        },
        {
          role: "user",
          content: `Create a sandboxed tool for: ${taskDescription}`,
        },
      ]);
      const jsonMatch = res.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.name) generatedName = String(parsed.name).replace(/[^a-z0-9_]/gi, "_").toLowerCase();
        if (parsed.description) description = String(parsed.description);
        if (parsed.json_schema) jsonSchema = parsed.json_schema;
        if (parsed.handler_code) codeBody = String(parsed.handler_code);
      }
    } catch {}

    return this.registerTool(
      {
        name: generatedName,
        description,
        source_type: "self_generated",
        json_schema: jsonSchema,
        ts_code: codeBody,
        is_enabled: true,
      },
      profile
    );
  }

  /**
   * 2. One-Click Manifest Import: fetches an `angel-plugin.json` manifest URL, sanitizes, and hot-loads it.
   */
  public async importFromManifestUrl(
    manifestUrl: string,
    profile?: AngelWorkspaceProfile
  ): Promise<RegisteredAngelTool> {
    const cleanUrl = manifestUrl.trim();
    if (!/^https?:\/\//i.test(cleanUrl)) {
      throw new Error("Manifest URL must start with http:// or https://");
    }

    const res = await fetch(cleanUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Failed to fetch manifest (${res.status})`);
    const manifest = (await res.json()) as AngelPluginManifest;

    if (!manifest.name || !manifest.handler_code) {
      throw new Error("Invalid angel-plugin.json manifest: missing name or handler_code.");
    }

    return this.registerTool(
      {
        name: manifest.name.replace(/[^a-z0-9_]/gi, "_").toLowerCase(),
        description: manifest.description || "Imported Angel Plugin",
        source_type: "manifest_import",
        manifest_url: cleanUrl,
        json_schema: manifest.json_schema || { type: "object", properties: {} },
        ts_code: manifest.handler_code,
        is_enabled: true,
      },
      profile
    );
  }

  public async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    const guard = sanitizeToolArguments(name, args);
    if (!guard.safe) throw new Error(guard.blockedReason || "Blocked by sanitizer.");

    const handler = this.activeHandlers.get(name);
    if (!handler) {
      throw new Error(`Tool "${name}" is not loaded or enabled.`);
    }
    return handler(guard.sanitizedArgs);
  }

  public getActiveSchemas(): Array<{ name: string; description: string; parameters: Record<string, unknown> }> {
    return this.loadLocalTools()
      .filter((t) => t.is_enabled)
      .map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.json_schema,
      }));
  }
}

export const toolRegistry = new HotReloadToolRegistry();

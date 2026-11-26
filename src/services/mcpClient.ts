import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { invoke } from "@tauri-apps/api/core";
import { PermissionRequest } from "../components/PermissionGateModal";
import { apiRateLimiter, sanitizeToolArguments } from "./securityGuardrails";

export interface McpServerEntry {
  id: string;
  name: string;
  url: string;
  transport: "streamable_http" | "sse";
  category: "filesystem" | "github" | "browser" | "supabase" | "custom";
  enabled: boolean;
}

export type PermissionHandler = (
  req: PermissionRequest
) => Promise<"allow_once" | "allow_session" | "deny">;

const MCP_SERVERS_KEY = "angel_mcp_servers_v2";

const DEFAULT_MCP_SERVERS: McpServerEntry[] = [
  {
    id: "filesystem",
    name: "Local Filesystem MCP",
    url: "http://127.0.0.1:3101/mcp",
    transport: "streamable_http",
    category: "filesystem",
    enabled: false,
  },
  {
    id: "github",
    name: "GitHub MCP",
    url: "http://127.0.0.1:3102/mcp",
    transport: "streamable_http",
    category: "github",
    enabled: false,
  },
  {
    id: "browser",
    name: "Browser Control MCP",
    url: "http://127.0.0.1:3103/mcp",
    transport: "streamable_http",
    category: "browser",
    enabled: false,
  },
  {
    id: "supabase",
    name: "Supabase MCP",
    url: "http://127.0.0.1:3104/mcp",
    transport: "streamable_http",
    category: "supabase",
    enabled: false,
  },
];

const SENSITIVE_TOOLS = new Set([
  "os_write_safe_file",
  "os_launch_application",
  "os_set_clipboard_text",
  "delete_file",
  "run_terminal",
  "git_push",
  "webhook_dispatch",
]);

class AngelMcpClientManager {
  private clients = new Map<string, Client>();
  private sessionAllowedTools = new Set<string>();
  private permissionHandler: PermissionHandler | null = null;

  public setPermissionHandler(handler: PermissionHandler | null) {
    this.permissionHandler = handler;
  }

  public getConfiguredServers(): McpServerEntry[] {
    try {
      const raw = localStorage.getItem(MCP_SERVERS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return DEFAULT_MCP_SERVERS;
  }

  public saveServers(servers: McpServerEntry[]) {
    localStorage.setItem(MCP_SERVERS_KEY, JSON.stringify(servers));
  }

  public async connectServer(entry: McpServerEntry): Promise<Client> {
    const existing = this.clients.get(entry.id);
    if (existing) return existing;

    const client = new Client(
      { name: "project-angel-desktop", version: "2.0.0" },
      { capabilities: {} }
    );

    const endpoint = new URL(entry.url);
    const transport =
      entry.transport === "sse"
        ? new SSEClientTransport(endpoint)
        : new StreamableHTTPClientTransport(endpoint);

    await client.connect(transport);
    this.clients.set(entry.id, client);
    return client;
  }

  public async listRemoteTools(entry: McpServerEntry) {
    const client = await this.connectServer(entry);
    const res = await client.listTools();
    return res.tools || [];
  }

  private async verifyPermission(
    toolName: string,
    serverOrScope: string,
    description: string,
    args: Record<string, unknown>,
    riskLevel: "sensitive" | "destructive" = "sensitive"
  ): Promise<boolean> {
    const key = `${serverOrScope}::${toolName}`;
    if (this.sessionAllowedTools.has(key)) return true;

    if (!this.permissionHandler) {
      // Fail-closed for sensitive/destructive tools if no UI gate is mounted
      return false;
    }

    const decision = await this.permissionHandler({
      id: `perm-${Date.now()}`,
      toolName,
      serverOrScope,
      description,
      argsPreview: JSON.stringify(args, null, 2).slice(0, 400),
      riskLevel,
    });

    if (decision === "allow_session") {
      this.sessionAllowedTools.add(key);
      return true;
    }
    return decision === "allow_once";
  }

  /**
   * Executes a remote MCP server tool with input sanitization, rate limiting, and IRIS permission gate.
   */
  public async callRemoteTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const rate = apiRateLimiter.checkAndConsume(`mcp:${serverId}`);
    if (!rate.allowed) {
      throw new Error(`Rate limit exceeded. Retry in ${Math.ceil(rate.retryAfterMs / 1000)}s.`);
    }

    const check = sanitizeToolArguments(toolName, args);
    if (!check.safe) {
      throw new Error(check.blockedReason || "Blocked by tool input sanitizer.");
    }

    const isSensitive =
      SENSITIVE_TOOLS.has(toolName) ||
      /delete|remove|write|exec|shell|push|send|post/i.test(toolName);

    if (isSensitive) {
      const approved = await this.verifyPermission(
        toolName,
        `MCP:${serverId}`,
        `Execute remote MCP tool "${toolName}" on server "${serverId}".`,
        check.sanitizedArgs,
        /delete|remove|exec|shell/i.test(toolName) ? "destructive" : "sensitive"
      );
      if (!approved) {
        throw new Error(`Permission denied by user for "${toolName}".`);
      }
    }

    const entry = this.getConfiguredServers().find((s) => s.id === serverId);
    if (!entry) throw new Error(`MCP server "${serverId}" not configured.`);
    const client = await this.connectServer(entry);
    return client.callTool({ name: toolName, arguments: check.sanitizedArgs });
  }

  /**
   * Executes a native Tauri Rust OS Control tool with IRIS Permission Gate & sanitization.
   */
  public async executeNativeOsTool(
    toolName:
      | "os_read_safe_file"
      | "os_write_safe_file"
      | "os_launch_application"
      | "os_get_clipboard_text"
      | "os_set_clipboard_text"
      | "os_inspect_active_window"
      | "os_capture_active_screen_base64",
    args: Record<string, unknown> = {}
  ): Promise<unknown> {
    const check = sanitizeToolArguments(toolName, args);
    if (!check.safe) {
      throw new Error(check.blockedReason || "Blocked by tool input sanitizer.");
    }

    if (SENSITIVE_TOOLS.has(toolName)) {
      const approved = await this.verifyPermission(
        toolName,
        "Native OS Bridge",
        `Execute local Windows OS action "${toolName}".`,
        check.sanitizedArgs,
        toolName === "os_write_safe_file" ? "destructive" : "sensitive"
      );
      if (!approved) {
        throw new Error(`Permission denied by user for "${toolName}".`);
      }
    }

    return invoke(toolName, check.sanitizedArgs);
  }
}

export const angelMcpClient = new AngelMcpClientManager();

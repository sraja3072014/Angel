import { invoke } from "@tauri-apps/api/core";
import { CloudBrainService } from "./cloudBrain";

export interface UiActionArgs {
  set_theme?: "light" | "dark";
  open_section?: "library" | "3d_workshop" | "settings" | "cybershield";
  speak?: string;
}

export interface AgentStepUpdate {
  step: number;
  status: "thinking" | "running" | "done" | "error";
  tool?: string;
  detail: string;
}

export interface AgentContext {
  brain: CloudBrainService;
  workspaceMode: string;
  screenBase64?: string;
  onUiAction: (args: UiActionArgs) => string;
  onStepUpdate?: (update: AgentStepUpdate) => void;
}

interface ParsedToolCall {
  tool: "exec_shell" | "read_file" | "write_file" | "ui_action";
  args: Record<string, any>;
}

const AGENT_SYSTEM_PROMPT = `You are Angel AI's Universal Autonomous Agent on Windows 11.
You have 4 general-purpose tools to accomplish ANY user request (launching apps like Notepad, creating files/folders on Desktop, reading/editing workspace code, changing Angel AI's UI theme/sections, or checking system info):

1. exec_shell: {"tool": "exec_shell", "args": {"command": "<PowerShell command>"}}
   - Example (write text & open Notepad): {"tool": "exec_shell", "args": {"command": "$p = \\"$env:USERPROFILE\\\\Desktop\\\\hello.txt\\"; Set-Content -Path $p -Value 'Hello world'; Start-Process notepad.exe $p"}}
   - Example (create Desktop folder): {"tool": "exec_shell", "args": {"command": "New-Item -ItemType Directory -Force -Path \\"$env:USERPROFILE\\\\Desktop\\\\NewFolder\\""}}
2. read_file: {"tool": "read_file", "args": {"path": "<file path>"}}
3. write_file: {"tool": "write_file", "args": {"path": "<file path>", "content": "<full UTF-8 content>"}}
4. ui_action: {"tool": "ui_action", "args": {"set_theme": "light"|"dark", "open_section": "library"|"3d_workshop"|"settings"|"cybershield", "speak": "<optional text>"}}

RULES:
- If the user asks you to perform an action, output ONLY a single valid JSON object matching one of the 4 tools above (no extra prose around the JSON).
- After receiving a tool Observation, decide whether another tool step is needed or if the task is complete.
- Once complete (or if no tool is needed), reply clearly and concisely in the user's language (Tamil, Tanglish, or English) WITHOUT any JSON tool call.`;

function extractToolCall(raw: string): ParsedToolCall | null {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();

  // Try direct JSON parse or first {...} block containing "tool"
  const jsonMatch = candidate.match(/\{[\s\S]*"tool"\s*:\s*"[^"]+"[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (
      parsed &&
      typeof parsed.tool === "string" &&
      ["exec_shell", "read_file", "write_file", "ui_action"].includes(parsed.tool)
    ) {
      return {
        tool: parsed.tool as ParsedToolCall["tool"],
        args: parsed.args && typeof parsed.args === "object" ? parsed.args : {},
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function shouldUseAutonomousAgent(prompt: string, workspaceMode: string): boolean {
  if (workspaceMode === "task") return true;
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();

  // Action/file/app/theme intent signals in English or Tamil
  const enAction =
    /\b(open|launch|start|create|make|write|edit|save|delete|remove|run|execute|read|check|list|switch|change|set)\b.*\b(notepad|folder|file|desktop|theme|light|dark|library|settings|cybershield|workshop|app|code|script|process|disk|cpu|ram|terminal)\b/i.test(
      lower
    );
  const taAction =
    /நோட்பேட்|ஃபோல்டர்|கோப்பு|டெஸ்க்டாப்|தீம்|லைட்|டார்க்|உருவாக்கு|எழுது|திற|மாற்று|கோடு/.test(trimmed);

  return enAction || taAction;
}

async function executeTool(call: ParsedToolCall, context: AgentContext): Promise<string> {
  try {
    if (call.tool === "exec_shell") {
      const command = String(call.args.command || "").trim();
      if (!command) return "Error: exec_shell requires a non-empty command.";
      const res = await invoke<{ ok: boolean; stdout: string; stderr: string }>("agent_exec_shell", { command });
      return JSON.stringify(res);
    }

    if (call.tool === "read_file") {
      const path = String(call.args.path || "").trim();
      if (!path) return "Error: read_file requires a path.";
      const content = await invoke<string>("agent_read_file", { path });
      return content.length > 4000 ? `${content.slice(0, 4000)}\n...[truncated]` : content;
    }

    if (call.tool === "write_file") {
      const path = String(call.args.path || "").trim();
      const content = String(call.args.content ?? "");
      if (!path) return "Error: write_file requires a path.";
      const writtenPath = await invoke<string>("agent_write_file", { path, content });
      return `Successfully wrote ${content.length} chars to ${writtenPath}`;
    }

    if (call.tool === "ui_action") {
      return context.onUiAction(call.args as UiActionArgs);
    }

    return "Unknown tool.";
  } catch (err: any) {
    return `Tool error: ${err?.message || String(err)}`;
  }
}

export async function runAutonomousAgent(
  userPrompt: string,
  context: AgentContext
): Promise<{ replyText: string; stepsUsed: string[] }> {
  const MAX_STEPS = 5;
  const stepsUsed: string[] = [];
  const scratchpad: string[] = [];

  for (let step = 1; step <= MAX_STEPS; step++) {
    context.onStepUpdate?.({
      step,
      status: "thinking",
      detail: step === 1 ? "Thinking..." : `Thinking (Step ${step}/${MAX_STEPS})...`,
    });

    const turnPrompt =
      scratchpad.length === 0
        ? `${AGENT_SYSTEM_PROMPT}\n\nUSER REQUEST:\n${userPrompt}`
        : `${AGENT_SYSTEM_PROMPT}\n\nUSER REQUEST:\n${userPrompt}\n\nEXECUTION HISTORY:\n${scratchpad.join(
            "\n"
          )}\n\nContinue: either emit the next JSON tool call or provide the final response to the user.`;

    const llmReply = await context.brain.askGemini(turnPrompt, {
      screenBase64: step === 1 ? context.screenBase64 : undefined,
    });

    const toolCall = extractToolCall(llmReply);
    if (!toolCall) {
      context.onStepUpdate?.({
        step,
        status: "done",
        detail: stepsUsed.length > 0 ? `Done (${stepsUsed.join(" -> ")})` : "Done",
      });
      return { replyText: llmReply.trim(), stepsUsed };
    }

    stepsUsed.push(toolCall.tool);
    context.onStepUpdate?.({
      step,
      status: "running",
      tool: toolCall.tool,
      detail: `Running: ${toolCall.tool}`,
    });

    const observation = await executeTool(toolCall, context);
    scratchpad.push(
      `Step ${step} Action: ${JSON.stringify(toolCall)}\nStep ${step} Observation: ${observation}`
    );
  }

  context.onStepUpdate?.({
    step: MAX_STEPS,
    status: "done",
    detail: `Done (${stepsUsed.join(" -> ")})`,
  });

  const summaryReply = await context.brain.askGemini(
    `Summarize the completed actions concisely for the user in their language (Tamil/English):\nUser request: ${userPrompt}\nActions:\n${scratchpad.join(
      "\n"
    )}`
  );
  return { replyText: summaryReply.trim(), stepsUsed };
}

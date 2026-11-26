import { invoke } from "@tauri-apps/api/core";

export interface SmartReminderEntry {
  id: string;
  category: string;
  title: string;
  when: string;
  note?: string;
}

export interface LiveBriefingPayload {
  kind: "live_briefing";
  location: string;
  temperatureC: string;
  condition: string;
  humidity: string;
  wind: string;
  isLiveWeather: boolean;
  reminders: SmartReminderEntry[];
}

export interface GeneratedCodePayload {
  kind: "generated_code";
  componentName: string;
  fileName: string;
  savedPath: string;
  wroteToDisk: boolean;
  code: string;
  previewType: "calculator" | "timer" | "todo" | "generic";
}

export interface AppCopilotPayload {
  kind: "app_copilot";
  appName: string;
  workflowTitle: string;
  activeWindowNote: string;
  shortcuts: string[];
  steps: string[];
}

export type ActionPayload = LiveBriefingPayload | GeneratedCodePayload | AppCopilotPayload;

export interface ActionExecutionResult {
  handled: boolean;
  actionLabel: string;
  replyText: string;
  payload?: ActionPayload;
}

function loadSavedReminders(): SmartReminderEntry[] {
  try {
    const raw = localStorage.getItem("angel_smart_reminders");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function fetchLiveWeatherSafe(): Promise<{
  location: string;
  temperatureC: string;
  condition: string;
  humidity: string;
  wind: string;
  isLiveWeather: boolean;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch("https://wttr.in/?format=j1", { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const cur = data?.current_condition?.[0];
    const area = data?.nearest_area?.[0];
    const city = area?.areaName?.[0]?.value || "Local Area";
    const region = area?.country?.[0]?.value || "";
    const temp = cur?.temp_C ? `${cur.temp_C}°C` : "--°C";
    const desc = cur?.weatherDesc?.[0]?.value || "Clear";
    const humidity = cur?.humidity ? `${cur.humidity}%` : "--";
    const wind = cur?.windspeedKmph ? `${cur.windspeedKmph} km/h` : "--";
    return {
      location: region ? `${city}, ${region}` : city,
      temperatureC: temp,
      condition: desc,
      humidity,
      wind,
      isLiveWeather: true,
    };
  } catch {
    return {
      location: "Local Desktop",
      temperatureC: "--",
      condition: "Offline / Weather service unavailable",
      humidity: "--",
      wind: "--",
      isLiveWeather: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildGeneratedTemplate(promptLower: string): {
  componentName: string;
  fileName: string;
  previewType: "calculator" | "timer" | "todo" | "generic";
  code: string;
} {
  if (promptLower.includes("calculator") || promptLower.includes("கால்குலேட்டர்")) {
    return {
      componentName: "CalculatorWidget",
      fileName: "CalculatorWidget.tsx",
      previewType: "calculator",
      code: `import { useState } from "react";

export function CalculatorWidget() {
  const [expr, setExpr] = useState("0");
  const press = (val: string) => {
    if (val === "C") return setExpr("0");
    if (val === "=") {
      try {
        const sanitized = expr.replace(/[^0-9+\\-*/().]/g, "");
        const result = Function(\`"use strict"; return (\${sanitized})\`)();
        setExpr(String(result ?? "0"));
      } catch {
        setExpr("Error");
      }
      return;
    }
    setExpr((prev) => (prev === "0" || prev === "Error" ? val : prev + val));
  };
  const keys = ["7","8","9","/","4","5","6","*","1","2","3","-","0",".","=","+","C"];
  return (
    <div className="p-4 rounded-2xl bg-slate-900/90 border border-cyan-400/30 w-64 space-y-3 text-white">
      <div className="px-3 py-2 rounded-xl bg-black/60 font-mono text-right text-lg text-cyan-300 truncate">{expr}</div>
      <div className="grid grid-cols-4 gap-1.5">
        {keys.map((k) => (
          <button key={k} onClick={() => press(k)} className="py-2 rounded-lg bg-white/10 hover:bg-cyan-500/30 font-bold text-xs">
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
`,
    };
  }

  if (promptLower.includes("timer") || promptLower.includes("stopwatch")) {
    return {
      componentName: "FocusTimerWidget",
      fileName: "FocusTimerWidget.tsx",
      previewType: "timer",
      code: `import { useEffect, useState } from "react";

export function FocusTimerWidget() {
  const [seconds, setSeconds] = useState(1500);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running || seconds <= 0) return;
    const id = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [running, seconds]);
  const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");
  return (
    <div className="p-4 rounded-2xl bg-slate-900/90 border border-emerald-400/30 w-64 space-y-3 text-white text-center">
      <div className="text-3xl font-black font-mono text-emerald-300">{mins}:{secs}</div>
      <div className="flex gap-2 justify-center">
        <button onClick={() => setRunning((r) => !r)} className="px-3 py-1.5 rounded-lg bg-emerald-500/25 text-xs font-bold">{running ? "Pause" : "Start"}</button>
        <button onClick={() => { setRunning(false); setSeconds(1500); }} className="px-3 py-1.5 rounded-lg bg-white/10 text-xs font-bold">Reset</button>
      </div>
    </div>
  );
}
`,
    };
  }

  if (promptLower.includes("todo") || promptLower.includes("to-do") || promptLower.includes("checklist")) {
    return {
      componentName: "QuickTodoWidget",
      fileName: "QuickTodoWidget.tsx",
      previewType: "todo",
      code: `import { useState } from "react";

export function QuickTodoWidget() {
  const [items, setItems] = useState<string[]>(["Review today's tasks", "Ship Angel AI update"]);
  const [draft, setDraft] = useState("");
  return (
    <div className="p-4 rounded-2xl bg-slate-900/90 border border-cyan-400/30 w-72 space-y-2.5 text-white">
      <div className="flex gap-1.5">
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add item..." className="flex-1 px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/10 text-xs" />
        <button onClick={() => { if (draft.trim()) { setItems((p) => [...p, draft.trim()]); setDraft(""); } }} className="px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 font-bold text-xs">Add</button>
      </div>
      <ul className="space-y-1 text-xs text-slate-200">
        {items.map((it, idx) => <li key={idx} className="px-2 py-1 rounded bg-white/5">• {it}</li>)}
      </ul>
    </div>
  );
}
`,
    };
  }

  return {
    componentName: "CustomMiniApp",
    fileName: "CustomMiniApp.tsx",
    previewType: "generic",
    code: `import { useState } from "react";

export function CustomMiniApp() {
  const [count, setCount] = useState(0);
  return (
    <div className="p-4 rounded-2xl bg-slate-900/90 border border-cyan-400/30 w-64 space-y-3 text-white text-center">
      <div className="text-xs font-bold uppercase tracking-wider text-cyan-300">Angel Generated Widget</div>
      <div className="text-2xl font-black font-mono">{count}</div>
      <button onClick={() => setCount((c) => c + 1)} className="px-4 py-1.5 rounded-lg bg-cyan-500 text-slate-950 font-bold text-xs">Increment</button>
    </div>
  );
}
`,
  };
}

export async function executeActionIntent(prompt: string): Promise<ActionExecutionResult> {
  const trimmed = prompt.trim();
  const lower = trimmed.toLowerCase();

  // 1. Weather + Today's Reminders Live Briefing Trigger
  const isWeatherOrReminder =
    !lower.includes("news") &&
    (/\b(weather|forecast|temperature|climate|reminder|reminders|today update|today's update|briefing)\b/i.test(lower) ||
      /வெதர்|வானிலை|ரிமைண்டர்|நினைவூட்டல்|இன்னைக்கு/.test(trimmed));

  if (isWeatherOrReminder) {
    const [weather, reminders] = await Promise.all([fetchLiveWeatherSafe(), Promise.resolve(loadSavedReminders())]);
    const reminderSummary =
      reminders.length > 0
        ? `You have ${reminders.length} reminder(s) saved (top: "${reminders[0].title}" at ${reminders[0].when}).`
        : "No reminders saved yet for today.";
    const weatherSummary = weather.isLiveWeather
      ? `Weather in ${weather.location}: ${weather.temperatureC}, ${weather.condition} (Humidity ${weather.humidity}).`
      : `Live weather is offline right now; showing your saved reminders.`;

    return {
      handled: true,
      actionLabel: "Live Weather & Reminders Card",
      replyText: `${weatherSummary} ${reminderSummary}`,
      payload: {
        kind: "live_briefing",
        ...weather,
        reminders,
      },
    };
  }

  // 2. Direct Code / Mini-App Builder Trigger
  const isCodeBuilder =
    /\b(create|build|generate|make)\s+(a|an)?\s*(calculator|timer|stopwatch|todo|to-do|checklist|counter|mini[- ]?app|widget|component)\b/i.test(
      lower
    ) || /கால்குலேட்டர்|கிரியேட் பண்ணு|உருவாக்கு/.test(trimmed);

  if (isCodeBuilder) {
    const tpl = buildGeneratedTemplate(lower);
    let savedPath = `src/components/generated/${tpl.fileName}`;
    let wroteToDisk = false;
    try {
      savedPath = await invoke<string>("write_generated_component", {
        fileName: tpl.fileName,
        content: tpl.code,
      });
      wroteToDisk = true;
    } catch {
      wroteToDisk = false;
    }

    return {
      handled: true,
      actionLabel: wroteToDisk ? `Generated & Saved ${tpl.fileName}` : `Generated ${tpl.fileName} Preview`,
      replyText: wroteToDisk
        ? `Created ${tpl.componentName} and saved it to ${savedPath}. Interactive preview is ready below.`
        : `Generated ${tpl.componentName} (${tpl.fileName}). Interactive preview and source code are ready below.`,
      payload: {
        kind: "generated_code",
        componentName: tpl.componentName,
        fileName: tpl.fileName,
        savedPath,
        wroteToDisk,
        code: tpl.code,
        previewType: tpl.previewType,
      },
    };
  }

  // 3. Desktop / Creative App Co-Pilot (Photoshop Background Removal & Active Window Guidance)
  const isAppCopilot =
    /\b(photoshop|remove background|background remove|bg remove|cutout|layer mask|premiere|illustrator)\b/i.test(
      lower
    ) || /பேக்ரவுண்ட் ரிமூவ்|போட்டோஷாப்/.test(trimmed);

  if (isAppCopilot) {
    return {
      handled: true,
      actionLabel: "App Co-Pilot • Photoshop Workflow",
      replyText:
        "Photoshop Co-Pilot ready: use the Contextual Taskbar's Remove Background button or Select -> Subject + Layer Mask for clean non-destructive edges.",
      payload: {
        kind: "app_copilot",
        appName: "Adobe Photoshop",
        workflowTitle: "Clean Subject Cutout & Background Removal",
        activeWindowNote: "Detected Creative App Co-Pilot • Non-destructive Layer Mask workflow",
        shortcuts: ["Ctrl + J (Duplicate Layer)", "W (Object Selection)", "Alt + Ctrl + R (Select & Mask)", "Ctrl + I (Invert Mask)"],
        steps: [
          "1. Unlock the Background layer or press Ctrl + J to duplicate your subject layer.",
          "2. In the floating Contextual Taskbar, click 'Remove Background' (or go to Select -> Subject).",
          "3. Press Alt + Ctrl + R (Select and Mask) and refine hair/soft edges with the Refine Edge Brush (R).",
          "4. Set Output To: 'Layer Mask' and click OK so edges stay 100% editable.",
          "5. Export via File -> Export -> Export As -> PNG (Transparency checked).",
        ],
      },
    };
  }

  return { handled: false, actionLabel: "", replyText: "" };
}

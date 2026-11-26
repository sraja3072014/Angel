import { useEffect, useState } from "react";
import {
  CloudSun,
  CalendarClock,
  Code2,
  Copy,
  Check,
  Sparkles,
  ChevronDown,
  ChevronUp,
  FolderCheck,
} from "lucide-react";
import { ActionPayload } from "../services/actionExecutor";

function InlineMiniCalculator() {
  const [expr, setExpr] = useState("0");
  const press = (val: string) => {
    if (val === "C") return setExpr("0");
    if (val === "=") {
      try {
        const sanitized = expr.replace(/[^0-9+\-*/().]/g, "");
        const res = Function(`"use strict"; return (${sanitized})`)();
        setExpr(String(res ?? "0"));
      } catch {
        setExpr("Error");
      }
      return;
    }
    setExpr((prev) => (prev === "0" || prev === "Error" ? val : prev + val));
  };
  const keys = ["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "=", "+", "C"];
  return (
    <div className="p-3 rounded-xl bg-black/50 border border-cyan-400/25 w-56 space-y-2">
      <div className="px-2.5 py-1.5 rounded-lg bg-slate-950/90 font-mono text-right text-sm text-cyan-300 truncate">
        {expr}
      </div>
      <div className="grid grid-cols-4 gap-1">
        {keys.map((k) => (
          <button
            key={k}
            onClick={() => press(k)}
            className="py-1.5 rounded-md bg-white/10 hover:bg-cyan-500/30 font-bold text-[11px] text-white transition"
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}

function InlineMiniTimer() {
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
    <div className="p-3 rounded-xl bg-black/50 border border-emerald-400/25 w-56 space-y-2 text-center">
      <div className="text-2xl font-black font-mono text-emerald-300">
        {mins}:{secs}
      </div>
      <div className="flex gap-2 justify-center">
        <button
          onClick={() => setRunning((r) => !r)}
          className="px-3 py-1 rounded-lg bg-emerald-500/25 hover:bg-emerald-500/35 text-emerald-200 text-xs font-bold"
        >
          {running ? "Pause" : "Start"}
        </button>
        <button
          onClick={() => {
            setRunning(false);
            setSeconds(1500);
          }}
          className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 text-xs font-bold"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

function InlineMiniTodo() {
  const [items, setItems] = useState<string[]>(["Review today's tasks", "Ship Angel AI update"]);
  const [draft, setDraft] = useState("");
  return (
    <div className="p-3 rounded-xl bg-black/50 border border-cyan-400/25 w-64 space-y-2">
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add item..."
          className="flex-1 px-2 py-1 rounded-lg bg-slate-950/80 border border-white/10 text-xs text-white focus:outline-none"
        />
        <button
          onClick={() => {
            if (draft.trim()) {
              setItems((p) => [...p, draft.trim()]);
              setDraft("");
            }
          }}
          className="px-2.5 py-1 rounded-lg bg-cyan-500 text-slate-950 font-bold text-xs"
        >
          Add
        </button>
      </div>
      <ul className="space-y-1 text-[11px] text-slate-200 max-h-24 overflow-y-auto">
        {items.map((it, idx) => (
          <li key={idx} className="px-2 py-1 rounded bg-white/5 truncate">
            • {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ActionResultCard({ payload }: { payload: ActionPayload }) {
  const [copied, setCopied] = useState(false);
  const [showSteps, setShowSteps] = useState(true);
  const [showCode, setShowCode] = useState(false);

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (payload.kind === "live_briefing") {
    return (
      <div className="mt-3 p-3.5 rounded-2xl bg-slate-950/75 border border-cyan-400/30 space-y-3 animate-in fade-in duration-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-cyan-200">
            <CloudSun size={15} className="text-amber-300" />
            <span>{payload.location}</span>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
              payload.isLiveWeather
                ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-300"
                : "bg-slate-800 border-white/10 text-slate-400"
            }`}
          >
            {payload.isLiveWeather ? "LIVE WEATHER" : "OFFLINE FALLBACK"}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[10px] text-slate-400">Temp</div>
            <div className="text-sm font-black text-white">{payload.temperatureC}</div>
          </div>
          <div className="p-2 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[10px] text-slate-400">Humidity</div>
            <div className="text-sm font-black text-cyan-300">{payload.humidity}</div>
          </div>
          <div className="p-2 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[10px] text-slate-400">Wind</div>
            <div className="text-sm font-black text-emerald-300">{payload.wind}</div>
          </div>
        </div>
        <div className="text-[11px] text-slate-300">{payload.condition}</div>

        <div className="pt-2 border-t border-white/10 space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-cyan-300">
            <CalendarClock size={13} />
            <span>Today&apos;s Reminders ({payload.reminders.length})</span>
          </div>
          {payload.reminders.length === 0 ? (
            <div className="text-[11px] text-slate-400">No reminders saved yet. Add them in Menu → General.</div>
          ) : (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {payload.reminders.map((r) => (
                <div
                  key={r.id}
                  className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 flex items-center justify-between gap-2 text-[11px]"
                >
                  <span className="text-white font-semibold truncate">{r.title}</span>
                  <span className="text-cyan-300 font-mono text-[10px] shrink-0">{r.when}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (payload.kind === "generated_code") {
    return (
      <div className="mt-3 p-3.5 rounded-2xl bg-slate-950/75 border border-emerald-400/30 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-200">
            <FolderCheck size={14} className="text-emerald-400" />
            <span>{payload.savedPath}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowCode((v) => !v)}
              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-[11px] font-bold text-slate-200 flex items-center gap-1"
            >
              <Code2 size={12} />
              <span>{showCode ? "Hide Code" : "View Code"}</span>
            </button>
            <button
              onClick={() => copyText(payload.code)}
              className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-[11px] font-bold text-cyan-200 flex items-center gap-1"
            >
              {copied ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
        </div>

        <div className="flex justify-center py-1">
          {payload.previewType === "calculator" && <InlineMiniCalculator />}
          {payload.previewType === "timer" && <InlineMiniTimer />}
          {payload.previewType === "todo" && <InlineMiniTodo />}
          {payload.previewType === "generic" && (
            <div className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-cyan-200">
              {payload.componentName} ready at {payload.savedPath}
            </div>
          )}
        </div>

        {showCode && (
          <pre className="p-3 rounded-xl bg-black/80 border border-white/10 text-[11px] font-mono text-cyan-200 overflow-x-auto max-h-48 overflow-y-auto">
            {payload.code}
          </pre>
        )}
      </div>
    );
  }

  // App Co-Pilot Card
  return (
    <div className="mt-3 p-3.5 rounded-2xl bg-slate-950/75 border border-purple-400/35 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-purple-200">
          <Sparkles size={14} className="text-purple-400" />
          <span>
            {payload.appName} • {payload.workflowTitle}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowSteps((v) => !v)}
            className="px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/40 text-[11px] font-bold text-purple-200 flex items-center gap-1"
          >
            {showSteps ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            <span>{showSteps ? "Hide Guide" : "Show Step-by-Step Guide"}</span>
          </button>
          <button
            onClick={() => copyText(payload.steps.join("\n"))}
            className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-[11px] font-bold text-cyan-200 flex items-center gap-1"
          >
            {copied ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />}
            <span>{copied ? "Copied" : "Copy Steps"}</span>
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {payload.shortcuts.map((sc, i) => (
          <span
            key={i}
            className="px-2 py-0.5 rounded-md bg-black/50 border border-white/10 font-mono text-[10px] text-cyan-200"
          >
            {sc}
          </span>
        ))}
      </div>

      {showSteps && (
        <div className="space-y-1 pt-1 text-[11.5px] text-slate-200">
          {payload.steps.map((step, i) => (
            <div key={i} className="px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/5">
              {step}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

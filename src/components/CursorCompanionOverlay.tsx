import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Sparkles,
  ClipboardCopy,
  Camera,
  Send,
  X,
  Check,
} from "lucide-react";
import { cloudBrain } from "../services/cloudBrain";

interface ActiveAppContext {
  app_name: string;
  process_name: string;
  window_title: string;
  is_supported_copilot: boolean;
}

interface CursorCompanionOverlayProps {
  lastAssistantText?: string;
  onSendPrompt?: (prompt: string, screenImage?: string) => void;
  speaking?: boolean;
}

export function CursorCompanionOverlay({
  lastAssistantText = "",
  onSendPrompt: _onSendPrompt,
  speaking = false,
}: CursorCompanionOverlayProps) {
  const [enabled, setEnabled] = useState<boolean>(() => {
    return localStorage.getItem("angel_cursor_companion_enabled") === "true";
  });

  const [activeTheme, setActiveTheme] = useState<string>(() => {
    return localStorage.getItem("angel_3d_core_theme") || "quantum_gyro";
  });

  const [isOpen, setIsOpen] = useState(false);
  const [activeApp, setActiveApp] = useState<ActiveAppContext>({
    app_name: "Active Application",
    process_name: "desktop.exe",
    window_title: "Windows Desktop",
    is_supported_copilot: false,
  });

  const [promptText, setPromptText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [quickAnswer, setQuickAnswer] = useState("");
  const [pastedStatus, setPastedStatus] = useState<string | null>(null);

  // Position & Velocity Lerp Refs
  const targetPos = useRef({ x: 300, y: 300 });
  const currentPos = useRef({ x: 300, y: 300 });
  const opacityRef = useRef(1.0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Listen to toggle and theme events
  useEffect(() => {
    const handleToggle = (e: any) => {
      if (e.detail?.enabled !== undefined) {
        setEnabled(e.detail.enabled);
      }
    };
    const handleThemeChange = (e: any) => {
      if (e.detail?.theme) {
        setActiveTheme(e.detail.theme);
      }
    };
    const handleSummon = () => {
      setIsOpen((prev) => !prev);
    };

    window.addEventListener("angel-cursor-companion-toggle", handleToggle);
    window.addEventListener("angel-3d-theme-changed", handleThemeChange);
    window.addEventListener("angel-summon-copilot", handleSummon);

    return () => {
      window.removeEventListener("angel-cursor-companion-toggle", handleToggle);
      window.removeEventListener("angel-3d-theme-changed", handleThemeChange);
      window.removeEventListener("angel-summon-copilot", handleSummon);
    };
  }, []);

  // Global Mouse Tracking & Fluid Spring Animation
  useEffect(() => {
    if (!enabled) return;

    const handleMouseMove = (e: MouseEvent) => {
      targetPos.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener("mousemove", handleMouseMove);

    let animId: number;
    const updateSpring = () => {
      animId = requestAnimationFrame(updateSpring);
      if (!containerRef.current) return;

      const targetX = targetPos.current.x + 34; // Safe offset so it never blocks clicks
      const targetY = targetPos.current.y + 34;

      const dx = targetX - currentPos.current.x;
      const dy = targetY - currentPos.current.y;
      const speed = Math.hypot(dx, dy);

      currentPos.current.x += dx * 0.15;
      currentPos.current.y += dy * 0.15;

      // Auto-fade slightly during rapid mouse flicks, restore when still
      const targetOpacity = speed > 28 ? 0.38 : 1.0;
      opacityRef.current += (targetOpacity - opacityRef.current) * 0.12;

      // Keep within viewport boundaries
      const maxX = window.innerWidth - (isOpen ? 380 : 120);
      const maxY = window.innerHeight - (isOpen ? 440 : 120);
      const clampedX = Math.max(16, Math.min(maxX, currentPos.current.x));
      const clampedY = Math.max(16, Math.min(maxY, currentPos.current.y));

      containerRef.current.style.transform = `translate3d(${clampedX}px, ${clampedY}px, 0)`;
      if (!isOpen) {
        containerRef.current.style.opacity = opacityRef.current.toFixed(2);
      } else {
        containerRef.current.style.opacity = "1.0";
      }
    };

    updateSpring();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [enabled, isOpen]);

  // Fetch Active Foreground Application Context on Popover Open
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const fetchContext = async () => {
      try {
        const raw = await invoke<string>("get_active_window_context");
        if (raw && isMounted) {
          const parsed: ActiveAppContext = JSON.parse(raw);
          setActiveApp(parsed);
        }
      } catch (e) {
        console.warn("Failed to get active window context:", e);
      }
    };

    fetchContext();
    const interval = setInterval(fetchContext, 2500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isOpen]);

  if (!enabled) return null;

  // Insert Text at Active Cursor in foreground app
  const handleInsertAtCursor = async (textToInsert: string) => {
    const text = textToInsert || quickAnswer || lastAssistantText;
    if (!text.trim()) {
      setPastedStatus("No text to insert.");
      setTimeout(() => setPastedStatus(null), 2000);
      return;
    }

    try {
      setPastedStatus("Inserting...");
      await invoke<string>("insert_text_at_active_cursor", { text });
      setPastedStatus(`Pasted into ${activeApp.app_name}!`);
      setTimeout(() => setPastedStatus(null), 2500);
    } catch (err: any) {
      setPastedStatus(`Error: ${err?.message || err}`);
      setTimeout(() => setPastedStatus(null), 3000);
    }
  };

  // Screen Vision quick trigger
  const handleInspectScreen = async () => {
    setIsProcessing(true);
    setQuickAnswer("Capturing screen and analyzing active app context...");
    try {
      const b64 = await invoke<string>("capture_screen_base64");
      const prompt = `Inspect this active desktop window (${activeApp.app_name}: ${activeApp.window_title}). Provide concise tactical guidance, shortcuts, or copy-paste content for this task.`;

      const response = await cloudBrain.askGemini(prompt, {
        screenBase64: b64,
        onChunk: (chunk) => setQuickAnswer(chunk),
      });

      setQuickAnswer(response);
    } catch (err: any) {
      setQuickAnswer(`Inspection failed: ${err?.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptText.trim()) return;

    const userQ = promptText.trim();
    setPromptText("");
    setIsProcessing(true);
    setQuickAnswer("");

    try {
      const contextualPrompt = `[Foreground App: ${activeApp.app_name} | Window: ${activeApp.window_title}]\n${userQ}`;
      const response = await cloudBrain.askGemini(contextualPrompt, {
        onChunk: (chunk) => setQuickAnswer(chunk),
      });
      setQuickAnswer(response);
    } catch (err: any) {
      setQuickAnswer(`Error: ${err?.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="fixed top-0 left-0 z-50 pointer-events-auto transition-transform duration-75 ease-out select-none"
      style={{ willChange: "transform, opacity" }}
    >
      {!isOpen ? (
        /* Floating Mini 3D Companion Orb Pill */
        <div
          onClick={() => setIsOpen(true)}
          className="group cursor-pointer flex items-center gap-2 p-1.5 pr-3 rounded-full bg-slate-950/80 border border-cyan-400/40 backdrop-blur-xl shadow-[0_0_20px_rgba(34,211,238,0.3)] hover:scale-105 hover:border-cyan-300 transition-all active:scale-95"
          title="Angel AI Co-Pilot (Click or Alt+Space)"
        >
          {/* Mini 3D Core Orb */}
          <div className="relative w-8 h-8 rounded-full flex items-center justify-center overflow-hidden">
            {activeTheme === "quantum_gyro" && (
              <div className="w-8 h-8 rounded-full border border-cyan-400/90 animate-[spin_4s_linear_infinite] flex items-center justify-center shadow-[0_0_12px_rgba(34,211,238,0.8)]">
                <div className="w-5 h-5 rounded-full border border-amber-400/90 animate-[spin_2s_linear_infinite_reverse] flex items-center justify-center">
                  <div className={`w-2.5 h-2.5 rounded-full bg-cyan-300 shadow-[0_0_8px_#22d3ee] ${speaking ? "animate-ping" : ""}`} />
                </div>
              </div>
            )}

            {activeTheme === "neural_synapse" && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 via-indigo-500 to-cyan-500 shadow-[0_0_12px_rgba(168,85,247,0.8)] flex items-center justify-center animate-pulse border border-purple-400">
                <div className="w-3 h-3 rounded-full bg-white shadow-[0_0_6px_#fff]" />
              </div>
            )}

            {activeTheme === "orbital_earth" && (
              <>
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-cyan-600 via-emerald-500 to-indigo-600 shadow-[0_0_12px_rgba(6,182,212,0.7)] flex items-center justify-center animate-[spin_10s_linear_infinite] border border-cyan-400">
                  <div className="w-2 h-2 rounded-full bg-emerald-300/60 blur-[0.5px]" />
                </div>
                <div className="absolute inset-0 rounded-full border border-cyan-300/50 rotate-45 scale-110 pointer-events-none" />
              </>
            )}

            {activeTheme === "volumetric_hologram" && (
              <>
                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-teal-500 via-cyan-400 to-blue-600 shadow-[0_0_12px_rgba(20,184,166,0.8)] flex items-center justify-center border border-teal-300 animate-[spin_5s_linear_infinite]">
                  <div className="w-2.5 h-2.5 rounded-full bg-cyan-100 blur-[0.5px]" />
                </div>
                <div className="absolute inset-0 rounded-full border border-teal-300/50 rotate-12 scale-110 pointer-events-none" />
              </>
            )}
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] font-extrabold tracking-wider text-cyan-200 uppercase font-mono">
              CO-PILOT
            </span>
            <span className="text-[9px] text-slate-400 font-mono">
              Alt + Space
            </span>
          </div>
        </div>
      ) : (
        /* Sleek Context Co-Pilot Popover Card */
        <div className="w-80 rounded-2xl bg-slate-950/95 border border-cyan-400/50 backdrop-blur-2xl shadow-[0_0_35px_rgba(34,211,238,0.25)] p-4 space-y-3 animate-in fade-in zoom-in-95 duration-150">
          {/* Header & Active App Badge */}
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center shrink-0">
                <Sparkles size={13} className="text-cyan-400" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold text-white truncate flex items-center gap-1.5">
                  <span>{activeApp.app_name}</span>
                  {activeApp.is_supported_copilot && (
                    <span className="px-1.5 py-0.2 rounded text-[8px] font-mono bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-400/40">
                      OPTIMIZED
                    </span>
                  )}
                </div>
                <div className="text-[9px] text-slate-400 font-mono truncate">
                  {activeApp.process_name}
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
              title="Close Co-Pilot popover"
            >
              <X size={15} />
            </button>
          </div>

          {/* Quick Action Pills: Insert at Cursor & Screen Vision */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleInsertAtCursor(quickAnswer || lastAssistantText)}
              className="px-2.5 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-[11px] font-bold flex items-center justify-center gap-1.5 transition active:scale-95"
              title="Paste generated text into active cursor"
            >
              <ClipboardCopy size={13} />
              <span>Insert at Cursor</span>
            </button>

            <button
              onClick={handleInspectScreen}
              disabled={isProcessing}
              className="px-2.5 py-1.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/40 text-indigo-200 text-[11px] font-bold flex items-center justify-center gap-1.5 transition active:scale-95 disabled:opacity-50"
              title="Analyze active screen context"
            >
              <Camera size={13} />
              <span>Screen Vision</span>
            </button>
          </div>

          {/* Feedback or Insertion Toast */}
          {pastedStatus && (
            <div className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[11px] font-mono flex items-center gap-1.5 animate-pulse">
              <Check size={12} />
              <span>{pastedStatus}</span>
            </div>
          )}

          {/* Quick Response Preview (if generated) */}
          {(quickAnswer || lastAssistantText) && (
            <div className="max-h-28 overflow-y-auto p-2.5 rounded-xl bg-black/50 border border-white/10 text-xs text-slate-200 leading-relaxed font-sans space-y-1">
              <div className="text-[10px] font-bold text-cyan-400 flex items-center justify-between">
                <span>{quickAnswer ? "CO-PILOT RESPONSE" : "LAST CHAT RESPONSE"}</span>
                <button
                  onClick={() => handleInsertAtCursor(quickAnswer || lastAssistantText)}
                  className="hover:underline text-[9px] text-slate-300"
                >
                  Insert (^V)
                </button>
              </div>
              <div className="text-[11px] line-clamp-4">
                {quickAnswer || lastAssistantText}
              </div>
            </div>
          )}

          {/* Instant Prompt Input */}
          <form onSubmit={handleQuickSubmit} className="relative">
            <input
              type="text"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder={`Ask Angel in ${activeApp.app_name}...`}
              className="w-full pl-3 pr-9 py-2 bg-black/60 border border-white/15 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-sans transition"
            />
            <button
              type="submit"
              disabled={!promptText.trim() || isProcessing}
              className="absolute right-1.5 top-1.5 p-1 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition disabled:opacity-40"
            >
              <Send size={12} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

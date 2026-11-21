import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Mic,
  Settings,
  Shield,
  Send,
  X,
  Globe,
  Activity,
  Stethoscope,
  Clock,
  Radio,
  AlertTriangle,
  Lock,
  Eye,
} from "lucide-react";
import "./App.css";
import { CloudBrainService } from "./services/cloudBrain";
import { AngelVoiceEngine } from "./services/voiceEngine";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { HoloEarthStage } from "./components/HoloEarthStage";

interface ThreatAlertPayload {
  file_name: string;
  file_path: string;
  sha256: string;
  risk_level: string;
  threat_type: string;
  timestamp: string;
}

interface SchedulerAlertPayload {
  task_id: string;
  title: string;
  message: string;
  timestamp: string;
}

const brain = new CloudBrainService();

export default function App() {
  const voiceRef = useRef<AngelVoiceEngine | null>(null);

  const [ramMb, setRamMb] = useState<string>("28.0");
  const [input, setInput] = useState("");
  const [reply, setReply] = useState("Welcome Raja! Project Angel V3 Global Command Center is online.");
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [wakeEnabled, setWakeEnabled] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeThreat, setActiveThreat] = useState<ThreatAlertPayload | null>(null);

  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const clockTimer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  const formattedTime = now.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const formattedDate = now.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });

  const handleCommand = async (userCmd: string) => {
    if (!userCmd.trim()) return;
    setReply("Processing...");

    try {
      const localRes = await invoke<string>("execute_os_reflex", { command: userCmd });
      if (localRes !== "CLOUD_BRAIN") {
        setReply(localRes);
        voiceRef.current?.speak(localRes, () => setSpeaking(true), () => setSpeaking(false));
        return;
      }
    } catch {}

    // Streaming Gemini AI with immediate first-sentence speech
    const aiReply = await brain.askGemini(userCmd, {
      onChunk: (partialText) => setReply(partialText),
      onFirstSentence: (firstSentence) => {
        voiceRef.current?.speak(firstSentence, () => setSpeaking(true), () => setSpeaking(false));
      },
    });
    setReply(aiReply);
  };

  const handleScreenVision = async () => {
    setReply("Screen Vision: Capturing primary screen in RAM...");
    try {
      const b64 = await invoke<string>("capture_screen_base64");
      setReply("Screen Vision: Analyzing live screen with Gemini Multimodal AI...");
      const prompt = "Look at my screen right now. Explain what is visible, diagnose any open dialogs or errors, and provide a helpful summary.";
      const aiReply = await brain.askGemini(prompt, {
        screenBase64: b64,
        onChunk: (partial) => setReply(partial),
        onFirstSentence: (first) => {
          voiceRef.current?.speak(first, () => setSpeaking(true), () => setSpeaking(false));
        },
      });
      setReply(aiReply);
    } catch (err: any) {
      setReply(`Screen Vision: ${err}`);
    }
  };

  useEffect(() => {
    voiceRef.current = new AngelVoiceEngine(
      () => {
        // Wake detected
        setReply("Listening: 'Hey Angel' detected...");
        setListening(true);
      },
      (cmd: string) => handleCommand(cmd),
      (status: string, isListening: boolean) => {
        setReply(status);
        setListening(isListening);
      },
      (level: number) => {
        setAudioLevel(level);
      }
    );

    // Start listening for remote commands dispatched from Android companion
    brain.startMobileRelayListener((mobileCmd) => {
      handleCommand(mobileCmd);
    });
  }, []);

  // Rust Real-Time AI Antivirus Alert Listener
  useEffect(() => {
    const handleAlert = (rawPayload: any) => {
      try {
        const payload: ThreatAlertPayload =
          typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;

        setActiveThreat(payload);
        setReply(`⚠️ THREAT DETECTED: ${payload.file_name} (${payload.threat_type || payload.risk_level})`);
        voiceRef.current?.speak(
          `Security Alert Raja! A suspicious file, ${payload.file_name}, was detected in your system.`,
          () => setSpeaking(true),
          () => setSpeaking(false)
        );
      } catch {
        setReply(String(rawPayload));
      }
    };

    const unlisten1Promise = listen<ThreatAlertPayload | string>("aegis_threat_detected", (event) => {
      handleAlert(event.payload);
    });

    const unlisten2Promise = listen<ThreatAlertPayload | string>("aegis_security_alert", (event) => {
      handleAlert(event.payload);
    });

    const unlisten3Promise = listen<ThreatAlertPayload | string>("ThreatAlert", (event) => {
      handleAlert(event.payload);
    });

    // Autonomous Background Scheduler & Watchdog Alert Listener
    const unlistenSchedulerPromise = listen<SchedulerAlertPayload | string>("angel_scheduler_alert", (event) => {
      try {
        const p: SchedulerAlertPayload = typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload;
        setReply(`⏰ WATCHDOG ALERT: ${p.title} — ${p.message}`);
        voiceRef.current?.speak(p.message, () => setSpeaking(true), () => setSpeaking(false));
      } catch {
        setReply(`⏰ Watchdog Alert: ${String(event.payload)}`);
      }
    });

    return () => {
      unlisten1Promise.then((unlisten) => unlisten());
      unlisten2Promise.then((unlisten) => unlisten());
      unlisten3Promise.then((unlisten) => unlisten());
      unlistenSchedulerPromise.then((unlisten) => unlisten());
    };
  }, []);

  // Live RAM Telemetry
  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const mb = await invoke<number>("get_angel_ram_mb");
        setRamMb(mb.toFixed(1));
      } catch {}
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const handleToggleWake = () => {
    const active = voiceRef.current?.toggleWakeWord();
    setWakeEnabled(!!active);
  };

  const handleQuarantine = async (filePath: string) => {
    try {
      let res = "";
      try {
        res = await invoke<string>("quarantine_file", { filePath });
      } catch {
        res = await invoke<string>("quarantine_threat_file", { filePath });
      }
      setReply(res);
      setActiveThreat(null);
      voiceRef.current?.speak(
        "Threat successfully isolated in quarantine vault.",
        () => setSpeaking(true),
        () => setSpeaking(false)
      );
    } catch (err: any) {
      setReply(`Quarantine error: ${err}`);
    }
  };

  return (
    <div className="h-screen w-screen p-2 sm:p-3 flex items-center justify-center bg-transparent select-none overflow-hidden">
      {/* Crystal-Clear Translucent Glassmorphism Main Container */}
      <div
        data-tauri-drag-region
        className="w-full h-full rounded-3xl border border-cyan-300/50 bg-slate-950/50 backdrop-blur-2xl shadow-[0_0_50px_rgba(0,240,255,0.22)] p-4 sm:p-6 flex flex-col justify-between text-white relative overflow-hidden"
      >
        {/* Top Header Bar */}
        <div data-tauri-drag-region className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <span className="text-base sm:text-lg font-extrabold tracking-widest text-cyan-300 drop-shadow">
              ✦ PROJECT ANGEL V3
            </span>
            <span className="px-2.5 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-xs font-semibold text-cyan-200 flex items-center gap-1.5">
              <Shield size={14} className="text-emerald-400" /> AI SHIELD • RAM: {ramMb} MB
            </span>
            <span className="hidden sm:flex px-3 py-1 rounded-full bg-white/5 border border-cyan-400/30 text-xs font-mono text-cyan-100 items-center gap-1.5">
              <Clock size={13} className="text-cyan-400" />
              <span className="text-cyan-300 font-semibold">{formattedTime}</span>
              <span className="text-slate-400 text-[11px]">• {formattedDate}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Wake Word Status Pill */}
            <button
              onClick={handleToggleWake}
              title="Toggle Hands-Free Wake Word ('Hey Angel')"
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
                wakeEnabled
                  ? "bg-emerald-500/30 border-emerald-400/60 text-emerald-200 shadow-[0_0_12px_rgba(52,211,153,0.3)]"
                  : "bg-white/5 border-white/10 hover:bg-white/10 text-slate-400"
              }`}
            >
              <Radio size={14} className={wakeEnabled ? "animate-pulse text-emerald-300" : ""} />
              <span>Wake: {wakeEnabled ? "ON" : "OFF"}</span>
            </button>

            <button
              onClick={() => setShowSettings(!showSettings)}
              className="px-3.5 py-1.5 sm:py-2 rounded-xl bg-cyan-500/20 border border-cyan-300/40 hover:bg-cyan-500/35 text-cyan-100 text-xs font-bold flex items-center gap-1.5 transition"
            >
              <Settings size={15} /> Settings
            </button>

            <button
              onClick={() => window.close()}
              title="Minimize to System Tray"
              className="p-1.5 sm:p-2 rounded-xl bg-rose-500/25 border border-rose-400/40 hover:bg-rose-500/45 text-rose-200 transition"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        {/* Real-Time Interactive Threat Alert Card Overlay */}
        {activeThreat && (
          <div className="my-2 p-3 sm:p-4 rounded-2xl bg-rose-950/80 border-2 border-rose-500/80 backdrop-blur-xl shadow-[0_0_35px_rgba(244,63,94,0.4)] flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 overflow-hidden w-full">
              <div className="p-2.5 rounded-xl bg-rose-500/30 border border-rose-400/50 text-rose-200 shrink-0">
                <AlertTriangle size={22} className="animate-bounce" />
              </div>
              <div className="overflow-hidden">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-xs sm:text-sm text-rose-200 uppercase tracking-wide">
                    Threat Detected
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/40 text-rose-100 border border-rose-300/40">
                    {activeThreat.risk_level} RISK
                  </span>
                </div>
                <div className="text-xs font-semibold text-white truncate max-w-lg">
                  {activeThreat.file_name} — <span className="text-rose-200/80">{activeThreat.threat_type}</span>
                </div>
                <div className="text-[11px] text-slate-300 font-mono truncate max-w-lg">
                  {activeThreat.file_path}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
              <button
                onClick={() => handleQuarantine(activeThreat.file_path)}
                className="px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-rose-900/50 transition"
              >
                <Lock size={14} /> Quarantine Now
              </button>
              <button
                onClick={() => setActiveThreat(null)}
                className="px-3 py-1.5 sm:py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-slate-300 text-xs font-bold transition"
              >
                Ignore
              </button>
            </div>
          </div>
        )}

        {/* Main Body: Responsive Desktop & Android Layout */}
        {showSettings ? (
          <SettingsDrawer
            onClose={() => setShowSettings(false)}
            onSyncCloud={() => brain.syncWithSupabase()}
            onTestVoice={() =>
              voiceRef.current?.speak(
                "Hello Raja, Project Angel neural voice system is online and ready.",
                () => setSpeaking(true),
                () => setSpeaking(false)
              )
            }
          />
        ) : (
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4 items-center my-2 overflow-y-auto md:overflow-hidden">
            {/* LEFT SIDE: 3D Satellite Hologram Earth Globe (Responsive on Mobile) */}
            <div className="col-span-1 md:col-span-5 h-[220px] sm:h-[260px] md:h-full flex items-center justify-center">
              <HoloEarthStage speaking={speaking} listening={listening} />
            </div>

            {/* RIGHT SIDE: Global Settings & Command Console */}
            <div className="col-span-1 md:col-span-7 h-full flex flex-col justify-between py-1 sm:py-2 space-y-2">
              {/* Top Panel: Quick OS Reflex Cards */}
              <div className="bg-white/5 border border-cyan-300/25 rounded-2xl p-3 sm:p-4 space-y-2.5">
                <div className="text-xs font-extrabold tracking-wider text-cyan-300 flex items-center gap-2 uppercase border-b border-cyan-400/20 pb-1.5">
                  <Globe size={15} /> Global and System Settings
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-1 gap-2">
                  <button
                    onClick={() => handleCommand("system scan")}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-400/40 hover:bg-emerald-500/30 text-xs sm:text-sm font-bold text-left flex items-center gap-2.5 transition"
                  >
                    <Shield size={16} className="text-emerald-400 shrink-0" />
                    <span className="truncate">Run AI Antivirus</span>
                  </button>

                  <button
                    onClick={() => handleCommand("firewall status")}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-sky-500/15 border border-sky-400/40 hover:bg-sky-500/30 text-xs sm:text-sm font-bold text-left flex items-center gap-2.5 transition"
                  >
                    <Activity size={16} className="text-sky-400 shrink-0" />
                    <span className="truncate">Check AI Smart Firewall</span>
                  </button>

                  <button
                    onClick={() => handleCommand("windows error")}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-amber-500/15 border border-amber-400/40 hover:bg-amber-500/30 text-xs sm:text-sm font-bold text-left flex items-center gap-2.5 transition"
                  >
                    <Stethoscope size={16} className="text-amber-300 shrink-0" />
                    <span className="truncate">OS Doctor Diagnostics</span>
                  </button>
                </div>
              </div>

              {/* Middle: AI Progressive Response Box */}
              <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-950/50 border border-cyan-300/30 min-h-[90px] max-h-[120px] sm:max-h-[140px] overflow-y-auto flex items-center">
                <p className="text-xs sm:text-sm leading-relaxed text-cyan-50 select-text">{reply}</p>
              </div>

              {/* Bottom: Voice Mic + Audio Visualizer + Screen Vision + Command Input */}
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap sm:flex-nowrap">
                <button
                  onClick={() => voiceRef.current?.listenOnce(true)}
                  title="Speak Live Command (VAD auto-stop on silence)"
                  className={`p-3 sm:p-3.5 rounded-2xl border transition flex items-center justify-center shrink-0 ${
                    listening
                      ? "bg-rose-500/60 border-rose-300 text-white animate-pulse"
                      : "bg-cyan-500/25 border-cyan-300/50 hover:bg-cyan-500/45 text-cyan-200"
                  }`}
                >
                  <Mic size={18} />
                </button>

                {/* Real-time Dynamic Audio Visualizer Waves */}
                <div
                  title="Live Audio Level Visualizer"
                  className="flex items-center gap-0.5 h-10 sm:h-11 px-2 rounded-2xl bg-white/5 border border-cyan-300/30 shrink-0"
                >
                  {[0.4, 0.7, 1.2, 0.9, 1.1, 0.6, 0.8].map((mult, idx) => {
                    const active = listening || speaking;
                    const normLevel = audioLevel > 1 ? audioLevel / 100 : audioLevel;
                    const calculatedHeight = active
                      ? Math.min(26, Math.max(4, Math.round(normLevel * 26 * mult + (speaking ? Math.sin(idx + Date.now() / 200) * 8 + 6 : 4))))
                      : 4;
                    return (
                      <span
                        key={idx}
                        className={`w-1 rounded-full transition-all duration-75 ${
                          speaking
                            ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
                            : listening
                            ? "bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.6)]"
                            : "bg-cyan-500/30"
                        }`}
                        style={{ height: `${calculatedHeight}px` }}
                      />
                    );
                  })}
                </div>

                {/* Screen Vision Quick Trigger */}
                <button
                  onClick={handleScreenVision}
                  title="Screen Vision: Analyze Current Screen in RAM"
                  className="p-3 sm:p-3.5 rounded-2xl bg-cyan-500/25 border border-cyan-300/50 hover:bg-cyan-500/45 text-cyan-200 transition flex items-center justify-center text-xs font-bold shrink-0 gap-1"
                >
                  <Eye size={18} />
                  <span className="hidden md:inline">Vision</span>
                </button>

                {/* WAV / MP3 Voice File Trigger */}
                <label
                  title="Upload .WAV or .MP3 Voice Command"
                  className="p-3 sm:p-3.5 rounded-2xl bg-indigo-500/25 border border-indigo-300/50 hover:bg-indigo-500/45 text-indigo-200 cursor-pointer transition flex items-center justify-center text-xs font-bold shrink-0"
                >
                  WAV
                  <input
                    type="file"
                    accept=".wav,.mp3,audio/wav,audio/mpeg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) voiceRef.current?.processAudioFile(file);
                      e.target.value = "";
                    }}
                  />
                </label>

                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const cmd = input;
                      setInput("");
                      handleCommand(cmd);
                    }
                  }}
                  placeholder="Speak, upload audio, vision, or type..."
                  className="flex-1 min-w-[140px] bg-white/10 border border-cyan-300/40 rounded-2xl px-3.5 py-3 text-xs sm:text-sm text-white placeholder-slate-300 outline-none focus:border-cyan-300"
                />

                <button
                  onClick={() => {
                    const cmd = input;
                    setInput("");
                    handleCommand(cmd);
                  }}
                  className="px-4 py-3 sm:px-5 sm:py-3.5 rounded-2xl bg-cyan-500/35 border border-cyan-300/60 hover:bg-cyan-500/55 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 shrink-0 transition"
                >
                  <Send size={16} /> Send
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

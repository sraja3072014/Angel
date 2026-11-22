import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  Clock,
  Plus,
  Search,
  Sparkles,
  Upload,
  HardDrive,
  ChevronRight,
  ChevronDown,
  Mic,
  Image,
  Video,
  Music,
  Code,
  BookOpen,
  User,
  Layout,
  GraduationCap,
  Eye,
  Volume2,
  Copy,
  Check,
  X,
  Smartphone,
  AlertTriangle,
  Minus,
  MessageCircleDashed,
  MessageSquare,
  Cpu,
} from "lucide-react";
import "./App.css";
import { CloudBrainService, incrementUsageTelemetry } from "./services/cloudBrain";
import { AngelVoiceEngine } from "./services/voiceEngine";
import { MenuControlCenterWindow } from "./components/MenuControlCenterWindow";
import { SecuritySuiteWindow } from "./components/SecuritySuiteWindow";
import { HoloEarthStage } from "./components/HoloEarthStage";
import { GeminiSidebar } from "./components/GeminiSidebar";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  actionExecuted?: string;
}

interface ThreatAlertPayload {
  file_name: string;
  file_path: string;
  sha256: string;
  risk_level: string;
  threat_type: string;
  timestamp: string;
}

const brain = new CloudBrainService();

export default function App() {
  const voiceRef = useRef<AngelVoiceEngine | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Layout & Navigation State
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeModal, setActiveModal] = useState<{ type: "menu" | "security"; tab: string } | null>(null);
  const [showGetAppModal, setShowGetAppModal] = useState(false);
  const [temporaryChat, setTemporaryChat] = useState(false);

  // Workspace Mode: "chat" vs "task"
  const [workspaceMode, setWorkspaceMode] = useState<"chat" | "task">("chat");

  // Ambient Earth Opacity (defaults to 50%)
  const [earthOpacity, setEarthOpacity] = useState<number>(() => {
    const v = localStorage.getItem("angel_earth_opacity");
    return v ? parseFloat(v) : 0.5;
  });

  useEffect(() => {
    const handleEarthConfig = (e: any) => {
      if (e.detail?.opacity !== undefined) {
        setEarthOpacity(e.detail.opacity);
      }
    };
    window.addEventListener("angel-earth-config", handleEarthConfig);
    return () => window.removeEventListener("angel-earth-config", handleEarthConfig);
  }, []);

  // AI Model Ladder Selector
  const [selectedModel, setSelectedModel] = useState<string>("Auto");
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  // Tools Selector
  const [selectedTool, setSelectedTool] = useState<string>("Tools");
  const [showToolsDropdown, setShowToolsDropdown] = useState(false);

  // Left Plus Menu Popovers
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showMoreUploads, setShowMoreUploads] = useState(false);

  // Chat & Conversation State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Voice & Audio State
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [micErrorMessage, setMicErrorMessage] = useState<string | null>(null);

  // Live Threat Notification
  const [activeThreat, setActiveThreat] = useState<ThreatAlertPayload | null>(null);

  // Clock
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

  // Auto-scroll on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isProcessing]);

  // Voice Engine Setup
  useEffect(() => {
    voiceRef.current = new AngelVoiceEngine(
      () => {
        setListening(true);
        setMicErrorMessage(null);
      },
      (recognizedCmd: string) => {
        handleSendMessage(recognizedCmd);
      },
      (status: string, isList: boolean) => {
        setListening(isList);
        if (status.includes("Unable to access the microphone")) {
          setMicErrorMessage("Unable to access the microphone. Please check settings.");
        }
      },
      (level: number) => {
        setAudioLevel(level);
      }
    );

    // Cross-Device Relay Listener (commands sent from Android companion)
    brain.startMobileRelayListener((mobileCmd) => {
      handleSendMessage(mobileCmd);
    });
  }, []);

  // Rust Real-Time Threat Alerts
  useEffect(() => {
    const unlisten = listen<ThreatAlertPayload>("aegis_threat_detected", (event) => {
      if (event.payload) {
        setActiveThreat(event.payload);
      }
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // Click-to-Toggle Microphone: First click starts, Second click stops
  const handleToggleMicrophone = async () => {
    setMicErrorMessage(null);

    if (listening || voiceRef.current?.isRecording()) {
      // Second click: stop recording immediately and transcribe
      voiceRef.current?.stopRecording();
      setListening(false);
    } else {
      // First click: start recording with VAD
      try {
        await voiceRef.current?.listenWithVAD(true);
      } catch {
        setListening(false);
        setMicErrorMessage("Unable to access the microphone. Please check settings.");
      }
    }
  };

  // Send Message Handler
  const handleSendMessage = async (textToSend?: string, screenB64?: string) => {
    const prompt = (textToSend ?? input).trim();
    if (!prompt || isProcessing) return;

    setInput("");
    setShowPlusMenu(false);
    setShowToolsDropdown(false);
    setShowModelDropdown(false);
    setMicErrorMessage(null);

    const userMsgId = `user_${Date.now()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: "user",
      text: prompt,
      timestamp: formattedTime,
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsProcessing(true);

    const assistantMsgId = `assistant_${Date.now()}`;
    const initialAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      text: "",
      timestamp: formattedTime,
    };

    setMessages((prev) => [...prev, initialAssistantMsg]);

    try {
      // 1. Check local Rust OS reflex if in Task mode or standard prompt
      if (workspaceMode === "task") {
        try {
          const localRes = await invoke<string>("execute_os_reflex", { command: prompt });
          if (localRes !== "CLOUD_BRAIN") {
            incrementUsageTelemetry("reflex");
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, text: localRes, actionExecuted: "OS Reflex Executed" }
                  : m
              )
            );
            setIsProcessing(false);
            voiceRef.current?.speak(localRes, () => setSpeaking(true), () => setSpeaking(false));
            return;
          }
        } catch {}
      }

      // 2. Query Gemini AI with streaming response
      const fullReply = await brain.askGemini(prompt, {
        screenBase64: screenB64,
        onChunk: (chunk) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? { ...m, text: chunk } : m))
          );
        },
        onFirstSentence: (firstSentence) => {
          voiceRef.current?.speak(firstSentence, () => setSpeaking(true), () => setSpeaking(false));
        },
      });

      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsgId ? { ...m, text: fullReply } : m))
      );
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, text: `⚠️ Error processing request: ${err?.message || err}` }
            : m
        )
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Clear / New Chat
  const handleNewChat = () => {
    setMessages([]);
    setInput("");
    setMicErrorMessage(null);
  };

  // Screen Vision AI
  const handleScreenVision = async () => {
    try {
      setIsProcessing(true);
      const b64 = await invoke<string>("capture_screen_base64");
      const prompt = "Look at my screen right now. Explain what is visible and summarize any open dialogs or errors.";
      handleSendMessage(prompt, b64);
    } catch (err: any) {
      setIsProcessing(false);
      setMicErrorMessage(`Screen Vision error: ${err}`);
    }
  };

  // Quarantine threat file
  const handleQuarantineThreat = async (filePath: string) => {
    try {
      await invoke("quarantine_file", { filePath });
      setActiveThreat(null);
      voiceRef.current?.speak(
        "Threat isolated in Quarantine Vault.",
        () => setSpeaking(true),
        () => setSpeaking(false)
      );
    } catch (err: any) {
      console.warn("Quarantine error:", err);
    }
  };

  // Window control helpers: Minimize to Tray & Complete Application Exit
  const handleMinimize = async () => {
    try {
      await invoke("minimize_to_tray");
    } catch {
      try {
        getCurrentWebviewWindow().hide();
      } catch {}
    }
  };
  const handleClose = () => {
    try {
      getCurrentWebviewWindow().close();
    } catch {
      window.close();
    }
  };

  const handleCopyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="h-screen w-screen flex bg-slate-950 text-white select-none overflow-hidden font-sans relative">
      {/* 1. AMBIENT 3D SATELLITE EARTH BACKGROUND LAYER */}
      <div
        className="fixed inset-0 z-0 pointer-events-none overflow-hidden transition-opacity duration-300"
        style={{ opacity: earthOpacity }}
      >
        <HoloEarthStage speaking={speaking} listening={listening} />
      </div>

      {/* 2. LEFT COLLAPSIBLE SIDEBAR */}
      <GeminiSidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onNewChat={handleNewChat}
        onOpenMenu={() => setActiveModal({ type: "menu", tab: "general" })}
        onSelectPrompt={(p) => handleSendMessage(p)}
      />

      {/* 3. MAIN WORKSPACE */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative z-10 backdrop-blur-sm">
        {/* TOP HEADER BAR */}
        <header
          data-tauri-drag-region
          className="h-14 px-4 bg-slate-950/40 border-b border-white/10 backdrop-blur-xl flex items-center justify-between shrink-0 select-none"
        >
          {/* Left side: clean live clock telemetry */}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-cyan-200">
              <Clock size={12} className="text-cyan-400" />
              <span>{formattedTime}</span>
              <span className="text-slate-400 text-[10px]">• {formattedDate} (IST)</span>
            </span>
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {/* Get App Companion Button */}
            <button
              onClick={() => setShowGetAppModal(true)}
              className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition"
            >
              <Smartphone size={14} className="text-cyan-400" />
              <span className="hidden sm:inline">Get app</span>
            </button>

            {/* Turn on Temporary Chat Compact Icon Button with Tooltip */}
            <div className="relative group">
              <button
                onClick={() => setTemporaryChat(!temporaryChat)}
                title="Turn on temporary chat"
                className={`p-2 rounded-xl border text-xs font-bold transition flex items-center justify-center ${
                  temporaryChat
                    ? "bg-amber-500/20 border-amber-400/60 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.35)]"
                    : "bg-white/5 border-white/10 hover:bg-white/10 text-slate-400 hover:text-white"
                }`}
              >
                <MessageCircleDashed size={15} className={temporaryChat ? "animate-pulse text-amber-400" : ""} />
              </button>
              <div className="absolute top-full mt-1.5 right-0 hidden group-hover:flex px-2.5 py-1 rounded-lg bg-slate-900 border border-white/15 text-[10px] text-slate-200 whitespace-nowrap shadow-xl z-50 pointer-events-none">
                {temporaryChat ? "Temporary chat active" : "Turn on temporary chat"}
              </div>
            </div>

            {/* Window controls */}
            <div className="flex items-center gap-1 pl-2 border-l border-white/10">
              <button
                onClick={handleMinimize}
                title="Minimize to System Tray"
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
              >
                <Minus size={15} />
              </button>
              <button
                onClick={handleClose}
                title="Close Angel AI"
                className="p-1.5 rounded-lg hover:bg-rose-600 text-slate-400 hover:text-white transition"
              >
                <X size={15} />
              </button>
            </div>
          </div>
        </header>

        {/* Real-time Threat Alert Toast Banner */}
        {activeThreat && (
          <div className="mx-4 my-2 p-3 rounded-2xl bg-rose-950/80 border border-rose-500/80 backdrop-blur-xl shadow-lg flex items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <AlertTriangle size={18} className="text-rose-400 shrink-0 animate-bounce" />
              <div className="overflow-hidden">
                <div className="text-xs font-bold text-white truncate">
                  Threat Blocked: {activeThreat.file_name} ({activeThreat.threat_type})
                </div>
                <div className="text-[10px] text-slate-300 font-mono truncate">{activeThreat.file_path}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleQuarantineThreat(activeThreat.file_path)}
                className="px-3 py-1 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
              >
                Quarantine
              </button>
              <button
                onClick={() => setActiveThreat(null)}
                className="p-1 rounded-lg text-slate-300 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Microphone Error Notice */}
        {micErrorMessage && (
          <div className="mx-auto my-2 px-4 py-2 rounded-2xl bg-rose-950/80 border border-rose-400 text-xs font-semibold text-rose-200 flex items-center gap-2 shadow-lg z-30">
            <AlertTriangle size={15} className="text-rose-400 shrink-0" />
            <span>{micErrorMessage}</span>
            <button onClick={() => setMicErrorMessage(null)} className="ml-2 hover:text-white">
              <X size={13} />
            </button>
          </div>
        )}

        {/* CENTER WORKSPACE BODY */}
        <main className="flex-1 overflow-y-auto px-4 py-6 flex flex-col justify-between">
          {/* CASE A: No messages yet -> Clean Hero Greeting */}
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center max-w-2xl mx-auto my-auto">
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white drop-shadow-md">
                Where should we start?
              </h1>
            </div>
          ) : (
            /* CASE B: Conversation Stream */
            <div className="flex-1 max-w-3xl w-full mx-auto space-y-4 pb-6 overflow-y-auto">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === "user" ? "items-end" : "items-start"
                  } space-y-1`}
                >
                  <div
                    className={`p-4 rounded-3xl text-xs sm:text-sm leading-relaxed max-w-[85%] select-text backdrop-blur-xl ${
                      msg.role === "user"
                        ? "bg-cyan-600/30 border border-cyan-400/40 text-cyan-50 shadow-md"
                        : "bg-slate-900/70 border border-white/15 text-slate-100 shadow-lg"
                    }`}
                  >
                    {msg.role === "assistant" && (
                      <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-white/10">
                        <span className="text-cyan-400 font-extrabold text-xs">✦ Angel AI</span>
                        {msg.actionExecuted && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-[10px] font-bold text-emerald-300">
                            {msg.actionExecuted}
                          </span>
                        )}
                      </div>
                    )}

                    <p className="whitespace-pre-wrap">{msg.text || (isProcessing ? "Thinking..." : "")}</p>

                    {/* Assistant Message Actions */}
                    {msg.role === "assistant" && msg.text && (
                      <div className="flex items-center gap-2 mt-2 pt-1 border-t border-white/10 text-slate-400 text-xs">
                        <button
                          onClick={() =>
                            voiceRef.current?.speak(
                              msg.text,
                              () => setSpeaking(true),
                              () => setSpeaking(false)
                            )
                          }
                          title="Speak reply"
                          className="p-1 rounded hover:text-cyan-300 transition"
                        >
                          <Volume2 size={13} />
                        </button>
                        <button
                          onClick={() => handleCopyText(msg.id, msg.text)}
                          title="Copy text"
                          className="p-1 rounded hover:text-cyan-300 transition"
                        >
                          {copiedId === msg.id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                        </button>
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono px-2">{msg.timestamp}</span>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* 4. STREAMLINED TRANSLUCENT PROMPT COMPOSER */}
          <div className="w-full max-w-3xl mx-auto mt-auto pt-2 space-y-2.5">
            {/* CLOSED PROMPT BOX */}
            <div className="rounded-3xl bg-slate-900/60 border border-white/15 backdrop-blur-2xl shadow-[0_0_40px_rgba(0,240,255,0.12)] p-2.5 flex items-center gap-2 relative">
                {/* Plus Menu Button */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowPlusMenu(!showPlusMenu);
                      setShowMoreUploads(false);
                      setShowToolsDropdown(false);
                      setShowModelDropdown(false);
                    }}
                    title="Add attachments or media"
                    className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition"
                  >
                    <Plus size={16} />
                  </button>

                  {/* Left Plus Popover Menu */}
                  {showPlusMenu && (
                    <div className="absolute bottom-12 left-0 w-52 rounded-2xl bg-slate-950/95 border border-white/15 backdrop-blur-2xl shadow-2xl p-1.5 flex flex-col gap-1 z-50 text-xs">
                      <button
                        onClick={() => {
                          fileInputRef.current?.click();
                          setShowPlusMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2.5 text-slate-200"
                      >
                        <Upload size={14} className="text-cyan-400" />
                        <span>Upload files</span>
                      </button>

                      <button
                        onClick={() => {
                          handleSendMessage("Sync and attach active cloud drive context.");
                          setShowPlusMenu(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2.5 text-slate-200"
                      >
                        <HardDrive size={14} className="text-sky-400" />
                        <span>Add more drive</span>
                      </button>

                      {/* More Uploads Expandable Submenu */}
                      <div className="relative">
                        <button
                          onClick={() => setShowMoreUploads(!showMoreUploads)}
                          className="w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 flex items-center justify-between text-slate-200"
                        >
                          <span className="flex items-center gap-2.5">
                            <Sparkles size={14} className="text-amber-400" /> More uploads
                          </span>
                          <ChevronRight size={13} className="text-slate-400" />
                        </button>

                        {showMoreUploads && (
                          <div className="absolute left-full bottom-0 ml-1.5 w-44 rounded-2xl bg-slate-950/95 border border-white/15 backdrop-blur-2xl shadow-2xl p-1.5 flex flex-col gap-0.5 z-50 text-xs">
                            {[
                              { label: "Google Photos", icon: Image },
                              { label: "Avatar", icon: User },
                              { label: "Notebook", icon: BookOpen },
                              { label: "Import code", icon: Code },
                              { label: "Create image", icon: Sparkles },
                              { label: "Create video", icon: Video },
                              { label: "Create music", icon: Music },
                              { label: "Canvas", icon: Layout },
                            ].map((item, idx) => {
                              const ItemIcon = item.icon;
                              return (
                                <button
                                  key={idx}
                                  onClick={() => {
                                    handleSendMessage(`Open ${item.label} workspace.`);
                                    setShowPlusMenu(false);
                                    setShowMoreUploads(false);
                                  }}
                                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 flex items-center gap-2 text-slate-300 hover:text-white"
                                >
                                  <ItemIcon size={13} className="text-slate-400" />
                                  <span>{item.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Hidden File Picker Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) {
                      handleSendMessage(`Attached file: ${files[0].name}`);
                    }
                    e.target.value = "";
                  }}
                />

                {/* Tools Dropdown Button */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowToolsDropdown(!showToolsDropdown);
                      setShowPlusMenu(false);
                      setShowModelDropdown(false);
                    }}
                    className="px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 flex items-center gap-1 transition"
                  >
                    <span>{selectedTool}</span>
                    <ChevronDown size={12} className="text-slate-400" />
                  </button>

                  {showToolsDropdown && (
                    <div className="absolute bottom-12 left-0 w-48 rounded-2xl bg-slate-950/95 border border-white/15 backdrop-blur-2xl shadow-2xl p-1.5 flex flex-col gap-0.5 z-50 text-xs">
                      {[
                        { label: "Deep search", icon: Search },
                        { label: "Guided learning", icon: GraduationCap },
                        { label: "Personal intelligent", icon: Sparkles },
                      ].map((tool, idx) => {
                        const ToolIcon = tool.icon;
                        return (
                          <button
                            key={idx}
                            onClick={() => {
                              setSelectedTool(tool.label);
                              setShowToolsDropdown(false);
                            }}
                            className={`w-full text-left px-2.5 py-2 rounded-xl hover:bg-white/10 flex items-center gap-2 ${
                              selectedTool === tool.label ? "text-cyan-300 font-bold bg-white/10" : "text-slate-300"
                            }`}
                          >
                            <ToolIcon size={14} />
                            <span>{tool.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Main Input Field */}
                <input
                  type="text"
                  placeholder="Ask Angel AI"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className="flex-1 bg-transparent border-0 px-2 text-xs sm:text-sm text-white placeholder-slate-400 focus:outline-none"
                />

                {/* Model Version Selector */}
                <div className="relative hidden md:block">
                  <button
                    onClick={() => {
                      setShowModelDropdown(!showModelDropdown);
                      setShowPlusMenu(false);
                      setShowToolsDropdown(false);
                    }}
                    className="px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-mono text-slate-300 flex items-center gap-1 transition"
                  >
                    <span className="truncate max-w-[120px]">{selectedModel}</span>
                    <ChevronDown size={11} className="text-slate-400" />
                  </button>

                  {showModelDropdown && (
                    <div className="absolute bottom-12 right-0 w-48 rounded-2xl bg-slate-950/95 border border-white/15 backdrop-blur-2xl shadow-2xl p-1.5 flex flex-col gap-0.5 z-50 text-xs">
                      {["Auto", "Gemini 3.5 Flash", "Gemini 3.5 Flash-Lite"].map((m, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setSelectedModel(m);
                            setShowModelDropdown(false);
                          }}
                          className={`w-full text-left px-2.5 py-2 rounded-xl hover:bg-white/10 text-xs ${
                            selectedModel === m ? "text-cyan-300 font-bold bg-white/10" : "text-slate-300"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Screen Vision Quick Button */}
                <button
                  onClick={handleScreenVision}
                  title="Analyze current screen in RAM"
                  className="p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-cyan-300 transition"
                >
                  <Eye size={17} />
                </button>

                {/* Click-to-Toggle Microphone Button */}
                <button
                  onClick={handleToggleMicrophone}
                  style={listening ? { transform: `scale(${1 + Math.min(0.25, audioLevel / 400)})` } : undefined}
                  title={listening ? "Click to stop recording & send" : "Click to start recording voice command"}
                  className={`p-2.5 rounded-full border transition flex items-center justify-center shrink-0 ${
                    listening
                      ? "bg-rose-500/80 border-rose-300 text-white animate-pulse shadow-[0_0_15px_rgba(244,63,94,0.6)]"
                      : "bg-white/10 border-white/10 hover:bg-white/20 text-slate-200"
                  }`}
                >
                  <Mic size={16} />
                </button>
              </div>

              {/* EXTERNAL CHAT & TASK DYNAMIC MODE PILLS */}
              <div className="flex items-center justify-center gap-2 pt-0.5">
                <button
                  onClick={() => setWorkspaceMode("chat")}
                  className={`px-3.5 py-1 rounded-full text-xs font-bold transition flex items-center gap-1.5 ${
                    workspaceMode === "chat"
                      ? "bg-cyan-500/20 border border-cyan-400/50 text-cyan-200 shadow-sm"
                      : "bg-white/5 border border-white/10 text-slate-400 hover:text-white"
                  }`}
                >
                  <MessageSquare size={13} />
                  <span>Chat</span>
                </button>
                <button
                  onClick={() => setWorkspaceMode("task")}
                  className={`px-3.5 py-1 rounded-full text-xs font-bold transition flex items-center gap-1.5 ${
                    workspaceMode === "task"
                      ? "bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 shadow-sm"
                      : "bg-white/5 border border-white/10 text-slate-400 hover:text-white"
                  }`}
                >
                  <Cpu size={13} />
                  <span>Task</span>
                  {workspaceMode === "task" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  )}
                </button>
              </div>
            </div>
        </main>
      </div>

      {/* Master Control Center Glass Modal Overlay */}
      {activeModal?.type === "menu" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/75 backdrop-blur-xl animate-in fade-in duration-150">
          <div className="w-full h-full max-w-6xl max-h-[92vh] rounded-3xl overflow-hidden shadow-2xl border border-cyan-400/40 relative flex flex-col">
            <MenuControlCenterWindow
              initialTab={activeModal.tab}
              onClose={() => setActiveModal(null)}
              onOpenSecurity={(tab) => setActiveModal({ type: "security", tab })}
            />
          </div>
        </div>
      )}

      {/* K7 Security & OS Doctor Suite Glass Modal Overlay */}
      {activeModal?.type === "security" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-black/70 backdrop-blur-xl animate-in fade-in duration-150">
          <div className="w-full h-full max-w-5xl max-h-[92vh] rounded-3xl overflow-hidden shadow-2xl border border-cyan-400/40 relative">
            <SecuritySuiteWindow
              initialTab={activeModal.tab}
              onClose={() => setActiveModal(null)}
            />
          </div>
        </div>
      )}

      {/* Get App Companion Modal */}
      {showGetAppModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4">
          <div className="w-full max-w-md rounded-3xl bg-slate-900/90 border border-cyan-400/30 p-6 shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-base font-extrabold text-cyan-300">
                <Smartphone size={20} />
                <span>Angel AI Companion Ecosystem</span>
              </div>
              <button
                onClick={() => setShowGetAppModal(false)}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                <div className="font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  <span>Windows 11 Sovereign Desktop</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Version 2.0.0 Standalone Executable (~4.8 MB) with native Rust backend and System Tray integration.
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                <div className="font-bold text-white flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-cyan-400" />
                  <span>Android Companion App</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Real-time command relay syncing via Supabase table <code className="text-cyan-300">angel_device_relay</code>. Dispatches voice commands remotely to this desktop.
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowGetAppModal(false)}
              className="w-full py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/30 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

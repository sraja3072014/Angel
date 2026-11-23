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
  VolumeX,
  Copy,
  Check,
  X,
  Smartphone,
  AlertTriangle,
  Minus,
  MessageCircleDashed,
  MessageSquare,
  Cpu,
  Boxes,
} from "lucide-react";
import "./App.css";
import { CloudBrainService, incrementUsageTelemetry } from "./services/cloudBrain";
import { AngelVoiceEngine } from "./services/voiceEngine";
import { MenuControlCenterWindow } from "./components/MenuControlCenterWindow";
import { SecuritySuiteWindow } from "./components/SecuritySuiteWindow";
import { HoloEarthStage } from "./components/HoloEarthStage";
import { GeminiSidebar, ChatSession } from "./components/GeminiSidebar";
import { WorkshopStagePanel } from "./components/WorkshopStagePanel";
import {
  detectPhysicalBuildPrompt,
  WORKSHOP_BUILDER_SYSTEM_PROMPT,
  parseWorkshopProtocolStream,
  WorkshopBuildState,
  saveWorkshopBuild,
  getSavedWorkshopBuilds,
} from "./services/workshopBuilder";

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

  // Workspace Mode: "chat" vs "task" vs "workshop"
  const [workspaceMode, setWorkspaceMode] = useState<"chat" | "task" | "workshop">("chat");
  const [activeWorkshopBuild, setActiveWorkshopBuild] = useState<WorkshopBuildState | null>(null);

  // AI Voice Global Mute State
  const [voiceMuted, setVoiceMuted] = useState<boolean>(() => {
    return localStorage.getItem("angel_voice_muted") === "true";
  });

  const handleToggleVoiceMute = () => {
    const next = !voiceMuted;
    setVoiceMuted(next);
    localStorage.setItem("angel_voice_muted", next.toString());
    if (voiceRef.current) {
      voiceRef.current.setMuted(next);
    }
  };

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
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    const saved = localStorage.getItem("angel_primary_model");
    if (saved && (saved.includes("3.8") || saved === "gemini-3.8-flash" || saved === "gemini-2.5-flash")) {
      localStorage.setItem("angel_primary_model", "gemini-2.5-pro");
      return "gemini-2.5-pro";
    }
    return saved || "Auto";
  });
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  useEffect(() => {
    const handleModelChange = (e: any) => {
      if (e.detail?.model) {
        setSelectedModel(e.detail.model);
      }
    };
    window.addEventListener("angel-model-changed", handleModelChange);
    return () => window.removeEventListener("angel-model-changed", handleModelChange);
  }, []);

  // Tools Selector
  const [selectedTool, setSelectedTool] = useState<string>("Tools");
  const [showToolsDropdown, setShowToolsDropdown] = useState(false);

  // Left Plus Menu Popovers
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [showMoreUploads, setShowMoreUploads] = useState(false);

  // Chat & Conversation State
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    try {
      const raw = localStorage.getItem("angel_chat_sessions");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const saveSessions = (updated: ChatSession[]) => {
    setSessions(updated);
    try {
      localStorage.setItem("angel_chat_sessions", JSON.stringify(updated));
    } catch {}
  };

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

    const updatedUserMsgs = [...messages, userMsg];
    setMessages(updatedUserMsgs);
    setIsProcessing(true);

    let activeSessionId = currentSessionId;
    if (!activeSessionId) {
      activeSessionId = `session_${Date.now()}`;
      setCurrentSessionId(activeSessionId);
      const title = prompt.trim().slice(0, 36) + (prompt.length > 36 ? "..." : "");
      const newSession: ChatSession = {
        id: activeSessionId,
        title,
        timestamp: "Just now",
        messages: updatedUserMsgs,
      };
      saveSessions([newSession, ...sessions.filter((s) => s.id !== activeSessionId)]);
    }

    const assistantMsgId = `assistant_${Date.now()}`;
    const initialAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      text: "",
      timestamp: formattedTime,
    };

    setMessages([...updatedUserMsgs, initialAssistantMsg]);

    try {
      const promptLower = prompt.toLowerCase();

      // Instant 3D Workshop Voice & Chat Triggers
      if (
        promptLower.includes("open 3d workshop") ||
        promptLower.includes("open workshop") ||
        promptLower.includes("start 3d workshop") ||
        promptLower.includes("3d workshop") ||
        promptLower.includes("3d பட்டறை")
      ) {
        setWorkspaceMode("workshop");
        const replyText = "Opening 3D Workshop Studio Stage. Two showpieces ready: Turbofan Jet Engine and Live Gaming PC Hardware Twin.";
        const msgs = [
          ...updatedUserMsgs,
          { id: assistantMsgId, role: "assistant" as const, text: replyText, actionExecuted: "3D Workshop Launched", timestamp: formattedTime },
        ];
        setMessages(msgs);
        voiceRef.current?.speak(replyText, () => setSpeaking(true), () => setSpeaking(false));
        return;
      }

      if (promptLower.includes("pull it apart") || promptLower.includes("explode model") || promptLower.includes("பிரித்துப் பார்")) {
        setWorkspaceMode("workshop");
        window.postMessage({ type: "TOGGLE_EXPLODE" }, "*");
        const replyText = "Disassembling 3D assembly into component layers.";
        const msgs = [
          ...updatedUserMsgs,
          { id: assistantMsgId, role: "assistant" as const, text: replyText, actionExecuted: "3D Teardown Explode", timestamp: formattedTime },
        ];
        setMessages(msgs);
        voiceRef.current?.speak(replyText, () => setSpeaking(true), () => setSpeaking(false));
        return;
      }

      if (promptLower.includes("put back together") || promptLower.includes("assemble model") || promptLower.includes("மீண்டும் இணை")) {
        setWorkspaceMode("workshop");
        window.postMessage({ type: "SET_EXPLODE", value: 0 }, "*");
        const replyText = "Reassembling components into unified state.";
        const msgs = [
          ...updatedUserMsgs,
          { id: assistantMsgId, role: "assistant" as const, text: replyText, actionExecuted: "3D Reassembled", timestamp: formattedTime },
        ];
        setMessages(msgs);
        voiceRef.current?.speak(replyText, () => setSpeaking(true), () => setSpeaking(false));
        return;
      }

      if (promptLower.includes("3d print it") || promptLower.includes("export stl") || promptLower.includes("print 3d")) {
        setWorkspaceMode("workshop");
        window.postMessage({ type: "TRIGGER_EXPORT_STL" }, "*");
        const replyText = "Generating 3D printable STL files for all assembly components.";
        const msgs = [
          ...updatedUserMsgs,
          { id: assistantMsgId, role: "assistant" as const, text: replyText, actionExecuted: "STL Print Export", timestamp: formattedTime },
        ];
        setMessages(msgs);
        voiceRef.current?.speak(replyText, () => setSpeaking(true), () => setSpeaking(false));
        return;
      }

      // Workshop voice shortcuts: Throttle, Airflow, Synth Sound, Saved Builds
      if (promptLower.includes("start the engine") || promptLower.includes("full power") || promptLower.includes("full throttle")) {
        setWorkspaceMode("workshop");
        window.postMessage({ type: "SET_THROTTLE", value: 1.0 }, "*");
        const replyText = "Engine throttled to 100% full military power.";
        const msgs = [
          ...updatedUserMsgs,
          { id: assistantMsgId, role: "assistant" as const, text: replyText, actionExecuted: "Full Throttle", timestamp: formattedTime },
        ];
        setMessages(msgs);
        voiceRef.current?.speak(replyText, () => setSpeaking(true), () => setSpeaking(false));
        return;
      }

      if (promptLower.includes("idle engine") || promptLower === "idle" || promptLower.includes("idle throttle")) {
        setWorkspaceMode("workshop");
        window.postMessage({ type: "SET_THROTTLE", value: 0.25 }, "*");
        const replyText = "Engine set to idle spool.";
        const msgs = [
          ...updatedUserMsgs,
          { id: assistantMsgId, role: "assistant" as const, text: replyText, actionExecuted: "Idle Throttle", timestamp: formattedTime },
        ];
        setMessages(msgs);
        voiceRef.current?.speak(replyText, () => setSpeaking(true), () => setSpeaking(false));
        return;
      }

      if (promptLower.includes("shut it down") || promptLower.includes("shut down engine") || promptLower.includes("cut engine") || promptLower.includes("stop engine")) {
        setWorkspaceMode("workshop");
        window.postMessage({ type: "SET_THROTTLE", value: 0.0 }, "*");
        const replyText = "Engine turbine spool shut down.";
        const msgs = [
          ...updatedUserMsgs,
          { id: assistantMsgId, role: "assistant" as const, text: replyText, actionExecuted: "Engine Cut", timestamp: formattedTime },
        ];
        setMessages(msgs);
        voiceRef.current?.speak(replyText, () => setSpeaking(true), () => setSpeaking(false));
        return;
      }

      if (promptLower.includes("show me the airflow") || promptLower.includes("show airflow") || promptLower.includes("turn on airflow")) {
        setWorkspaceMode("workshop");
        window.postMessage({ type: "SET_AIRFLOW", enabled: true }, "*");
        const replyText = "Aerodynamic airflow particle stream engaged.";
        const msgs = [
          ...updatedUserMsgs,
          { id: assistantMsgId, role: "assistant" as const, text: replyText, actionExecuted: "Airflow Active", timestamp: formattedTime },
        ];
        setMessages(msgs);
        voiceRef.current?.speak(replyText, () => setSpeaking(true), () => setSpeaking(false));
        return;
      }

      if (promptLower.includes("hide airflow") || promptLower.includes("turn off airflow")) {
        setWorkspaceMode("workshop");
        window.postMessage({ type: "SET_AIRFLOW", enabled: false }, "*");
        const replyText = "Aerodynamic airflow particle simulation paused.";
        const msgs = [
          ...updatedUserMsgs,
          { id: assistantMsgId, role: "assistant" as const, text: replyText, actionExecuted: "Airflow Paused", timestamp: formattedTime },
        ];
        setMessages(msgs);
        voiceRef.current?.speak(replyText, () => setSpeaking(true), () => setSpeaking(false));
        return;
      }

      if (promptLower.includes("turn off fan sounds") || promptLower.includes("mute engine") || promptLower.includes("silence engine")) {
        setWorkspaceMode("workshop");
        window.postMessage({ type: "SET_SYNTH_MUTE", muted: true }, "*");
        const replyText = "Engine audio synthesizer muted.";
        const msgs = [
          ...updatedUserMsgs,
          { id: assistantMsgId, role: "assistant" as const, text: replyText, actionExecuted: "Synth Muted", timestamp: formattedTime },
        ];
        setMessages(msgs);
        voiceRef.current?.speak(replyText, () => setSpeaking(true), () => setSpeaking(false));
        return;
      }

      if (promptLower.includes("turn on fan sounds") || promptLower.includes("unmute engine")) {
        setWorkspaceMode("workshop");
        window.postMessage({ type: "SET_SYNTH_MUTE", muted: false }, "*");
        const replyText = "Engine audio synthesizer unmuted.";
        const msgs = [
          ...updatedUserMsgs,
          { id: assistantMsgId, role: "assistant" as const, text: replyText, actionExecuted: "Synth Unmuted", timestamp: formattedTime },
        ];
        setMessages(msgs);
        voiceRef.current?.speak(replyText, () => setSpeaking(true), () => setSpeaking(false));
        return;
      }

      if (promptLower.includes("open the last build") || promptLower.includes("load last build") || promptLower.includes("previous build")) {
        const saved = getSavedWorkshopBuilds();
        if (saved.length > 0) {
          setWorkspaceMode("workshop");
          setActiveWorkshopBuild(saved[0]);
          const replyText = `Loading previous 3D build: ${saved[0].title}.`;
          const msgs = [
            ...updatedUserMsgs,
            { id: assistantMsgId, role: "assistant" as const, text: replyText, actionExecuted: "Loaded Saved Build", timestamp: formattedTime },
          ];
          setMessages(msgs);
          voiceRef.current?.speak(replyText, () => setSpeaking(true), () => setSpeaking(false));
          return;
        }
      }

      // 3D Physical Object Build Detector -> Live Multi-LLM Streaming 3D Builder
      if (detectPhysicalBuildPrompt(prompt)) {
        setWorkspaceMode("workshop");
        const initialBuild: WorkshopBuildState = {
          id: `build_${Date.now()}`,
          title: "Generating 3D Assembly...",
          prompt,
          parts: [],
          timestamp: "Just now",
        };
        setActiveWorkshopBuild(initialBuild);

        const promptWithSystem = `${WORKSHOP_BUILDER_SYSTEM_PROMPT}\n\nUSER 3D REQUEST: ${prompt}`;
        let full3DResponse = "";

        await brain.askGemini(promptWithSystem, {
          screenBase64: screenB64,
          onChunk: (chunk) => {
            full3DResponse = chunk;
            const parsed = parseWorkshopProtocolStream(chunk);
            setActiveWorkshopBuild((prev) => {
              const baseParts = [...parsed.parts];
              if (parsed.inProgressPart) {
                baseParts.push({
                  id: parsed.inProgressPart.name,
                  name: parsed.inProgressPart.name,
                  status: parsed.inProgressPart.status,
                  code: parsed.inProgressPart.code,
                  completed: false,
                });
              }
              return {
                id: prev?.id || initialBuild.id,
                title: parsed.title || prev?.title || "3D Procedural Assembly",
                prompt,
                parts: baseParts,
                spokenSummary: parsed.spokenSummary,
                timestamp: "Just now",
              };
            });
          },
        });

        const finalParsed = parseWorkshopProtocolStream(full3DResponse);
        const completedBuild: WorkshopBuildState = {
          id: initialBuild.id,
          title: finalParsed.title || "3D Procedural Assembly",
          prompt,
          parts: finalParsed.parts,
          spokenSummary: finalParsed.spokenSummary,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        };
        setActiveWorkshopBuild(completedBuild);
        saveWorkshopBuild(completedBuild);

        const summaryText =
          finalParsed.spokenSummary ||
          `Completed 3D assembly of ${completedBuild.title} with ${completedBuild.parts.length} mechanical components.`;
        const buildMsgs = [
          ...updatedUserMsgs,
          {
            id: assistantMsgId,
            role: "assistant" as const,
            text: summaryText,
            actionExecuted: "3D Assembly Generated",
            timestamp: formattedTime,
          },
        ];
        setMessages(buildMsgs);
        if (activeSessionId) {
          setSessions((prev) => {
            const sUpdated = prev.map((s) => (s.id === activeSessionId ? { ...s, messages: buildMsgs } : s));
            try { localStorage.setItem("angel_chat_sessions", JSON.stringify(sUpdated)); } catch {}
            return sUpdated;
          });
        }
        voiceRef.current?.speak(summaryText, () => setSpeaking(true), () => setSpeaking(false));
        return;
      }

      // 1. Check local Rust OS reflex if in Task mode or standard prompt
      if (workspaceMode === "task") {
        try {
          let localRes = await invoke<string>("execute_os_reflex", { command: prompt });
          if (localRes === "3D_WORKSHOP_TRIGGER") {
            setWorkspaceMode("workshop");
            localRes = "Opening 3D Workshop Studio Stage. Two showpieces ready: Turbofan Jet Engine and Live Gaming PC Hardware Twin.";
          }
          if (localRes !== "CLOUD_BRAIN") {
            incrementUsageTelemetry("reflex");
            const reflexMsgs = [
              ...updatedUserMsgs,
              { id: assistantMsgId, role: "assistant" as const, text: localRes, actionExecuted: "OS Reflex Executed", timestamp: formattedTime },
            ];
            setMessages(reflexMsgs);
            if (activeSessionId) {
              setSessions((prev) => {
                const sUpdated = prev.map((s) => (s.id === activeSessionId ? { ...s, messages: reflexMsgs } : s));
                try { localStorage.setItem("angel_chat_sessions", JSON.stringify(sUpdated)); } catch {}
                return sUpdated;
              });
            }
            voiceRef.current?.speak(localRes, () => setSpeaking(true), () => setSpeaking(false));
            return;
          }
        } catch {}
      }

      // 1.4 GitHub Reverse-Engineering (REA) Detector
      const ghUrlMatch = prompt.match(/https?:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/i);
      const isReaPrompt =
        ghUrlMatch &&
        (promptLower.includes("reverse engineer") ||
          promptLower.includes("use rea") ||
          promptLower.includes("rea skill") ||
          promptLower.includes("rebuild") ||
          promptLower.includes("convert to zero python") ||
          promptLower.includes("zero python") ||
          promptLower.includes("transpile") ||
          promptLower.includes("dissect") ||
          promptLower.includes("deconstruct") ||
          promptLower.includes("inspect repo"));

      if (isReaPrompt && ghUrlMatch) {
        const repoUrl = ghUrlMatch[0];
        try {
          const repoAudit = await invoke<string>("inspect_github_repo", { repoUrl });
          let parsedAudit: any = {};
          try {
            parsedAudit = JSON.parse(repoAudit);
          } catch {}

          const reaPrompt = `You are Angel AI — Reverse-Engineer Anything (REA) Cognitive Architect.
The user requested: "${prompt}"

REVERSE-ENGINEERING TARGET AUDIT:
- Repository: ${parsedAudit.repo_url || repoUrl} (Owner: ${parsedAudit.owner || "unknown"}, Repo: ${parsedAudit.repo || "unknown"})
- Primary Stack: ${parsedAudit.detected_stack || parsedAudit.primary_language || "Generic Stack"}
- Purpose: ${parsedAudit.description || "N/A"}
- Manifest (${parsedAudit.manifest_name || "manifest"}):
${(parsedAudit.manifest_content || "").slice(0, 1000)}
- README Excerpt:
${(parsedAudit.readme_excerpt || "").slice(0, 1500)}

MANDATORY ARCHITECTURE DIRECTIVE:
Break down the complete internal architecture and produce a 100% ZERO-PYTHON system rebuild plan for Project Angel Tauri:
1. Native Rust Backend Service (src-tauri/src/*.rs) replacing all Python logic with native Rust crates (reqwest, serde, sysinfo, tokio) and CREATE_NO_WINDOW = 0x08000000.
2. React 19 Frontend Components (src/*.tsx) + Tailwind CSS + Lucide Icons for real-time UI/HUD display.
3. Complete Implementation Blueprint with concrete code snippets and exact integration commands.
NEVER produce any Python (.py) code or dependencies.`;

          const responseText = await brain.askGemini(reaPrompt, {
            onChunk: (chunk: string) => {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantMsgId ? { ...m, text: chunk } : m))
              );
            },
          });

          incrementUsageTelemetry("prompt");
          const finalMsgs = [
            ...updatedUserMsgs,
            {
              id: assistantMsgId,
              role: "assistant" as const,
              text: responseText,
              actionExecuted: `REA: ${parsedAudit.repo || "GitHub Repo"} Rebuild Plan`,
              timestamp: formattedTime,
            },
          ];
          setMessages(finalMsgs);
          if (activeSessionId) {
            setSessions((prev) => {
              const sUpdated = prev.map((s) => (s.id === activeSessionId ? { ...s, messages: finalMsgs } : s));
              try {
                localStorage.setItem("angel_chat_sessions", JSON.stringify(sUpdated));
              } catch {}
              return sUpdated;
            });
          }
          voiceRef.current?.speak(
            "Repository reverse engineered. Zero Python rebuild plan ready.",
            () => setSpeaking(true),
            () => setSpeaking(false)
          );
          return;
        } catch (err: any) {
          console.error("REA GitHub inspection notice:", err);
        }
      }

      // 1.5 Check installed SkillForge plugins before general LLM query
      try {
        const skills = ((await invoke<any[]>("list_forged_skills").catch(() => invoke<any[]>("plugin_forge_list"))) || []) as any[];
        const matchedSkill = skills?.find((s: any) => {
          if (!s.enabled) return false;
          const trigger = (s.trigger || "").toLowerCase().trim();
          if (trigger && (promptLower === trigger || promptLower.includes(trigger))) return true;
          if (Array.isArray(s.trigger_phrases)) {
            return s.trigger_phrases.some((tp: string) => {
              const tpLower = tp.toLowerCase().trim();
              return tpLower && (promptLower === tpLower || promptLower.includes(tpLower));
            });
          }
          return false;
        });

        if (matchedSkill) {
          const res = await invoke<string>("run_forged_skill", { skillId: matchedSkill.id, userInput: prompt })
            .catch(() => invoke<string>("plugin_forge_execute", { skillId: matchedSkill.id }));

          if (res) {
            incrementUsageTelemetry("reflex");
            const skillMsgs = [
              ...updatedUserMsgs,
              {
                id: assistantMsgId,
                role: "assistant" as const,
                text: res,
                actionExecuted: `SkillForge: ${matchedSkill.name}`,
                timestamp: formattedTime,
              },
            ];
            setMessages(skillMsgs);
            if (activeSessionId) {
              setSessions((prev) => {
                const sUpdated = prev.map((s) => (s.id === activeSessionId ? { ...s, messages: skillMsgs } : s));
                try { localStorage.setItem("angel_chat_sessions", JSON.stringify(sUpdated)); } catch {}
                return sUpdated;
              });
            }
            voiceRef.current?.speak(res, () => setSpeaking(true), () => setSpeaking(false));
            return;
          }
        }
      } catch (skillErr) {
        console.warn("SkillForge trigger check notice:", skillErr);
      }

      // 2. Query Gemini/Cloud Brain with streaming and 45s timeout safeguard
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("AI response timed out after 45s. Check network connectivity or API key quota.")),
          45000
        )
      );

      const queryPromise = brain.askGemini(prompt, {
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

      const fullReply = await Promise.race([queryPromise, timeoutPromise]);

      const finalMsgs = [
        ...updatedUserMsgs,
        { id: assistantMsgId, role: "assistant" as const, text: fullReply, timestamp: formattedTime },
      ];
      setMessages(finalMsgs);
      if (activeSessionId) {
        setSessions((prev) => {
          const sUpdated = prev.map((s) => (s.id === activeSessionId ? { ...s, messages: finalMsgs } : s));
          try { localStorage.setItem("angel_chat_sessions", JSON.stringify(sUpdated)); } catch {}
          return sUpdated;
        });
      }
    } catch (err: any) {
      const errText = `⚠️ Error processing request: ${err?.message || err}`;
      const errMsgs = [
        ...updatedUserMsgs,
        { id: assistantMsgId, role: "assistant" as const, text: errText, timestamp: formattedTime },
      ];
      setMessages(errMsgs);
      if (activeSessionId) {
        setSessions((prev) => {
          const sUpdated = prev.map((s) => (s.id === activeSessionId ? { ...s, messages: errMsgs } : s));
          try { localStorage.setItem("angel_chat_sessions", JSON.stringify(sUpdated)); } catch {}
          return sUpdated;
        });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Clear / New Chat & Session Reset
  const handleNewChat = () => {
    // 1. Save current non-empty conversation into localStorage if not already saved
    if (messages.length > 0) {
      const existingSession = currentSessionId ? sessions.find((s) => s.id === currentSessionId) : null;
      if (!existingSession) {
        const firstUserMsg = messages.find((m) => m.role === "user");
        const titleText = firstUserMsg?.text || "Conversation";
        const title = titleText.trim().slice(0, 36) + (titleText.length > 36 ? "..." : "");
        const newSessionId = currentSessionId || `session_${Date.now()}`;
        const newSession: ChatSession = {
          id: newSessionId,
          title,
          timestamp: "Just now",
          messages: [...messages],
        };
        const updated = [newSession, ...sessions.filter((s) => s.id !== newSessionId)];
        saveSessions(updated);
      } else {
        const updated = sessions.map((s) =>
          s.id === currentSessionId ? { ...s, messages: [...messages] } : s
        );
        saveSessions(updated);
      }
    }

    // 2. Immediately reset state so clean "Where should we start?" screen appears
    setMessages([]);
    setCurrentSessionId(null);
    setInput("");
    setIsProcessing(false);
    setMicErrorMessage(null);
    setActiveModal(null);
  };

  // Global Shortcut: Ctrl+N or Cmd+N for Instant New Chat
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleNewChat();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [messages, currentSessionId, sessions]);

  const handleSelectSession = (session: ChatSession) => {
    setCurrentSessionId(session.id);
    setMessages(session.messages || []);
    setInput("");
    setIsProcessing(false);
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
        onOpenWorkshop={() => setWorkspaceMode("workshop")}
        sessions={sessions}
        currentChatId={currentSessionId}
        onSelectSession={handleSelectSession}
      />

      {/* 3. MAIN WORKSPACE */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative z-10 backdrop-blur-sm">
        {/* TOP HEADER BAR */}
        <header
          data-tauri-drag-region
          onMouseDown={(e) => {
            if (e.button === 0 && !(e.target as HTMLElement).closest("button, input, textarea, a, select")) {
              try {
                getCurrentWebviewWindow().startDragging();
              } catch {}
            }
          }}
          className="h-14 px-4 bg-slate-950/40 border-b border-white/10 backdrop-blur-xl flex items-center justify-between shrink-0 select-none cursor-default"
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

            {/* AI Voice Speaker Mute / Unmute Toggle Button with Tooltip */}
            <div className="relative group">
              <button
                type="button"
                onClick={handleToggleVoiceMute}
                title={voiceMuted ? "Unmute AI Voice" : "Mute AI Voice"}
                className={`p-2 rounded-xl border text-xs font-bold transition flex items-center justify-center ${
                  voiceMuted
                    ? "bg-amber-500/20 border-amber-400/60 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.35)]"
                    : "bg-white/5 border-white/10 hover:bg-white/10 text-cyan-300 hover:text-white"
                }`}
              >
                {voiceMuted ? (
                  <VolumeX size={15} className="text-amber-400" />
                ) : (
                  <Volume2 size={15} className="text-cyan-400" />
                )}
              </button>
              <div className="absolute top-full mt-1.5 right-0 hidden group-hover:flex px-2.5 py-1 rounded-lg bg-slate-900 border border-white/15 text-[10px] text-slate-200 whitespace-nowrap shadow-xl z-50 pointer-events-none">
                {voiceMuted ? "Unmute AI Voice" : "Mute AI Voice"}
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
        <main className={`flex-1 overflow-hidden flex flex-col ${workspaceMode === "workshop" ? "p-3 sm:p-5" : "overflow-y-auto px-4 py-6 justify-between"}`}>
          {workspaceMode === "workshop" ? (
            <div className="w-full h-full flex flex-col min-h-0 animate-in fade-in zoom-in-95 duration-200">
              <WorkshopStagePanel
                onClose={() => setWorkspaceMode("chat")}
                onVoiceSpeak={(t) => voiceRef.current?.speak(t, () => setSpeaking(true), () => setSpeaking(false))}
                activeBuild={activeWorkshopBuild}
                onTriggerPrompt={(p, img) => handleSendMessage(p, img)}
              />
            </div>
          ) : (
            <>
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
            </>
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
                              { label: "3D Workshop", icon: Boxes },
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
                                    if (item.label === "3D Workshop") {
                                      setWorkspaceMode("workshop");
                                    } else {
                                      handleSendMessage(`Open ${item.label} workspace.`);
                                    }
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
                    <div className="absolute bottom-12 right-0 w-56 rounded-2xl bg-slate-950/95 border border-white/15 backdrop-blur-2xl shadow-2xl p-1.5 flex flex-col gap-0.5 z-50 text-xs max-h-72 overflow-y-auto">
                      {[
                        { id: "Auto", label: "Auto Smart Router" },
                        { id: "gemini", label: "Google Gemini 2.5 Pro / 2.0" },
                        { id: "groq", label: "Groq Llama 3.3 70B" },
                        { id: "deepseek", label: "DeepSeek V3" },
                        { id: "openai", label: "OpenAI GPT-4o" },
                        { id: "anthropic", label: "Claude 3.7 Sonnet" },
                        { id: "github", label: "GitHub Models (GPT-4o)" },
                        { id: "openrouter", label: "Free LLM (OpenRouter)" },
                        { id: "ollama", label: "Ollama (Offline Local)" },
                        { id: "local_lmstudio", label: "Local LM Studio" },
                      ].map((m) => (
                        <button
                          key={m.id}
                          onClick={() => {
                            setSelectedModel(m.id);
                            localStorage.setItem("angel_primary_model", m.id);
                            setShowModelDropdown(false);
                          }}
                          className={`w-full text-left px-2.5 py-2 rounded-xl hover:bg-white/10 text-xs flex items-center justify-between ${
                            selectedModel === m.id ? "text-cyan-300 font-bold bg-white/10" : "text-slate-300"
                          }`}
                        >
                          <span className="truncate">{m.label}</span>
                          {selectedModel === m.id && (
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0"></span>
                          )}
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

              {/* EXTERNAL CHAT, TASK, 3D WORKSHOP & TOOLS DYNAMIC MODE PILLS */}
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
                <button
                  onClick={() => setWorkspaceMode("workshop")}
                  className={`px-3.5 py-1 rounded-full text-xs font-bold transition flex items-center gap-1.5 ${
                    workspaceMode === "workshop"
                      ? "bg-cyan-500/25 border border-cyan-400/60 text-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.35)]"
                      : "bg-white/5 border border-white/10 text-slate-400 hover:text-white"
                  }`}
                >
                  <Boxes size={13} className="text-cyan-400" />
                  <span>3D Workshop</span>
                  {workspaceMode === "workshop" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
                  )}
                </button>

                {/* Tools Pill beside Chat / Task / 3D Workshop */}
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowToolsDropdown(!showToolsDropdown);
                      setShowPlusMenu(false);
                      setShowModelDropdown(false);
                    }}
                    className={`px-3.5 py-1 rounded-full text-xs font-bold transition flex items-center gap-1.5 ${
                      showToolsDropdown
                        ? "bg-amber-500/20 border border-amber-400/50 text-amber-200 shadow-sm"
                        : "bg-white/5 border border-white/10 text-slate-300 hover:text-white"
                    }`}
                  >
                    <Sparkles size={12} className="text-amber-400" />
                    <span>{selectedTool}</span>
                    <ChevronDown size={11} className="text-slate-400" />
                  </button>

                  {showToolsDropdown && (
                    <div className="absolute bottom-9 left-1/2 -translate-x-1/2 w-48 rounded-2xl bg-slate-950/95 border border-white/15 backdrop-blur-2xl shadow-2xl p-1.5 flex flex-col gap-0.5 z-50 text-xs">
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
              </div>
            </div>
        </main>
      </div>

      {/* Master Control Center Glass Modal Overlay */}
      {activeModal?.type === "menu" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-xl animate-in fade-in duration-150">
          <div className="w-full h-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col box-border z-50 shadow-2xl">
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

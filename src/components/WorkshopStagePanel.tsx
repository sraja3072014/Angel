import { useEffect, useRef, useState } from "react";
import {
  Boxes,
  Split,
  Thermometer,
  Download,
  RotateCcw,
  X,
  Cpu,
  Activity,
  HardDrive,
  Gauge,
  CheckCircle2,
  Sparkles,
  Wind,
  Volume2,
  VolumeX,
  Hand,
  Image as ImageIcon,
  ListChecks,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import {
  SHOWPIECE_CATALOG,
  WorkshopTelemetry,
  pollWorkshopTelemetry,
  exportWorkshopStl,
} from "../services/workshopShowpieces";
import {
  WorkshopPart,
  WorkshopBuildState,
  getSavedWorkshopBuilds,
  generatePartRepairPrompt,
} from "../services/workshopBuilder";
import { handTracker, HandTrackingFrame } from "../services/handTracker";
import { CloudBrainService } from "../services/cloudBrain";

interface WorkshopStagePanelProps {
  onClose: () => void;
  onVoiceSpeak?: (text: string) => void;
  activeBuild?: WorkshopBuildState | null;
  onTriggerPrompt?: (prompt: string, imageBase64?: string) => void;
}

const brain = new CloudBrainService();

export function WorkshopStagePanel({
  onClose,
  onVoiceSpeak,
  activeBuild,
  onTriggerPrompt,
}: WorkshopStagePanelProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const pipVideoRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Stage & Display State
  const [selectedShowpiece, setSelectedShowpiece] = useState<"jet_engine" | "gaming_pc" | "custom">("jet_engine");
  const [isExploded, setIsExploded] = useState<boolean>(false);
  const [isThermalMode, setIsThermalMode] = useState<boolean>(false);
  const [isAirflowActive, setIsAirflowActive] = useState<boolean>(true);
  const [isSynthMuted, setIsSynthMuted] = useState<boolean>(false);
  const [isHandTracking, setIsHandTracking] = useState<boolean>(false);
  const [handGestures, setHandGestures] = useState<string[]>([]);
  const [throttleVal, setThrottleVal] = useState<number>(0.25);
  const [showChecklist, setShowChecklist] = useState<boolean>(true);
  const [showSavedBuilds, setShowSavedBuilds] = useState<boolean>(false);
  const [savedBuilds, setSavedBuilds] = useState<WorkshopBuildState[]>([]);
  const [isRepairingPart, setIsRepairingPart] = useState<string | null>(null);

  // Active Parts List (built-in or streamed)
  const [partsList, setPartsList] = useState<WorkshopPart[]>([]);
  const [activePartHover, setActivePartHover] = useState<{ name: string; desc: string } | null>(null);

  // STL Export status
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccessPath, setExportSuccessPath] = useState<string | null>(null);

  // Hardware Telemetry
  const [telemetry, setTelemetry] = useState<WorkshopTelemetry>({
    cpu_percent: 22,
    ram_percent: 45,
    ram_used_gb: 7.2,
    ram_total_gb: 16.0,
    health_score: 98,
    cpu_temp_c: 38.5,
    fan_rpm: 1100,
  });

  // PostMessage sender helper
  const sendToIframe = (msg: any) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(msg, "*");
    }
  };

  // Sync activeBuild parts into checklist and run them in stage
  useEffect(() => {
    if (activeBuild && activeBuild.parts && activeBuild.parts.length > 0) {
      setSelectedShowpiece("custom");
      setPartsList(activeBuild.parts);

      // If activeBuild changed, run new completed parts in iframe
      activeBuild.parts.forEach((p) => {
        if (p.completed && p.code) {
          sendToIframe({
            type: "RUN_PART",
            partName: p.name,
            code: p.code,
          });
        }
      });
    }
  }, [activeBuild]);

  // Load saved builds list
  useEffect(() => {
    setSavedBuilds(getSavedWorkshopBuilds());
  }, []);

  // Switch showpiece
  const handleSelectShowpiece = (id: "jet_engine" | "gaming_pc") => {
    setSelectedShowpiece(id);
    setIsExploded(false);
    setIsThermalMode(false);
    setActivePartHover(null);
    sendToIframe({ type: "LOAD_SHOWPIECE", showpiece: id });
  };

  // Explode toggle
  const handleToggleExplode = () => {
    const next = !isExploded;
    setIsExploded(next);
    sendToIframe({ type: "TOGGLE_EXPLODE" });
    if (onVoiceSpeak) {
      onVoiceSpeak(
        next ? "Disassembling 3D assembly into component layers." : "Reassembling components into unified state."
      );
    }
  };

  // Thermal toggle
  const handleToggleThermal = () => {
    const next = !isThermalMode;
    setIsThermalMode(next);
    sendToIframe({ type: "SET_THERMAL", enabled: next });
    if (onVoiceSpeak) {
      onVoiceSpeak(next ? "Engaging thermal telemetry heat map." : "Returning to standard mechanical materials.");
    }
  };

  // Airflow toggle
  const handleToggleAirflow = () => {
    const next = !isAirflowActive;
    setIsAirflowActive(next);
    sendToIframe({ type: "SET_AIRFLOW", enabled: next });
    if (onVoiceSpeak) {
      onVoiceSpeak(next ? "Activating aerodynamic airflow particle simulation." : "Airflow simulation paused.");
    }
  };

  // Audio Synth mute toggle
  const handleToggleSynthMute = () => {
    const next = !isSynthMuted;
    setIsSynthMuted(next);
    sendToIframe({ type: "SET_SYNTH_MUTE", muted: next });
  };

  // Throttle control
  const handleSetThrottle = (val: number) => {
    setThrottleVal(val);
    sendToIframe({ type: "SET_THROTTLE", value: val });
  };

  // Reset Camera
  const handleResetCamera = () => {
    sendToIframe({ type: "RESET_CAMERA" });
  };

  // Export STL Files
  const handleTriggerExport = () => {
    setIsExporting(true);
    sendToIframe({ type: "TRIGGER_EXPORT_STL" });
  };

  // MediaPipe Hand Tracking Toggle
  const handleToggleHandTracking = async () => {
    if (isHandTracking) {
      handTracker.stop();
      setIsHandTracking(false);
      setHandGestures([]);
      if (pipVideoRef.current) {
        pipVideoRef.current.innerHTML = "";
      }
      sendToIframe({ type: "HAND_LANDMARKS_DATA", landmarks: [], gestures: [] });
      if (onVoiceSpeak) onVoiceSpeak("Hand gesture tracking deactivated.");
    } else {
      try {
        if (onVoiceSpeak) onVoiceSpeak("Initializing webcam for 3D gesture tracking.");
        const videoEl = await handTracker.start();
        setIsHandTracking(true);

        if (pipVideoRef.current) {
          pipVideoRef.current.innerHTML = "";
          videoEl.className = "w-full h-full object-cover rounded-lg border border-cyan-400/50";
          pipVideoRef.current.appendChild(videoEl);
        }

        // Register tracking callback
        handTracker.initialize((frame: HandTrackingFrame) => {
          setHandGestures(frame.gestures);
          sendToIframe({
            type: "HAND_LANDMARKS_DATA",
            landmarks: frame.landmarks,
            gestures: frame.gestures,
          });
        });
      } catch (err: any) {
        console.error("Camera access error:", err);
        setIsHandTracking(false);
        if (onVoiceSpeak) onVoiceSpeak("Camera access was not granted for hand tracking.");
      }
    }
  };

  // Reference Image Upload Handler
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        // Send image texture into 3D stage
        sendToIframe({ type: "LOAD_REFERENCE_IMAGE", dataUrl });

        if (onVoiceSpeak) {
          onVoiceSpeak("Analyzing reference floor plan image. Beginning 3D reconstruction.");
        }

        // Trigger AI 3D building prompt
        const prompt = `Build a high-precision 3D architectural model or mechanical assembly based on this reference image. Follow the //@part protocol and construct walls, floorings, and interior furniture or mechanical parts.`;
        onTriggerPrompt?.(prompt, dataUrl);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // Self-Healing Part Repair Handler
  const handleRepairPart = async (partName: string, code: string, errorMsg: string) => {
    setIsRepairingPart(partName);
    try {
      const repairPrompt = generatePartRepairPrompt(partName, errorMsg, code);
      const repairedChunk = await brain.askGemini(repairPrompt, {});
      
      // Extract code inside repaired block
      const match = repairedChunk.match(/\/\/@part[^\r\n]+([\s\S]*?)\/\/@end/);
      const correctedCode = match ? match[1].trim() : repairedChunk;

      // Run repaired code in iframe
      sendToIframe({
        type: "RUN_PART",
        partName,
        code: correctedCode,
      });

      // Update part in local list
      setPartsList((prev) =>
        prev.map((p) =>
          p.name === partName ? { ...p, code: correctedCode, completed: true, error: undefined } : p
        )
      );

      if (onVoiceSpeak) {
        onVoiceSpeak(`Successfully repaired component: ${partName}.`);
      }
    } catch (repairErr: any) {
      console.error("Repair failed:", repairErr);
    } finally {
      setIsRepairingPart(null);
    }
  };

  // Setup message listener from sandboxed iframe
  useEffect(() => {
    const handleMessage = async (e: MessageEvent) => {
      const data = e.data;
      if (!data || !data.type) return;

      if (data.type === "STAGE_READY") {
        if (selectedShowpiece === "custom" && activeBuild) {
          activeBuild.parts.forEach((p) => {
            if (p.completed && p.code) {
              sendToIframe({ type: "RUN_PART", partName: p.name, code: p.code });
            }
          });
        } else {
          sendToIframe({ type: "LOAD_SHOWPIECE", showpiece: selectedShowpiece });
        }
      } else if (data.type === "PART_HOVERED" || data.type === "PART_CLICKED") {
        setActivePartHover({ name: data.partName, desc: data.description });
      } else if (data.type === "PART_ERROR") {
        console.warn("Stage Part Error:", data);
        setPartsList((prev) =>
          prev.map((p) =>
            p.name === data.partName ? { ...p, completed: false, error: data.error } : p
          )
        );
        // Automatically attempt self-healing repair once
        handleRepairPart(data.partName, data.code, data.error);
      } else if (data.type === "PART_SUCCESS") {
        setPartsList((prev) =>
          prev.map((p) =>
            p.name === data.partName ? { ...p, completed: true, error: undefined } : p
          )
        );
      } else if (data.type === "DOUBLE_PINCH_SPOKEN") {
        if (onVoiceSpeak) {
          onVoiceSpeak(`${data.partName}. ${data.description}`);
        }
      } else if (data.type === "EXPORT_STL_PAYLOAD") {
        try {
          const savedPath = await exportWorkshopStl(data.projectName, data.files);
          setExportSuccessPath(savedPath);
          setIsExporting(false);
          const count = data.files?.length || 0;
          if (onVoiceSpeak) {
            onVoiceSpeak(`Successfully generated ${count} STL parts in your Downloads folder.`);
          }
          setTimeout(() => setExportSuccessPath(null), 6000);
        } catch (err: any) {
          setIsExporting(false);
          console.error("STL Export Error:", err);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [selectedShowpiece, activeBuild, onVoiceSpeak]);

  // Live Hardware Telemetry Polling (every 3000ms)
  useEffect(() => {
    let timer: any = null;

    const fetchTelemetry = async () => {
      const report = await pollWorkshopTelemetry();
      setTelemetry(report);
      sendToIframe({ type: "TELEMETRY_UPDATE", telemetry: report });
    };

    fetchTelemetry();
    timer = setInterval(fetchTelemetry, 3000);

    return () => {
      if (timer) clearInterval(timer);
      handTracker.stop();
    };
  }, []);

  const currentMeta =
    SHOWPIECE_CATALOG.find((s) => s.id === selectedShowpiece) || {
      id: "custom",
      name: activeBuild?.title || "AI Procedural 3D Model",
      subtitle: "Custom Multi-LLM Assembly",
      partCount: partsList.length,
    };

  return (
    <div className="w-full h-full flex flex-col bg-slate-950/85 backdrop-blur-2xl border border-cyan-400/30 rounded-2xl shadow-2xl relative overflow-hidden select-none">
      {/* Hidden file input for Reference Image / Floor Plan */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleImageFileChange}
      />

      {/* 1. TOP SCI-FI WORKSHOP TOOLBAR */}
      <header className="h-14 px-4 bg-slate-900/95 border-b border-cyan-400/25 flex items-center justify-between shrink-0 z-30 select-none">
        {/* Left: Branding & Showpiece Selector */}
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 shrink-0">
            <Boxes size={18} className="text-cyan-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-widest text-cyan-200">3D WORKSHOP</span>
              <span className="text-[10px] font-mono text-cyan-400/80 px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-400/30">
                PHASE 2 & 3
              </span>
            </div>
            <div className="text-[10px] text-slate-400 hidden sm:block truncate max-w-[220px]">
              {currentMeta.name} • {partsList.length || currentMeta.partCount} Parts
            </div>
          </div>

          {/* Showpiece Switcher Segmented Pills */}
          <div className="ml-2 sm:ml-4 flex items-center p-0.5 rounded-xl bg-black/50 border border-white/10">
            <button
              type="button"
              onClick={() => handleSelectShowpiece("jet_engine")}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                selectedShowpiece === "jet_engine"
                  ? "bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span>Jet Engine</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectShowpiece("gaming_pc")}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                selectedShowpiece === "gaming_pc"
                  ? "bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Activity size={13} className={selectedShowpiece === "gaming_pc" ? "text-emerald-400" : ""} />
              <span>Gaming PC</span>
            </button>
            {activeBuild && (
              <button
                type="button"
                onClick={() => setSelectedShowpiece("custom")}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                  selectedShowpiece === "custom"
                    ? "bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <Sparkles size={13} className="text-amber-400 animate-spin" />
                <span>AI Build</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-2">
          {/* Quick Throttle Control Pills */}
          <div className="hidden xl:flex items-center gap-1.5 px-2 py-1 rounded-xl bg-black/40 border border-white/10 text-[10px] font-mono">
            <Gauge size={12} className="text-cyan-400" />
            <span className="text-slate-400">THR:</span>
            {[0.0, 0.25, 0.6, 1.0].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => handleSetThrottle(v)}
                className={`px-1.5 py-0.5 rounded transition ${
                  Math.abs(throttleVal - v) < 0.05
                    ? "bg-cyan-500/30 text-cyan-200 border border-cyan-400/40"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                {v === 0 ? "CUT" : `${Math.round(v * 100)}%`}
              </button>
            ))}
          </div>
          {/* Airflow Toggle */}
          <button
            type="button"
            onClick={handleToggleAirflow}
            title={isAirflowActive ? "Pause Airflow Simulation" : "Activate Airflow Simulation"}
            className={`p-2 rounded-xl border text-xs font-bold flex items-center transition ${
              isAirflowActive
                ? "bg-cyan-500/25 border-cyan-400/60 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.25)]"
                : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
            }`}
          >
            <Wind size={15} />
          </button>

          {/* Synth Audio Mute Toggle */}
          <button
            type="button"
            onClick={handleToggleSynthMute}
            title={isSynthMuted ? "Unmute Engine Audio Synthesizer" : "Mute Engine Audio Synthesizer"}
            className={`p-2 rounded-xl border text-xs font-bold flex items-center transition ${
              !isSynthMuted
                ? "bg-cyan-500/25 border-cyan-400/60 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.25)]"
                : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
            }`}
          >
            {isSynthMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>

          {/* MediaPipe Hand Gesture Control Toggle */}
          <button
            type="button"
            onClick={handleToggleHandTracking}
            title={isHandTracking ? "Turn Off Hand Gesture Control" : "Turn On Webcam 3D Hand Gestures"}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
              isHandTracking
                ? "bg-emerald-500/30 border-emerald-400/60 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.35)]"
                : "bg-white/5 border-white/10 hover:bg-white/10 text-slate-300"
            }`}
          >
            <Hand size={14} className={isHandTracking ? "text-emerald-400 animate-pulse" : ""} />
            <span className="hidden lg:inline">{isHandTracking ? "Gestures Active" : "Hand Gestures"}</span>
          </button>

          {/* Image / Floor Plan Drop Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Upload Floor Plan or Reference Image to build in 3D"
            className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-bold flex items-center gap-1.5 transition"
          >
            <ImageIcon size={14} className="text-amber-400" />
            <span className="hidden lg:inline">Image to 3D</span>
          </button>

          {/* Pull It Apart / Put Back Together */}
          <button
            type="button"
            onClick={handleToggleExplode}
            title={isExploded ? "Put Back Together" : "Pull It Apart"}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
              isExploded
                ? "bg-amber-500/25 border-amber-400/60 text-amber-200 shadow-[0_0_15px_rgba(245,158,11,0.25)]"
                : "bg-white/5 border-white/10 hover:bg-white/10 text-slate-300"
            }`}
          >
            <Split size={14} className={isExploded ? "rotate-180 transition" : ""} />
            <span className="hidden md:inline">{isExploded ? "Assemble" : "Pull Apart"}</span>
          </button>

          {/* Thermal View Toggle */}
          <button
            type="button"
            onClick={handleToggleThermal}
            title="Toggle Thermal Telemetry View"
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
              isThermalMode
                ? "bg-rose-500/25 border-rose-400/60 text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.25)]"
                : "bg-white/5 border-white/10 hover:bg-white/10 text-slate-300"
            }`}
          >
            <Thermometer size={14} className={isThermalMode ? "text-rose-400" : ""} />
            <span className="hidden md:inline">Thermal</span>
          </button>

          {/* Export STL Files */}
          <button
            type="button"
            onClick={handleTriggerExport}
            disabled={isExporting}
            title="Export all components as 3D-printable STL files"
            className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-xs font-bold flex items-center gap-1.5 transition shadow-sm disabled:opacity-50"
          >
            <Download size={14} className={isExporting ? "animate-bounce" : ""} />
            <span className="hidden sm:inline">{isExporting ? "Exporting..." : "STL Print"}</span>
          </button>

          {/* Reset Camera */}
          <button
            type="button"
            onClick={handleResetCamera}
            title="Reset Camera"
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 transition"
          >
            <RotateCcw size={14} />
          </button>

          {/* Close Workshop */}
          <button
            type="button"
            onClick={onClose}
            title="Close 3D Workshop"
            className="p-2 rounded-xl bg-rose-500/20 hover:bg-rose-600/60 border border-rose-400/40 text-rose-200 hover:text-white transition"
          >
            <X size={15} />
          </button>
        </div>
      </header>

      {/* 2. MAIN 3D WORKSHOP STAGE & OVERLAYS */}
      <div className="flex-1 w-full h-full relative overflow-hidden bg-slate-950 flex">
        {/* Assembly Checklist Sidebar Drawer */}
        {showChecklist && (
          <aside className="w-72 h-full bg-slate-900/90 border-r border-cyan-400/20 backdrop-blur-xl flex flex-col z-20 shrink-0 transition-all animate-in slide-in-from-left-4">
            <div className="h-11 px-3 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-cyan-300">
                <ListChecks size={15} className="text-cyan-400" />
                <span>ASSEMBLY CHECKLIST</span>
              </div>
              <button
                type="button"
                onClick={() => setShowSavedBuilds(!showSavedBuilds)}
                title="Browse Saved 3D Builds"
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[10px] font-mono flex items-center gap-1"
              >
                <FolderOpen size={12} />
                <span>Saved</span>
              </button>
            </div>

            {/* Saved Builds Modal View */}
            {showSavedBuilds ? (
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Saved 3D Projects
                </div>
                {savedBuilds.length === 0 ? (
                  <div className="text-xs text-slate-500 text-center py-8">No saved builds yet.</div>
                ) : (
                  savedBuilds.map((b) => (
                    <div
                      key={b.id}
                      onClick={() => {
                        setSelectedShowpiece("custom");
                        setPartsList(b.parts);
                        sendToIframe({ type: "CLEAR_STAGE" });
                        b.parts.forEach((p) => {
                          if (p.completed && p.code) {
                            sendToIframe({ type: "RUN_PART", partName: p.name, code: p.code });
                          }
                        });
                        setShowSavedBuilds(false);
                      }}
                      className="p-2.5 rounded-xl bg-slate-950/70 border border-white/10 hover:border-cyan-400/50 cursor-pointer transition text-left"
                    >
                      <div className="text-xs font-bold text-cyan-300 truncate">{b.title}</div>
                      <div className="text-[10px] text-slate-400 flex items-center justify-between mt-1">
                        <span>{b.parts.length} parts</span>
                        <span>{b.timestamp}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              /* Streaming Parts Checklist */
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {partsList.length === 0 ? (
                  <div className="text-xs text-slate-500 text-center py-10 px-4">
                    Ready to stream parts. Speak or type:
                    <div className="text-cyan-400/80 font-mono text-[11px] mt-2">
                      "Build me a titanium watch in 3D"
                    </div>
                    or select a showpiece.
                  </div>
                ) : (
                  partsList.map((part, idx) => (
                    <div
                      key={part.id || idx}
                      className={`p-2.5 rounded-xl border text-left transition ${
                        part.completed
                          ? "bg-slate-950/60 border-cyan-400/30"
                          : part.error
                          ? "bg-rose-950/30 border-rose-500/50"
                          : "bg-slate-950/40 border-white/10"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {part.completed ? (
                            <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                          ) : part.error ? (
                            <AlertCircle size={14} className="text-rose-400 shrink-0" />
                          ) : (
                            <div className="w-3.5 h-3.5 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin shrink-0" />
                          )}
                          <span className="text-xs font-bold text-slate-200 truncate max-w-[140px]">
                            {part.name}
                          </span>
                        </div>

                        {part.error && (
                          <button
                            type="button"
                            onClick={() => handleRepairPart(part.name, part.code, part.error || "")}
                            disabled={isRepairingPart === part.name}
                            className="p-1 rounded bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 text-[10px] flex items-center gap-1 font-mono"
                          >
                            <RefreshCw size={10} className={isRepairingPart === part.name ? "animate-spin" : ""} />
                            <span>Retry</span>
                          </button>
                        )}
                      </div>

                      <div className="text-[10px] text-slate-400 mt-1 leading-snug">
                        {part.status || "Constructing 3D geometry..."}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </aside>
        )}

        {/* Toggle Checklist Button Tab */}
        <button
          type="button"
          onClick={() => setShowChecklist(!showChecklist)}
          className="absolute top-4 left-0 z-20 p-1.5 rounded-r-lg bg-slate-900/90 border-y border-r border-cyan-400/30 text-cyan-300 shadow-md hover:bg-slate-800"
          style={{ left: showChecklist ? "18rem" : "0" }}
          title={showChecklist ? "Hide Checklist" : "Show Checklist"}
        >
          {showChecklist ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </button>

        {/* IFRAME 3D STAGE */}
        <div className="flex-1 w-full h-full relative overflow-hidden bg-slate-950">
          <iframe
            ref={iframeRef}
            src="/workshop-stage.html"
            sandbox="allow-scripts"
            title="3D Workshop Studio Stage"
            className="w-full h-full border-none block"
          />

          {/* Hovered / Clicked Part Detail Pill */}
          {activePartHover && (
            <div className="absolute top-4 left-14 z-20 max-w-sm px-4 py-2.5 rounded-xl bg-slate-950/90 border border-cyan-400/40 text-white shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2">
              <div className="text-xs font-black text-cyan-300 flex items-center gap-2">
                <Sparkles size={13} className="text-amber-400" />
                <span>{activePartHover.name}</span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">{activePartHover.desc}</p>
            </div>
          )}

          {/* STL Export Confirmation Toast */}
          {exportSuccessPath && (
            <div className="absolute top-4 right-4 z-30 max-w-md px-4 py-3 rounded-xl bg-emerald-950/95 border border-emerald-400/60 text-emerald-200 shadow-2xl backdrop-blur-md flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
              <div className="text-xs font-mono">
                <div className="font-bold">3D STL Files Exported Successfully!</div>
                <div className="text-[10px] text-emerald-300/80 truncate mt-0.5">{exportSuccessPath}</div>
              </div>
            </div>
          )}

          {/* Floating PIP Webcam Preview for Hand Gesture Control */}
          {isHandTracking && (
            <div className="absolute bottom-4 right-4 z-30 w-44 h-32 rounded-xl bg-slate-950/90 border border-emerald-400/50 shadow-2xl overflow-hidden flex flex-col p-1.5 backdrop-blur-md">
              <div className="text-[9px] font-mono text-emerald-300 flex items-center justify-between px-1 mb-1">
                <span>CAM TRACKER</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              </div>
              <div ref={pipVideoRef} className="flex-1 w-full h-full overflow-hidden rounded-lg bg-black" />
              {handGestures.length > 0 && (
                <div className="text-[8px] font-mono text-center text-cyan-300 mt-0.5 uppercase">
                  {handGestures.join(" • ")}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 3. BOTTOM TELEMETRY TELEMETRY HUD BAR */}
      <footer className="h-10 px-4 bg-slate-900/90 border-t border-cyan-400/20 flex items-center justify-between shrink-0 text-xs font-mono text-slate-300 z-30">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-cyan-300 font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>REAL-TIME HARDWARE SYNC</span>
          </span>
          <span className="flex items-center gap-1 text-slate-400">
            <Cpu size={12} className="text-cyan-400" />
            <span>CPU: {Math.round(telemetry.cpu_percent)}%</span>
          </span>
          <span className="flex items-center gap-1 text-slate-400">
            <HardDrive size={12} className="text-indigo-400" />
            <span>RAM: {Math.round(telemetry.ram_percent)}% ({telemetry.ram_used_gb} GB)</span>
          </span>
          <span className="flex items-center gap-1 text-slate-400">
            <Thermometer size={12} className="text-amber-400" />
            <span>TEMP: {Math.round(telemetry.cpu_temp_c)}°C</span>
          </span>
          <span className="flex items-center gap-1 text-slate-400">
            <Gauge size={12} className="text-emerald-400" />
            <span>FANS: {telemetry.fan_rpm} RPM</span>
          </span>
        </div>

        <div className="text-[10px] text-slate-400 hidden sm:block">
          Controls: Orbit (Left Drag) • Pan (Right Drag) • Zoom (Wheel) • Hand Gestures (Webcam)
        </div>
      </footer>
    </div>
  );
}

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
} from "lucide-react";
import {
  SHOWPIECE_CATALOG,
  WorkshopTelemetry,
  pollWorkshopTelemetry,
  exportWorkshopStl,
} from "../services/workshopShowpieces";

interface WorkshopStagePanelProps {
  onClose: () => void;
  onVoiceSpeak?: (text: string) => void;
}

export function WorkshopStagePanel({ onClose, onVoiceSpeak }: WorkshopStagePanelProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [selectedShowpiece, setSelectedShowpiece] = useState<"jet_engine" | "gaming_pc">("jet_engine");
  const [isExploded, setIsExploded] = useState<boolean>(false);
  const [isThermalMode, setIsThermalMode] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccessPath, setExportSuccessPath] = useState<string | null>(null);
  const [activePartHover, setActivePartHover] = useState<{ name: string; desc: string } | null>(null);
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
      onVoiceSpeak(next ? "Disassembling 3D assembly into component layers." : "Reassembling components into unified state.");
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

  // Reset Camera
  const handleResetCamera = () => {
    sendToIframe({ type: "RESET_CAMERA" });
  };

  // Export STL 3D Print Files
  const handleTriggerExport = () => {
    setIsExporting(true);
    sendToIframe({ type: "TRIGGER_EXPORT_STL" });
  };

  // Setup message listener from sandboxed iframe
  useEffect(() => {
    const handleMessage = async (e: MessageEvent) => {
      const data = e.data;
      if (!data || !data.type) return;

      if (data.type === "STAGE_READY") {
        sendToIframe({ type: "LOAD_SHOWPIECE", showpiece: selectedShowpiece });
      } else if (data.type === "PART_HOVERED" || data.type === "PART_CLICKED") {
        setActivePartHover({ name: data.partName, desc: data.description });
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
  }, [selectedShowpiece, onVoiceSpeak]);

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
    };
  }, []);

  const currentMeta = SHOWPIECE_CATALOG.find((s) => s.id === selectedShowpiece) || SHOWPIECE_CATALOG[0];

  return (
    <div className="w-full h-full flex flex-col bg-slate-950/80 backdrop-blur-2xl border border-cyan-400/30 rounded-2xl shadow-2xl relative overflow-hidden select-none">
      {/* 1. TOP SCI-FI WORKSHOP TOOLBAR */}
      <header className="h-14 px-4 bg-slate-900/90 border-b border-cyan-400/25 flex items-center justify-between shrink-0 z-30 select-none">
        {/* Left: Branding & Showpiece Selector */}
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 shrink-0">
            <Boxes size={18} className="text-cyan-400 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-widest text-cyan-200">3D WORKSHOP</span>
              <span className="text-[10px] font-mono text-cyan-400/80 px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-400/30">
                PHASE 1
              </span>
            </div>
            <div className="text-[10px] text-slate-400 hidden sm:block truncate">
              {currentMeta.subtitle} • {currentMeta.partCount} Components
            </div>
          </div>

          {/* Showpiece Switcher Segmented Pills */}
          <div className="ml-2 sm:ml-4 flex items-center p-0.5 rounded-xl bg-black/50 border border-white/10">
            <button
              type="button"
              onClick={() => handleSelectShowpiece("jet_engine")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                selectedShowpiece === "jet_engine"
                  ? "bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span>Turbofan Jet Engine</span>
            </button>
            <button
              type="button"
              onClick={() => handleSelectShowpiece("gaming_pc")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                selectedShowpiece === "gaming_pc"
                  ? "bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Activity size={13} className={selectedShowpiece === "gaming_pc" ? "text-emerald-400" : ""} />
              <span>Gaming PC Twin</span>
            </button>
          </div>
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-2">
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
            <span className="hidden md:inline">{isExploded ? "Put Back Together" : "Pull It Apart"}</span>
          </button>

          {/* Thermal / Telemetry View Toggle */}
          <button
            type="button"
            onClick={handleToggleThermal}
            title="Toggle Thermal Telemetry View"
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
              isThermalMode
                ? "bg-rose-500/25 border-rose-400/60 text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.25)]"
                : "bg-white/5 border-white/10 hover:bg-white/10 text-slate-300"
            }`}
          >
            <Thermometer size={14} className={isThermalMode ? "text-rose-400" : ""} />
            <span className="hidden md:inline">Thermal View</span>
          </button>

          {/* Export STL Files Button */}
          <button
            type="button"
            onClick={handleTriggerExport}
            disabled={isExporting}
            title="Export all components as 3D-printable STL files"
            className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-xs font-bold flex items-center gap-1.5 transition shadow-sm disabled:opacity-50"
          >
            <Download size={14} className={isExporting ? "animate-bounce" : ""} />
            <span className="hidden sm:inline">{isExporting ? "Generating STL..." : "Export STL Files"}</span>
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

      {/* 2. MAIN 3D WORKSHOP STAGE IFRAME */}
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
          <div className="absolute top-4 left-4 z-20 max-w-sm px-4 py-2.5 rounded-xl bg-slate-950/90 border border-cyan-400/40 text-white shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-top-2">
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
            <span>PUMP/FANS: {telemetry.fan_rpm} RPM</span>
          </span>
        </div>

        <div className="text-[10px] text-slate-400 hidden sm:block">
          Controls: Orbit (Left Drag) • Pan (Right Drag) • Zoom (Wheel)
        </div>
      </footer>
    </div>
  );
}

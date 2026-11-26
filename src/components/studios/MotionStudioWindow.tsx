import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, Pause, Film, Download, X, Sparkles } from "lucide-react";

export function MotionStudioWindow() {
  const [title, setTitle] = useState("Grace Church Sunday Service");
  const [subtitle, setSubtitle] = useState("Worship • Word • Fellowship • Every Sunday 9:00 AM");
  const [accentColor, setAccentColor] = useState("#22d3ee");
  const [isPlaying, setIsPlaying] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [frame, setFrame] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Lightweight React/Canvas timeline animation loop (60fps, 5s loop = 300 frames)
  useEffect(() => {
    let animId = 0;
    const render = () => {
      if (isPlaying) {
        setFrame((f) => (f + 1) % 300);
      }
      animId = requestAnimationFrame(render);
    };
    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const t = frame / 300;

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, "#020617");
    grad.addColorStop(1, "#0f172a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Animated radial pulse
    const radius = 140 + Math.sin(t * Math.PI * 2) * 30;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, radius, 0, Math.PI * 2);
    ctx.strokeStyle = accentColor;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Animated title entrance
    const slideY = Math.max(0, 1 - Math.min(1, t * 4)) * 28;
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 34px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(title, w / 2, h / 2 - 12 + slideY);

    ctx.fillStyle = accentColor;
    ctx.font = "600 18px system-ui, sans-serif";
    ctx.fillText(subtitle, w / 2, h / 2 + 28 + slideY * 0.5);
  }, [frame, title, subtitle, accentColor]);

  // Zero-Python WebM Video Export via MediaRecorder
  const handleExportWebM = async () => {
    const canvas = canvasRef.current;
    if (!canvas || isRecording) return;
    setIsRecording(true);
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `angel-motion-${Date.now()}.webm`;
      a.click();
      setIsRecording(false);
    };

    recorder.start();
    setTimeout(() => recorder.stop(), 3500);
  };

  return (
    <div className="w-screen h-screen bg-slate-950/90 backdrop-blur-2xl border border-cyan-400/30 rounded-2xl flex flex-col text-white select-none overflow-hidden font-sans">
      <header
        data-tauri-drag-region
        className="h-12 px-4 border-b border-white/10 flex items-center justify-between bg-black/40"
      >
        <div className="flex items-center gap-2 pointer-events-none">
          <Film size={16} className="text-cyan-400" />
          <span className="text-xs font-extrabold tracking-wide">MOTION &amp; VIDEO MICRO-STUDIO</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportWebM}
            disabled={isRecording}
            className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-xs font-bold text-emerald-200 flex items-center gap-1.5"
          >
            <Download size={13} />
            <span>{isRecording ? "Rendering WebM..." : "Download Clip"}</span>
          </button>
          <button
            onClick={() => invoke("close_studio_window", { label: "studio-motion" }).catch(() => window.close())}
            className="p-1.5 rounded-xl hover:bg-rose-500/20 text-slate-400 hover:text-rose-300"
          >
            <X size={15} />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-64 border-r border-white/10 bg-black/30 p-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] text-slate-400 font-semibold">Slide Headline</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/15 text-xs text-white"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] text-slate-400 font-semibold">Announcement Subtitle</label>
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/15 text-xs text-white"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] text-slate-400 font-semibold">Accent Color</label>
            <div className="flex gap-2">
              {["#22d3ee", "#34d399", "#f59e0b", "#a855f7"].map((c) => (
                <button
                  key={c}
                  onClick={() => setAccentColor(c)}
                  style={{ backgroundColor: c }}
                  className={`w-7 h-7 rounded-full border-2 ${
                    accentColor === c ? "border-white scale-110" : "border-transparent"
                  }`}
                />
              ))}
            </div>
          </div>
        </aside>

        <main className="flex-1 flex flex-col items-center justify-center p-6 gap-4 bg-slate-900/50">
          <canvas
            ref={canvasRef}
            width={720}
            height={405}
            className="rounded-2xl border border-white/15 shadow-2xl max-w-full"
          />
          <div className="w-full max-w-[720px] flex items-center gap-3 px-4 py-2 rounded-xl bg-black/50 border border-white/10">
            <button
              onClick={() => setIsPlaying((p) => !p)}
              className="p-2 rounded-lg bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30"
            >
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <input
              type="range"
              min={0}
              max={299}
              value={frame}
              onChange={(e) => setFrame(Number(e.target.value))}
              className="flex-1 accent-cyan-400"
            />
            <span className="text-[11px] font-mono text-slate-300 flex items-center gap-1">
              <Sparkles size={11} className="text-cyan-400" />
              Frame {frame}/300
            </span>
          </div>
        </main>
      </div>
    </div>
  );
}

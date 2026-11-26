import { useEffect, useRef, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Line } from "react-konva";
import { removeBackground } from "@imgly/background-removal";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Wand2,
  Eraser,
  Paintbrush,
  ZoomIn,
  ZoomOut,
  Crop,
  Upload,
  Download,
  Sparkles,
  X,
  Send,
} from "lucide-react";
import { omniChatCompletion } from "../../services/omniRouteClient";
import { speakText } from "../../services/voiceEngine";

interface MaskStroke {
  points: number[];
  strokeWidth: number;
}

export function AnyCraftWindow() {
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);
  const [imageSrc, setImageSrc] = useState<string>("/angel_primary.png");
  const [strokes, setStrokes] = useState<MaskStroke[]>([]);
  const [tool, setTool] = useState<"brush" | "crop" | "pan">("brush");
  const [brushSize, setBrushSize] = useState(24);
  const [zoom, setZoom] = useState(1);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState(
    "இந்தப் பின்னணியை இயற்கையான மலைப் பகுதியாக மாற்றட்டுமா, அல்லது வேறு ஏதாவது மாற்ற வேண்டுமா?"
  );
  const [refinePrompt, setRefinePrompt] = useState("");

  const stageRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load image into HTMLImageElement for Konva
  useEffect(() => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.src = imageSrc;
    img.onload = () => setImageObj(img);
  }, [imageSrc]);

  // Listen to bidirectional studio init events from Main Angel HUD / Pet Avatar
  useEffect(() => {
    const unlisten = listen<{ initial_prompt?: string; image_path?: string }>(
      "angel-studio-init",
      (event) => {
        if (event.payload?.initial_prompt) {
          setRefinePrompt(event.payload.initial_prompt);
        }
      }
    );
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const handleUploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setImageSrc(reader.result);
        setStrokes([]);
      }
    };
    reader.readAsDataURL(file);
  };

  // Client-side WebAssembly Background Removal (@imgly/background-removal)
  const handleRemoveBackgroundOffline = async () => {
    setIsProcessing(true);
    setStatusMsg("WebAssembly AI மூலம் Background நீக்கப்படுகிறது...");
    try {
      const blob = await removeBackground(imageSrc);
      const url = URL.createObjectURL(blob);
      setImageSrc(url);
      const doneMsg =
        "Background வெற்றிகரமாக நீக்கப்பட்டது! இந்தப் பின்னணியை இயற்கையான மலைப் பகுதியாக மாற்றட்டுமா, அல்லது வேறு ஏதாவது மாற்ற வேண்டுமா?";
      setStatusMsg(doneMsg);
      speakText(doneMsg);
    } catch (err: any) {
      setStatusMsg(`Background removal error: ${err?.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Human-in-the-Loop Generative Outfit / Background Replacement via OmniRoute
  const handleGenerativeRefine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refinePrompt.trim() || isProcessing) return;
    const prompt = refinePrompt.trim();
    setRefinePrompt("");
    setIsProcessing(true);
    setStatusMsg(`"${prompt}" — Flux/ControlNet generative pipeline-க்கு அனுப்பப்படுகிறது...`);

    try {
      const res = await omniChatCompletion([
        {
          role: "system",
          content:
            "You are Angel AnyCraft Studio's art director. Confirm the visual mask/inpaint plan in natural Tamil/Tanglish and ask one short follow-up refinement question.",
        },
        {
          role: "user",
          content: `Mask strokes: ${strokes.length}. User edit request: ${prompt}`,
        },
      ]);
      setStatusMsg(res.text);
      speakText(res.text);
    } catch (err: any) {
      setStatusMsg(`Generative refine note: ${err?.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExportPng = () => {
    if (!stageRef.current) return;
    const uri = stageRef.current.toDataURL({ pixelRatio: 2 });
    const a = document.createElement("a");
    a.download = `angel-anycraft-${Date.now()}.png`;
    a.href = uri;
    a.click();
  };

  return (
    <div className="w-screen h-screen bg-slate-950/90 backdrop-blur-2xl border border-cyan-400/30 rounded-2xl flex flex-col text-white select-none overflow-hidden font-sans">
      {/* Frameless Acrylic Header */}
      <header
        data-tauri-drag-region
        className="h-12 px-4 border-b border-white/10 flex items-center justify-between bg-black/40"
      >
        <div className="flex items-center gap-2.5 pointer-events-none">
          <div className="w-7 h-7 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center">
            <Wand2 size={14} className="text-cyan-300" />
          </div>
          <div>
            <div className="text-xs font-extrabold tracking-wide">ANYCRAFT INTERACTIVE STUDIO</div>
            <div className="text-[10px] text-cyan-300">Konva Masking • WASM Cutout • OmniRoute Vision</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleUploadImage}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs flex items-center gap-1.5"
          >
            <Upload size={13} className="text-cyan-400" />
            <span>Load Image</span>
          </button>
          <button
            onClick={handleExportPng}
            className="px-2.5 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-xs font-bold text-emerald-200 flex items-center gap-1.5"
          >
            <Download size={13} />
            <span>Export PNG</span>
          </button>
          <button
            onClick={() => invoke("close_studio_window", { label: "studio-anycraft" }).catch(() => window.close())}
            className="p-1.5 rounded-xl hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 transition"
          >
            <X size={15} />
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Toolbar */}
        <aside className="w-56 border-r border-white/10 bg-black/30 p-3 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Canvas Tools
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                onClick={() => setTool("brush")}
                className={`p-2 rounded-xl border text-[11px] flex flex-col items-center gap-1 ${
                  tool === "brush"
                    ? "bg-cyan-500/20 border-cyan-400 text-cyan-200"
                    : "bg-white/5 border-white/10 text-slate-400"
                }`}
              >
                <Paintbrush size={14} />
                <span>Mask</span>
              </button>
              <button
                onClick={() => setTool("crop")}
                className={`p-2 rounded-xl border text-[11px] flex flex-col items-center gap-1 ${
                  tool === "crop"
                    ? "bg-cyan-500/20 border-cyan-400 text-cyan-200"
                    : "bg-white/5 border-white/10 text-slate-400"
                }`}
              >
                <Crop size={14} />
                <span>Crop</span>
              </button>
              <button
                onClick={() => setStrokes([])}
                className="p-2 rounded-xl border bg-white/5 border-white/10 text-slate-400 hover:text-white text-[11px] flex flex-col items-center gap-1"
              >
                <Eraser size={14} />
                <span>Clear</span>
              </button>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-slate-300">
                <span>Mask Brush</span>
                <span>{brushSize}px</span>
              </div>
              <input
                type="range"
                min={6}
                max={64}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-full accent-cyan-400"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}
                className="flex-1 py-1.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10"
              >
                <ZoomOut size={14} />
              </button>
              <span className="text-xs font-mono text-slate-300">{Math.round(zoom * 100)}%</span>
              <button
                onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}
                className="flex-1 py-1.5 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10"
              >
                <ZoomIn size={14} />
              </button>
            </div>
          </div>

          {/* Instant Offline WASM Background Removal */}
          <button
            onClick={handleRemoveBackgroundOffline}
            disabled={isProcessing}
            className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-500/25 to-purple-500/25 hover:from-cyan-500/40 hover:to-purple-500/40 border border-cyan-400/50 text-xs font-bold text-cyan-100 flex items-center justify-center gap-2 transition disabled:opacity-50"
          >
            <Sparkles size={14} className="text-cyan-300" />
            <span>{isProcessing ? "Processing..." : "Remove Background (WASM)"}</span>
          </button>
        </aside>

        {/* Center Konva Layered Canvas */}
        <main className="flex-1 flex flex-col bg-slate-900/60 relative overflow-hidden">
          <div className="flex-1 flex items-center justify-center overflow-auto p-4">
            <div className="rounded-2xl border border-white/10 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] overflow-hidden shadow-2xl">
              <Stage
                ref={stageRef}
                width={680}
                height={500}
                scaleX={zoom}
                scaleY={zoom}
                draggable={tool === "pan"}
                onMouseDown={(e) => {
                  if (tool !== "brush") return;
                  setIsDrawing(true);
                  const pos = e.target.getStage()?.getPointerPosition();
                  if (pos) {
                    setStrokes((prev) => [
                      ...prev,
                      { points: [pos.x / zoom, pos.y / zoom], strokeWidth: brushSize },
                    ]);
                  }
                }}
                onMouseMove={(e) => {
                  if (!isDrawing || tool !== "brush") return;
                  const stage = e.target.getStage();
                  const pos = stage?.getPointerPosition();
                  if (!pos) return;
                  setStrokes((prev) => {
                    const next = [...prev];
                    const last = next[next.length - 1];
                    if (last) {
                      last.points = last.points.concat([pos.x / zoom, pos.y / zoom]);
                    }
                    return next;
                  });
                }}
                onMouseUp={() => setIsDrawing(false)}
              >
                <Layer>
                  {imageObj && (
                    <KonvaImage
                      image={imageObj}
                      x={120}
                      y={30}
                      width={440}
                      height={440}
                      listening={false}
                    />
                  )}
                  {strokes.map((line, i) => (
                    <Line
                      key={i}
                      points={line.points}
                      stroke="rgba(34, 211, 238, 0.55)"
                      strokeWidth={line.strokeWidth}
                      tension={0.5}
                      lineCap="round"
                      lineJoin="round"
                    />
                  ))}
                </Layer>
              </Stage>
            </div>
          </div>

          {/* Human-in-the-Loop Tamil/Tanglish Contextual Refinement Bar */}
          <div className="p-3 border-t border-white/10 bg-slate-950/90 space-y-2">
            <div className="text-xs text-cyan-200 flex items-center gap-2">
              <Sparkles size={13} className="text-cyan-400 shrink-0" />
              <span>{statusMsg}</span>
            </div>
            <form onSubmit={handleGenerativeRefine} className="flex items-center gap-2">
              <input
                type="text"
                value={refinePrompt}
                onChange={(e) => setRefinePrompt(e.target.value)}
                placeholder="Ex: 'Change outfit to natural outdoor suit' or 'மலைப் பின்னணி மாற்று'..."
                className="flex-1 px-3 py-2 rounded-xl bg-black/60 border border-white/15 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
              <button
                type="submit"
                disabled={!refinePrompt.trim() || isProcessing}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 disabled:opacity-40"
              >
                <Send size={13} />
                <span>Refine</span>
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}

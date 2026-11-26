import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import * as THREE from "three";
import {
  Mic,
  MicOff,
  Sparkles,
  Music,
  BookOpen,
  Church,
  LayoutDashboard,
  Droplets,
  ImageMinus,
  UploadCloud,
  X,
} from "lucide-react";
import { useAngelVoice } from "../hooks/useAngelVoice";
import { resolveLocalFallbackProfile } from "../services/supabaseAuth";
import { spawnStudio } from "../services/studioRouter";

interface CursorGazePayload {
  x: number;
  y: number;
  norm_x: number;
  norm_y: number;
}

interface HydrationNudgePayload {
  active_minutes: number;
  message_ta: string;
}

interface PetFileDropPayload {
  paths: string[];
  prompt_ta: string;
}

export function PetAvatarWindow() {
  const [profile] = useState(() => resolveLocalFallbackProfile());
  const voice = useAngelVoice(profile);

  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const [isBlinking, setIsBlinking] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hydrationNudge, setHydrationNudge] = useState<HydrationNudgePayload | null>(null);
  const [droppedFiles, setDroppedFiles] = useState<string[] | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const particleCanvasRef = useRef<HTMLDivElement>(null);

  // 1. Global OS Cursor Eye/Head Tracking from Rust
  useEffect(() => {
    const unlistenGaze = listen<CursorGazePayload>("angel-cursor-gaze", (event) => {
      if (event.payload) {
        setGaze({
          x: event.payload.norm_x * 13,
          y: -event.payload.norm_y * 8,
        });
      }
    });

    const unlistenHydration = listen<HydrationNudgePayload>("angel-hydration-nudge", (event) => {
      if (event.payload) {
        setHydrationNudge(event.payload);
        voice.speakReply(event.payload.message_ta);
      }
    });

    const unlistenDrop = listen<PetFileDropPayload>("angel-pet-file-drop", (event) => {
      if (event.payload?.paths?.length) {
        setDroppedFiles(event.payload.paths);
        setStatusToast(event.payload.prompt_ta);
        voice.speakReply(event.payload.prompt_ta);
      }
    });

    return () => {
      unlistenGaze.then((f) => f());
      unlistenHydration.then((f) => f());
      unlistenDrop.then((f) => f());
    };
  }, [voice.speakReply]);

  // 2. Natural Idle Blinking Loop
  useEffect(() => {
    const timer = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 140);
    }, 4200);
    return () => clearInterval(timer);
  }, []);

  // 3. Subtle Three.js Ambient Energy Particles Behind Companion Avatar
  useEffect(() => {
    if (!particleCanvasRef.current) return;
    const width = 260;
    const height = 320;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 4.5;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    particleCanvasRef.current.innerHTML = "";
    particleCanvasRef.current.appendChild(renderer.domElement);

    const count = 48;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 2.8;
      positions[i + 1] = (Math.random() - 0.5) * 3.8;
      positions[i + 2] = (Math.random() - 0.5) * 1.4;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.04,
      transparent: true,
      opacity: 0.65,
    });
    const particles = new THREE.Points(geo, mat);
    scene.add(particles);

    let animId = 0;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      particles.rotation.y += 0.0025;
      particles.position.y = Math.sin(Date.now() * 0.0012) * 0.08;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      renderer.dispose();
    };
  }, []);

  // HTML5 Drag-and-Drop Fallback onto Avatar
  const handleHtmlDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const names = Array.from(e.dataTransfer.files).map((f) => f.name);
    if (names.length > 0) {
      const promptTa =
        "இந்த ஃபைலோட பேக்ரவுண்ட் ரிமூவ் பண்ணட்டுமா, இல்ல Grace Church App-ல ஏத்தட்டுமா?";
      setDroppedFiles(names);
      setStatusToast(promptTa);
      voice.speakReply(promptTa);
    }
  };

  const handleDismissHydration = async () => {
    setHydrationNudge(null);
    await invoke("reset_work_timer").catch(() => {});
  };

  const handlePlayHydrationRiddle = async () => {
    setHydrationNudge(null);
    await invoke("reset_work_timer").catch(() => {});
    await voice.startContinuousMode("tamil_riddles");
  };

  const handleFileAction = async (action: "remove_bg" | "upload_church") => {
    const fileLabel = droppedFiles?.[0]?.split(/[/\\]/).pop() || "file";
    setDroppedFiles(null);
    if (action === "remove_bg") {
      const msg = `"${fileLabel}" ஃபைலின் background-ஐ நீக்க AnyCraft Studio திறக்கிறேன்.`;
      setStatusToast(msg);
      await spawnStudio("anycraft", "Remove background", droppedFiles?.[0]).catch(() => {});
    } else {
      const msg = `"${fileLabel}" Grace Church Management App upload queue-க்கு தயாராக உள்ளது!`;
      setStatusToast(msg);
      await voice.speakReply(msg);
    }
    setTimeout(() => setStatusToast(null), 4000);
  };

  const auraColor = voice.isSpeaking
    ? "rgba(16, 185, 129, 0.55)"
    : voice.listening
    ? "rgba(244, 63, 94, 0.55)"
    : hydrationNudge
    ? "rgba(56, 189, 248, 0.65)"
    : "rgba(34, 211, 238, 0.35)";

  const stateClass = voice.isSpeaking
    ? "brahma-speak"
    : voice.listening
    ? "brahma-listen"
    : "brahma-idle";

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuOpen((prev) => !prev);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleHtmlDrop}
      className="relative w-screen h-screen bg-transparent flex flex-col items-center justify-end overflow-visible select-none font-sans"
    >
      {/* Ambient Three.js Particles */}
      <div
        ref={particleCanvasRef}
        className="absolute inset-0 flex items-center justify-center pointer-events-none z-0"
      />

      {/* Contextual Bubble: Hydration Nudge / File Drop / Voice Reply */}
      {(hydrationNudge || droppedFiles || statusToast || voice.lastReply) && (
        <div className="z-30 mb-2 w-[256px] rounded-2xl bg-slate-950/90 border border-cyan-400/50 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.6)] p-2.5 text-[11px] text-slate-100 space-y-2">
          {hydrationNudge ? (
            <>
              <div className="flex items-center justify-between text-sky-300 font-bold">
                <span className="flex items-center gap-1.5">
                  <Droplets size={13} className="animate-bounce text-sky-400" />
                  <span>45m Wellness Care</span>
                </span>
                <button onClick={handleDismissHydration} className="text-slate-400 hover:text-white">
                  <X size={12} />
                </button>
              </div>
              <p className="text-[10.5px] leading-relaxed text-slate-200">{hydrationNudge.message_ta}</p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={handlePlayHydrationRiddle}
                  className="flex-1 py-1 px-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-[10px] font-bold"
                >
                  விடுகதை (2m)
                </button>
                <button
                  onClick={handleDismissHydration}
                  className="py-1 px-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-[10px] font-bold"
                >
                  Water ✓
                </button>
              </div>
            </>
          ) : droppedFiles ? (
            <>
              <div className="flex items-center justify-between text-cyan-300 font-bold">
                <span className="truncate max-w-[200px]">
                  {droppedFiles[0]?.split(/[/\\]/).pop()}
                </span>
                <button onClick={() => setDroppedFiles(null)} className="text-slate-400 hover:text-white">
                  <X size={12} />
                </button>
              </div>
              <p className="text-[10.5px] leading-relaxed text-slate-200">
                இந்த ஃபைலோட பேக்ரவுண்ட் ரிமூவ் பண்ணட்டுமா, இல்ல Grace Church App-ல ஏத்தட்டுமா?
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleFileAction("remove_bg")}
                  className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/40 text-purple-200 text-[10px] font-bold"
                >
                  <ImageMinus size={11} />
                  <span>Remove BG</span>
                </button>
                <button
                  onClick={() => handleFileAction("upload_church")}
                  className="flex-1 flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-[10px] font-bold"
                >
                  <UploadCloud size={11} />
                  <span>Grace App</span>
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10.5px] leading-relaxed text-slate-200 line-clamp-3">
                {statusToast || voice.lastReply}
              </p>
              <button
                onClick={() => setStatusToast(null)}
                className="text-slate-400 hover:text-white shrink-0"
              >
                <X size={11} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Right-Click Windows 11 Acrylic Glassmorphism Context Menu */}
      {menuOpen && (
        <div className="z-40 mb-2 w-[240px] rounded-2xl bg-slate-950/90 border border-white/15 backdrop-blur-2xl shadow-2xl p-1.5 space-y-1 text-xs">
          <button
            onClick={() => {
              setMenuOpen(false);
              if (voice.continuousLoop) voice.stopContinuousMode();
              else voice.startContinuousMode("idle");
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-left text-slate-100 transition"
          >
            {voice.continuousLoop ? (
              <MicOff size={13} className="text-rose-400 shrink-0" />
            ) : (
              <Mic size={13} className="text-emerald-400 shrink-0" />
            )}
            <span className="truncate font-medium">
              {voice.continuousLoop ? "Stop Continuous Voice" : "Keep Talk With Me"}
            </span>
          </button>

          <button
            onClick={() => {
              setMenuOpen(false);
              voice.startContinuousMode("tamil_riddles");
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-left text-slate-100 transition"
          >
            <Sparkles size={13} className="text-amber-400 shrink-0" />
            <span className="truncate">விடுகதை சொல்லு (Tamil Riddles)</span>
          </button>

          <button
            onClick={() => {
              setMenuOpen(false);
              voice.startContinuousMode("paatukku_paatu");
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-left text-slate-100 transition"
          >
            <Music size={13} className="text-pink-400 shrink-0" />
            <span className="truncate">பாட்டுக்குப் பாட்டு (Antakshari)</span>
          </button>

          <button
            onClick={() => {
              setMenuOpen(false);
              voice.startContinuousMode("bible_quiz");
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-left text-slate-100 transition"
          >
            <BookOpen size={13} className="text-sky-400 shrink-0" />
            <span className="truncate">Bible Verse &amp; Quiz</span>
          </button>

          <button
            onClick={() => {
              setMenuOpen(false);
              voice.startContinuousMode("grace_church_admin");
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-left text-slate-100 transition"
          >
            <Church size={13} className="text-cyan-400 shrink-0" />
            <span className="truncate">Grace Church Admin Mode</span>
          </button>

          <button
            onClick={() => {
              setMenuOpen(false);
              invoke("show_main_dashboard", { initialMode: "arcade" }).catch(() => {});
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-left text-amber-200 transition"
          >
            <Sparkles size={13} className="text-amber-400 shrink-0" />
            <span className="truncate">Chill &amp; Arcade (Chess / Ludo)</span>
          </button>

          <div className="border-t border-white/10 my-1" />

          <button
            onClick={() => {
              setMenuOpen(false);
              invoke("show_main_dashboard", { initialMode: null }).catch(() => {});
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-cyan-500/20 text-left text-cyan-200 font-semibold transition"
          >
            <LayoutDashboard size={13} className="text-cyan-400 shrink-0" />
            <span>Open Main Dashboard</span>
          </button>
        </div>
      )}

      {/* Realistic Human-Like Companion Avatar Stage (Draggable via data-tauri-drag-region) */}
      <div
        data-tauri-drag-region
        style={{
          transform: `perspective(900px) rotateY(${gaze.x}deg) rotateX(${gaze.y}deg)`,
        }}
        className={`relative z-10 cursor-grab active:cursor-grabbing transition-transform duration-150 ease-out flex flex-col items-center ${
          isDragOver ? "scale-105 ring-2 ring-cyan-400/70 rounded-3xl" : ""
        }`}
        title="Right-click for Companion Menu | Drag to move | Drop files here"
      >
        {/* Subtle Reactive Aura */}
        <div
          style={{ backgroundColor: auraColor }}
          className="absolute bottom-4 w-36 h-44 rounded-full blur-2xl pointer-events-none transition-colors duration-300"
        />

        {/* Hydration Water Cup Badge when 45m Nudge is Active */}
        {hydrationNudge && (
          <div className="absolute -right-2 top-8 z-20 px-2 py-1 rounded-full bg-sky-500/90 text-white text-[10px] font-bold shadow-lg flex items-center gap-1 animate-bounce pointer-events-none">
            <Droplets size={12} />
            <span>Water Break!</span>
          </div>
        )}

        <div className={`relative ${stateClass} pointer-events-none`}>
          <img
            src="/angel_primary.png"
            alt="Angel Companion"
            style={{
              filter: `drop-shadow(0 0 16px ${auraColor}) ${isBlinking ? "brightness(0.95)" : ""}`,
            }}
            className="h-[215px] w-auto object-contain transition-all duration-150"
          />
        </div>

        {/* Compact Status Pill */}
        <div
          onClick={() => voice.toggleVoice()}
          className="mt-1 mb-1.5 px-2.5 py-0.5 rounded-full bg-slate-950/80 border border-white/15 backdrop-blur-xl text-[9.5px] font-bold tracking-wider uppercase text-cyan-200 flex items-center gap-1.5 cursor-pointer hover:border-cyan-400/60 shadow-lg"
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              voice.isSpeaking
                ? "bg-emerald-400 animate-ping"
                : voice.listening
                ? "bg-rose-400 animate-ping"
                : voice.isProcessing
                ? "bg-amber-400 animate-pulse"
                : "bg-cyan-400"
            }`}
          />
          <span>
            {voice.isSpeaking
              ? "SPEAKING"
              : voice.listening
              ? "LISTENING"
              : voice.mode !== "idle"
              ? voice.mode.replace(/_/g, " ")
              : "ANGEL • READY"}
          </span>
        </div>
      </div>
    </div>
  );
}

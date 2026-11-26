import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

export type Avatar2DState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "greeting"
  | "alert"
  | "happy"
  | "cursor_tracking";

interface VtuberAvatarStageProps {
  speaking?: boolean;
  listening?: boolean;
  thinking?: boolean;
  alertActive?: boolean;
  happyActive?: boolean;
  forcedState?: Avatar2DState | null;
  compact?: boolean;
}

const DEFAULT_2D_SPRITE = "/assets/avatar/angel_2d_default.png";

export function VtuberAvatarStage({
  speaking = false,
  listening = false,
  thinking = false,
  alertActive = false,
  happyActive = false,
  forcedState = null,
  compact = false,
}: VtuberAvatarStageProps) {
  const [avatarSrc, setAvatarSrc] = useState<string>(() => {
    return localStorage.getItem("angel_2d_avatar_image") || DEFAULT_2D_SPRITE;
  });
  const [speechEventActive, setSpeechEventActive] = useState(false);
  const [speechPreviewText, setSpeechPreviewText] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<Avatar2DState | null>(forcedState);
  const [startupGreeting, setStartupGreeting] = useState(true);
  const [isBlinking, setIsBlinking] = useState(false);
  const [cursorOffset, setCursorOffset] = useState({ x: 0, y: 0 });
  const [lipAmplitude, setLipAmplitude] = useState(0);

  const stageRef = useRef<HTMLDivElement>(null);

  // Startup Greeting for 2.8 seconds
  useEffect(() => {
    const t = setTimeout(() => setStartupGreeting(false), 2800);
    return () => clearTimeout(t);
  }, []);

  // Periodic Natural Eye Blinking (every ~3.8s)
  useEffect(() => {
    const interval = setInterval(() => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 140);
    }, 3800);
    return () => clearInterval(interval);
  }, []);

  // Sync with voiceEngine.ts global Tauri speech events + Control Center sprite/state previews
  useEffect(() => {
    const unlistenStart = listen<{ text?: string }>("angel-speech-start", (e) => {
      setSpeechEventActive(true);
      if (e.payload?.text) setSpeechPreviewText(e.payload.text);
    });
    const unlistenEnd = listen("angel-speech-end", () => {
      setSpeechEventActive(false);
      setSpeechPreviewText(null);
    });
    const unlistenSprite = listen<{ src?: string }>("angel-2d-avatar-changed", (e) => {
      const updated = e.payload?.src || localStorage.getItem("angel_2d_avatar_image") || DEFAULT_2D_SPRITE;
      setAvatarSrc(updated);
    });
    const unlistenPreview = listen<{ state?: Avatar2DState | null }>("angel-2d-state-preview", (e) => {
      setPreviewState(e.payload?.state || null);
    });

    const onWindowSpriteChange = () => {
      setAvatarSrc(localStorage.getItem("angel_2d_avatar_image") || DEFAULT_2D_SPRITE);
    };
    window.addEventListener("angel-2d-avatar-changed", onWindowSpriteChange);

    return () => {
      unlistenStart.then((f) => f());
      unlistenEnd.then((f) => f());
      unlistenSprite.then((f) => f());
      unlistenPreview.then((f) => f());
      window.removeEventListener("angel-2d-avatar-changed", onWindowSpriteChange);
    };
  }, []);

  // Smooth Cursor Tracking (State 8: cursor_tracking)
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const normX = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      const normY = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
      setCursorOffset({
        x: Math.max(-12, Math.min(12, normX * 12)),
        y: Math.max(-7, Math.min(7, -normY * 7)),
      });
    };
    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, []);

  // Resolve Active 2D Animation State
  const effectiveSpeaking = speaking || speechEventActive;
  const activeState: Avatar2DState =
    previewState ||
    forcedState ||
    (alertActive
      ? "alert"
      : effectiveSpeaking
      ? "speaking"
      : listening
      ? "listening"
      : thinking
      ? "thinking"
      : happyActive
      ? "happy"
      : startupGreeting
      ? "greeting"
      : "idle");

  // Real-time Lip-Sync Jaw/Mouth Modulation when speaking
  useEffect(() => {
    if (activeState !== "speaking") {
      setLipAmplitude(0);
      return;
    }
    let raf = 0;
    const tick = () => {
      const wave = Math.abs(Math.sin(performance.now() * 0.018)) * 0.7 + Math.random() * 0.3;
      setLipAmplitude(wave);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [activeState]);

  // State-driven Aura Color & Motion Transforms
  const auraMap: Record<Avatar2DState, string> = {
    idle: "rgba(34, 211, 238, 0.32)",
    listening: "rgba(244, 63, 94, 0.5)",
    thinking: "rgba(168, 85, 247, 0.45)",
    speaking: "rgba(16, 185, 129, 0.52)",
    greeting: "rgba(56, 189, 248, 0.48)",
    alert: "rgba(245, 158, 11, 0.6)",
    happy: "rgba(52, 211, 153, 0.55)",
    cursor_tracking: "rgba(34, 211, 238, 0.42)",
  };

  const stateClass =
    activeState === "speaking"
      ? "brahma-speak"
      : activeState === "listening"
      ? "brahma-listen"
      : "brahma-idle";

  const extraTransform =
    activeState === "thinking"
      ? "rotateZ(-3deg) translateY(-4px)"
      : activeState === "happy"
      ? "scale(1.04) translateY(-8px)"
      : activeState === "alert"
      ? "scale(1.03)"
      : activeState === "greeting"
      ? "scale(1.02) translateY(-4px)"
      : "";

  const auraColor = auraMap[activeState];

  return (
    <div
      ref={stageRef}
      className="relative w-full h-full flex flex-col items-center justify-end select-none overflow-visible pointer-events-none"
    >
      {/* Dynamic Ambient Aura */}
      <div
        style={{ backgroundColor: auraColor }}
        className={`absolute bottom-10 rounded-full blur-3xl transition-all duration-300 ${
          compact ? "w-36 h-44" : "w-56 h-72"
        } ${activeState === "speaking" || activeState === "listening" ? "opacity-80 scale-110" : "opacity-50"}`}
      />

      {/* Speech Bubble when speaking */}
      {speechPreviewText && !compact && (
        <div className="mb-2 max-w-[260px] px-3 py-1.5 rounded-2xl bg-slate-950/85 border border-cyan-400/50 backdrop-blur-xl text-[11px] text-cyan-100 text-center shadow-lg">
          {speechPreviewText}
        </div>
      )}

      {/* 2D Animated Companion Figure with Smooth Cursor Tracking & Lip-Sync */}
      <div
        style={{
          transform: `perspective(1000px) rotateY(${cursorOffset.x}deg) rotateX(${cursorOffset.y}deg) ${extraTransform}`,
        }}
        className="relative z-10 flex flex-col items-center transition-transform duration-150 ease-out"
      >
        <div
          style={{
            transform: activeState === "speaking" ? `scaleY(${1 + lipAmplitude * 0.015})` : undefined,
          }}
          className={`relative ${stateClass}`}
        >
          <img
            src={avatarSrc}
            alt="Angel 2D Companion"
            onError={() => {
              if (avatarSrc !== "/angel_primary.png") setAvatarSrc("/angel_primary.png");
            }}
            style={{
              filter: `drop-shadow(0 0 18px ${auraColor}) ${isBlinking ? "brightness(0.95)" : ""}`,
            }}
            className={`${
              compact ? "max-h-[240px]" : "max-h-[430px]"
            } w-auto object-contain transition-all duration-200 rounded-2xl`}
          />

          {/* Neural Thinking Pulse / Alert Ring */}
          {activeState === "thinking" && (
            <div className="absolute -top-2 right-6 w-3 h-3 rounded-full bg-purple-400 animate-ping" />
          )}
          {activeState === "alert" && (
            <div className="absolute -top-2 right-6 w-3.5 h-3.5 rounded-full bg-amber-400 animate-ping" />
          )}

          {/* Subtle Hologram Scanline */}
          <div className="absolute left-4 right-4 h-[2px] bg-gradient-to-r from-transparent via-cyan-300/75 to-transparent holo-scanline" />
        </div>
      </div>

      {/* State Telemetry Pill */}
      <div className="z-20 mt-1 px-3 py-0.5 rounded-full bg-slate-950/80 border border-white/15 backdrop-blur-xl text-[10px] font-bold tracking-widest uppercase text-cyan-200 flex items-center gap-1.5 shadow-lg">
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            activeState === "speaking"
              ? "bg-emerald-400 animate-ping"
              : activeState === "listening"
              ? "bg-rose-400 animate-ping"
              : activeState === "alert"
              ? "bg-amber-400 animate-ping"
              : activeState === "thinking"
              ? "bg-purple-400 animate-pulse"
              : "bg-cyan-400"
          }`}
        />
        <span>ANGEL • {activeState.replace("_", " ")}</span>
      </div>
    </div>
  );
}

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

/**
 * Draws a clean built-in 2D Female AI Companion vector/canvas rig when no image is loaded.
 * Zero robotic visor mask, zero feather wings.
 */
function drawFallbackFemaleRig(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  state: Avatar2DState,
  gazeX: number,
  gazeY: number,
  blinkAmt: number,
  lipOpen: number
) {
  const cx = w / 2;
  const baseY = h * 0.94;
  const breathe = Math.sin(t * 2.4) * 3.5;

  ctx.save();
  ctx.translate(cx, baseY);

  // Subtle state tilt/lean
  let tilt = Math.sin(t * 1.1) * 0.015;
  let scale = 1 + Math.sin(t * 2.4) * 0.012;
  if (state === "thinking") tilt = -0.055;
  if (state === "listening") scale = 1.035;
  if (state === "happy") scale = 1.04 + Math.abs(Math.sin(t * 6)) * 0.025;
  if (state === "greeting") tilt = Math.sin(t * 5) * 0.04;

  ctx.rotate(tilt);
  ctx.scale(scale, scale);

  // Torso / Blue & Gold Futuristic Suit
  ctx.fillStyle = "#1e3a5f";
  ctx.beginPath();
  ctx.moveTo(-34, -120 + breathe);
  ctx.quadraticCurveTo(0, -135 + breathe, 34, -120 + breathe);
  ctx.lineTo(44, 0);
  ctx.lineTo(-44, 0);
  ctx.closePath();
  ctx.fill();

  // Gold collar trim
  ctx.strokeStyle = "#fbbf24";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-22, -124 + breathe);
  ctx.quadraticCurveTo(0, -108 + breathe, 22, -124 + breathe);
  ctx.stroke();

  // Neck
  ctx.fillStyle = "#e8b89a";
  ctx.fillRect(-10, -146 + breathe, 20, 26);

  // Head + Gaze offset
  ctx.save();
  ctx.translate(gazeX * 5, -172 + breathe + gazeY * 3);

  // Back hair
  ctx.fillStyle = "#1e1b4b";
  ctx.beginPath();
  ctx.ellipse(0, 6, 36, 44, 0, 0, Math.PI * 2);
  ctx.fill();

  // Face
  ctx.fillStyle = "#f2c6aa";
  ctx.beginPath();
  ctx.ellipse(0, 0, 27, 33, 0, 0, Math.PI * 2);
  ctx.fill();

  // Hair bangs / crown
  ctx.fillStyle = "#1e1b4b";
  ctx.beginPath();
  ctx.arc(0, -10, 29, Math.PI * 0.95, Math.PI * 2.05);
  ctx.fill();

  // Eyes + Pupils + Blink
  const eyeY = -3;
  const eyeH = Math.max(0.8, 4.8 * (1 - blinkAmt));
  for (const side of [-1, 1]) {
    const ex = side * 10;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, 5.5, eyeH, 0, 0, Math.PI * 2);
    ctx.fill();

    if (blinkAmt < 0.75) {
      ctx.fillStyle = "#0f172a";
      ctx.beginPath();
      ctx.arc(ex + gazeX * 1.8, eyeY + gazeY * 1.2, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Expressive Mouth (Lip-Sync)
  ctx.fillStyle = "#be123c";
  ctx.beginPath();
  const mouthH = 1.6 + lipOpen * 5.2;
  ctx.ellipse(0, 15, 7, mouthH, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  ctx.restore();
}

export function VtuberAvatarStage({
  speaking = false,
  listening = false,
  thinking = false,
  alertActive = false,
  happyActive = false,
  forcedState = null,
  compact = false,
}: VtuberAvatarStageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const imageReadyRef = useRef<boolean>(false);

  const [avatarSrc, setAvatarSrc] = useState<string>(() => {
    return localStorage.getItem("angel_2d_avatar_image") || DEFAULT_2D_SPRITE;
  });
  const [cursorTrackingEnabled, setCursorTrackingEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem("angel_2d_cursor_tracking");
    return saved === null ? true : saved === "true";
  });
  const [speechEventActive, setSpeechEventActive] = useState(false);
  const [speechPreviewText, setSpeechPreviewText] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<Avatar2DState | null>(forcedState);
  const [startupGreeting, setStartupGreeting] = useState(true);

  const gazeTargetRef = useRef({ x: 0, y: 0 });
  const gazeSmoothRef = useRef({ x: 0, y: 0 });
  const activeStateRef = useRef<Avatar2DState>("idle");
  const cursorTrackingRef = useRef(cursorTrackingEnabled);

  useEffect(() => {
    cursorTrackingRef.current = cursorTrackingEnabled;
  }, [cursorTrackingEnabled]);

  useEffect(() => {
    const t = setTimeout(() => setStartupGreeting(false), 2800);
    return () => clearTimeout(t);
  }, []);

  // Load 2D Sprite Image cleanly into offscreen HTMLImageElement for Canvas rendering
  useEffect(() => {
    imageReadyRef.current = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      loadedImageRef.current = img;
      imageReadyRef.current = true;
    };
    img.onerror = () => {
      if (avatarSrc !== "/angel_primary.png") {
        setAvatarSrc("/angel_primary.png");
      } else {
        loadedImageRef.current = null;
        imageReadyRef.current = false;
      }
    };
    img.src = avatarSrc;
  }, [avatarSrc]);

  // Listen to voiceEngine.ts global Tauri speech events + Menu sprite/state previews
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
    const unlistenCursorToggle = listen<{ enabled?: boolean }>("angel-2d-cursor-toggle", (e) => {
      if (typeof e.payload?.enabled === "boolean") {
        setCursorTrackingEnabled(e.payload.enabled);
      }
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
      unlistenCursorToggle.then((f) => f());
      window.removeEventListener("angel-2d-avatar-changed", onWindowSpriteChange);
    };
  }, []);

  // Track pointer position smoothly across viewport
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!cursorTrackingRef.current) {
        gazeTargetRef.current = { x: 0, y: 0 };
        return;
      }
      const normX = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
      const normY = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
      gazeTargetRef.current = {
        x: Math.max(-1, Math.min(1, normX)),
        y: Math.max(-1, Math.min(1, normY)),
      };
    };
    window.addEventListener("mousemove", onMouseMove);
    return () => window.removeEventListener("mousemove", onMouseMove);
  }, []);

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

  activeStateRef.current = activeState;

  // Continuous 60fps HTML5 Canvas 2D Live-Animation Loop (all 8 states)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    const startTime = performance.now();

    const renderFrame = (now: number) => {
      rafId = requestAnimationFrame(renderFrame);
      const t = (now - startTime) / 1000;
      const state = activeStateRef.current;

      // Smooth cursor gaze interpolation
      const targetGaze =
        cursorTrackingRef.current || state === "cursor_tracking"
          ? gazeTargetRef.current
          : { x: 0, y: 0 };
      gazeSmoothRef.current.x += (targetGaze.x - gazeSmoothRef.current.x) * 0.12;
      gazeSmoothRef.current.y += (targetGaze.y - gazeSmoothRef.current.y) * 0.12;
      const gx = gazeSmoothRef.current.x;
      const gy = gazeSmoothRef.current.y;

      // Periodic natural eye blink (~every 3.8s)
      const blinkMod = t % 3.8;
      const blinkAmt = blinkMod > 3.64 ? Math.sin(((blinkMod - 3.64) / 0.16) * Math.PI) : 0;

      // Real-time syllable/cadence lip-sync amplitude when speaking
      const lipOpen =
        state === "speaking"
          ? 0.25 + Math.abs(Math.sin(t * 14.5)) * 0.5 + Math.abs(Math.sin(t * 23.0)) * 0.25
          : 0;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = compact ? 220 : 320;
      const cssH = compact ? 270 : 410;
      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // State-specific subtle crisp aura ring (no blurry ghost box)
      const ringColorMap: Record<Avatar2DState, string> = {
        idle: "rgba(34, 211, 238, 0.28)",
        listening: "rgba(244, 63, 94, 0.55)",
        thinking: "rgba(168, 85, 247, 0.5)",
        speaking: "rgba(16, 185, 129, 0.55)",
        greeting: "rgba(56, 189, 248, 0.5)",
        alert: "rgba(245, 158, 11, 0.65)",
        happy: "rgba(52, 211, 153, 0.6)",
        cursor_tracking: "rgba(34, 211, 238, 0.45)",
      };

      // Pedestal ring at bottom
      ctx.save();
      ctx.strokeStyle = ringColorMap[state];
      ctx.lineWidth = state === "listening" || state === "alert" ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.ellipse(
        cssW / 2,
        cssH - 12,
        cssW * 0.34 + Math.sin(t * 3) * (state === "listening" ? 5 : 1.5),
        8,
        0,
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.restore();

      const img = loadedImageRef.current;
      if (imageReadyRef.current && img && img.naturalWidth > 0) {
        // Draw uploaded / default 2D companion image with continuous 60fps animation transforms
        const aspect = img.naturalWidth / img.naturalHeight;
        const drawH = cssH - 22;
        const drawW = Math.min(cssW - 12, drawH * aspect);

        // Continuous state transforms
        const breatheScaleY = 1 + Math.sin(t * 2.5) * 0.014;
        const breatheScaleX = 1 - Math.sin(t * 2.5) * 0.005;
        let floatY = Math.sin(t * 2.2) * 3.0;
        let rot = Math.sin(t * 1.1) * 0.012 + gx * 0.035;
        let extraScale = 1;

        if (state === "listening") {
          extraScale = 1.035;
          floatY -= 3;
        } else if (state === "thinking") {
          rot = -0.045 + Math.sin(t * 1.6) * 0.012;
        } else if (state === "speaking") {
          floatY += Math.sin(t * 9) * 1.6;
          extraScale = 1.015 + lipOpen * 0.012;
        } else if (state === "greeting") {
          floatY += Math.sin(t * 6) * 4.5;
          rot = Math.sin(t * 4.5) * 0.035;
        } else if (state === "alert") {
          extraScale = 1.03;
        } else if (state === "happy") {
          floatY -= Math.abs(Math.sin(t * 6.5)) * 7;
          extraScale = 1.035;
        }

        ctx.save();
        ctx.translate(cssW / 2 + gx * 4, cssH - 12 + floatY + gy * 2.5);
        ctx.rotate(rot);
        ctx.scale(breatheScaleX * extraScale, breatheScaleY * extraScale);
        ctx.drawImage(img, -drawW / 2, -drawH, drawW, drawH);

        // Subtle periodic blink & lip-sync modulation highlight over upper/lower face region
        if (blinkAmt > 0.1) {
          ctx.fillStyle = `rgba(15, 23, 42, ${blinkAmt * 0.18})`;
          ctx.beginPath();
          ctx.ellipse(0, -drawH * 0.87, drawW * 0.14, 3 * blinkAmt, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        if (state === "speaking" && lipOpen > 0.15) {
          ctx.fillStyle = `rgba(225, 29, 72, ${0.22 + lipOpen * 0.25})`;
          ctx.beginPath();
          ctx.ellipse(0, -drawH * 0.825, 4.5, 1.5 + lipOpen * 2.4, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // Thinking scanning shimmer
        if (state === "thinking") {
          const scanY = -drawH + ((t * 140) % drawH);
          const grad = ctx.createLinearGradient(-drawW / 2, scanY, drawW / 2, scanY);
          grad.addColorStop(0, "transparent");
          grad.addColorStop(0.5, "rgba(192, 132, 252, 0.55)");
          grad.addColorStop(1, "transparent");
          ctx.fillStyle = grad;
          ctx.fillRect(-drawW / 2, scanY, drawW, 2);
        }

        ctx.restore();
      } else {
        drawFallbackFemaleRig(ctx, cssW, cssH, t, state, gx, gy, blinkAmt, lipOpen);
      }
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [compact]);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-end select-none overflow-visible pointer-events-none">
      {/* Speech Bubble when speaking */}
      {speechPreviewText && !compact && (
        <div className="mb-1.5 max-w-[260px] px-3 py-1.5 rounded-2xl bg-slate-950/90 border border-cyan-400/50 backdrop-blur-xl text-[11px] text-cyan-100 text-center shadow-lg">
          {speechPreviewText}
        </div>
      )}

      {/* Real-Time 60fps HTML5 2D Animated Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          width: compact ? 220 : 320,
          height: compact ? 270 : 410,
        }}
        className="block pointer-events-none"
      />

      {/* Compact State Telemetry Pill */}
      <div className="z-20 mt-0.5 px-3 py-0.5 rounded-full bg-slate-950/85 border border-white/15 backdrop-blur-xl text-[10px] font-bold tracking-widest uppercase text-cyan-200 flex items-center gap-1.5 shadow-lg">
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

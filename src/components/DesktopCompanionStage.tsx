import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  Check,
  LayoutDashboard,
  Navigation,
  Pin,
  Eye,
  Armchair,
  Moon,
  Sparkles,
  RotateCcw,
} from "lucide-react";

interface CursorAndWindowRect {
  cursor_x: number;
  cursor_y: number;
  win_x: number;
  win_y: number;
  win_w: number;
  win_h: number;
  work_left: number;
  work_top: number;
  work_right: number;
  work_bottom: number;
}

const DEFAULT_ANGEL_GLB = "/assets/avatar/angel_avatar.glb";

export function DesktopCompanionStage() {
  const mountRef = useRef<HTMLDivElement>(null);

  const [speechText, setSpeechText] = useState<string | null>(
    "வணக்கம் ராஜா! Angel AI தயாராக உள்ளேன்."
  );
  const [hasCustomGlb, setHasCustomGlb] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isSitting, setIsSitting] = useState(false);
  const [isSleeping, setIsSleeping] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [autoRoam, setAutoRoam] = useState(true);
  const [trackCursor, setTrackCursor] = useState(true);
  const [isWalking, setIsWalking] = useState(false);
  const [gaze, setGaze] = useState({ yaw: 0, pitch: 0 });
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [avatarSourceVersion, setAvatarSourceVersion] = useState(0);

  const modelRootRef = useRef<THREE.Object3D | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Map<string, THREE.AnimationAction>>(new Map());
  const activeActionRef = useRef<THREE.AnimationAction | null>(null);
  const neckBoneRef = useRef<THREE.Object3D | null>(null);
  const headBoneRef = useRef<THREE.Object3D | null>(null);

  const isSittingRef = useRef(false);
  const isSleepingRef = useRef(false);
  const isPinnedRef = useRef(false);
  const autoRoamRef = useRef(true);
  const trackCursorRef = useRef(true);
  const isDraggingRef = useRef(false);
  const isRoamingRef = useRef(false);

  const targetGazeRef = useRef({ yaw: 0, pitch: 0 });
  const targetHeadingRef = useRef(0);
  const dragStartMouseRef = useRef({ x: 0, y: 0 });
  const dragStartWinRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    isSittingRef.current = isSitting;
  }, [isSitting]);
  useEffect(() => {
    isSleepingRef.current = isSleeping;
  }, [isSleeping]);
  useEffect(() => {
    isPinnedRef.current = isPinned;
  }, [isPinned]);
  useEffect(() => {
    autoRoamRef.current = autoRoam;
  }, [autoRoam]);
  useEffect(() => {
    trackCursorRef.current = trackCursor;
  }, [trackCursor]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSpeechText((cur) => (cur === "வணக்கம் ராஜா! Angel AI தயாராக உள்ளேன்." ? null : cur));
    }, 4500);
    return () => clearTimeout(t);
  }, []);

  const findClipAction = useCallback((desiredName: string): THREE.AnimationAction | null => {
    const actions = actionsRef.current;
    if (actions.has(desiredName)) return actions.get(desiredName) || null;
    const lower = desiredName.toLowerCase();
    for (const [k, act] of actions.entries()) {
      if (k.toLowerCase() === lower || k.toLowerCase().includes(lower)) {
        return act;
      }
    }
    return null;
  }, []);

  const playClip = useCallback(
    (clipName: string, loopOnce = false, fadeSec = 0.25, onFinished?: () => void) => {
      const next = findClipAction(clipName);
      if (!next) {
        if (loopOnce && onFinished) {
          setTimeout(onFinished, 1400);
        }
        return;
      }

      const prev = activeActionRef.current;
      if (prev === next && !loopOnce) return;

      next.reset();
      next.enabled = true;
      next.setEffectiveTimeScale(1);
      next.setEffectiveWeight(1);

      if (loopOnce) {
        next.setLoop(THREE.LoopOnce, 1);
        next.clampWhenFinished = true;
      } else {
        next.setLoop(THREE.LoopRepeat, Infinity);
        next.clampWhenFinished = false;
      }

      if (prev && prev !== next) {
        prev.crossFadeTo(next, fadeSec, true);
      } else {
        next.fadeIn(fadeSec);
      }
      next.play();
      activeActionRef.current = next;

      if (loopOnce && onFinished && mixerRef.current) {
        const mixer = mixerRef.current;
        const handler = (e: { action: THREE.AnimationAction }) => {
          if (e.action === next) {
            mixer.removeEventListener("finished", handler as any);
            onFinished();
          }
        };
        mixer.addEventListener("finished", handler as any);
      }
    },
    [findClipAction]
  );

  const playIdleState = useCallback(() => {
    if (isSleepingRef.current) {
      playClip("Sleeping");
    } else if (isSittingRef.current) {
      playClip("Sitting Idle");
    } else {
      playClip("Idle Subtle");
    }
  }, [playClip]);

  const performExpressiveAction = useCallback(
    (clipName: string) => {
      setIsSleeping(false);
      setIsSitting(false);
      isSleepingRef.current = false;
      isSittingRef.current = false;
      playClip(clipName, true, 0.22, () => {
        playIdleState();
      });
    },
    [playClip, playIdleState]
  );

  const roamToX = useCallback(
    async (customX?: number) => {
      if (isPinnedRef.current || isDraggingRef.current || isRoamingRef.current) return;
      try {
        const rect = await invoke<CursorAndWindowRect>("get_global_cursor_and_window_rect");
        const minX = rect.work_left + 16;
        const maxX = Math.max(minX + 40, rect.work_right - rect.win_w - 16);
        const destX =
          typeof customX === "number"
            ? Math.max(minX, Math.min(maxX, customX))
            : Math.round(minX + Math.random() * (maxX - minX));

        const dx = destX - rect.win_x;
        if (Math.abs(dx) < 30) return;

        isRoamingRef.current = true;
        setIsWalking(true);
        setIsSitting(false);
        setIsSleeping(false);
        isSittingRef.current = false;
        isSleepingRef.current = false;

        targetHeadingRef.current = dx > 0 ? Math.PI * 0.28 : -Math.PI * 0.28;
        playClip("Walk_2");

        const steps = 42;
        const startX = rect.win_x;
        const fixedY = rect.work_bottom - rect.win_h - 10;

        for (let i = 1; i <= steps; i++) {
          if (isPinnedRef.current || isDraggingRef.current || !isRoamingRef.current) break;
          const t = i / steps;
          const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
          const curX = Math.round(startX + (destX - startX) * eased);
          await invoke("move_companion_window", { x: curX, y: fixedY }).catch(() => {});
          await new Promise((r) => setTimeout(r, 24));
        }

        targetHeadingRef.current = 0;
        isRoamingRef.current = false;
        setIsWalking(false);
        playIdleState();
      } catch {
        isRoamingRef.current = false;
        setIsWalking(false);
      }
    },
    [playClip, playIdleState]
  );

  // 1. Initialize Three.js Cyan Particle Field + Optional Custom GLB Loader (Zero blocky doll)
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = 440;
    const height = 540;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    camera.position.set(0, 1.15, 3.4);
    camera.lookAt(0, 0.92, 0);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Subtle Cyan Energy Particles & Sci-Fi Halo Ring (Dark Slate-Blue Aesthetic)
    const pCount = 72;
    const positions = new Float32Array(pCount * 3);
    for (let i = 0; i < pCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 2.6;
      positions[i + 1] = Math.random() * 2.4 - 0.2;
      positions[i + 2] = (Math.random() - 0.5) * 1.4;
    }
    const partGeo = new THREE.BufferGeometry();
    partGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const partMat = new THREE.PointsMaterial({
      color: 0x00f0ff,
      size: 0.035,
      transparent: true,
      opacity: 0.7,
    });
    const particles = new THREE.Points(partGeo, partMat);
    scene.add(particles);

    const haloGeo = new THREE.RingGeometry(0.92, 0.96, 64);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.26,
    });
    const haloRing = new THREE.Mesh(haloGeo, haloMat);
    haloRing.position.set(0, 1.05, -0.55);
    scene.add(haloRing);

    const ambient = new THREE.AmbientLight(0xe0f2fe, 1.25);
    scene.add(ambient);

    const warmKeyLight = new THREE.DirectionalLight(0xfff1e6, 2.2);
    warmKeyLight.position.set(2.4, 3.8, 3.2);
    scene.add(warmKeyLight);

    const cyanRimLight = new THREE.DirectionalLight(0x00f0ff, 2.0);
    cyanRimLight.position.set(-2.8, 2.4, -2.5);
    scene.add(cyanRimLight);

    const customGlbUrl = localStorage.getItem("angel_custom_avatar_glb")?.trim();
    const targetUrl = customGlbUrl || DEFAULT_ANGEL_GLB;

    const loader = new GLTFLoader();
    loader.load(
      targetUrl,
      (gltf) => {
        const model = gltf.scene as THREE.Object3D;
        model.position.set(0, 0, 0);
        scene.add(model);
        modelRootRef.current = model;
        setHasCustomGlb(true);

        model.traverse((obj) => {
          const lower = obj.name.toLowerCase();
          if (lower.includes("neck")) neckBoneRef.current = obj;
          else if (lower.includes("head") && !headBoneRef.current) headBoneRef.current = obj;
        });

        const clips = gltf.animations || [];
        if (clips.length > 0) {
          const mixer = new THREE.AnimationMixer(model);
          mixerRef.current = mixer;
          const map = new Map<string, THREE.AnimationAction>();
          for (const clip of clips) {
            map.set(clip.name, mixer.clipAction(clip));
          }
          actionsRef.current = map;
          playClip("Greeting", true, 0.1, () => playClip("Idle Subtle"));
        } else {
          mixerRef.current = null;
          actionsRef.current.clear();
        }
      },
      undefined,
      () => {
        // Use sleek composed realistic Female AI Companion portrait stage
        modelRootRef.current = null;
        setHasCustomGlb(false);
      }
    );

    const clock = new THREE.Clock();
    let elapsed = 0;
    let animId = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05);
      elapsed += delta;

      particles.rotation.y += delta * 0.25;
      particles.position.y = Math.sin(elapsed * 1.1) * 0.06;
      haloRing.rotation.z += delta * 0.3;

      if (mixerRef.current) {
        mixerRef.current.update(delta);
      }

      if (modelRootRef.current) {
        modelRootRef.current.rotation.y +=
          (targetHeadingRef.current - modelRootRef.current.rotation.y) * Math.min(1, delta * 6);
      }

      const ikAllowed =
        trackCursorRef.current &&
        !isSleepingRef.current &&
        !isRoamingRef.current &&
        !isDraggingRef.current;

      const desiredYaw = ikAllowed ? targetGazeRef.current.yaw : 0;
      const desiredPitch = ikAllowed ? targetGazeRef.current.pitch : 0;

      if (neckBoneRef.current) {
        neckBoneRef.current.rotation.y += (desiredYaw * 0.38 - neckBoneRef.current.rotation.y) * 0.12;
        neckBoneRef.current.rotation.x += (desiredPitch * 0.3 - neckBoneRef.current.rotation.x) * 0.12;
      }
      if (headBoneRef.current) {
        headBoneRef.current.rotation.y += (desiredYaw * 0.58 - headBoneRef.current.rotation.y) * 0.15;
        headBoneRef.current.rotation.x += (desiredPitch * 0.45 - headBoneRef.current.rotation.x) * 0.15;
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      renderer.dispose();
    };
  }, [avatarSourceVersion, playClip]);

  // 2. Global OS Cursor Gaze Polling (~15fps)
  useEffect(() => {
    const timer = setInterval(async () => {
      if (!trackCursorRef.current || isSleepingRef.current) {
        setGaze({ yaw: 0, pitch: 0 });
        return;
      }
      try {
        const rect = await invoke<CursorAndWindowRect>("get_global_cursor_and_window_rect");
        const centerX = rect.win_x + rect.win_w / 2;
        const centerY = rect.win_y + rect.win_h * 0.35;
        const normX = Math.max(-1, Math.min(1, (rect.cursor_x - centerX) / 600));
        const normY = Math.max(-1, Math.min(1, (rect.cursor_y - centerY) / 450));
        targetGazeRef.current = { yaw: normX * 0.55, pitch: normY * 0.35 };
        setGaze({ yaw: normX * 12, pitch: -normY * 7 });
      } catch {}
    }, 66);
    return () => clearInterval(timer);
  }, []);

  // 3. Autonomous Desktop Roaming Interval
  useEffect(() => {
    const timer = setInterval(() => {
      if (autoRoamRef.current && !isPinnedRef.current && !isSittingRef.current && !isSleepingRef.current) {
        roamToX();
      }
    }, 24_000);
    return () => clearInterval(timer);
  }, [roamToX]);

  // 4. Listen to Angel Speech Events, File Drops & Custom Avatar Reloads
  useEffect(() => {
    const unlistenStart = listen<{ text?: string }>("angel-speech-start", (event) => {
      const txt = event.payload?.text || "Speaking...";
      setSpeechText(txt);
      setIsSpeaking(true);
      if (isSleepingRef.current) {
        setIsSleeping(false);
        isSleepingRef.current = false;
      }
      playClip(isSittingRef.current ? "Sitting Talking" : "Idle Talking");
    });

    const unlistenEnd = listen("angel-speech-end", () => {
      setIsSpeaking(false);
      setSpeechText(null);
      playIdleState();
    });

    const unlistenDrop = listen<string[]>("angel-companion-file-drop", (event) => {
      const first = event.payload?.[0];
      if (first) {
        const fileName = first.split(/[/\\]/).pop() || first;
        setSpeechText(`Inspecting ${fileName}...`);
        playClip("Interact", true, 0.2, () => playIdleState());
        emit("angel-companion-file-inspected", { path: first, fileName }).catch(() => {});
        setTimeout(() => setSpeechText(null), 4000);
      }
    });

    const unlistenAvatar = listen("angel-custom-avatar-changed", () => {
      setAvatarSourceVersion((v) => v + 1);
    });

    return () => {
      unlistenStart.then((f) => f());
      unlistenEnd.then((f) => f());
      unlistenDrop.then((f) => f());
      unlistenAvatar.then((f) => f());
    };
  }, [playClip, playIdleState]);

  // Smooth Window Dragging Handlers
  const handlePointerDown = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button === 2) return;
    setMenuPos(null);
    isDraggingRef.current = true;
    isRoamingRef.current = false;
    setIsWalking(false);
    dragStartMouseRef.current = { x: e.screenX, y: e.screenY };
    try {
      const winRect = await invoke<CursorAndWindowRect>("get_global_cursor_and_window_rect");
      dragStartWinRef.current = { x: winRect.win_x, y: winRect.win_y };
    } catch {}
  };

  useEffect(() => {
    const onMove = async (e: PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.screenX - dragStartMouseRef.current.x;
      const dy = e.screenY - dragStartMouseRef.current.y;
      await invoke("move_companion_window", {
        x: Math.round(dragStartWinRef.current.x + dx),
        y: Math.round(dragStartWinRef.current.y + dy),
      }).catch(() => {});
    };
    const onUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      playIdleState();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [playIdleState]);

  const handleResetPosition = async () => {
    setMenuPos(null);
    try {
      const rect = await invoke<CursorAndWindowRect>("get_global_cursor_and_window_rect");
      await invoke("move_companion_window", {
        x: rect.work_right - 470,
        y: rect.work_bottom - 550,
      });
      performExpressiveAction("Greeting");
    } catch {}
  };

  const auraColor = isSpeaking
    ? "rgba(16, 185, 129, 0.52)"
    : isWalking
    ? "rgba(56, 189, 248, 0.5)"
    : "rgba(0, 240, 255, 0.36)";

  const motionClass = isSpeaking
    ? "brahma-speak"
    : isWalking
    ? "brahma-listen"
    : "brahma-idle";

  return (
    <div
      onPointerDown={handlePointerDown}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuPos({
          x: Math.min(e.clientX, 200),
          y: Math.min(e.clientY, 160),
        });
      }}
      onClick={() => {
        if (menuPos) setMenuPos(null);
      }}
      onDoubleClick={() => invoke("toggle_main_dashboard_window").catch(() => {})}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) {
          setSpeechText(`Inspecting ${f.name}...`);
          playClip("Interact", true, 0.2, () => playIdleState());
          emit("angel-companion-file-inspected", { path: f.name, fileName: f.name }).catch(() => {});
          setTimeout(() => setSpeechText(null), 4000);
        }
      }}
      className="relative w-screen h-screen bg-transparent overflow-hidden select-none font-sans cursor-grab active:cursor-grabbing"
    >
      {/* Holographic Speech Bubble branded "Angel AI" */}
      {speechText && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 w-[320px] px-3.5 py-2 rounded-2xl bg-slate-950/92 border border-cyan-400/60 backdrop-blur-xl shadow-[0_0_24px_rgba(34,211,238,0.35)] text-center animate-in fade-in space-y-0.5 pointer-events-none">
          <div className="text-[10px] font-extrabold uppercase tracking-widest text-cyan-400">
            ✦ Angel AI
          </div>
          <div className="text-xs text-cyan-100 leading-relaxed">{speechText}</div>
        </div>
      )}

      {/* Three.js Cyan Particle Field & Optional Custom GLB Canvas */}
      <div ref={mountRef} className="absolute inset-0 w-[440px] h-[540px] pointer-events-none z-0" />

      {/* Sleek Composed Realistic Female AI Companion Stage (when no external GLB loaded) */}
      {!hasCustomGlb && (
        <div
          style={{
            transform: `perspective(1000px) rotateY(${gaze.yaw}deg) rotateX(${gaze.pitch}deg) translateY(${
              isSitting ? "36px" : "0px"
            })`,
          }}
          className="relative z-10 w-full h-full flex flex-col items-center justify-end pb-5 transition-transform duration-150 ease-out pointer-events-none"
        >
          {/* Ambient Dark Slate-Blue / Cyan Glow */}
          <div
            style={{ backgroundColor: auraColor }}
            className="absolute bottom-14 w-52 h-64 rounded-full blur-3xl opacity-60 transition-colors duration-300"
          />

          <div className={`relative ${motionClass} ${isSleeping ? "opacity-75 grayscale-[30%]" : ""}`}>
            <img
              src="/angel_primary.png"
              alt="Angel AI Female Companion"
              style={{
                filter: `drop-shadow(0 0 20px ${auraColor})`,
              }}
              className="h-[430px] w-auto object-contain transition-all duration-300"
            />
            {/* Subtle Hologram Scanline */}
            <div className="absolute left-6 right-6 h-[2px] bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent holo-scanline" />
          </div>
        </div>
      )}

      {/* Sleek Glassmorphic Right-Click Context Menu */}
      {menuPos && (
        <div
          style={{ left: menuPos.x, top: menuPos.y }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute z-40 w-[235px] rounded-2xl bg-slate-950/95 border border-cyan-400/40 backdrop-blur-2xl shadow-2xl p-1.5 text-[11.5px] text-slate-100 space-y-0.5 cursor-default"
        >
          <div className="px-2.5 py-1 text-[10px] font-extrabold tracking-wider uppercase text-cyan-300 border-b border-white/10 mb-1">
            ✦ Angel AI Companion
          </div>

          <button
            onClick={() => {
              setMenuPos(null);
              invoke("toggle_main_dashboard_window").catch(() => {});
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-cyan-500/20 text-cyan-200 font-bold text-left"
          >
            <LayoutDashboard size={13} className="text-cyan-400" />
            <span>Open / Hide Angel AI</span>
          </button>

          <button
            onClick={() => {
              setMenuPos(null);
              roamToX();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-left"
          >
            <Navigation size={13} className="text-emerald-400" />
            <span>Roam Somewhere Now</span>
          </button>

          <button
            onClick={() => {
              const next = !isPinned;
              setIsPinned(next);
              if (next) setAutoRoam(false);
            }}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-left"
          >
            <span className="flex items-center gap-2">
              <Pin size={13} className="text-amber-400" />
              <span>Pin to This Position</span>
            </span>
            {isPinned && <Check size={12} className="text-cyan-400" />}
          </button>

          <button
            onClick={() => setAutoRoam((v) => !v)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-left"
          >
            <span className="flex items-center gap-2">
              <Navigation size={13} className="text-sky-400" />
              <span>Autonomous Roaming</span>
            </span>
            {autoRoam && <Check size={12} className="text-cyan-400" />}
          </button>

          <button
            onClick={() => setTrackCursor((v) => !v)}
            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-left"
          >
            <span className="flex items-center gap-2">
              <Eye size={13} className="text-purple-400" />
              <span>Track Cursor</span>
            </span>
            {trackCursor && <Check size={12} className="text-cyan-400" />}
          </button>

          <div className="border-t border-white/10 my-1" />

          <button
            onClick={() => {
              setMenuPos(null);
              const nextSit = !isSitting;
              setIsSitting(nextSit);
              setIsSleeping(false);
              if (nextSit) {
                playClip("Sitting Enter", true, 0.2, () => playClip("Sitting Idle"));
              } else {
                playClip("Idle Subtle");
              }
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-left"
          >
            <Armchair size={13} className="text-cyan-300" />
            <span>{isSitting ? "Stand Up" : "Sit Down"}</span>
          </button>

          <button
            onClick={() => {
              setMenuPos(null);
              const nextSleep = !isSleeping;
              setIsSleeping(nextSleep);
              setIsSitting(false);
              playClip(nextSleep ? "Sleeping" : "Idle Subtle");
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-left"
          >
            <Moon size={13} className="text-indigo-300" />
            <span>{isSleeping ? "Wake Up" : "Rest & Sleep"}</span>
          </button>

          <div className="border-t border-white/10 my-1" />

          <div className="px-2 py-0.5 text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
            <Sparkles size={10} className="text-amber-400" />
            <span>Expressive Actions</span>
          </div>
          <div className="grid grid-cols-2 gap-1 px-1 pb-1">
            {[
              { label: "Dance", clip: "Dance Simple" },
              { label: "Salute", clip: "Salute" },
              { label: "Polite Bow", clip: "Bow" },
              { label: "Power Up", clip: "Power Up" },
              { label: "Victory", clip: "Victory" },
            ].map((act) => (
              <button
                key={act.clip}
                onClick={() => {
                  setMenuPos(null);
                  performExpressiveAction(act.clip);
                }}
                className="px-2 py-1 rounded-lg bg-white/5 hover:bg-cyan-500/20 text-[10.5px] text-left truncate"
              >
                {act.label}
              </button>
            ))}
          </div>

          <div className="border-t border-white/10 my-1" />

          <button
            onClick={handleResetPosition}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-slate-300 text-left"
          >
            <RotateCcw size={13} />
            <span>Reset Desktop Position</span>
          </button>
        </div>
      )}
    </div>
  );
}

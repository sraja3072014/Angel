import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import * as THREE from "three";
import {
  Sparkles,
  Camera,
  Send,
  X,
  Check,
  Volume2,
  Keyboard,
} from "lucide-react";
import { cloudBrain } from "../services/cloudBrain";
import { speakText } from "../services/voiceEngine";

export interface ActiveAppContextWithSelection {
  app_name: string;
  process_name: string;
  window_title: string;
  is_supported_copilot: boolean;
  selected_text: string;
}

export function CursorCompanionOverlay({ isStandaloneWindow = false }: { isStandaloneWindow?: boolean }) {
  const [activeTheme, setActiveTheme] = useState<string>(() => {
    return localStorage.getItem("angel_3d_core_theme") || "orbital_earth";
  });

  const [isOpen, setIsOpen] = useState(false);
  const [activeApp, setActiveApp] = useState<ActiveAppContextWithSelection>({
    app_name: "Active Application",
    process_name: "desktop.exe",
    window_title: "Windows Desktop",
    is_supported_copilot: true,
    selected_text: "",
  });

  const [promptText, setPromptText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [quickAnswer, setQuickAnswer] = useState("");
  const [pastedStatus, setPastedStatus] = useState<string | null>(null);

  // Three.js Mount Ref
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Listen to theme changes from Menu or storage
  useEffect(() => {
    const handleThemeChange = (e: any) => {
      if (e.detail?.theme) {
        setActiveTheme(e.detail.theme);
      }
    };
    window.addEventListener("angel-3d-theme-changed", handleThemeChange);

    // Listen to global hotkey Alt+Space
    const unlisten = listen("angel-summon-copilot", () => {
      setIsOpen(true);
      fetchContext();
      if (isStandaloneWindow) {
        invoke("set_cursor_orb_interactive", { interactive: true }).catch(() => {});
      }
    });

    return () => {
      window.removeEventListener("angel-3d-theme-changed", handleThemeChange);
      unlisten.then((f) => f());
    };
  }, [isStandaloneWindow]);

  // Sync window interactivity when opening or closing in standalone mode
  const handleOpenPopover = () => {
    setIsOpen(true);
    fetchContext();
    if (isStandaloneWindow) {
      invoke("set_cursor_orb_interactive", { interactive: true }).catch(() => {});
    }
  };

  const handleClosePopover = () => {
    setIsOpen(false);
    if (isStandaloneWindow) {
      invoke("set_cursor_orb_interactive", { interactive: false }).catch(() => {});
    }
  };

  const fetchContext = async () => {
    try {
      const ctx = await invoke<ActiveAppContextWithSelection>("get_active_app_and_selection");
      if (ctx) {
        setActiveApp(ctx);
        if (ctx.selected_text && !promptText) {
          setPromptText(ctx.selected_text);
        }
      }
    } catch {}
  };

  // Real Three.js Miniature Core Rendering (84x84 px)
  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;
    container.innerHTML = "";

    const width = 84;
    const height = 84;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 2.8;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const group = new THREE.Group();
    scene.add(group);
    meshGroupRef.current = group;

    // Ambient & Directional Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0x22d3ee, 2.5);
    dirLight.position.set(2, 2, 3);
    scene.add(dirLight);

    // Build chosen core geometry
    if (activeTheme === "orbital_earth") {
      // 1. Satellite Orbital Earth Core
      const sphereGeo = new THREE.SphereGeometry(0.85, 32, 32);
      const sphereMat = new THREE.MeshPhongMaterial({
        color: 0x0284c7,
        emissive: 0x064e3b,
        specular: 0x38bdf8,
        shininess: 40,
        wireframe: false,
      });
      const earthMesh = new THREE.Mesh(sphereGeo, sphereMat);
      group.add(earthMesh);

      // Atmospheric outer glow layer
      const atmoGeo = new THREE.SphereGeometry(0.88, 32, 32);
      const atmoMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.25,
        wireframe: true,
      });
      group.add(new THREE.Mesh(atmoGeo, atmoMat));

      // Orbiting Satellite Ring
      const ringGeo = new THREE.RingGeometry(1.15, 1.18, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x22d3ee,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.rotation.x = Math.PI / 3;
      group.add(ringMesh);

      // Satellite Bead
      const satGeo = new THREE.SphereGeometry(0.06, 12, 12);
      const satMat = new THREE.MeshBasicMaterial({ color: 0x4ade80 });
      const satMesh = new THREE.Mesh(satGeo, satMat);
      satMesh.position.set(1.16, 0, 0);
      ringMesh.add(satMesh);
    } else if (activeTheme === "quantum_gyro") {
      // 2. Quantum Gyroscope Core
      const coreGeo = new THREE.SphereGeometry(0.38, 20, 20);
      const coreMat = new THREE.MeshBasicMaterial({ color: 0x22d3ee });
      group.add(new THREE.Mesh(coreGeo, coreMat));

      const ring1 = new THREE.Mesh(
        new THREE.TorusGeometry(0.8, 0.03, 12, 36),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      const ring2 = new THREE.Mesh(
        new THREE.TorusGeometry(1.0, 0.03, 12, 36),
        new THREE.MeshBasicMaterial({ color: 0xf59e0b })
      );
      ring1.rotation.x = Math.PI / 4;
      ring2.rotation.y = Math.PI / 3;
      group.add(ring1);
      group.add(ring2);
    } else if (activeTheme === "neural_synapse") {
      // 3. Neural Synapse Sphere
      const pCount = 80;
      const positions = new Float32Array(pCount * 3);
      for (let i = 0; i < pCount * 3; i += 3) {
        const u = Math.random();
        const v = Math.random();
        const theta = u * 2.0 * Math.PI;
        const phi = Math.acos(2.0 * v - 1.0);
        const r = 0.85 + Math.random() * 0.15;
        positions[i] = r * Math.sin(phi) * Math.cos(theta);
        positions[i + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i + 2] = r * Math.cos(phi);
      }
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const pMat = new THREE.PointsMaterial({ color: 0xa855f7, size: 0.08 });
      group.add(new THREE.Points(pGeo, pMat));

      const wireGeo = new THREE.IcosahedronGeometry(0.7, 1);
      const wireMat = new THREE.MeshBasicMaterial({ color: 0x818cf8, wireframe: true, transparent: true, opacity: 0.5 });
      group.add(new THREE.Mesh(wireGeo, wireMat));
    } else {
      // 4. Volumetric Hologram
      const pCount = 120;
      const positions = new Float32Array(pCount * 3);
      for (let i = 0; i < pCount * 3; i += 3) {
        positions[i] = (Math.random() - 0.5) * 1.5;
        positions[i + 1] = (Math.random() - 0.5) * 1.5;
        positions[i + 2] = (Math.random() - 0.5) * 1.5;
      }
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const pMat = new THREE.PointsMaterial({ color: 0x14b8a6, size: 0.06 });
      group.add(new THREE.Points(pGeo, pMat));
    }

    // Animation Loop
    let clock = new THREE.Clock();
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      if (group) {
        group.rotation.y += delta * 0.75;
        group.rotation.x += delta * 0.25;
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
      container.innerHTML = "";
    };
  }, [activeTheme]);

  // Handle Quick Submit
  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptText.trim() || isProcessing) return;

    const userQ = promptText.trim();
    setPromptText("");
    setIsProcessing(true);
    setQuickAnswer("");

    try {
      const contextualPrompt = `[Foreground Application: ${activeApp.app_name} | Window: ${activeApp.window_title}]\nUser Request: ${userQ}`;
      const response = await cloudBrain.askGemini(contextualPrompt, {
        onChunk: (chunk) => setQuickAnswer(chunk),
      });
      setQuickAnswer(response);
    } catch (err: any) {
      setQuickAnswer(`Error: ${err?.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Type at cursor in active app
  const handleTypeAtCursor = async (text: string) => {
    if (!text) return;
    try {
      setPastedStatus("Typing into active app...");
      await invoke("type_text_into_active_app", { text });
      setPastedStatus(`Typed into ${activeApp.app_name}!`);
      setTimeout(() => setPastedStatus(null), 2500);
    } catch (err: any) {
      setPastedStatus(`Error: ${err?.message || err}`);
      setTimeout(() => setPastedStatus(null), 3000);
    }
  };

  // Screen Vision quick trigger
  const handleInspectScreen = async () => {
    setIsProcessing(true);
    setQuickAnswer("Capturing and inspecting active app screen...");
    try {
      const b64 = await invoke<string>("capture_screen_base64");
      const prompt = `Inspect active application (${activeApp.app_name}: ${activeApp.window_title}). Provide concise tactical guidance, translation, or content to paste.`;
      const response = await cloudBrain.askGemini(prompt, {
        screenBase64: b64,
        onChunk: (chunk) => setQuickAnswer(chunk),
      });
      setQuickAnswer(response);
    } catch (err: any) {
      setQuickAnswer(`Inspection failed: ${err?.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full h-full flex items-center justify-center p-2 select-none font-sans">
      {!isOpen ? (
        /* Floating Desktop 3D Orb */
        <div
          onClick={handleOpenPopover}
          className="cursor-pointer group flex items-center justify-center p-1 rounded-full bg-slate-950/60 hover:bg-slate-950/80 border border-cyan-400/40 hover:border-cyan-300 shadow-[0_0_24px_rgba(6,182,212,0.4)] backdrop-blur-md transition-all hover:scale-105 active:scale-95"
          title="Angel AI 3D Co-Pilot (Click or Alt+Space)"
        >
          {/* Three.js Miniature Canvas */}
          <div ref={mountRef} className="w-[84px] h-[84px] flex items-center justify-center pointer-events-none" />
        </div>
      ) : (
        /* Expanded Interactive Co-Pilot Popover */
        <div className="w-[400px] max-h-[320px] rounded-2xl bg-slate-950/95 border border-cyan-400/60 backdrop-blur-2xl shadow-[0_0_40px_rgba(34,211,238,0.3)] p-3.5 space-y-2.5 flex flex-col justify-between">
          {/* Header & Active App Context Pill */}
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-lg bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center shrink-0">
                <Sparkles size={13} className="text-cyan-300" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] font-extrabold text-white truncate flex items-center gap-1.5">
                  <span>Active App: {activeApp.app_name}</span>
                </div>
                <div className="text-[9px] text-slate-400 font-mono truncate max-w-[240px]">
                  {activeApp.window_title || activeApp.process_name}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleInspectScreen}
                disabled={isProcessing}
                className="p-1 rounded-lg hover:bg-white/10 text-cyan-400 hover:text-cyan-300 transition"
                title="Screen Vision: Inspect Foreground Window"
              >
                <Camera size={14} />
              </button>
              <button
                onClick={handleClosePopover}
                className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
                title="Close Co-Pilot"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Response Box / Selected Text Box */}
          <div className="flex-1 max-h-[140px] overflow-y-auto p-2 rounded-xl bg-black/60 border border-white/10 text-xs text-slate-200 leading-relaxed font-sans space-y-1.5">
            {quickAnswer ? (
              <div>{quickAnswer}</div>
            ) : (
              <div className="text-[11px] text-slate-400">
                Paste Tamil or English text to translate, generate, or summarize for <b>{activeApp.app_name}</b>.
              </div>
            )}
          </div>

          {/* Action Row: Type at Cursor & Speak Text */}
          {quickAnswer && (
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5">
              <button
                onClick={() => handleTypeAtCursor(quickAnswer)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 text-[10px] font-bold border border-cyan-400/40 transition"
              >
                <Keyboard size={12} />
                <span>⌨️ Type at Cursor</span>
              </button>

              <button
                onClick={() => speakText(quickAnswer)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-bold border border-emerald-400/40 transition"
              >
                <Volume2 size={12} />
                <span>🔊 Speak</span>
              </button>
            </div>
          )}

          {pastedStatus && (
            <div className="text-[10px] text-emerald-300 font-mono flex items-center gap-1">
              <Check size={11} />
              <span>{pastedStatus}</span>
            </div>
          )}

          {/* Prompt Form accepting full Tamil & English pasted text */}
          <form onSubmit={handleQuickSubmit} className="relative flex items-center gap-1.5 pt-1">
            <input
              type="text"
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder={`Ask or paste in ${activeApp.app_name}...`}
              className="flex-1 px-3 py-1.5 bg-black/70 border border-white/20 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
            />
            <button
              type="submit"
              disabled={!promptText.trim() || isProcessing}
              className="p-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold transition disabled:opacity-40"
            >
              <Send size={13} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

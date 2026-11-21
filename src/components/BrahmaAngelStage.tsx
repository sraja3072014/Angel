import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface BrahmaStageProps {
  speaking: boolean;
  listening: boolean;
  thinking?: boolean;
}

export function BrahmaAngelStage({ speaking, listening, thinking = false }: BrahmaStageProps) {
  const particleCanvasRef = useRef<HTMLDivElement>(null);
  const [gaze, setGaze] = useState({ x: 0, y: 0 });

  // Global Mouse Tracking (திரையில் எங்கு மவுஸ் நகர்ந்தாலும் அவதார் அந்தப் பக்கம் திரும்பும்)
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const normX = (e.clientX / window.innerWidth - 0.5) * 2;  // -1 to +1
      const normY = (e.clientY / window.innerHeight - 0.5) * 2; // -1 to +1
      setGaze({ x: normX * 14, y: -normY * 8 });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  // Three.js 3D Floating Cyber Particles & Back Halo
  useEffect(() => {
    if (!particleCanvasRef.current) return;
    const width = 340;
    const height = 520;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    particleCanvasRef.current.innerHTML = "";
    particleCanvasRef.current.appendChild(renderer.domElement);

    // 3D Energy Particles (மிதக்கும் ஹாலோகிராம் துகள்கள்)
    const count = 90;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 3.5;
      positions[i + 1] = (Math.random() - 0.5) * 5.2;
      positions[i + 2] = (Math.random() - 0.5) * 2.0;
    }

    const partGeo = new THREE.BufferGeometry();
    partGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const partMat = new THREE.PointsMaterial({
      color: 0x00f0ff,
      size: 0.045,
      transparent: true,
      opacity: 0.75,
    });
    const particles = new THREE.Points(partGeo, partMat);
    scene.add(particles);

    // Back Sci-Fi Halo Ring
    const haloGeo = new THREE.RingGeometry(1.15, 1.22, 64);
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.35,
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.y = 0.85;
    halo.position.z = -0.8;
    scene.add(halo);

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      particles.rotation.y += 0.003;
      particles.position.y = Math.sin(Date.now() * 0.001) * 0.12;
      halo.rotation.z += 0.006;
      renderer.render(scene, camera);
    };
    animate();

    return () => cancelAnimationFrame(animId);
  }, []);

  const stateClass = speaking
    ? "brahma-speak"
    : listening
    ? "brahma-listen"
    : "brahma-idle";

  const auraColor = speaking
    ? "rgba(16, 185, 129, 0.65)"
    : listening
    ? "rgba(244, 63, 94, 0.65)"
    : thinking
    ? "rgba(245, 158, 11, 0.65)"
    : "rgba(0, 240, 255, 0.48)";

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-end overflow-visible select-none">
      {/* 1. Three.js 3D Particle & Halo Layer */}
      <div
        ref={particleCanvasRef}
        className="absolute inset-0 flex items-center justify-center pointer-events-none z-0"
      />

      {/* 2. Dynamic Reactive Energy Aura Behind Avatar */}
      <div
        style={{ backgroundColor: auraColor }}
        className={`absolute top-1/2 -translate-y-1/2 w-60 h-72 rounded-full blur-3xl transition-all duration-500 pointer-events-none ${
          speaking || listening ? "scale-125 opacity-80" : "scale-100 opacity-50"
        }`}
      />

      {/* 3. 3D Parallax Full-Body Angel Character */}
      <div
        style={{
          transform: `perspective(1000px) rotateY(${gaze.x}deg) rotateX(${gaze.y}deg)`,
        }}
        className="relative z-10 flex items-end justify-center transition-transform duration-150 ease-out"
      >
        <div className={`relative ${stateClass}`}>
          <img
            src="/angel_primary.png"
            alt="Angel Holographic Companion"
            style={{
              filter: `drop-shadow(0 0 22px ${auraColor})`,
            }}
            className="max-h-[490px] w-auto object-contain transition-all duration-300"
          />

          {/* Subtle Hologram Scanline Sweeping Across Character */}
          <div className="absolute left-4 right-4 h-[2px] bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent holo-scanline pointer-events-none" />
        </div>
      </div>

      {/* 4. Brahma AI Dual-Ring 3D Hologram Pedestal */}
      <div className="relative w-64 h-14 flex items-center justify-center -mt-5 z-20 pointer-events-none">
        {/* Outer Clockwise Ring */}
        <div
          className={`absolute w-60 h-60 rounded-full border-2 border-dashed ring-outer ${
            speaking
              ? "border-emerald-400/80"
              : listening
              ? "border-rose-400/80"
              : "border-cyan-400/60"
          }`}
        />
        {/* Inner Counter-Clockwise Ring */}
        <div
          className={`absolute w-44 h-44 rounded-full border border-dotted ring-inner ${
            speaking ? "border-emerald-300" : "border-sky-300/80"
          }`}
        />
        {/* Core Pedestal Light */}
        <div
          style={{ backgroundColor: auraColor }}
          className="w-48 h-6 rounded-full blur-md transition-colors duration-300"
        />
      </div>

      {/* 5. Status Badge */}
      <div className="z-20 mt-1 flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-950/70 border border-cyan-400/40 text-[11px] font-bold tracking-widest uppercase text-cyan-200 shadow-lg">
        <span
          className={`w-2 h-2 rounded-full ${
            speaking
              ? "bg-emerald-400 animate-ping"
              : listening
              ? "bg-rose-400 animate-ping"
              : thinking
              ? "bg-amber-400 animate-pulse"
              : "bg-cyan-400"
          }`}
        />
        {speaking
          ? "ANGEL • SPEAKING"
          : listening
          ? "ANGEL • LISTENING"
          : thinking
          ? "ANGEL • PROCESSING"
          : "ANGEL • STANDBY"}
      </div>
    </div>
  );
}
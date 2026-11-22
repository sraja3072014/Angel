import { useEffect, useRef } from "react";
import * as THREE from "three";

interface HoloEarthProps {
  speaking: boolean;
  listening: boolean;
}

export function HoloEarthStage({ speaking, listening }: HoloEarthProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ speaking, listening });

  useEffect(() => {
    stateRef.current = { speaking, listening };
  }, [speaking, listening]);

  useEffect(() => {
    if (!mountRef.current || !containerRef.current) return;

    const getBoxSize = () => {
      const rect = containerRef.current!.getBoundingClientRect();
      const size = Math.max(220, Math.min(rect.width - 16, rect.height - 54));
      return { width: size, height: size };
    };

    let { width, height } = getBoxSize();

    // 1. Scene & Camera (à®•à®šà¯à®šà®¿à®¤à®®à®¾à®•à®ªà¯ à®ªà¯Šà®°à¯à®¨à¯à®¤ Camera distance à®šà®±à¯à®±à¯ à®…à®¤à®¿à®•à®°à®¿à®•à¯à®•à®ªà¯à®ªà®Ÿà¯à®Ÿà¯à®³à¯à®³à®¤à¯)
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0.1, 4.75);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.innerHTML = "";
    mountRef.current.appendChild(renderer.domElement);

    // 2. Sunlight + Night-Side Hologram Rim Lighting
    const ambientLight = new THREE.AmbientLight(0x1e293b, 0.9);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.6);
    sunLight.position.set(4.5, 1.8, 3.2);
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x00f0ff, 1.4);
    rimLight.position.set(-4.0, -1.5, -2.5);
    scene.add(rimLight);

    // 3. Earth Axial Tilt Group
    const earthGroup = new THREE.Group();
    earthGroup.rotation.z = 0.23;
    scene.add(earthGroup);

    const loader = new THREE.TextureLoader();

    // A. Satellite Surface + Specular Ocean + Night City Lights
    const earthGeo = new THREE.SphereGeometry(1.12, 64, 64);
    const earthMat = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      specular: new THREE.Color(0x38bdf8),
      shininess: 35,
      emissive: new THREE.Color(0xffb703),
      emissiveIntensity: 0.85,
    });

    loader.load(
      "/earth_satellite.jpg",
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        earthMat.map = tex;
        earthMat.needsUpdate = true;
      },
      undefined,
      () => earthMat.color.setHex(0x0ea5e9)
    );

    loader.load("/earth_specular.jpg", (specTex) => {
      earthMat.specularMap = specTex;
      earthMat.needsUpdate = true;
    });

    loader.load("/earth_lights.png", (lightsTex) => {
      lightsTex.colorSpace = THREE.SRGBColorSpace;
      earthMat.emissiveMap = lightsTex;
      earthMat.needsUpdate = true;
    });

    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    earthGroup.add(earthMesh);

    // B. Moon (Lunar Orbit) - ~384,400 km radius orbit
    const moonRef = useRef(null);
    const moonGeo = new THREE.SphereGeometry(0.12, 32, 32);
    const moonMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.8 });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    moonMesh.position.set(3.2 + Math.cos(moonOrbitPhase.current) * 1.8, 0.7 + Math.sin(moonOrbitPhase.current) * 1.0, 0);
    moonRef.current = moonMesh;
    scene.add(moonMesh);

    // C. ISS (International Space Station) - ~400 km altitude orbit
    const issBodyRef = useRef(null);
    // Orbital tracking refs for animation
    const moonOrbitPhase = useRef(0);
    const isonOrbitAngle = useRef(0);
    const issBody = new THREE.Group();
    const issMainGeo = new THREE.BoxGeometry(0.08, 0.03, 0.04);
    const issMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8 });
    const issMainMesh = new THREE.Mesh(issMainGeo, issMat);
    issBody.add(issMainMesh);

    const issPanelGeo = new THREE.BoxGeometry(0.16, 0.01, 0.04);
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.5 });
    const panelLeft = new THREE.Mesh(issPanelGeo, panelMat);
    panelLeft.position.set(-0.1, 0, 0);
    issBody.add(panelLeft);

    const panelRight = new THREE.Mesh(issPanelGeo, panelMat);
    panelRight.position.set(0.1, 0, 0);
    issBody.add(panelRight);

    issBody.position.set(2.4 + Math.cos(isonOrbitAngle.current * 5) * 1.5, 0.5 + Math.sin(isonOrbitAngle.current * 5) * 1.0, 0);
    issBodyRef.current = issBody;
    scene.add(issBody);

  const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    // C. Holographic Grid Overlay
    const holoGridGeo = new THREE.SphereGeometry(1.162, 28, 28);
    const holoGridMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.11,
    });
    const holoGrid = new THREE.Mesh(holoGridGeo, holoGridMat);
    earthGroup.add(holoGrid);

    // 4. Outer Satellite Orbit Rings (à®ªà®¾à®•à¯à®¸à¯à®•à¯à®•à¯à®³à¯ à®•à®šà¯à®šà®¿à®¤à®®à®¾à®• à®…à®Ÿà®™à¯à®•à¯à®®à¯ à®…à®³à®µà¯)
    const ring1Geo = new THREE.TorusGeometry(1.45, 0.011, 16, 120);
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.65,
    });
    const orbitRing1Ref = useRef(null);
    const orbitRing1 = new THREE.Mesh(ring1Geo, ring1Mat);
    orbitRing1Ref.current = orbitRing1;
    orbitRing1.rotation.x = 1.25;
    orbitRing1.rotation.y = 0.2;
    scene.add(orbitRing1);

    const ring2Geo = new THREE.TorusGeometry(1.62, 0.008, 16, 120);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
    });
    const orbitRing2Ref = useRef(null);
    const orbitRing2 = new THREE.Mesh(ring2Geo, ring2Mat);
    orbitRing2Ref.current = orbitRing2;
    orbitRing2.rotation.x = 1.45;
    orbitRing2.rotation.y = -0.35;
    scene.add(orbitRing2);

    // 5. Space Dust Particles
    const starCount = 75;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      starPos[i] = (Math.random() - 0.5) * 4.2;
      starPos[i + 1] = (Math.random() - 0.5) * 4.2;
      starPos[i + 2] = (Math.random() - 0.5) * 2.5;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0x7dd3fc,
      size: 0.03,
      transparent: true,
      opacity: 0.7,
    });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);

    // Auto-Resize when window changes
    const resizeObserver = new ResizeObserver(() => {
      const next = getBoxSize();
      camera.aspect = next.width / next.height;
      camera.updateProjectionMatrix();
      renderer.setSize(next.width, next.height);
    });
    resizeObserver.observe(containerRef.current);

    // Mouse Parallax
    const mouse = { x: 0, y: 0 };
    const onMove = (e: MouseEvent) => {
      mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("mousemove", onMove);

    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const { speaking: isSpeaking, listening: isListening } = stateRef.current;

      const baseSpin = isSpeaking ? 0.011 : isListening ? 0.007 : 0.0035;
      earthMesh.rotation.y += baseSpin;
      cloudMesh.rotation.y += baseSpin * 1.35;
      holoGrid.rotation.y += baseSpin * 1.15;

      orbitRing1.rotation.z += 0.01;
      orbitRing2.rotation.z -= 0.007;
      stars.rotation.y += 0.0015;

      ring1Mat.color.setHex(
        isSpeaking ? 0x10b981 : isListening ? 0xf43f5e : 0x00f0ff
      );
      holoGridMat.opacity = isSpeaking ? 0.24 : isListening ? 0.2 : 0.11;

      earthGroup.rotation.x += (mouse.y * 0.25 - earthGroup.rotation.x) * 0.05;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      window.removeEventListener("mousemove", onMove);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full rounded-2xl bg-white/[0.03] border border-cyan-300/20 flex flex-col items-center justify-center p-2 overflow-hidden select-none"
    >
      {/* Glow Behind Earth */}
      <div
        className={`absolute w-52 h-52 rounded-full blur-3xl transition-all duration-500 pointer-events-none ${
          speaking
            ? "bg-emerald-400/30 scale-115"
            : listening
            ? "bg-rose-400/30 scale-110"
            : "bg-cyan-400/25 scale-100"
        }`}
      />

      {/* Fitted 3D Satellite Hologram Earth Canvas */}
      <div ref={mountRef} className="flex items-center justify-center z-10" />

      {/* Status Badge */}
      <div className="z-20 mt-1 flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-950/75 border border-cyan-400/40 text-[11px] font-bold tracking-widest uppercase text-cyan-200 shadow-lg">
        <span
          className={`w-2 h-2 rounded-full ${
            speaking
              ? "bg-emerald-400 animate-ping"
              : listening
              ? "bg-rose-400 animate-ping"
              : "bg-cyan-400"
          }`}
        />
        {speaking
          ? "ANGEL AI â€¢ SPEAKING"
          : listening
          ? "ANGEL AI â€¢ LISTENING"
          : "GLOBAL HOLOGRAM â€¢ ONLINE"}
      </div>
    </div>
  );
}






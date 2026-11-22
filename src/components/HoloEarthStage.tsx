import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { CloudSun, Wind, Droplets } from "lucide-react";

interface HoloEarthProps {
  speaking: boolean;
  listening: boolean;
}

interface WeatherInfo {
  temperature: number;
  humidity: number;
  windSpeed: number;
  condition: string;
  location: string;
}

export function HoloEarthStage({ speaking, listening }: HoloEarthProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ speaking, listening });

  // Live Weather HUD state (Koduvai, TN, IN)
  const [weather, setWeather] = useState<WeatherInfo>({
    temperature: 29.0,
    humidity: 64,
    windSpeed: 12.0,
    condition: "Fair / Sunny",
    location: "Koduvai, IN",
  });

  useEffect(() => {
    stateRef.current = { speaking, listening };
  }, [speaking, listening]);

  // Fetch Open-Meteo weather with fallback for Koduvai (lat=11.02, lon=77.31)
  useEffect(() => {
    let isMounted = true;
    const fetchWeather = async () => {
      try {
        const url =
          "https://api.open-meteo.com/v1/forecast?latitude=11.02&longitude=77.31&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m";
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data.current && isMounted) {
            const code = data.current.weather_code ?? 0;
            let cond = "Clear Sky";
            if (code >= 1 && code <= 3) cond = "Partly Cloudy";
            else if (code >= 45 && code <= 48) cond = "Foggy";
            else if (code >= 51 && code <= 67) cond = "Rain Showers";
            else if (code >= 80 && code <= 99) cond = "Thunderstorms";

            setWeather({
              temperature: Math.round(data.current.temperature_2m * 10) / 10,
              humidity: data.current.relative_humidity_2m ?? 64,
              windSpeed: Math.round(data.current.wind_speed_10m * 10) / 10,
              condition: cond,
              location: "Koduvai, IN",
            });
          }
        }
      } catch {
        // Retain standard Koduvai fallback on network isolation
      }
    };

    fetchWeather();
    const weatherTimer = setInterval(fetchWeather, 10 * 60 * 1000); // 10 min
    return () => {
      isMounted = false;
      clearInterval(weatherTimer);
    };
  }, []);

  useEffect(() => {
    if (!mountRef.current || !containerRef.current) return;

    const getBoxSize = () => {
      const rect = containerRef.current!.getBoundingClientRect();
      const size = Math.max(200, Math.min(rect.width - 12, rect.height - 48));
      return { width: size, height: size };
    };

    let { width, height } = getBoxSize();

    // 1. Scene & Camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0.1, 4.75);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.innerHTML = "";
    mountRef.current.appendChild(renderer.domElement);

    // 2. Real-Time Solar Day/Night Lighting
    const ambientLight = new THREE.AmbientLight(0x1e293b, 0.95);
    scene.add(ambientLight);

    const calculateSunVector = () => {
      const now = new Date();
      const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60;
      const istHours = (utcHours + 5.5) % 24; // IST UTC+5:30
      const isNight = istHours < 6.0 || istHours > 18.5;

      let sunDist = 4.5;
      let sunY = 1.8;
      let xPos = 0;

      if (isNight) {
        sunDist = 3.2;
        sunY = -1.5;
        xPos = -1.5;
      } else {
        const progressInDay = istHours / 24;
        xPos = Math.sin(progressInDay * Math.PI * 2) * 3.5;
        sunY = Math.cos(progressInDay * Math.PI * 0.5) * 1.8;
        sunDist += Math.abs(Math.sin(progressInDay * Math.PI));
      }

      return new THREE.Vector3(xPos, sunY, sunDist);
    };

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.6);
    sunLight.position.copy(calculateSunVector());
    scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight(0x00f0ff, 1.4);
    rimLight.position.set(-4.0, -1.5, -2.5);
    scene.add(rimLight);

    // 3. Earth Axial Tilt Group (23.5 deg = ~0.41 rad or 0.23 rad aesthetic)
    const earthGroup = new THREE.Group();
    earthGroup.rotation.z = 0.23;
    scene.add(earthGroup);

    const loader = new THREE.TextureLoader();

    // A. Satellite Surface + Night City Lights + Specular Ocean
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

    // B. Moving 3D Cloud Layer
    const cloudGeo = new THREE.SphereGeometry(1.142, 64, 64);
    const cloudMat = new THREE.MeshPhongMaterial({
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });

    loader.load("/earth_clouds.png", (cloudTex) => {
      cloudMat.map = cloudTex;
      cloudMat.needsUpdate = true;
    });

    const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    earthGroup.add(cloudMesh);

    // C. Holographic Grid Wireframe
    const holoGridGeo = new THREE.SphereGeometry(1.162, 28, 28);
    const holoGridMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.11,
    });
    const holoGrid = new THREE.Mesh(holoGridGeo, holoGridMat);
    earthGroup.add(holoGrid);

    // 4. Orbiting 3D Moon
    const moonGeo = new THREE.SphereGeometry(0.12, 32, 32);
    const moonMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.85,
      metalness: 0.1,
    });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    moonMesh.position.set(2.4, 0.4, 0);
    scene.add(moonMesh);

    // 5. Procedural International Space Station (ISS) with Solar Wings
    const issBody = new THREE.Group();

    // Central cylindrical/box module
    const issMainGeo = new THREE.BoxGeometry(0.08, 0.03, 0.04);
    const issMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.7 });
    const issMainMesh = new THREE.Mesh(issMainGeo, issMat);
    issBody.add(issMainMesh);

    // Left & Right Solar Panels (Gold/Cyan Photo-Voltaic Wings)
    const panelGeo = new THREE.BoxGeometry(0.18, 0.008, 0.045);
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.6,
      metalness: 0.8,
    });

    const panelLeft = new THREE.Mesh(panelGeo, panelMat);
    panelLeft.position.set(-0.11, 0, 0);
    issBody.add(panelLeft);

    const panelRight = new THREE.Mesh(panelGeo, panelMat);
    panelRight.position.set(0.11, 0, 0);
    issBody.add(panelRight);

    issBody.position.set(1.38, 0.2, 0);
    scene.add(issBody);

    // 6. Outer Satellite Orbit Rings
    const ring1Geo = new THREE.TorusGeometry(1.45, 0.011, 16, 120);
    const ring1Mat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.65,
    });
    const orbitRing1 = new THREE.Mesh(ring1Geo, ring1Mat);
    orbitRing1.rotation.x = 1.25;
    orbitRing1.rotation.y = 0.2;
    scene.add(orbitRing1);

    const ring2Geo = new THREE.TorusGeometry(1.62, 0.008, 16, 120);
    const ring2Mat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.35,
    });
    const orbitRing2 = new THREE.Mesh(ring2Geo, ring2Mat);
    orbitRing2.rotation.x = 1.45;
    orbitRing2.rotation.y = -0.35;
    scene.add(orbitRing2);

    // 7. Space Dust Particles
    const starCount = 80;
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

    // Auto-Resize observer
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

    // Animation Loop with Slow-Motion 0.0008 rad/frame Standby Rotation
    let animId: number;
    let moonAngle = 0;
    let issAngle = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const { speaking: isSpeaking, listening: isListening } = stateRef.current;

      // Strict requirement: 0.0008 rad/frame standby rotation
      const baseSpin = isSpeaking ? 0.007 : isListening ? 0.004 : 0.0008;

      earthMesh.rotation.y += baseSpin;
      cloudMesh.rotation.y += baseSpin * 1.35;
      holoGrid.rotation.y += baseSpin * 1.15;

      // Orbiting 3D Moon
      moonAngle += 0.0012;
      moonMesh.position.x = Math.cos(moonAngle) * 2.35;
      moonMesh.position.z = Math.sin(moonAngle) * 2.35;
      moonMesh.rotation.y += 0.0012;

      // Orbiting ISS
      issAngle -= 0.008;
      issBody.position.x = Math.cos(issAngle) * 1.38;
      issBody.position.z = Math.sin(issAngle) * 1.38;
      issBody.rotation.y = -issAngle;

      orbitRing1.rotation.z += 0.006;
      orbitRing2.rotation.z -= 0.004;
      stars.rotation.y += 0.0005;

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
      {/* Live Weather HUD Glassmorphic Pill */}
      <div className="absolute top-2.5 left-2.5 z-20 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/70 border border-cyan-400/30 backdrop-blur-md text-white shadow-lg pointer-events-auto">
        <CloudSun size={15} className="text-amber-400 animate-pulse" />
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-black text-cyan-200">{weather.temperature}°C</span>
            <span className="text-[10px] text-slate-300 font-medium truncate">• {weather.location}</span>
          </div>
          <div className="flex items-center gap-2 text-[9px] text-slate-400 font-mono">
            <span className="flex items-center gap-0.5">
              <Droplets size={10} className="text-cyan-400" /> {weather.humidity}%
            </span>
            <span className="flex items-center gap-0.5">
              <Wind size={10} className="text-sky-400" /> {weather.windSpeed} km/h
            </span>
          </div>
        </div>
      </div>

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
          ? "ANGEL AI • SPEAKING"
          : listening
          ? "ANGEL AI • LISTENING"
          : "ORBITAL EARTH • ONLINE"}
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { CloudSun, Droplets } from "lucide-react";

interface HoloEarthProps {
  speaking: boolean;
  listening: boolean;
}

interface WeatherData {
  location: string;
  temperature: number;
  humidity: number;
  condition: string;
}

export function HoloEarthStage({ speaking, listening }: HoloEarthProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ speaking, listening });

  const [weather, setWeather] = useState<WeatherData>({
    location: "Koduvai, IN",
    temperature: 29.0,
    humidity: 64,
    condition: "Fair",
  });

  useEffect(() => {
    stateRef.current = { speaking, listening };
  }, [speaking, listening]);

  // Live Local Weather Overlay via Open-Meteo with Geolocation & Koduvai fallback
  useEffect(() => {
    let isMounted = true;

    const fetchWeather = async (lat: number, lon: number, locName: string) => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data?.current && isMounted) {
            const code = data.current.weather_code ?? 0;
            let cond = "Clear";
            if (code >= 1 && code <= 3) cond = "Partly Cloudy";
            else if (code >= 45 && code <= 48) cond = "Foggy";
            else if (code >= 51 && code <= 67) cond = "Rain";
            else if (code >= 80 && code <= 99) cond = "Storm";

            setWeather({
              location: locName,
              temperature: Math.round(data.current.temperature_2m * 10) / 10,
              humidity: data.current.relative_humidity_2m ?? 64,
              condition: cond,
            });
          }
        }
      } catch {
        // Fallback already pre-set to Koduvai, IN
      }
    };

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          fetchWeather(pos.coords.latitude, pos.coords.longitude, "Local Weather");
        },
        () => {
          fetchWeather(11.02, 77.31, "Koduvai, IN");
        },
        { timeout: 4000 }
      );
    } else {
      fetchWeather(11.02, 77.31, "Koduvai, IN");
    }

    const interval = setInterval(() => {
      fetchWeather(11.02, 77.31, "Koduvai, IN");
    }, 10 * 60 * 1000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // 3D Scene Initialization
  useEffect(() => {
    if (!mountRef.current || !containerRef.current) return;

    const getBoxSize = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      const width = rect?.width || window.innerWidth;
      const height = rect?.height || window.innerHeight;
      return { width, height };
    };

    let { width, height } = getBoxSize();

    // 1. Scene, Camera (z = 4.9 for zero-clipping auto-fit), Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0.1, 4.9);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.innerHTML = "";
    mountRef.current.appendChild(renderer.domElement);

    // 2. Ambient + Real-Time Solar Directional Lighting (calculated from system current hour)
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

    // 3. Earth Tilt Group
    const earthGroup = new THREE.Group();
    earthGroup.rotation.z = 0.23;
    scene.add(earthGroup);

    const loader = new THREE.TextureLoader();

    // A. Satellite Surface + Specular Oceans + Night City Lights
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

    // B. Moving 3D Cloud Sphere
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

    // 4. Orbiting 3D Moon on Inclined Orbit
    const moonGroup = new THREE.Group();
    moonGroup.rotation.x = 0.35; // 20-deg lunar orbital inclination
    scene.add(moonGroup);

    const moonGeo = new THREE.SphereGeometry(0.24, 32, 32);
    const moonMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.88,
      metalness: 0.05,
    });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    moonMesh.position.set(2.35, 0, 0);
    moonGroup.add(moonMesh);

    // 5. Procedural 3D ISS Group (Truss + Habitation + Twin Solar Wings + Blinking Cyan Beacon)
    const issGroup = new THREE.Group();
    issGroup.rotation.x = -0.45; // 51.6-deg ISS orbital inclination aesthetic
    scene.add(issGroup);

    const issStation = new THREE.Group();

    // Central Habitation & Node
    const habGeo = new THREE.BoxGeometry(0.07, 0.035, 0.035);
    const habMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.75 });
    const habMesh = new THREE.Mesh(habGeo, habMat);
    issStation.add(habMesh);

    // Integrated Truss Structure
    const trussGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.26, 8);
    const trussMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9 });
    const trussMesh = new THREE.Mesh(trussGeo, trussMat);
    trussMesh.rotation.z = Math.PI / 2;
    issStation.add(trussMesh);

    // Twin Solar Wings (Port & Starboard Photovoltaic Arrays)
    const wingGeo = new THREE.BoxGeometry(0.12, 0.006, 0.045);
    const wingMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.65,
      metalness: 0.85,
    });

    const leftWing = new THREE.Mesh(wingGeo, wingMat);
    leftWing.position.set(-0.13, 0, 0);
    issStation.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeo, wingMat);
    rightWing.position.set(0.13, 0, 0);
    issStation.add(rightWing);

    // Blinking Cyan Beacon
    const beaconGeo = new THREE.SphereGeometry(0.012, 12, 12);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
    beaconMesh.position.set(0, 0.025, 0);
    issStation.add(beaconMesh);

    issStation.position.set(1.42, 0, 0);
    issGroup.add(issStation);

    // 6. Two Outer Hologram Orbit Rings
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

    // Auto-Resize Container Observer
    const resizeObserver = new ResizeObserver(() => {
      const next = getBoxSize();
      camera.aspect = next.width / next.height;
      camera.updateProjectionMatrix();
      renderer.setSize(next.width, next.height);
    });
    resizeObserver.observe(containerRef.current);

    // Mouse Parallax Interaction
    const mouse = { x: 0, y: 0 };
    const onMove = (e: MouseEvent) => {
      mouse.x = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("mousemove", onMove);

    // Animation Loop
    let animId: number;
    let moonAngle = 0;
    let issAngle = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const { speaking: isSpeaking, listening: isListening } = stateRef.current;

      // Real-time speed: 0.0008 rad/frame standby, 0.0018 when speaking
      const baseSpin = isSpeaking ? 0.0018 : isListening ? 0.0012 : 0.0008;

      earthMesh.rotation.y += baseSpin;
      cloudMesh.rotation.y += baseSpin * 1.35;
      holoGrid.rotation.y += baseSpin * 1.15;

      // Orbiting 3D Moon
      moonAngle += 0.001;
      moonMesh.position.x = Math.cos(moonAngle) * 2.35;
      moonMesh.position.z = Math.sin(moonAngle) * 2.35;
      moonMesh.rotation.y += 0.001;

      // Orbiting ISS with tangential orientation
      issAngle -= 0.007;
      issStation.position.x = Math.cos(issAngle) * 1.42;
      issStation.position.z = Math.sin(issAngle) * 1.42;
      issStation.rotation.y = -issAngle + Math.PI / 2;

      // Beacon blinking effect
      const beaconIntensity = (Math.sin(Date.now() * 0.008) + 1) * 0.5;
      beaconMat.color.setRGB(0, beaconIntensity, beaconIntensity);

      // Rings and stars
      orbitRing1.rotation.z += 0.005;
      orbitRing2.rotation.z -= 0.003;
      stars.rotation.y += 0.0005;

      // Visual feedback colors
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
      className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden select-none"
    >
      {/* Live Local Weather Overlay Compact Glass Pill */}
      <div className="absolute top-3 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/70 border border-cyan-400/30 backdrop-blur-md text-white shadow-lg pointer-events-auto">
        <CloudSun size={15} className="text-amber-400 animate-pulse shrink-0" />
        <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-200">
          <span>{weather.location}</span>
          <span className="text-slate-400">•</span>
          <span className="text-white font-extrabold">{weather.temperature}°C</span>
          <span className="text-slate-400">•</span>
          <span className="flex items-center gap-0.5 text-slate-300 text-[11px] font-mono">
            <Droplets size={11} className="text-cyan-400" /> {weather.humidity}%
          </span>
        </div>
      </div>

      {/* Radial Glow Behind Earth */}
      <div
        className={`absolute w-[500px] h-[500px] rounded-full blur-3xl transition-all duration-700 pointer-events-none ${
          speaking
            ? "bg-emerald-500/25 scale-120"
            : listening
            ? "bg-rose-500/25 scale-110"
            : "bg-cyan-500/15 scale-100"
        }`}
      />

      {/* Fitted 3D Satellite Hologram Earth Canvas */}
      <div ref={mountRef} className="w-full h-full flex items-center justify-center pointer-events-none z-10" />
    </div>
  );
}

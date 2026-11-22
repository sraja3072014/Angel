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

    // Dynamic Earth Scale & Live Weather FX State
    let targetScale = parseFloat(localStorage.getItem("angel_earth_scale") || "1.0");
    if (isNaN(targetScale) || targetScale < 0.5) targetScale = 1.0;
    let weatherFxEnabled = localStorage.getItem("angel_earth_weather_fx") !== "false";
    earthGroup.scale.set(targetScale, targetScale, targetScale);

    // Procedural Storm Lightning Point Lights inside cloud clusters
    const lightning1 = new THREE.PointLight(0xa5f3fc, 0, 1.9, 2);
    lightning1.position.set(0.72, 0.35, 0.85);
    earthGroup.add(lightning1);

    const lightning2 = new THREE.PointLight(0xdbeafe, 0, 1.9, 2);
    lightning2.position.set(-0.65, -0.28, 0.92);
    earthGroup.add(lightning2);

    // Soft Polar Aurora / Snow Shimmer at high latitudes
    const auroraGeo = new THREE.RingGeometry(0.38, 0.58, 64);
    const auroraMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const auroraMesh = new THREE.Mesh(auroraGeo, auroraMat);
    auroraMesh.rotation.x = Math.PI / 2;
    auroraMesh.position.set(0, 1.08, 0);
    earthGroup.add(auroraMesh);

    // Listen for live config updates dispatched from Control Center
    const onEarthConfig = (e: any) => {
      if (e.detail?.scale !== undefined) {
        targetScale = e.detail.scale;
      }
      if (e.detail?.weatherFx !== undefined) {
        weatherFxEnabled = e.detail.weatherFx;
      }
    };
    window.addEventListener("angel-earth-config", onEarthConfig);

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

    // 6. Space Dust Particles in Deep Space
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

      // Dynamic Earth scale lerping smoothly in real-time
      earthGroup.scale.lerp(new THREE.Vector3(targetScale, targetScale, targetScale), 0.08);

      // Real-Time Global Weather FX: Storm Lightning & Polar Aurora Shimmer
      if (weatherFxEnabled) {
        // Distant storm lightning pulse 1
        if (Math.random() < 0.02) {
          lightning1.intensity = 2.4 + Math.random() * 2.0;
        } else {
          lightning1.intensity *= 0.72;
          if (lightning1.intensity < 0.05) lightning1.intensity = 0;
        }

        // Distant storm lightning pulse 2
        if (Math.random() < 0.015) {
          lightning2.intensity = 2.2 + Math.random() * 2.0;
        } else {
          lightning2.intensity *= 0.68;
          if (lightning2.intensity < 0.05) lightning2.intensity = 0;
        }

        // Polar Aurora shimmer
        auroraMesh.visible = true;
        auroraMat.opacity = 0.22 + 0.14 * Math.sin(Date.now() * 0.002);
        auroraMesh.rotation.z += 0.002;
      } else {
        lightning1.intensity = 0;
        lightning2.intensity = 0;
        auroraMesh.visible = false;
      }

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

      // Deep space background dust motion
      stars.rotation.y += 0.0005;

      earthGroup.rotation.x += (mouse.y * 0.25 - earthGroup.rotation.x) * 0.05;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("angel-earth-config", onEarthConfig);
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

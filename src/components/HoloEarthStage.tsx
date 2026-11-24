import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Droplets, Atom, Brain, Globe, Sparkles } from "lucide-react";

export type Core3DTheme = "quantum_gyro" | "neural_synapse" | "orbital_earth" | "volumetric_hologram";

interface HoloEarthProps {
  speaking: boolean;
  listening: boolean;
  theme?: Core3DTheme;
}

interface WeatherData {
  location: string;
  temperature: number;
  humidity: number;
  condition: string;
}

export function HoloEarthStage({ speaking, listening, theme: propTheme }: HoloEarthProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ speaking, listening });

  const [activeTheme, setActiveTheme] = useState<Core3DTheme>(() => {
    return propTheme || (localStorage.getItem("angel_3d_core_theme") as Core3DTheme) || "quantum_gyro";
  });

  const [weather, setWeather] = useState<WeatherData>({
    location: "Koduvai, IN",
    temperature: 29.0,
    humidity: 64,
    condition: "Fair",
  });

  useEffect(() => {
    stateRef.current = { speaking, listening };
  }, [speaking, listening]);

  useEffect(() => {
    if (propTheme) {
      setActiveTheme(propTheme);
    }
  }, [propTheme]);

  // Listen for live 3D theme change events dispatched from Control Center
  useEffect(() => {
    const handleThemeChange = (e: any) => {
      const newTheme = e.detail?.theme;
      if (newTheme) {
        setActiveTheme(newTheme);
      }
    };
    window.addEventListener("angel-3d-theme-changed", handleThemeChange);
    return () => window.removeEventListener("angel-3d-theme-changed", handleThemeChange);
  }, []);

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

  // 3D Scene Initialization with 4 Sci-Fi Cores
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

    // 2. Ambient & Multi-Angle Stage Lights
    const ambientLight = new THREE.AmbientLight(0x0f172a, 1.2);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0x38bdf8, 2.5);
    keyLight.position.set(3.5, 3.0, 4.0);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x818cf8, 2.0);
    rimLight.position.set(-4.0, -2.0, -2.5);
    scene.add(rimLight);

    const coreLight = new THREE.PointLight(0x00f0ff, 3.0, 8);
    coreLight.position.set(0, 0, 0);
    scene.add(coreLight);

    // ==========================================
    // CORE 1: QUANTUM GYROSCOPE CORE (JARVIS Style)
    // ==========================================
    const gyroRoot = new THREE.Group();
    scene.add(gyroRoot);

    // Outer Ring
    const outerRingGeo = new THREE.TorusGeometry(1.48, 0.022, 16, 120);
    const outerRingMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x0284c7,
      emissiveIntensity: 0.8,
      metalness: 0.9,
      roughness: 0.1,
    });
    const outerRing = new THREE.Mesh(outerRingGeo, outerRingMat);
    gyroRoot.add(outerRing);

    // Outer Ring Tick Marks / Circuit Nodes
    const tickGroup = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const tickGeo = new THREE.BoxGeometry(0.06, 0.02, 0.04);
      const tickMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const tick = new THREE.Mesh(tickGeo, tickMat);
      tick.position.set(Math.cos(angle) * 1.48, Math.sin(angle) * 1.48, 0);
      tick.rotation.z = angle;
      tickGroup.add(tick);
    }
    outerRing.add(tickGroup);

    // Middle Gimbal Ring
    const midRingGeo = new THREE.TorusGeometry(1.22, 0.026, 16, 100);
    const midRingMat = new THREE.MeshStandardMaterial({
      color: 0x6366f1,
      emissive: 0x4f46e5,
      emissiveIntensity: 0.85,
      metalness: 0.85,
      roughness: 0.15,
    });
    const midRing = new THREE.Mesh(midRingGeo, midRingMat);
    midRing.rotation.x = Math.PI / 3;
    gyroRoot.add(midRing);

    // Inner Fast Gyro Ring
    const innerRingGeo = new THREE.TorusGeometry(0.96, 0.024, 16, 90);
    const innerRingMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xd97706,
      emissiveIntensity: 0.9,
      metalness: 0.9,
      roughness: 0.1,
    });
    const innerRing = new THREE.Mesh(innerRingGeo, innerRingMat);
    innerRing.rotation.y = Math.PI / 4;
    gyroRoot.add(innerRing);

    // Central Floating Energy Core (Dual-Layer Icosahedron)
    const coreShellGeo = new THREE.IcosahedronGeometry(0.54, 2);
    const coreShellMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.75,
      emissive: 0x0284c7,
      emissiveIntensity: 0.6,
    });
    const coreShell = new THREE.Mesh(coreShellGeo, coreShellMat);
    gyroRoot.add(coreShell);

    const innerCoreGeo = new THREE.SphereGeometry(0.36, 32, 32);
    const innerCoreMat = new THREE.MeshBasicMaterial({
      color: 0xa5f3fc,
      transparent: true,
      opacity: 0.88,
    });
    const innerCore = new THREE.Mesh(innerCoreGeo, innerCoreMat);
    gyroRoot.add(innerCore);

    // Circulating Energy Particles
    const gyroPartCount = 180;
    const gyroPartPos = new Float32Array(gyroPartCount * 3);
    for (let i = 0; i < gyroPartCount; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      const r = 0.65 + Math.random() * 0.75;
      gyroPartPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      gyroPartPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      gyroPartPos[i * 3 + 2] = r * Math.cos(phi);
    }
    const gyroPartGeo = new THREE.BufferGeometry();
    gyroPartGeo.setAttribute("position", new THREE.BufferAttribute(gyroPartPos, 3));
    const gyroPartMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.035,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    const gyroParticles = new THREE.Points(gyroPartGeo, gyroPartMat);
    gyroRoot.add(gyroParticles);

    // ==========================================
    // CORE 2: LIVING NEURAL SYNAPSE SPHERE
    // ==========================================
    const synapseRoot = new THREE.Group();
    scene.add(synapseRoot);

    const nodeCount = 110;
    const nodePositions: THREE.Vector3[] = [];
    const nodeRadii: number[] = [];

    const synapseGeo = new THREE.BufferGeometry();
    const posArray = new Float32Array(nodeCount * 3);

    for (let i = 0; i < nodeCount; i++) {
      const phi = Math.acos(-1 + (2 * i) / nodeCount);
      const theta = Math.sqrt(nodeCount * Math.PI) * phi;
      const r = 1.08 + (Math.random() - 0.5) * 0.28;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      posArray[i * 3] = x;
      posArray[i * 3 + 1] = y;
      posArray[i * 3 + 2] = z;

      nodePositions.push(new THREE.Vector3(x, y, z));
      nodeRadii.push(r);
    }

    synapseGeo.setAttribute("position", new THREE.BufferAttribute(posArray, 3));
    const synapseMat = new THREE.PointsMaterial({
      color: 0xc084fc,
      size: 0.065,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });
    const synapseNodes = new THREE.Points(synapseGeo, synapseMat);
    synapseRoot.add(synapseNodes);

    // Neural Synaptic Filaments / Connections
    const lineIndices: number[] = [];
    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        const dist = nodePositions[i].distanceTo(nodePositions[j]);
        if (dist < 0.44) {
          lineIndices.push(i, j);
        }
      }
    }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.BufferAttribute(posArray, 3));
    lineGeo.setIndex(lineIndices);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x818cf8,
      transparent: true,
      opacity: 0.45,
      blending: THREE.AdditiveBlending,
    });
    const synapseLines = new THREE.LineSegments(lineGeo, lineMat);
    synapseRoot.add(synapseLines);

    // Central Synaptic Nucleus Glow
    const nucleusGeo = new THREE.SphereGeometry(0.48, 32, 32);
    const nucleusMat = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      transparent: true,
      opacity: 0.55,
      wireframe: true,
    });
    const nucleusMesh = new THREE.Mesh(nucleusGeo, nucleusMat);
    synapseRoot.add(nucleusMesh);

    // ==========================================
    // CORE 3: SATELLITE ORBITAL EARTH
    // ==========================================
    const earthRoot = new THREE.Group();
    scene.add(earthRoot);

    const earthGroup = new THREE.Group();
    earthGroup.rotation.z = 0.23;
    earthRoot.add(earthGroup);

    const loader = new THREE.TextureLoader();

    // Satellite Surface + Specular Oceans + Night City Lights
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

    // Moving 3D Cloud Sphere
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

    // Storm Lightning Point Lights
    const lightning1 = new THREE.PointLight(0xa5f3fc, 0, 1.9, 2);
    lightning1.position.set(0.72, 0.35, 0.85);
    earthGroup.add(lightning1);

    const lightning2 = new THREE.PointLight(0xdbeafe, 0, 1.9, 2);
    lightning2.position.set(-0.65, -0.28, 0.92);
    earthGroup.add(lightning2);

    // Polar Aurora Shimmer
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

    // Orbiting 3D Moon
    const moonGroup = new THREE.Group();
    moonGroup.rotation.x = 0.35;
    earthRoot.add(moonGroup);

    const moonGeo = new THREE.SphereGeometry(0.24, 32, 32);
    const moonMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.88,
      metalness: 0.05,
    });
    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    moonMesh.position.set(2.35, 0, 0);
    moonGroup.add(moonMesh);

    // Procedural 3D ISS Space Station
    const issGroup = new THREE.Group();
    issGroup.rotation.x = -0.45;
    earthRoot.add(issGroup);

    const issStation = new THREE.Group();
    const habMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.035, 0.035),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.75 })
    );
    issStation.add(habMesh);

    const trussMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.26, 8),
      new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.9 })
    );
    trussMesh.rotation.z = Math.PI / 2;
    issStation.add(trussMesh);

    const solarMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.65,
      metalness: 0.85,
    });
    const leftWing = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.006, 0.045), solarMat);
    leftWing.position.set(-0.13, 0, 0);
    issStation.add(leftWing);

    const rightWing = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.006, 0.045), solarMat);
    rightWing.position.set(0.13, 0, 0);
    issStation.add(rightWing);

    const beaconMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff })
    );
    beaconMesh.position.set(0, 0.025, 0);
    issStation.add(beaconMesh);

    issStation.position.set(1.42, 0, 0);
    issGroup.add(issStation);

    // ==========================================
    // CORE 4: VOLUMETRIC HOLOGRAM SILHOUETTE
    // ==========================================
    const hologramRoot = new THREE.Group();
    scene.add(hologramRoot);

    const holoParticleCount = 1800;
    const holoPositions = new Float32Array(holoParticleCount * 3);
    const holoBaseAngles = new Float32Array(holoParticleCount * 2);

    for (let i = 0; i < holoParticleCount; i++) {
      const u = Math.random() * Math.PI * 2;
      const v = Math.random() * Math.PI * 2;
      const r = 1.05 + 0.35 * Math.sin(u * 3) * Math.cos(v * 2);
      holoPositions[i * 3] = r * Math.cos(u) * Math.sin(v);
      holoPositions[i * 3 + 1] = r * Math.sin(u) * Math.sin(v);
      holoPositions[i * 3 + 2] = r * Math.cos(v);

      holoBaseAngles[i * 2] = u;
      holoBaseAngles[i * 2 + 1] = v;
    }

    const holoGeo = new THREE.BufferGeometry();
    holoGeo.setAttribute("position", new THREE.BufferAttribute(holoPositions, 3));
    const holoMat = new THREE.PointsMaterial({
      color: 0x22d3ee,
      size: 0.042,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
    });
    const holoPoints = new THREE.Points(holoGeo, holoMat);
    hologramRoot.add(holoPoints);

    // Scanning Hologram Disc
    const scanDiscGeo = new THREE.RingGeometry(0.85, 1.45, 64);
    const scanDiscMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const scanDisc = new THREE.Mesh(scanDiscGeo, scanDiscMat);
    scanDisc.rotation.x = Math.PI / 2;
    hologramRoot.add(scanDisc);

    // Deep Space Dust Particles
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

    // Dynamic Scale & Config
    let targetScale = parseFloat(localStorage.getItem("angel_earth_scale") || "1.0");
    if (isNaN(targetScale) || targetScale < 0.5) targetScale = 1.0;
    let weatherFxEnabled = localStorage.getItem("angel_earth_weather_fx") !== "false";

    const onEarthConfig = (e: any) => {
      if (e.detail?.scale !== undefined) {
        targetScale = e.detail.scale;
      }
      if (e.detail?.weatherFx !== undefined) {
        weatherFxEnabled = e.detail.weatherFx;
      }
    };
    window.addEventListener("angel-earth-config", onEarthConfig);

    // Resize Observer
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
    let scanDiscY = 0;
    let scanDirection = 1;

    let gyroScale = 0.001;
    let synapseScale = 0.001;
    let earthScaleCurrent = 0.001;
    let holoScale = 0.001;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const { speaking: isSpeaking, listening: isListening } = stateRef.current;
      const speedMultiplier = isSpeaking ? 2.5 : isListening ? 1.8 : 1.0;

      // Smooth Morphing Between Selected Core Themes
      const currentThemeVal = (localStorage.getItem("angel_3d_core_theme") as Core3DTheme) || "quantum_gyro";

      const targetGyro = currentThemeVal === "quantum_gyro" ? targetScale : 0.001;
      const targetSynapse = currentThemeVal === "neural_synapse" ? targetScale : 0.001;
      const targetEarth = currentThemeVal === "orbital_earth" ? targetScale : 0.001;
      const targetHolo = currentThemeVal === "volumetric_hologram" ? targetScale : 0.001;

      gyroScale += (targetGyro - gyroScale) * 0.08;
      synapseScale += (targetSynapse - synapseScale) * 0.08;
      earthScaleCurrent += (targetEarth - earthScaleCurrent) * 0.08;
      holoScale += (targetHolo - holoScale) * 0.08;

      gyroRoot.scale.set(gyroScale, gyroScale, gyroScale);
      gyroRoot.visible = gyroScale > 0.01;

      synapseRoot.scale.set(synapseScale, synapseScale, synapseScale);
      synapseRoot.visible = synapseScale > 0.01;

      earthRoot.scale.set(earthScaleCurrent, earthScaleCurrent, earthScaleCurrent);
      earthRoot.visible = earthScaleCurrent > 0.01;

      hologramRoot.scale.set(holoScale, holoScale, holoScale);
      hologramRoot.visible = holoScale > 0.01;

      // 1. Quantum Gyroscope Core Animation
      if (gyroRoot.visible) {
        outerRing.rotation.z += 0.004 * speedMultiplier;
        outerRing.rotation.y += 0.002;
        midRing.rotation.x += 0.009 * speedMultiplier;
        midRing.rotation.z -= 0.005;
        innerRing.rotation.y -= 0.014 * speedMultiplier;
        innerRing.rotation.x += 0.006;

        coreShell.rotation.y += 0.01 * speedMultiplier;
        coreShell.rotation.x += 0.008;

        const pulse = 1.0 + 0.08 * Math.sin(Date.now() * 0.006 * speedMultiplier);
        innerCore.scale.set(pulse, pulse, pulse);
        coreLight.intensity = isSpeaking ? 4.5 : isListening ? 3.5 : 2.5;

        gyroParticles.rotation.y += 0.003 * speedMultiplier;
      }

      // 2. Neural Synapse Sphere Animation
      if (synapseRoot.visible) {
        synapseRoot.rotation.y += 0.0035 * speedMultiplier;
        synapseRoot.rotation.x += 0.0015;

        const pulseScale = 1.0 + 0.05 * Math.sin(Date.now() * 0.005 * speedMultiplier);
        nucleusMesh.scale.set(pulseScale, pulseScale, pulseScale);

        if (isSpeaking) {
          synapseMat.color.setHex(0x38bdf8);
          lineMat.opacity = 0.75 + 0.2 * Math.sin(Date.now() * 0.02);
        } else if (isListening) {
          synapseMat.color.setHex(0xf43f5e);
          lineMat.opacity = 0.65;
        } else {
          synapseMat.color.setHex(0xc084fc);
          lineMat.opacity = 0.38 + 0.1 * Math.sin(Date.now() * 0.003);
        }
      }

      // 3. Orbital Earth Animation
      if (earthRoot.visible) {
        const baseSpin = (isSpeaking ? 0.0018 : isListening ? 0.0012 : 0.0008) * targetScale;
        earthMesh.rotation.y += baseSpin;
        cloudMesh.rotation.y += baseSpin * 1.35;

        if (weatherFxEnabled) {
          if (Math.random() < 0.02) {
            lightning1.intensity = 2.4 + Math.random() * 2.0;
          } else {
            lightning1.intensity *= 0.72;
            if (lightning1.intensity < 0.05) lightning1.intensity = 0;
          }
          if (Math.random() < 0.015) {
            lightning2.intensity = 2.2 + Math.random() * 2.0;
          } else {
            lightning2.intensity *= 0.68;
            if (lightning2.intensity < 0.05) lightning2.intensity = 0;
          }
          auroraMesh.visible = true;
          auroraMat.opacity = 0.22 + 0.14 * Math.sin(Date.now() * 0.002);
          auroraMesh.rotation.z += 0.002;
        } else {
          lightning1.intensity = 0;
          lightning2.intensity = 0;
          auroraMesh.visible = false;
        }

        moonAngle += 0.001;
        moonMesh.position.x = Math.cos(moonAngle) * 2.35;
        moonMesh.position.z = Math.sin(moonAngle) * 2.35;
        moonMesh.rotation.y += 0.001;

        issAngle -= 0.007;
        issStation.position.x = Math.cos(issAngle) * 1.42;
        issStation.position.z = Math.sin(issAngle) * 1.42;
        issStation.rotation.y = -issAngle + Math.PI / 2;

        const beaconIntensity = (Math.sin(Date.now() * 0.008) + 1) * 0.5;
        beaconMesh.scale.set(1 + beaconIntensity * 0.5, 1 + beaconIntensity * 0.5, 1 + beaconIntensity * 0.5);
      }

      // 4. Volumetric Hologram Silhouette Animation
      if (hologramRoot.visible) {
        hologramRoot.rotation.y += 0.004 * speedMultiplier;
        hologramRoot.rotation.x += 0.002;

        scanDiscY += 0.012 * scanDirection * speedMultiplier;
        if (scanDiscY > 1.25) scanDirection = -1;
        if (scanDiscY < -1.25) scanDirection = 1;
        scanDisc.position.y = scanDiscY;

        // Waveform Particle Undulation
        const timeNow = Date.now() * 0.0025;
        const positions = holoGeo.attributes.position.array as Float32Array;
        for (let i = 0; i < holoParticleCount; i++) {
          const u = holoBaseAngles[i * 2];
          const v = holoBaseAngles[i * 2 + 1];
          const wave = 0.08 * Math.sin(u * 4 + timeNow) * Math.cos(v * 3 + timeNow);
          const r = 1.05 + 0.35 * Math.sin(u * 3) * Math.cos(v * 2) + wave;

          positions[i * 3] = r * Math.cos(u) * Math.sin(v);
          positions[i * 3 + 1] = r * Math.sin(u) * Math.sin(v);
          positions[i * 3 + 2] = r * Math.cos(v);
        }
        holoGeo.attributes.position.needsUpdate = true;
      }

      // Deep space background motion & Parallax
      stars.rotation.y += 0.0005;
      scene.rotation.x += (mouse.y * 0.2 - scene.rotation.x) * 0.05;
      scene.rotation.y += (mouse.x * 0.2 - scene.rotation.y) * 0.05;

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
      {/* Live Core Telemetry & Weather Overlay Glass Pill */}
      <div className="absolute top-3 left-4 z-20 flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-950/75 border border-cyan-400/30 backdrop-blur-md text-white shadow-lg pointer-events-auto">
        {activeTheme === "quantum_gyro" && (
          <>
            <Atom size={15} className="text-cyan-400 animate-spin shrink-0" style={{ animationDuration: "8s" }} />
            <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-200 font-mono">
              <span>QUANTUM GYRO CORE</span>
              <span className="text-slate-500">•</span>
              <span className="text-emerald-400">1.21 GW</span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-300 text-[11px] font-sans">
                {weather.location} ({weather.temperature}°C)
              </span>
            </div>
          </>
        )}

        {activeTheme === "neural_synapse" && (
          <>
            <Brain size={15} className="text-purple-400 animate-pulse shrink-0" />
            <div className="flex items-center gap-1.5 text-xs font-bold text-purple-200 font-mono">
              <span>NEURAL SYNAPSE</span>
              <span className="text-slate-500">•</span>
              <span className="text-cyan-300">110 NODES</span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-300 text-[11px] font-sans">
                {weather.location} ({weather.temperature}°C)
              </span>
            </div>
          </>
        )}

        {activeTheme === "orbital_earth" && (
          <>
            <Globe size={15} className="text-emerald-400 shrink-0" />
            <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-200">
              <span>{weather.location}</span>
              <span className="text-slate-400">•</span>
              <span className="text-white font-extrabold">{weather.temperature}°C</span>
              <span className="text-slate-400">•</span>
              <span className="flex items-center gap-0.5 text-slate-300 text-[11px] font-mono">
                <Droplets size={11} className="text-cyan-400" /> {weather.humidity}%
              </span>
            </div>
          </>
        )}

        {activeTheme === "volumetric_hologram" && (
          <>
            <Sparkles size={15} className="text-teal-400 animate-pulse shrink-0" />
            <div className="flex items-center gap-1.5 text-xs font-bold text-teal-200 font-mono">
              <span>VOLUMETRIC HOLOGRAM</span>
              <span className="text-slate-500">•</span>
              <span className="text-cyan-400">1,800 PTS</span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-300 text-[11px] font-sans">
                {weather.location} ({weather.temperature}°C)
              </span>
            </div>
          </>
        )}
      </div>

      {/* Radial Glow Behind 3D Core */}
      <div
        className={`absolute w-[500px] h-[500px] rounded-full blur-3xl transition-all duration-700 pointer-events-none ${
          speaking
            ? "bg-emerald-500/25 scale-125"
            : listening
            ? "bg-rose-500/25 scale-115"
            : activeTheme === "neural_synapse"
            ? "bg-purple-500/20 scale-100"
            : activeTheme === "quantum_gyro"
            ? "bg-cyan-500/20 scale-100"
            : activeTheme === "volumetric_hologram"
            ? "bg-teal-500/20 scale-100"
            : "bg-cyan-500/15 scale-100"
        }`}
      />

      {/* Canvas */}
      <div ref={mountRef} className="w-full h-full flex items-center justify-center pointer-events-none z-10" />
    </div>
  );
}

import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { invoke } from "@tauri-apps/api/core";
import { Boxes, Sun, Download, X } from "lucide-react";

type ShapeType = "torusKnot" | "icosahedron" | "churchCross";

export function ThreeDStudioWindow() {
  const [shape, setShape] = useState<ShapeType>("torusKnot");
  const [meshColor, setMeshColor] = useState("#22d3ee");
  const [wireframe, setWireframe] = useState(false);
  const [lightIntensity, setLightIntensity] = useState(1.6);

  const handleExportObj = () => {
    const objContent = `# Angel 3D Studio Export (${shape})\no AngelModel\nv 0 1 0\nv -1 -1 0\nv 1 -1 0\nf 1 2 3\n`;
    const blob = new Blob([objContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `angel-3d-${shape}.obj`;
    a.click();
  };

  return (
    <div className="w-screen h-screen bg-slate-950/90 backdrop-blur-2xl border border-cyan-400/30 rounded-2xl flex flex-col text-white select-none overflow-hidden font-sans">
      <header
        data-tauri-drag-region
        className="h-12 px-4 border-b border-white/10 flex items-center justify-between bg-black/40"
      >
        <div className="flex items-center gap-2 pointer-events-none">
          <Boxes size={16} className="text-cyan-400" />
          <span className="text-xs font-extrabold tracking-wide">3D VIEWPORT MICRO-STUDIO</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportObj}
            className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-xs font-bold text-emerald-200 flex items-center gap-1.5"
          >
            <Download size={13} />
            <span>Export OBJ</span>
          </button>
          <button
            onClick={() => invoke("close_studio_window", { label: "studio-threed" }).catch(() => window.close())}
            className="p-1.5 rounded-xl hover:bg-rose-500/20 text-slate-400 hover:text-rose-300"
          >
            <X size={15} />
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <aside className="w-60 border-r border-white/10 bg-black/30 p-4 space-y-4">
          <div className="space-y-1.5">
            <div className="text-[11px] text-slate-400 font-semibold">3D Model Preset</div>
            {(
              [
                { id: "torusKnot", label: "Quantum Knot" },
                { id: "icosahedron", label: "Crystal Core" },
                { id: "churchCross", label: "Grace Sanctuary Cross" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                onClick={() => setShape(item.id)}
                className={`w-full text-left px-3 py-2 rounded-xl border text-xs ${
                  shape === item.id
                    ? "bg-cyan-500/20 border-cyan-400 text-cyan-200 font-bold"
                    : "bg-white/5 border-white/10 text-slate-300"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <div className="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
              <Sun size={12} />
              <span>Studio Light ({lightIntensity.toFixed(1)})</span>
            </div>
            <input
              type="range"
              min={0.4}
              max={3}
              step={0.1}
              value={lightIntensity}
              onChange={(e) => setLightIntensity(Number(e.target.value))}
              className="w-full accent-cyan-400"
            />
          </div>

          <div className="flex items-center justify-between text-xs">
            <span>Wireframe Mode</span>
            <input
              type="checkbox"
              checked={wireframe}
              onChange={(e) => setWireframe(e.target.checked)}
              className="accent-cyan-400"
            />
          </div>

          <div className="flex gap-2">
            {["#22d3ee", "#a855f7", "#f59e0b", "#10b981"].map((c) => (
              <button
                key={c}
                onClick={() => setMeshColor(c)}
                style={{ backgroundColor: c }}
                className={`w-6 h-6 rounded-full border-2 ${
                  meshColor === c ? "border-white scale-110" : "border-transparent"
                }`}
              />
            ))}
          </div>
        </aside>

        <main className="flex-1 bg-slate-900/40">
          <Canvas camera={{ position: [0, 0.5, 4.2], fov: 45 }}>
            <ambientLight intensity={0.6} />
            <directionalLight position={[4, 5, 4]} intensity={lightIntensity} color="#ffffff" />
            <pointLight position={[-4, -2, -3]} intensity={0.8} color={meshColor} />

            {shape === "torusKnot" && (
              <mesh>
                <torusKnotGeometry args={[0.9, 0.28, 128, 24]} />
                <meshStandardMaterial color={meshColor} wireframe={wireframe} metalness={0.5} roughness={0.25} />
              </mesh>
            )}
            {shape === "icosahedron" && (
              <mesh>
                <icosahedronGeometry args={[1.25, 1]} />
                <meshStandardMaterial color={meshColor} wireframe={wireframe} metalness={0.6} roughness={0.2} />
              </mesh>
            )}
            {shape === "churchCross" && (
              <group>
                <mesh position={[0, 0.1, 0]}>
                  <boxGeometry args={[0.35, 2.2, 0.3]} />
                  <meshStandardMaterial color={meshColor} wireframe={wireframe} metalness={0.4} roughness={0.3} />
                </mesh>
                <mesh position={[0, 0.55, 0]}>
                  <boxGeometry args={[1.45, 0.35, 0.3]} />
                  <meshStandardMaterial color={meshColor} wireframe={wireframe} metalness={0.4} roughness={0.3} />
                </mesh>
              </group>
            )}

            <OrbitControls enableDamping />
          </Canvas>
        </main>
      </div>
    </div>
  );
}

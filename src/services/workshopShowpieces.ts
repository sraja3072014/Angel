import { invoke } from "@tauri-apps/api/core";

export interface ShowpieceMeta {
  id: "jet_engine" | "gaming_pc";
  name: string;
  subtitle: string;
  category: string;
  description: string;
  partCount: number;
  tags: string[];
}

export interface WorkshopTelemetry {
  cpu_percent: number;
  ram_percent: number;
  ram_used_gb: number;
  ram_total_gb: number;
  health_score: number;
  cpu_temp_c: number;
  fan_rpm: number;
}

export const SHOWPIECE_CATALOG: ShowpieceMeta[] = [
  {
    id: "jet_engine",
    name: "Turbofan Jet Engine",
    subtitle: "Two-Spool High-Bypass Turbofan",
    category: "Aerospace Propulsion",
    description:
      "A high-bypass two-spool aircraft turbofan featuring a 20-blade titanium fan, multi-stage HP compressor, glowing annular combustor, and cooled turbine disks.",
    partCount: 10,
    tags: ["2-Spool Rotor", "Titanium Blades", "Bypass Thrust", "STL Ready"],
  },
  {
    id: "gaming_pc",
    name: "Gaming PC (Hardware Twin)",
    subtitle: "Live Windows 11 Hardware Telemetry",
    category: "Computing & Thermodynamics",
    description:
      "A dual-chamber panoramic showcase PC with RTX 5090 FE, AIO liquid cooler with live dynamic LCD telemetry readout, illuminated RAM, and 9 synchronized ARGB fans.",
    partCount: 7,
    tags: ["Live Telemetry", "RTX 5090 FE", "AIO LCD Gauge", "ARGB Fans"],
  },
];

/**
 * Poll live system telemetry from Rust OS Doctor
 */
export async function pollWorkshopTelemetry(): Promise<WorkshopTelemetry> {
  try {
    const report = await invoke<WorkshopTelemetry>("get_system_health_report");
    return report;
  } catch (err) {
    console.warn("Telemetry fallback note:", err);
    return {
      cpu_percent: 24,
      ram_percent: 48,
      ram_used_gb: 7.8,
      ram_total_gb: 16.0,
      health_score: 96,
      cpu_temp_c: 41.5,
      fan_rpm: 1200,
    };
  }
}

/**
 * Invoke native Rust STL 3D-print file exporter
 */
export async function exportWorkshopStl(
  projectName: string,
  files: Array<{ filename: string; content: string }>
): Promise<string> {
  return await invoke<string>("export_workshop_stl_files", {
    projectName,
    files,
  });
}

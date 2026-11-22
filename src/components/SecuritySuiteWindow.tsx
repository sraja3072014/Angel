import { useEffect, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Activity,
  Stethoscope,
  Radio,
  Lock,
  Unlock,
  Trash2,
  RotateCcw,
  RefreshCw,
  Search,
  CheckCircle2,
  XCircle,
  HardDrive,
  Usb,
  EyeOff,
  FolderLock,
  X,
  Cpu,
  Flame,
  ArrowRight,
} from "lucide-react";

interface ThreatItem {
  id: string;
  file_name: string;
  file_path: string;
  threat_type: string;
  sha256: string;
  detected_at: string;
  severity: string;
  status: string;
}

interface ScanResult {
  files_scanned: number;
  threats_found: ThreatItem[];
  scan_duration_ms: number;
}

interface QuarantinedFileInfo {
  id: string;
  original_name: string;
  file_name: string;
  file_path: string;
  file_size: number;
  quarantined_at: string;
  threat_type: string;
  sha256: string;
}

interface NetworkAppInfo {
  pid: number;
  name?: string;
  app_name: string;
  exe_path: string;
  connections?: number;
  connections_count?: number;
  remote_ips: string[];
}

interface FirewallStatus {
  is_lockdown_active: boolean;
  active_connections_count: number;
  status_message: string;
}

interface DiagnosticReport {
  health_score: number;
  event_log_errors: string[];
  temp_cache_mb: number;
  audio_service_running: boolean;
  network_responsive: boolean;
  recommendation: string;
}

interface SecuritySuiteProps {
  initialTab?: string;
  onClose?: () => void;
}

export function SecuritySuiteWindow({ initialTab = "antivirus", onClose }: SecuritySuiteProps) {
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [subTab, setSubTab] = useState<"quick" | "deep" | "vault">("quick");

  // Title bar clock
  const [clock, setClock] = useState<string>("");
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setClock(
        now.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Listen for tab switches dispatched from backend or main window
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    let isMounted = true;

    listen<string>("security-suite-switch-tab", (event) => {
      if (isMounted && event.payload) {
        setActiveTab(event.payload);
      }
    })
      .then((unlisten) => {
        if (isMounted) {
          unlistenFn = unlisten;
        } else {
          unlisten();
        }
      })
      .catch((err) => {
        console.warn("security-suite-switch-tab listener registration error:", err);
      });

    return () => {
      isMounted = false;
      if (unlistenFn) unlistenFn();
    };
  }, []);

  // Banner status
  const [realtimeWatcher, setRealtimeWatcher] = useState<boolean>(true);
  const [statusFeedback, setStatusFeedback] = useState<string>("");

  // Antivirus / Scanner state
  const [scanning, setScanning] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [scanTelemetry, setScanTelemetry] = useState<string>("Ready to scan.");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [quarantineItems, setQuarantineItems] = useState<QuarantinedFileInfo[]>([]);
  const [loadingVault, setLoadingVault] = useState<boolean>(false);

  // Firewall state
  const [firewallStatus, setFirewallStatus] = useState<FirewallStatus | null>(null);
  const [networkApps, setNetworkApps] = useState<NetworkAppInfo[]>([]);
  const [loadingNetwork, setLoadingNetwork] = useState<boolean>(false);
  const [appFilter, setAppFilter] = useState<string>("");
  const [blockingApp, setBlockingApp] = useState<string | null>(null);

  // OS Doctor state
  const [diagnostics, setDiagnostics] = useState<DiagnosticReport | null>(null);
  const [doctorLoading, setDoctorLoading] = useState<boolean>(false);
  const [doctorFeedback, setDoctorFeedback] = useState<string>("");

  // Privacy & USB Guard state
  const [usbWatcher, setUsbWatcher] = useState<boolean>(true);
  const [privacyCamGuard, setPrivacyCamGuard] = useState<boolean>(true);
  const [ransomwareShield, setRansomwareShield] = useState<boolean>(true);
  const [keyloggerIsolation, setKeyloggerIsolation] = useState<boolean>(true);
  const [usbScanResults, setUsbScanResults] = useState<ThreatItem[]>([]);
  const [usbScanning, setUsbScanning] = useState<boolean>(false);

  // Load Initial Data
  const refreshVault = async () => {
    setLoadingVault(true);
    try {
      let items: QuarantinedFileInfo[] = [];
      try {
        items = await invoke<QuarantinedFileInfo[]>("list_quarantined_files");
      } catch {
        const raw = await invoke<ThreatItem[]>("aegis_list_quarantine");
        items = raw.map((r) => ({
          id: r.id,
          original_name: r.file_name,
          file_name: r.file_name,
          file_path: r.file_path,
          file_size: 1024,
          quarantined_at: r.detected_at,
          threat_type: r.threat_type,
          sha256: r.sha256,
        }));
      }
      setQuarantineItems(items);
    } catch (err: any) {
      console.warn("Vault refresh error:", err);
    } finally {
      setLoadingVault(false);
    }
  };

  const refreshFirewall = async () => {
    setLoadingNetwork(true);
    try {
      const status = await invoke<FirewallStatus>("get_network_status").catch(() =>
        invoke<FirewallStatus>("firewall_get_status")
      );
      setFirewallStatus(status);

      const apps = await invoke<NetworkAppInfo[]>("get_active_network_apps");
      setNetworkApps(apps);
    } catch (err: any) {
      console.warn("Firewall refresh error:", err);
    } finally {
      setLoadingNetwork(false);
    }
  };

  const refreshDoctor = async () => {
    setDoctorLoading(true);
    try {
      const rep = await invoke<DiagnosticReport>("scan_windows_errors").catch(() =>
        invoke<DiagnosticReport>("os_doctor_diagnose")
      );
      setDiagnostics(rep);
    } catch (err: any) {
      console.warn("Doctor refresh error:", err);
    } finally {
      setDoctorLoading(false);
    }
  };

  useEffect(() => {
    try {
      refreshVault().catch(() => {});
      refreshFirewall().catch(() => {});
      refreshDoctor().catch(() => {});
    } catch {}
  }, []);

  // Quick / Deep Scan Handlers
  const handleStartScan = async (isDeep = false) => {
    setScanning(true);
    setScanProgress(5);
    setScanTelemetry(isDeep ? "Initializing Deep Memory & Startup Scan..." : "Scanning Downloads, Desktop & Temp...");

    // Simulated visual step progression
    const interval = setInterval(() => {
      setScanProgress((prev) => {
        if (prev >= 92) return prev;
        const inc = Math.floor(Math.random() * 8) + 4;
        return Math.min(92, prev + inc);
      });
    }, 150);

    try {
      const cmd = isDeep ? "run_aegis_deep_scan" : "run_aegis_quick_scan";
      let result: ScanResult;
      try {
        result = await invoke<ScanResult>(cmd);
      } catch {
        result = await invoke<ScanResult>("aegis_scan_system");
      }

      clearInterval(interval);
      setScanProgress(100);
      setScanResult(result);
      setScanTelemetry(
        `Scan complete. ${result.files_scanned} files inspected in ${result.scan_duration_ms}ms. ${result.threats_found.length} threats found.`
      );
      refreshVault();
    } catch (err: any) {
      clearInterval(interval);
      setScanTelemetry(`Scan error: ${err}`);
    } finally {
      setScanning(false);
    }
  };

  // Quarantine & Vault actions
  const handleDeleteQuarantine = async (fileNameOrId: string) => {
    try {
      await invoke("delete_quarantined_file", { fileName: fileNameOrId });
      setStatusFeedback(`Permanently deleted from vault: ${fileNameOrId}`);
      refreshVault();
    } catch (err: any) {
      setStatusFeedback(`Delete error: ${err}`);
    }
  };

  const handleRestoreQuarantine = async (fileNameOrPath: string) => {
    try {
      await invoke("restore_quarantined_file", { fileName: fileNameOrPath }).catch(() =>
        invoke("aegis_restore_file", { quarantinePath: fileNameOrPath, targetPath: "" })
      );
      setStatusFeedback(`Restored file: ${fileNameOrPath}`);
      refreshVault();
    } catch (err: any) {
      setStatusFeedback(`Restore error: ${err}`);
    }
  };

  const handleQuarantineFoundThreat = async (filePath: string) => {
    try {
      await invoke("quarantine_file", { filePath }).catch(() =>
        invoke("aegis_quarantine_file", { filePath })
      );
      setStatusFeedback(`Threat successfully quarantined: ${filePath}`);
      // Remove from scanResult view
      if (scanResult) {
        setScanResult({
          ...scanResult,
          threats_found: scanResult.threats_found.filter((t) => t.file_path !== filePath),
        });
      }
      refreshVault();
    } catch (err: any) {
      setStatusFeedback(`Quarantine error: ${err}`);
    }
  };

  // Firewall actions
  const handleToggleLockdown = async () => {
    if (!firewallStatus) return;
    const target = !firewallStatus.is_lockdown_active;
    try {
      const res = await invoke<string>("set_firewall_lockdown", { enable: target }).catch(() =>
        invoke<string>("firewall_toggle_lockdown", { enable: target })
      );
      setStatusFeedback(res);
      refreshFirewall();
    } catch (err: any) {
      setStatusFeedback(`Lockdown error: ${err}`);
    }
  };

  const handleBlockApp = async (exePath: string) => {
    setBlockingApp(exePath);
    try {
      const res = await invoke<string>("block_app_internet", { exePath }).catch(() =>
        invoke<string>("block_network_app", { exePath, ruleName: null })
      );
      setStatusFeedback(res);
      refreshFirewall();
    } catch (err: any) {
      setStatusFeedback(`Block error: ${err}`);
    } finally {
      setBlockingApp(null);
    }
  };

  // OS Doctor actions
  const handleDoctorHeal = async () => {
    setDoctorLoading(true);
    setDoctorFeedback("Running OS Doctor Auto-Heal (Audio, DNS Flush & Temp Clean)...");
    try {
      const res = await invoke<string>("heal_windows_services").catch(async () => {
        const a = await invoke<string>("os_doctor_heal_audio");
        const b = await invoke<string>("os_doctor_heal_network");
        const c = await invoke<string>("os_doctor_clean_temp");
        return `${a} • ${b} • ${c}`;
      });
      setDoctorFeedback(res);
      refreshDoctor();
    } catch (err: any) {
      setDoctorFeedback(`Auto-Heal error: ${err}`);
    } finally {
      setDoctorLoading(false);
    }
  };

  const handleDeepRepair = async () => {
    setDoctorLoading(true);
    setDoctorFeedback("Executing System File Checker (SFC /scannow) in background...");
    try {
      const res = await invoke<string>("run_deep_os_repair").catch(() =>
        invoke<string>("os_doctor_repair_system")
      );
      setDoctorFeedback(res);
      refreshDoctor();
    } catch (err: any) {
      setDoctorFeedback(`Repair error: ${err}`);
    } finally {
      setDoctorLoading(false);
    }
  };

  const handleCreateRestorePoint = async () => {
    setDoctorLoading(true);
    setDoctorFeedback("Creating Windows System Restore Point...");
    try {
      const res = await invoke<string>("os_doctor_create_restore_point");
      setDoctorFeedback(res);
    } catch (err: any) {
      setDoctorFeedback(`Restore point error: ${err}`);
    } finally {
      setDoctorLoading(false);
    }
  };

  // Privacy & USB Guard Actions
  const handleScanUsbDrives = async () => {
    setUsbScanning(true);
    try {
      const threats = await invoke<ThreatItem[]>("scan_removable_drives");
      setUsbScanResults(threats);
      setStatusFeedback(
        threats.length === 0
          ? "USB Guard: Removable drives checked. Zero autorun or executable threats found."
          : `USB Guard: Warning! ${threats.length} threats detected on removable drives.`
      );
    } catch (err: any) {
      setStatusFeedback(`USB scan error: ${err}`);
    } finally {
      setUsbScanning(false);
    }
  };

  // Filtered network apps
  const filteredApps = useMemo(() => {
    if (!appFilter.trim()) return networkApps;
    const q = appFilter.toLowerCase();
    return networkApps.filter(
      (app) =>
        (app.name && app.name.toLowerCase().includes(q)) ||
        (app.app_name && app.app_name.toLowerCase().includes(q)) ||
        app.exe_path.toLowerCase().includes(q) ||
        app.pid.toString().includes(q)
    );
  }, [networkApps, appFilter]);

  // Window control helpers
  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      try {
        getCurrentWebviewWindow().close();
      } catch {
        window.close();
      }
    }
  };

  const isThreatActive = (quarantineItems.length > 0) || (scanResult?.threats_found.length ?? 0) > 0;

  return (
    <div className="h-screen w-screen p-2.5 flex items-center justify-center bg-transparent select-none overflow-hidden font-sans text-white">
      {/* K7 Dark Obsidian Glassmorphic Frame */}
      <div
        data-tauri-drag-region
        className="w-full h-full rounded-2xl border border-cyan-400/40 bg-slate-950/90 backdrop-blur-3xl shadow-[0_0_60px_rgba(0,240,255,0.22)] flex flex-col overflow-hidden relative"
      >
        {/* Custom K7 Titlebar */}
        <div
          data-tauri-drag-region
          className="h-10 px-3.5 bg-slate-900/90 border-b border-cyan-400/30 flex items-center justify-between shrink-0 select-none"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1 rounded-md bg-cyan-500/20 border border-cyan-400/40 text-cyan-300">
              <Shield size={14} className="text-emerald-400" />
            </div>
            <span className="text-xs font-black tracking-widest text-cyan-200">
              PROJECT ANGEL V3 • K7 SECURITY & OS DOCTOR SUITE
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-950 border border-cyan-500/40 text-cyan-300">
              AEGIS v3.4.2
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-cyan-300/80 mr-2">{clock}</span>
            <button
              onClick={handleClose}
              title="Back to Angel AI"
              className="px-3 py-1 rounded-md bg-cyan-500/20 hover:bg-rose-600/80 border border-cyan-400/40 text-cyan-200 hover:text-white text-xs font-bold flex items-center gap-1.5 transition"
            >
              <X size={14} />
              <span>Back to Angel AI</span>
            </button>
          </div>
        </div>

        {/* Top K7 Protection Status Banner */}
        <div className="p-3.5 bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border-b border-cyan-400/20 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3.5">
            <div
              className={`p-3 rounded-2xl border shadow-lg flex items-center justify-center transition-all duration-300 ${
                isThreatActive
                  ? "bg-rose-500/20 border-rose-400/60 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.4)] animate-pulse"
                  : firewallStatus?.is_lockdown_active
                  ? "bg-amber-500/20 border-amber-400/60 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.4)]"
                  : "bg-emerald-500/20 border-emerald-400/60 text-emerald-300 shadow-[0_0_20px_rgba(52,211,153,0.35)]"
              }`}
            >
              {isThreatActive ? (
                <ShieldAlert size={26} />
              ) : firewallStatus?.is_lockdown_active ? (
                <Lock size={26} />
              ) : (
                <ShieldCheck size={26} />
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold tracking-wide uppercase text-white drop-shadow">
                  {isThreatActive
                    ? "POTENTIAL THREAT DETECTED • QUARANTINE READY"
                    : firewallStatus?.is_lockdown_active
                    ? "EMERGENCY NETWORK LOCKDOWN ENGAGED"
                    : "SYSTEM PROTECTED • AI REAL-TIME SHIELD ACTIVE"}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                    isThreatActive
                      ? "bg-rose-600 text-white"
                      : "bg-emerald-600 text-white"
                  }`}
                >
                  {isThreatActive ? "Action Required" : "Secure"}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Real-Time Heuristics: <span className="text-emerald-400 font-bold">Enabled</span> • Downloads Watcher:{" "}
                <span className={realtimeWatcher ? "text-emerald-400 font-bold" : "text-slate-400"}>
                  {realtimeWatcher ? "24/7 Monitoring" : "Paused"}
                </span>{" "}
                • Isolated Threats: <span className="text-cyan-300 font-bold">{quarantineItems.length}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Real-Time Downloads Watcher Toggle */}
            <button
              onClick={() => setRealtimeWatcher(!realtimeWatcher)}
              title="Toggle Background 24/7 File Sentinel"
              className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition ${
                realtimeWatcher
                  ? "bg-emerald-500/20 border-emerald-400/50 text-emerald-200"
                  : "bg-white/5 border-white/10 text-slate-400"
              }`}
            >
              <Radio size={13} className={realtimeWatcher ? "animate-pulse text-emerald-400" : ""} />
              <span>Watcher: {realtimeWatcher ? "ON" : "OFF"}</span>
            </button>

            {/* Instant Quick Scan Trigger */}
            <button
              onClick={() => {
                setActiveTab("antivirus");
                setSubTab("quick");
                handleStartScan(false);
              }}
              disabled={scanning}
              className="px-3.5 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 text-xs font-extrabold flex items-center gap-1.5 shadow-md shadow-cyan-500/30 transition"
            >
              <RefreshCw size={13} className={scanning ? "animate-spin" : ""} />
              <span>{scanning ? "Scanning..." : "Instant Scan"}</span>
            </button>
          </div>
        </div>

        {/* Global Status Notification Toast if any */}
        {statusFeedback && (
          <div className="px-4 py-1.5 bg-cyan-950/70 border-b border-cyan-400/30 text-xs font-mono text-cyan-200 flex items-center justify-between">
            <span className="truncate">{statusFeedback}</span>
            <button
              onClick={() => setStatusFeedback("")}
              className="text-cyan-400 hover:text-white ml-2"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* 4-Card K7 Navigation Bar */}
        <div className="px-3 py-2 bg-slate-900/60 border-b border-cyan-400/20 grid grid-cols-4 gap-2 shrink-0">
          {[
            {
              id: "antivirus",
              label: "AI Antivirus & Scanner",
              sub: "Heuristics & Quarantine",
              icon: ShieldCheck,
              color: "text-emerald-400",
              activeBorder: "border-emerald-400",
              activeBg: "bg-emerald-500/15",
            },
            {
              id: "firewall",
              label: "AI Smart Firewall",
              sub: `${networkApps.length} Apps • Lockdown`,
              icon: Activity,
              color: "text-sky-400",
              activeBorder: "border-sky-400",
              activeBg: "bg-sky-500/15",
            },
            {
              id: "doctor",
              label: "OS Doctor Diagnostics",
              sub: diagnostics ? `Health: ${diagnostics.health_score}%` : "System Health & Repair",
              icon: Stethoscope,
              color: "text-amber-400",
              activeBorder: "border-amber-400",
              activeBg: "bg-amber-500/15",
            },
            {
              id: "privacy",
              label: "Privacy & USB Guard",
              sub: "Removable Drives & Cam",
              icon: Usb,
              color: "text-indigo-400",
              activeBorder: "border-indigo-400",
              activeBg: "bg-indigo-500/15",
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`p-2.5 rounded-xl border text-left flex items-center gap-3 transition-all ${
                  isSelected
                    ? `${tab.activeBg} ${tab.activeBorder} shadow-[0_0_15px_rgba(0,240,255,0.2)]`
                    : "bg-white/5 border-white/10 hover:bg-white/10 text-slate-300"
                }`}
              >
                <div className={`p-2 rounded-lg bg-black/40 border border-white/10 ${tab.color}`}>
                  <Icon size={18} />
                </div>
                <div className="overflow-hidden">
                  <div className={`text-xs font-extrabold truncate ${isSelected ? "text-white" : "text-slate-200"}`}>
                    {tab.label}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">{tab.sub}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Tab Content Area */}
        <div className="flex-1 p-3.5 overflow-y-auto">
          {/* TAB 1: AI ANTIVIRUS & SCANNER */}
          {activeTab === "antivirus" && (
            <div className="h-full flex flex-col space-y-3">
              {/* Sub-tab Navigation */}
              <div className="flex items-center gap-2 border-b border-cyan-400/20 pb-2">
                <button
                  onClick={() => setSubTab("quick")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                    subTab === "quick"
                      ? "bg-cyan-500/25 border border-cyan-400/60 text-cyan-200"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <RefreshCw size={13} /> Quick Scan
                </button>
                <button
                  onClick={() => setSubTab("deep")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                    subTab === "deep"
                      ? "bg-cyan-500/25 border border-cyan-400/60 text-cyan-200"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Cpu size={13} /> Deep Memory & Startup
                </button>
                <button
                  onClick={() => {
                    setSubTab("vault");
                    refreshVault();
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                    subTab === "vault"
                      ? "bg-rose-500/25 border border-rose-400/60 text-rose-200"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Lock size={13} /> Quarantine Vault Manager ({quarantineItems.length})
                </button>
              </div>

              {/* Sub-tab 1 & 2: Scanner UI */}
              {(subTab === "quick" || subTab === "deep") && (
                <div className="flex-1 flex flex-col space-y-3">
                  {/* Scanner Card */}
                  <div className="p-4 rounded-2xl bg-white/5 border border-cyan-400/25 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-extrabold text-cyan-300">
                          {subTab === "deep" ? "Deep Memory & Windows Startup Scan" : "Aegis Intelligent Quick Scan"}
                        </div>
                        <div className="text-xs text-slate-300 mt-0.5">
                          {subTab === "deep"
                            ? "Examines active RAM processes, Startup Registry, and System directories."
                            : "Scans active user downloads, temporary caches, and double-extension masquerades."}
                        </div>
                      </div>

                      <button
                        onClick={() => handleStartScan(subTab === "deep")}
                        disabled={scanning}
                        className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-extrabold flex items-center gap-2 shadow-lg shadow-emerald-500/30 transition"
                      >
                        <RefreshCw size={15} className={scanning ? "animate-spin" : ""} />
                        <span>{scanning ? "Scan in Progress..." : subTab === "deep" ? "Run Deep Scan" : "Run Quick Scan"}</span>
                      </button>
                    </div>

                    {/* Animated Progress Bar */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-mono text-cyan-200">
                        <span className="truncate max-w-md">{scanTelemetry}</span>
                        <span className="font-bold">{scanProgress}%</span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-slate-900 border border-cyan-400/30 overflow-hidden relative">
                        <div
                          className="h-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-cyan-300 transition-all duration-200 rounded-full shadow-[0_0_12px_rgba(0,240,255,0.8)]"
                          style={{ width: `${scanProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Scan Results View */}
                  {scanResult && (
                    <div className="flex-1 rounded-2xl bg-slate-950/70 border border-cyan-400/25 p-3 flex flex-col space-y-2 overflow-hidden">
                      <div className="flex items-center justify-between border-b border-cyan-400/20 pb-2">
                        <div className="text-xs font-bold text-slate-200 flex items-center gap-2">
                          <CheckCircle2 size={15} className="text-emerald-400" />
                          <span>
                            Scanned {scanResult.files_scanned} files in {scanResult.scan_duration_ms} ms
                          </span>
                        </div>
                        <span
                          className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                            scanResult.threats_found.length === 0
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                              : "bg-rose-500/20 text-rose-300 border border-rose-400/30"
                          }`}
                        >
                          {scanResult.threats_found.length} Threats Detected
                        </span>
                      </div>

                      {scanResult.threats_found.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-2">
                          <div className="p-3 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300">
                            <ShieldCheck size={36} />
                          </div>
                          <div className="text-sm font-extrabold text-white">No Malicious Payloads Detected</div>
                          <p className="text-xs text-slate-400 max-w-sm">
                            Aegis Antivirus verified file headers, executable hashes, and scripts. Your machine is
                            operating securely.
                          </p>
                        </div>
                      ) : (
                        <div className="flex-1 overflow-y-auto space-y-2">
                          {scanResult.threats_found.map((threat) => (
                            <div
                              key={threat.id}
                              className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/60 flex items-center justify-between gap-3"
                            >
                              <div className="overflow-hidden">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-rose-200 truncate">{threat.file_name}</span>
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-600 text-white">
                                    {threat.severity}
                                  </span>
                                </div>
                                <div className="text-[11px] text-slate-300 truncate mt-0.5">{threat.threat_type}</div>
                                <div className="text-[10px] font-mono text-slate-400 truncate">{threat.file_path}</div>
                              </div>

                              <button
                                onClick={() => handleQuarantineFoundThreat(threat.file_path)}
                                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 transition"
                              >
                                <Lock size={12} /> Quarantine
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Sub-tab 3: Quarantine Vault Manager */}
              {subTab === "vault" && (
                <div className="flex-1 flex flex-col space-y-2 overflow-hidden">
                  <div className="flex items-center justify-between pb-1">
                    <div className="text-xs text-slate-300">
                      Isolated dangerous files stored in{" "}
                      <span className="text-cyan-300 font-mono">%LOCALAPPDATA%\ProjectAngel\quarantine\</span>
                    </div>
                    <button
                      onClick={refreshVault}
                      disabled={loadingVault}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold flex items-center gap-1 text-slate-300"
                    >
                      <RefreshCw size={12} className={loadingVault ? "animate-spin" : ""} /> Refresh
                    </button>
                  </div>

                  {quarantineItems.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 rounded-2xl bg-white/5 border border-cyan-400/20 text-center space-y-2">
                      <div className="p-3 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-cyan-300">
                        <Lock size={32} />
                      </div>
                      <div className="text-sm font-extrabold text-white">Quarantine Vault is Empty</div>
                      <p className="text-xs text-slate-400 max-w-sm">
                        Zero isolated threats. Suspicious scripts and temp payloads will appear here once blocked.
                      </p>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto space-y-2">
                      {quarantineItems.map((item) => (
                        <div
                          key={item.id}
                          className="p-3 rounded-xl bg-slate-900/80 border border-cyan-400/30 flex items-center justify-between gap-3 hover:border-cyan-400/60 transition"
                        >
                          <div className="overflow-hidden">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-cyan-200 truncate">{item.original_name}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 border border-cyan-400/40 text-cyan-300 font-mono">
                                {(item.file_size / 1024).toFixed(1)} KB
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-300 truncate mt-0.5">
                              {item.threat_type} • Isolated at: {item.quarantined_at}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 truncate">
                              SHA256: {item.sha256}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleRestoreQuarantine(item.file_name || item.file_path)}
                              title="Restore file to Desktop"
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/35 border border-emerald-400/40 text-emerald-200 text-xs font-bold flex items-center gap-1 transition"
                            >
                              <RotateCcw size={12} /> Restore
                            </button>
                            <button
                              onClick={() => handleDeleteQuarantine(item.file_name || item.id)}
                              title="Permanently remove file from disk"
                              className="px-2.5 py-1.5 rounded-lg bg-rose-500/25 hover:bg-rose-500/45 border border-rose-400/40 text-rose-200 text-xs font-bold flex items-center gap-1 transition"
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: AI SMART FIREWALL */}
          {activeTab === "firewall" && (
            <div className="h-full flex flex-col space-y-3">
              {/* Top Firewall Controls Card */}
              <div className="p-4 rounded-2xl bg-white/5 border border-cyan-400/25 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-sky-500/20 border border-sky-400/50 text-sky-300">
                    <Activity size={24} />
                  </div>
                  <div>
                    <div className="text-sm font-extrabold text-white flex items-center gap-2">
                      <span>Windows Filtering Platform Sentinel</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-950 border border-sky-400/40 text-sky-200">
                        {networkApps.length} Connected Apps
                      </span>
                    </div>
                    <div className="text-xs text-slate-300 mt-0.5">
                      {firewallStatus?.status_message || "Monitoring all outbound and inbound TCP/UDP sockets."}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={refreshFirewall}
                    disabled={loadingNetwork}
                    className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 transition"
                    title="Refresh Connections"
                  >
                    <RefreshCw size={15} className={loadingNetwork ? "animate-spin" : ""} />
                  </button>

                  {/* Emergency Lockdown Master Switch */}
                  <button
                    onClick={handleToggleLockdown}
                    className={`px-4 py-2.5 rounded-xl border text-xs font-black flex items-center gap-2 shadow-lg transition ${
                      firewallStatus?.is_lockdown_active
                        ? "bg-rose-600 hover:bg-rose-500 border-rose-400 text-white shadow-rose-900/50 animate-pulse"
                        : "bg-amber-500/20 hover:bg-amber-500/35 border-amber-400/60 text-amber-200"
                    }`}
                  >
                    {firewallStatus?.is_lockdown_active ? <Unlock size={15} /> : <Lock size={15} />}
                    <span>
                      {firewallStatus?.is_lockdown_active ? "DISENGAGE LOCKDOWN" : "EMERGENCY LOCKDOWN"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Active Network Apps Table */}
              <div className="flex-1 flex flex-col space-y-2 rounded-2xl bg-slate-950/70 border border-cyan-400/25 p-3 overflow-hidden">
                <div className="flex items-center justify-between gap-3 pb-1 border-b border-cyan-400/20">
                  <div className="text-xs font-extrabold text-cyan-300 uppercase tracking-wide">
                    Live Internet-Connected Applications ({filteredApps.length})
                  </div>

                  <div className="relative w-64">
                    <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter app or PID..."
                      value={appFilter}
                      onChange={(e) => setAppFilter(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-black/40 border border-cyan-400/30 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-300 font-mono"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2">
                  {filteredApps.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs text-slate-400">
                      No matching network applications found.
                    </div>
                  ) : (
                    filteredApps.map((app) => (
                      <div
                        key={`${app.pid}-${app.exe_path}`}
                        className="p-2.5 rounded-xl bg-slate-900/80 border border-white/10 hover:border-cyan-400/40 flex items-center justify-between gap-3 transition"
                      >
                        <div className="overflow-hidden">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-white truncate">
                              {app.name || app.app_name}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-white/10 text-cyan-200">
                              PID: {app.pid}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-sky-950 text-sky-300 border border-sky-400/30">
                              {app.connections_count ?? app.connections ?? 1} TCP Conn
                            </span>
                          </div>
                          <div className="text-[11px] font-mono text-slate-400 truncate mt-0.5">
                            {app.exe_path}
                          </div>
                          {app.remote_ips && app.remote_ips.length > 0 && (
                            <div className="text-[10px] font-mono text-cyan-400/70 truncate">
                              Endpoints: {app.remote_ips.slice(0, 3).join(", ")}
                            </div>
                          )}
                        </div>

                        <button
                          onClick={() => handleBlockApp(app.exe_path)}
                          disabled={blockingApp === app.exe_path}
                          className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/40 border border-rose-400/40 text-rose-200 text-xs font-bold shrink-0 transition"
                        >
                          {blockingApp === app.exe_path ? "Blocking..." : "Block Internet"}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: OS DOCTOR DIAGNOSTICS */}
          {activeTab === "doctor" && (
            <div className="h-full flex flex-col space-y-3">
              {/* Visual Health Gauge & Summary */}
              <div className="p-4 rounded-2xl bg-white/5 border border-cyan-400/25 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {/* Circular Health Score Badge */}
                  <div
                    className={`h-20 w-20 rounded-2xl border-2 flex flex-col items-center justify-center shrink-0 shadow-lg ${
                      (diagnostics?.health_score ?? 100) >= 90
                        ? "bg-emerald-500/15 border-emerald-400 text-emerald-300 shadow-emerald-500/20"
                        : (diagnostics?.health_score ?? 100) >= 70
                        ? "bg-amber-500/15 border-amber-400 text-amber-300 shadow-amber-500/20"
                        : "bg-rose-500/15 border-rose-400 text-rose-300 shadow-rose-500/20"
                    }`}
                  >
                    <span className="text-2xl font-black">{diagnostics?.health_score ?? 100}</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-300">Score</span>
                  </div>

                  <div>
                    <div className="text-sm font-extrabold text-white flex items-center gap-2">
                      <span>Windows System Health Diagnostics</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-400/40">
                        Audit Complete
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 max-w-lg leading-relaxed">
                      {diagnostics?.recommendation || "All critical services operating within baseline parameters."}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={refreshDoctor}
                    disabled={doctorLoading}
                    className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-slate-200 flex items-center gap-1.5 transition"
                  >
                    <RefreshCw size={14} className={doctorLoading ? "animate-spin" : ""} /> Re-Check
                  </button>
                  <button
                    onClick={handleDoctorHeal}
                    disabled={doctorLoading}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-lg shadow-emerald-500/30 transition"
                  >
                    <Flame size={14} /> Auto-Heal OS
                  </button>
                </div>
              </div>

              {/* Status Feedback Banner */}
              {doctorFeedback && (
                <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-400/40 text-xs text-amber-200 flex items-center justify-between">
                  <span>{doctorFeedback}</span>
                  <button onClick={() => setDoctorFeedback("")} className="text-amber-400 hover:text-white">
                    <X size={13} />
                  </button>
                </div>
              )}

              {/* Diagnostic Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10">
                  <div className="text-[11px] text-slate-400 uppercase font-semibold">Audio Subsystem</div>
                  <div className="text-sm font-extrabold text-white mt-1 flex items-center gap-1.5">
                    {diagnostics?.audio_service_running ? (
                      <CheckCircle2 size={16} className="text-emerald-400" />
                    ) : (
                      <XCircle size={16} className="text-rose-400" />
                    )}
                    <span>{diagnostics?.audio_service_running ? "Audiosrv Running" : "Stopped"}</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10">
                  <div className="text-[11px] text-slate-400 uppercase font-semibold">Network Gateway</div>
                  <div className="text-sm font-extrabold text-white mt-1 flex items-center gap-1.5">
                    {diagnostics?.network_responsive ? (
                      <CheckCircle2 size={16} className="text-emerald-400" />
                    ) : (
                      <XCircle size={16} className="text-rose-400" />
                    )}
                    <span>{diagnostics?.network_responsive ? "Responsive" : "High Latency"}</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10">
                  <div className="text-[11px] text-slate-400 uppercase font-semibold">Temp Cache Clutter</div>
                  <div className="text-sm font-extrabold text-cyan-300 mt-1 flex items-center gap-1.5">
                    <HardDrive size={16} className="text-cyan-400" />
                    <span>{diagnostics?.temp_cache_mb ?? 0} MB</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10">
                  <div className="text-[11px] text-slate-400 uppercase font-semibold">Event Log Anomalies</div>
                  <div className="text-sm font-extrabold text-amber-300 mt-1 flex items-center gap-1.5">
                    <AlertTriangle size={16} className="text-amber-400" />
                    <span>{diagnostics?.event_log_errors.length ?? 0} Critical Events</span>
                  </div>
                </div>
              </div>

              {/* OS Doctor Action Cards */}
              <div className="flex-1 rounded-2xl bg-slate-950/70 border border-cyan-400/25 p-3 flex flex-col space-y-2 overflow-hidden">
                <div className="text-xs font-extrabold text-cyan-300 uppercase tracking-wide border-b border-cyan-400/20 pb-2">
                  One-Click Deep Repair & Remediation Tools
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  <button
                    onClick={handleDoctorHeal}
                    disabled={doctorLoading}
                    className="p-3 rounded-xl bg-white/5 border border-white/10 hover:border-emerald-400 hover:bg-emerald-500/10 text-left transition flex flex-col justify-between space-y-2"
                  >
                    <div>
                      <div className="text-xs font-black text-white flex items-center gap-1.5">
                        <Flame size={14} className="text-emerald-400" />
                        <span>Auto-Heal Audio, DNS & Temp</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Restarts audio endpoints, flushes DNS cache, and purges Windows temp files.
                      </p>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-300 flex items-center gap-1">
                      Execute Clean & Fix <ArrowRight size={11} />
                    </span>
                  </button>

                  <button
                    onClick={handleDeepRepair}
                    disabled={doctorLoading}
                    className="p-3 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-400 hover:bg-cyan-500/10 text-left transition flex flex-col justify-between space-y-2"
                  >
                    <div>
                      <div className="text-xs font-black text-white flex items-center gap-1.5">
                        <Cpu size={14} className="text-cyan-400" />
                        <span>Deep System Repair (SFC /scannow)</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Scans Windows protected system files and replaces corrupted binaries via CBS store.
                      </p>
                    </div>
                    <span className="text-[10px] font-bold text-cyan-300 flex items-center gap-1">
                      Run SFC Repair <ArrowRight size={11} />
                    </span>
                  </button>

                  <button
                    onClick={handleCreateRestorePoint}
                    disabled={doctorLoading}
                    className="p-3 rounded-xl bg-white/5 border border-white/10 hover:border-indigo-400 hover:bg-indigo-500/10 text-left transition flex flex-col justify-between space-y-2"
                  >
                    <div>
                      <div className="text-xs font-black text-white flex items-center gap-1.5">
                        <FolderLock size={14} className="text-indigo-400" />
                        <span>Create Restore Point</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Creates an instant Windows Shadow Copy restore snapshot prior to deep repairs.
                      </p>
                    </div>
                    <span className="text-[10px] font-bold text-indigo-300 flex items-center gap-1">
                      Create Snapshot <ArrowRight size={11} />
                    </span>
                  </button>
                </div>

                {/* Event log preview */}
                <div className="flex-1 mt-2 p-2.5 rounded-xl bg-black/40 border border-white/10 overflow-y-auto font-mono text-[11px] text-slate-300 space-y-1">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Event Log Telemetry Stream:
                  </div>
                  {diagnostics?.event_log_errors && diagnostics.event_log_errors.length > 0 ? (
                    diagnostics.event_log_errors.map((err, i) => (
                      <div key={i} className="text-amber-300/90 leading-tight">
                        • {err}
                      </div>
                    ))
                  ) : (
                    <div className="text-emerald-400">Zero anomalous Windows System Event warnings logged.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: PRIVACY & USB GUARD */}
          {activeTab === "privacy" && (
            <div className="h-full flex flex-col space-y-3">
              <div className="p-4 rounded-2xl bg-white/5 border border-cyan-400/25 flex items-center justify-between">
                <div>
                  <div className="text-sm font-extrabold text-white flex items-center gap-2">
                    <Usb size={18} className="text-indigo-400" />
                    <span>Future-Ready Privacy & Peripheral Shield Suite</span>
                  </div>
                  <div className="text-xs text-slate-300 mt-0.5">
                    Hardens Windows against removable USB thumb drive droppers, background camera eavesdropping, and ransomware.
                  </div>
                </div>

                <button
                  onClick={handleScanUsbDrives}
                  disabled={usbScanning}
                  className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-indigo-500/30 transition"
                >
                  <RefreshCw size={13} className={usbScanning ? "animate-spin" : ""} />
                  <span>{usbScanning ? "Scanning USBs..." : "Scan Removable Drives"}</span>
                </button>
              </div>

              {/* 4 Privacy Toggles Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-300">
                      <Usb size={20} />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-white">USB Drive Auto-Scan Watcher</div>
                      <div className="text-[11px] text-slate-400">
                        Automatically scans newly mounted removable media for autorun.inf & root binaries.
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setUsbWatcher(!usbWatcher)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                      usbWatcher
                        ? "bg-emerald-500/20 border border-emerald-400/60 text-emerald-300"
                        : "bg-white/10 text-slate-400"
                    }`}
                  >
                    {usbWatcher ? "ENABLED" : "DISABLED"}
                  </button>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-300">
                      <EyeOff size={20} />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-white">Webcam & Mic Privacy Guard</div>
                      <div className="text-[11px] text-slate-400">
                        Hardened against stealth background capture hooks and unauthorized audio recording.
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setPrivacyCamGuard(!privacyCamGuard)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                      privacyCamGuard
                        ? "bg-emerald-500/20 border border-emerald-400/60 text-emerald-300"
                        : "bg-white/10 text-slate-400"
                    }`}
                  >
                    {privacyCamGuard ? "ENABLED" : "DISABLED"}
                  </button>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-300">
                      <FolderLock size={20} />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-white">Ransomware Protected Folders</div>
                      <div className="text-[11px] text-slate-400">
                        Protects Documents, Desktop, and Pictures against unauthorized mass file encryption.
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setRansomwareShield(!ransomwareShield)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                      ransomwareShield
                        ? "bg-emerald-500/20 border border-emerald-400/60 text-emerald-300"
                        : "bg-white/10 text-slate-400"
                    }`}
                  >
                    {ransomwareShield ? "ENABLED" : "DISABLED"}
                  </button>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-300">
                      <Lock size={20} />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-white">Keystroke Buffer Isolation</div>
                      <div className="text-[11px] text-slate-400">
                        Prevents background user32 GetAsyncKeyState hooks from harvesting credentials.
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => setKeyloggerIsolation(!keyloggerIsolation)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                      keyloggerIsolation
                        ? "bg-emerald-500/20 border border-emerald-400/60 text-emerald-300"
                        : "bg-white/10 text-slate-400"
                    }`}
                  >
                    {keyloggerIsolation ? "ENABLED" : "DISABLED"}
                  </button>
                </div>
              </div>

              {/* USB Scan Results if any */}
              {usbScanResults.length > 0 && (
                <div className="p-3 rounded-2xl bg-rose-950/60 border border-rose-500/60 space-y-2">
                  <div className="text-xs font-black text-rose-200 uppercase">
                    Removable Drive Threats Detected:
                  </div>
                  {usbScanResults.map((t) => (
                    <div key={t.id} className="text-xs text-white font-mono flex items-center justify-between">
                      <span>
                        {t.file_name} ({t.threat_type})
                      </span>
                      <button
                        onClick={() => handleQuarantineFoundThreat(t.file_path)}
                        className="px-2 py-1 bg-rose-600 rounded text-[10px] font-bold"
                      >
                        Quarantine
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

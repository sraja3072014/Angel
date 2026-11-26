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
  FolderLock,
  X,
  Cpu,
  Flame,
  ArrowRight,
  Network,
  FileText,
  Check,
} from "lucide-react";
import { speakSecurityAlert } from "../services/voiceEngine";

export interface CanaryGuardStatus {
  active: boolean;
  guarded_paths: string[];
  canary_files_ok: boolean;
  rapid_changes_detected: boolean;
  unsigned_binaries_found: string[];
  status_message: string;
  last_checked: string;
}

export interface UsbDeviceInfo {
  instance_id: string;
  friendly_name: string;
  is_trusted: boolean;
}

export interface OutboundConnInfo {
  local_port: number;
  remote_ip: string;
  remote_port: number;
  pid: number;
  process_name: string;
  is_trusted: boolean;
}

export interface UsbNetworkAnomalyReport {
  connected_usbs: UsbDeviceInfo[];
  new_untrusted_usbs: UsbDeviceInfo[];
  active_outbound_conns: OutboundConnInfo[];
  suspicious_remote_ips: OutboundConnInfo[];
  baseline_approved_usbs_count: number;
  baseline_approved_ips_count: number;
  alert_triggered: boolean;
  alert_message: string;
}

export interface HardeningCheckItem {
  name: string;
  description: string;
  is_hardened: boolean;
  impact: string;
}

export interface WindowsHardeningReport {
  score: number;
  defender_active: boolean;
  firewall_domain: boolean;
  firewall_private: boolean;
  firewall_public: boolean;
  uac_enabled: boolean;
  smb1_disabled: boolean;
  checks: HardeningCheckItem[];
  recommendation: string;
}

export interface ListeningPortInfo {
  protocol: string;
  local_address: string;
  local_port: number;
  pid: number;
  process_name: string;
}

export interface FileForensicsReport {
  file_path: string;
  file_name: string;
  file_size_bytes: number;
  sha256_hash: string;
  entropy: number;
  is_high_entropy: boolean;
  signature_status: string;
  signer: string;
  extracted_urls: string[];
  verdict: string;
}

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
  const [subTab, setSubTab] = useState<"quick" | "deep" | "vault" | "forensics">("quick");

  // Defensive Sentry & Canary Guard State
  const [canaryStatus, setCanaryStatus] = useState<CanaryGuardStatus | null>(null);
  const [canaryLoading, setCanaryLoading] = useState<boolean>(false);
  const [usbAnomalyReport, setUsbAnomalyReport] = useState<UsbNetworkAnomalyReport | null>(null);
  const [usbAnomalyLoading, setUsbAnomalyLoading] = useState<boolean>(false);
  const [hardeningReport, setHardeningReport] = useState<WindowsHardeningReport | null>(null);
  const [hardeningLoading, setHardeningLoading] = useState<boolean>(false);
  const [portsList, setPortsList] = useState<ListeningPortInfo[]>([]);
  const [portsLoading, setPortsLoading] = useState<boolean>(false);
  const [forensicsFilePath, setForensicsFilePath] = useState<string>("");
  const [forensicsReport, setForensicsReport] = useState<FileForensicsReport | null>(null);
  const [forensicsLoading, setForensicsLoading] = useState<boolean>(false);
  const [quarantinePidInput, setQuarantinePidInput] = useState<string>("");
  const [quarantinePathInput, setQuarantinePathInput] = useState<string>("");

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

  const forwardDiscordSecurityAlert = async (title: string, details: string) => {
    try {
      const cfgRaw = localStorage.getItem("angel_cloud_storage_config");
      if (!cfgRaw) return;
      const cfg = JSON.parse(cfgRaw);
      const webhookUrl = cfg.discordWebhook?.trim();
      if (webhookUrl && webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
        const payload = JSON.stringify({
          username: "Angel AI Cyber-Shield Sentinel",
          avatar_url: "https://raw.githubusercontent.com/tauri-apps/tauri/dev/tooling/cli/templates/app-icon.png",
          embeds: [
            {
              title: `🚨 ${title}`,
              description: details,
              color: 0x00f0ff,
              timestamp: new Date().toISOString(),
              footer: { text: "Angel AI Defensive Sentry • Project Angel Tauri" },
            },
          ],
        });
        await invoke("send_discord_webhook", { webhookUrl, message: payload }).catch(() => {});
      }
    } catch {}
  };

  const handleCheckCanary = async () => {
    setCanaryLoading(true);
    try {
      const res = await invoke<CanaryGuardStatus>("check_canary_status");
      setCanaryStatus(res);
      if (!res.canary_files_ok) {
        speakSecurityAlert("எச்சரிக்கை! சந்தேகத்திற்கிடமான கோப்பு மாற்றம் கண்டறியப்பட்டுள்ளது");
        forwardDiscordSecurityAlert(
          "RANSOMWARE CANARY COMPROMISED",
          "Canary sentinel integrity breached in guarded workspace paths! Possible unauthorized encryption attempt."
        );
      }
      setStatusFeedback(res.status_message);
    } catch (e: any) {
      setStatusFeedback(`Canary check notice: ${e?.message || e}`);
    } finally {
      setCanaryLoading(false);
    }
  };

  const handleStartCanary = async () => {
    setCanaryLoading(true);
    try {
      const res = await invoke<CanaryGuardStatus>("start_ransomware_canary_guard");
      setCanaryStatus(res);
      setStatusFeedback("Ransomware Canary Sentinel initialized across workspace paths.");
    } catch (e: any) {
      setStatusFeedback(`Error starting canary: ${e?.message || e}`);
    } finally {
      setCanaryLoading(false);
    }
  };

  const handleScanUsbAndNetwork = async () => {
    setUsbAnomalyLoading(true);
    try {
      const res = await invoke<UsbNetworkAnomalyReport>("scan_usb_and_network_anomalies");
      setUsbAnomalyReport(res);
      if (res.alert_triggered) {
        speakSecurityAlert("எச்சரிக்கை ராஜா! புதிய USB சாதனம் அல்லது அங்கீகரிக்கப்படாத வெளிப்புற இணைப்பு கண்டறியப்பட்டுள்ளது");
        forwardDiscordSecurityAlert("PERIPHERAL / OUTBOUND NETWORK ANOMALY", res.alert_message);
      }
      setStatusFeedback(res.alert_message);
    } catch (e: any) {
      setStatusFeedback(`Watchdog scan notice: ${e?.message || e}`);
    } finally {
      setUsbAnomalyLoading(false);
    }
  };

  const handleApproveBaseline = async () => {
    if (!usbAnomalyReport) return;
    const usbIds = usbAnomalyReport.connected_usbs.map((u) => u.instance_id);
    const remoteIps = usbAnomalyReport.active_outbound_conns.map((c) => c.remote_ip);
    try {
      const msg = await invoke<string>("approve_security_baseline", { usbIds, remoteIps });
      setStatusFeedback(msg);
      await handleScanUsbAndNetwork();
    } catch (e: any) {
      setStatusFeedback(`Baseline error: ${e?.message || e}`);
    }
  };

  const handleAuditHardening = async () => {
    setHardeningLoading(true);
    try {
      const res = await invoke<WindowsHardeningReport>("audit_windows_hardening");
      setHardeningReport(res);
    } catch (e: any) {
      setStatusFeedback(`Hardening audit notice: ${e?.message || e}`);
    } finally {
      setHardeningLoading(false);
    }
  };

  const handleApplyHardening = async () => {
    setHardeningLoading(true);
    try {
      const msg = await invoke<string>("apply_defensive_hardening");
      setStatusFeedback(msg);
      speakSecurityAlert("விண்டோஸ் ஃபயர்வால் மற்றும் பாதுகாப்பு அமைப்புகள் பலப்படுத்தப்பட்டுள்ளன");
      await handleAuditHardening();
    } catch (e: any) {
      setStatusFeedback(`Hardening dispatch notice: ${e?.message || e}`);
    } finally {
      setHardeningLoading(false);
    }
  };

  const handleScanPorts = async () => {
    setPortsLoading(true);
    try {
      const ports = await invoke<ListeningPortInfo[]>("scan_active_ports_and_processes");
      setPortsList(ports);
    } catch (e: any) {
      console.warn("Ports scan notice:", e);
    } finally {
      setPortsLoading(false);
    }
  };

  const handleInspectForensics = async () => {
    if (!forensicsFilePath.trim()) {
      setStatusFeedback("Please enter a valid file path to inspect.");
      return;
    }
    setForensicsLoading(true);
    try {
      const report = await invoke<FileForensicsReport>("inspect_file_forensics", {
        filePath: forensicsFilePath.trim(),
      });
      setForensicsReport(report);
      setStatusFeedback(`File forensics analysis complete for: ${report.file_name}`);
    } catch (e: any) {
      setStatusFeedback(`Forensics error: ${e?.message || e}`);
    } finally {
      setForensicsLoading(false);
    }
  };

  const handleQuarantineProcess = async () => {
    const pid = parseInt(quarantinePidInput);
    if (!pid || isNaN(pid)) {
      setStatusFeedback("Please enter a valid process PID.");
      return;
    }
    try {
      const msg = await invoke<string>("quarantine_suspicious_process", {
        pid,
        filePath: quarantinePathInput.trim() || null,
      });
      setStatusFeedback(msg);
      speakSecurityAlert("சந்தேகத்திற்கிடமான செயல்முறை தனிமைப்படுத்தப்பட்டு நிறுத்தப்பட்டது");
      setQuarantinePidInput("");
      setQuarantinePathInput("");
      await refreshVault();
    } catch (e: any) {
      setStatusFeedback(`Quarantine error: ${e?.message || e}`);
    }
  };

  useEffect(() => {
    try {
      refreshVault().catch(() => {});
      refreshFirewall().catch(() => {});
      refreshDoctor().catch(() => {});
      handleCheckCanary().catch(() => {});
      handleScanUsbAndNetwork().catch(() => {});
      handleAuditHardening().catch(() => {});
      handleScanPorts().catch(() => {});
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
      {/* Angel CyberShield Dark Obsidian Glassmorphic Frame */}
      <div
        data-tauri-drag-region
        className="w-full h-full rounded-2xl border border-cyan-400/40 bg-slate-950/90 backdrop-blur-3xl shadow-[0_0_60px_rgba(0,240,255,0.22)] flex flex-col overflow-hidden relative"
      >
        {/* Custom CyberShield Titlebar */}
        <div
          data-tauri-drag-region
          className="h-10 px-3.5 bg-slate-900/90 border-b border-cyan-400/30 flex items-center justify-between shrink-0 select-none"
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1 rounded-md bg-cyan-500/20 border border-cyan-400/40 text-cyan-300">
              <Shield size={14} className="text-emerald-400" />
            </div>
            <span className="text-xs font-black tracking-widest text-cyan-200">
              PROJECT ANGEL V3 • CYBERSHIELD SECURITY & OS DOCTOR SUITE
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

        {/* Top CyberShield Protection Status Banner */}
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

        {/* 4-Card CyberShield Navigation Bar */}
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
                <button
                  onClick={() => {
                    setSubTab("forensics");
                    handleScanPorts();
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                    subTab === "forensics"
                      ? "bg-cyan-500/25 border border-cyan-400/60 text-cyan-200"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <FileText size={13} /> Static File Forensics & Ports
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

              {/* Sub-tab 4: Static File Forensics & Ports Watchdog */}
              {subTab === "forensics" && (
                <div className="flex-1 flex flex-col space-y-4 overflow-y-auto">
                  {/* File Forensics Card */}
                  <div className="p-4 rounded-2xl bg-white/5 border border-cyan-400/25 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText size={18} className="text-cyan-400" />
                        <div>
                          <h4 className="text-xs font-bold text-white">Static File Forensics Inspector</h4>
                          <p className="text-[11px] text-slate-400">
                            Deep static inspection without execution: SHA-256 hash, Shannon entropy, Authenticode signature, and embedded URLs.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={forensicsFilePath}
                        onChange={(e) => setForensicsFilePath(e.target.value)}
                        placeholder="C:\path\to\suspicious_file.exe or script.vbs"
                        className="flex-1 p-2 rounded-xl bg-black/60 border border-white/15 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                      />
                      <button
                        onClick={handleInspectForensics}
                        disabled={forensicsLoading}
                        className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-md shadow-cyan-500/20"
                      >
                        <Search size={13} className={forensicsLoading ? "animate-spin" : ""} />
                        <span>{forensicsLoading ? "Analyzing..." : "Analyze File"}</span>
                      </button>
                    </div>

                    {forensicsReport && (
                      <div className="p-3 rounded-xl bg-black/50 border border-white/10 space-y-2 font-mono text-xs">
                        <div className="flex items-center justify-between pb-1.5 border-b border-white/10">
                          <span className="font-bold text-white">{forensicsReport.file_name}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              forensicsReport.is_high_entropy
                                ? "bg-amber-500/20 text-amber-300 border border-amber-400/30"
                                : "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                            }`}
                          >
                            {forensicsReport.is_high_entropy ? "HIGH ENTROPY" : "NORMAL ENTROPY"}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <span className="text-slate-400">File Size:</span>{" "}
                            <span className="text-cyan-300">{(forensicsReport.file_size_bytes / 1024).toFixed(1)} KB</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Shannon Entropy:</span>{" "}
                            <span className={forensicsReport.is_high_entropy ? "text-amber-400 font-bold" : "text-emerald-400"}>
                              {forensicsReport.entropy.toFixed(3)} / 8.0
                            </span>
                          </div>
                          <div className="col-span-full truncate">
                            <span className="text-slate-400">SHA-256:</span>{" "}
                            <span className="text-slate-200 select-all">{forensicsReport.sha256_hash}</span>
                          </div>
                          <div>
                            <span className="text-slate-400">Authenticode:</span>{" "}
                            <span className={forensicsReport.signature_status === "Valid" ? "text-emerald-400 font-bold" : "text-slate-300"}>
                              {forensicsReport.signature_status}
                            </span>
                          </div>
                          <div className="truncate">
                            <span className="text-slate-400">Signer:</span>{" "}
                            <span className="text-slate-300">{forensicsReport.signer}</span>
                          </div>
                        </div>

                        {forensicsReport.extracted_urls.length > 0 && (
                          <div className="pt-1.5 border-t border-white/10 text-[10px]">
                            <span className="text-slate-400 block mb-1">Extracted Network Endpoints:</span>
                            <div className="flex flex-wrap gap-1">
                              {forensicsReport.extracted_urls.map((u, i) => (
                                <span key={i} className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-cyan-300">
                                  {u}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="pt-1.5 border-t border-white/10 text-[11px]">
                          <span className="text-slate-400">Defensive Verdict:</span>{" "}
                          <span className="text-cyan-200 font-sans font-bold">{forensicsReport.verdict}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Active Listening Ports & Processes Card */}
                  <div className="p-4 rounded-2xl bg-white/5 border border-cyan-400/25 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Network size={18} className="text-sky-400" />
                        <div>
                          <h4 className="text-xs font-bold text-white">Active Listening Ports & Process Watchdog</h4>
                          <p className="text-[11px] text-slate-400">
                            Real-time audit of local TCP/UDP listeners and owning application binaries.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleScanPorts}
                        disabled={portsLoading}
                        className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white text-xs font-bold flex items-center gap-1.5 transition"
                      >
                        <RefreshCw size={12} className={portsLoading ? "animate-spin" : ""} />
                        <span>Refresh Ports</span>
                      </button>
                    </div>

                    <div className="max-h-60 overflow-y-auto rounded-xl border border-white/10 bg-black/40 font-mono text-[11px]">
                      {portsList.length > 0 ? (
                        <table className="w-full text-left">
                          <thead className="bg-white/5 text-slate-400 border-b border-white/10">
                            <tr>
                              <th className="p-2">Proto</th>
                              <th className="p-2">Local Address</th>
                              <th className="p-2">Port</th>
                              <th className="p-2">PID</th>
                              <th className="p-2">Process Name</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {portsList.map((p, idx) => (
                              <tr key={idx} className="hover:bg-white/5 transition">
                                <td className="p-2 text-sky-400 font-bold">{p.protocol}</td>
                                <td className="p-2 text-slate-300">{p.local_address}</td>
                                <td className="p-2 text-cyan-300 font-bold">{p.local_port}</td>
                                <td className="p-2 text-slate-400">{p.pid}</td>
                                <td className="p-2 text-emerald-300 font-semibold truncate max-w-[150px]">{p.process_name}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="p-4 text-center text-slate-500 text-xs">
                          {portsLoading ? "Auditing active sockets..." : "No anomalous listening ports detected."}
                        </div>
                      )}
                    </div>
                  </div>
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

          {/* TAB 4: PRIVACY & DEFENSIVE CYBER-SHIELD */}
          {activeTab === "privacy" && (
            <div className="h-full flex flex-col space-y-4 overflow-y-auto">
              {/* Header Banner */}
              <div className="p-4 rounded-2xl bg-white/5 border border-cyan-400/25 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-extrabold text-white flex items-center gap-2">
                    <Usb size={18} className="text-indigo-400" />
                    <span>Autonomous Defensive Cyber-Shield & Sentinel Hub</span>
                  </div>
                  <div className="text-xs text-slate-300 mt-0.5">
                    Ransomware Canary Folder Guards, USB & Outbound IP Watchdogs, and Windows 11 Hardening.
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCheckCanary}
                    disabled={canaryLoading}
                    className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-slate-200 flex items-center gap-1.5 transition"
                  >
                    <RefreshCw size={13} className={canaryLoading ? "animate-spin" : ""} />
                    <span>Check Canary</span>
                  </button>
                  <button
                    onClick={handleScanUsbAndNetwork}
                    disabled={usbAnomalyLoading}
                    className="px-3.5 py-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-indigo-500/30 transition"
                  >
                    <Activity size={13} className={usbAnomalyLoading ? "animate-spin" : ""} />
                    <span>Scan USB & Outbound IPs</span>
                  </button>
                </div>
              </div>

              {/* 1. RANSOMWARE CANARY FOLDER SHIELD */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-cyan-400/25 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-300">
                      <FolderLock size={20} />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-white flex items-center gap-2">
                        <span>Ransomware Canary Sentinel Shield</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            canaryStatus?.canary_files_ok ?? true
                              ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                              : "bg-rose-500/20 text-rose-300 border border-rose-400/30"
                          }`}
                        >
                          {canaryStatus?.canary_files_ok ?? true ? "CANARY INTACT" : "INTEGRITY ALERT"}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Monitors hidden sentinel files (.angel_canary_guard.dat) in primary workspace folders to intercept mass encryption.
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleStartCanary}
                    disabled={canaryLoading}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition shadow-md shadow-amber-500/20"
                  >
                    Re-Arm Sentinel
                  </button>
                </div>

                {canaryStatus && (
                  <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-2 text-xs font-mono">
                    <div className="text-slate-300 text-[11px] flex items-center justify-between">
                      <span>Status: {canaryStatus.status_message}</span>
                      <span className="text-slate-500">Checked: {canaryStatus.last_checked}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block mb-1">Guarded Workspaces:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {canaryStatus.guarded_paths.map((p, i) => (
                          <span key={i} className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-cyan-300 text-[11px]">
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Emergency Process Quarantine Input */}
                <div className="pt-2 border-t border-white/10 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-300 font-semibold text-[11px]">Emergency Process Quarantine:</span>
                  <input
                    type="number"
                    value={quarantinePidInput}
                    onChange={(e) => setQuarantinePidInput(e.target.value)}
                    placeholder="PID"
                    className="w-20 p-1.5 rounded-lg bg-black/60 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-rose-400"
                  />
                  <input
                    type="text"
                    value={quarantinePathInput}
                    onChange={(e) => setQuarantinePathInput(e.target.value)}
                    placeholder="Optional File Path (e.g. C:\Users\Public\malware.exe)"
                    className="flex-1 min-w-[200px] p-1.5 rounded-lg bg-black/60 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-rose-400"
                  />
                  <button
                    onClick={handleQuarantineProcess}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition flex items-center gap-1 shadow-md shadow-rose-600/30"
                  >
                    <Trash2 size={12} />
                    <span>Kill & Vault</span>
                  </button>
                </div>
              </div>

              {/* 2. USB & LIVE OUTBOUND CONNECTION WATCHDOG */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-cyan-400/25 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-300">
                      <Usb size={20} />
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-white flex items-center gap-2">
                        <span>USB Hardware & Outbound IP Watchdog</span>
                        {usbAnomalyReport?.alert_triggered && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-400/30">
                            UNTRUSTED ACTIVITY
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Detects newly plugged USB flash drives and unauthorized non-local established outbound sockets.
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleApproveBaseline}
                    disabled={!usbAnomalyReport}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-slate-200 text-xs font-bold transition flex items-center gap-1"
                  >
                    <Check size={12} className="text-emerald-400" />
                    <span>Approve Baseline</span>
                  </button>
                </div>

                {usbAnomalyReport && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                    <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1.5">
                      <div className="flex items-center justify-between text-slate-300 pb-1 border-b border-white/10">
                        <span className="font-bold">USB Hardware ({usbAnomalyReport.connected_usbs.length})</span>
                        <span className="text-[10px] text-slate-500">Trusted: {usbAnomalyReport.baseline_approved_usbs_count}</span>
                      </div>
                      <div className="max-h-32 overflow-y-auto space-y-1 text-[11px]">
                        {usbAnomalyReport.connected_usbs.map((u, idx) => (
                          <div key={idx} className="flex items-center justify-between">
                            <span className="text-slate-300 truncate max-w-[200px]">{u.friendly_name}</span>
                            <span className={u.is_trusted ? "text-emerald-400 text-[10px]" : "text-amber-400 text-[10px] font-bold"}>
                              {u.is_trusted ? "TRUSTED" : "UNAPPROVED"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-black/40 border border-white/10 space-y-1.5">
                      <div className="flex items-center justify-between text-slate-300 pb-1 border-b border-white/10">
                        <span className="font-bold">Outbound Sockets ({usbAnomalyReport.active_outbound_conns.length})</span>
                        <span className="text-[10px] text-slate-500">Trusted: {usbAnomalyReport.baseline_approved_ips_count}</span>
                      </div>
                      <div className="max-h-32 overflow-y-auto space-y-1 text-[11px]">
                        {usbAnomalyReport.active_outbound_conns.length > 0 ? (
                          usbAnomalyReport.active_outbound_conns.map((c, idx) => (
                            <div key={idx} className="flex items-center justify-between">
                              <span className="text-cyan-300 truncate">{c.remote_ip}:{c.remote_port}</span>
                              <span className="text-slate-400 text-[10px] truncate max-w-[120px]">{c.process_name}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-slate-500 text-center py-2">No external outbound TCP sockets.</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. WINDOWS 11 HARDENING ADVISOR */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-cyan-400/25 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-cyan-950/80 border border-cyan-400/50 flex flex-col items-center justify-center">
                      <span className="text-lg font-black text-cyan-300 font-mono">
                        {hardeningReport?.score ?? 100}%
                      </span>
                      <span className="text-[8px] text-slate-400 uppercase font-bold">Hardened</span>
                    </div>
                    <div>
                      <div className="text-xs font-extrabold text-white flex items-center gap-2">
                        <span>Windows 11 Defensive Hardening Advisor</span>
                      </div>
                      <div className="text-[11px] text-slate-400 max-w-md">
                        {hardeningReport?.recommendation || "Auditing Windows Defender, Firewall Profiles, UAC, and legacy protocol security..."}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleAuditHardening}
                      disabled={hardeningLoading}
                      className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-slate-200 flex items-center gap-1.5 transition"
                    >
                      <RefreshCw size={13} className={hardeningLoading ? "animate-spin" : ""} />
                      <span>Audit Score</span>
                    </button>
                    <button
                      onClick={handleApplyHardening}
                      disabled={hardeningLoading}
                      className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-lg shadow-cyan-500/30 transition"
                    >
                      <ShieldCheck size={14} />
                      <span>One-Click Harden Windows</span>
                    </button>
                  </div>
                </div>

                {hardeningReport && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1">
                    {hardeningReport.checks.map((c, i) => (
                      <div
                        key={i}
                        className={`p-2.5 rounded-xl border flex items-start gap-2 ${
                          c.is_hardened
                            ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-200"
                            : "bg-amber-950/30 border-amber-500/30 text-amber-200"
                        }`}
                      >
                        {c.is_hardened ? (
                          <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <div className="font-bold text-white text-[11px]">{c.name}</div>
                          <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{c.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

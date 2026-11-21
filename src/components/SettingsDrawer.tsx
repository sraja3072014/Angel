import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Settings,
  Shield,
  Mic,
  Stethoscope,
  Hammer,
  Cloud,
  Save,
  ArrowLeft,
  Lock,
  Unlock,
  RefreshCw,
  CheckCircle2,
  Power,
  Ban,
  Radio,
  Clock,
  Trash2,
  Plus,
} from "lucide-react";
import { AngelConfig, loadAngelConfig, saveAngelConfig } from "../services/cloudBrain";

interface ForgedSkill {
  name: string;
  trigger: string;
  command_type: string;
  script: string;
  description: string;
}

interface NetworkAppInfo {
  pid: number;
  name?: string;
  app_name: string;
  exe_path: string;
  connections?: number;
  connections_count: number;
  remote_ips: string[];
}

export interface ScheduledTaskItem {
  id: string;
  title: string;
  task_type: string;
  schedule_value: string;
  action: string;
  message: string;
  enabled: boolean;
  last_run_timestamp?: number;
}

interface Props {
  onClose: () => void;
  onSyncCloud: () => Promise<{ ok: boolean; message: string }>;
  onTestVoice?: () => void;
}

type TabId = "config" | "security" | "voice" | "doctor" | "forge";

export function SettingsDrawer({ onClose, onSyncCloud, onTestVoice }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("config");
  const [cfg, setCfg] = useState<AngelConfig>(loadAngelConfig());
  const [syncMsg, setSyncMsg] = useState("Local RAM Mode (Ready to Sync)");
  const [syncing, setSyncing] = useState(false);

  // Action Status Feedback
  const [actionStatus, setActionStatus] = useState<string>("");
  const [skills, setSkills] = useState<ForgedSkill[]>([]);
  const [networkApps, setNetworkApps] = useState<NetworkAppInfo[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTaskItem[]>([]);

  const loadNetworkApps = async () => {
    setLoadingApps(true);
    try {
      const apps = await invoke<NetworkAppInfo[]>("get_active_network_apps");
      setNetworkApps(apps);
    } catch (e: any) {
      setActionStatus(`Failed to load network apps: ${e}`);
    } finally {
      setLoadingApps(false);
    }
  };

  const loadScheduledTasks = async () => {
    try {
      const tasks = await invoke<ScheduledTaskItem[]>("list_scheduled_tasks");
      setScheduledTasks(tasks);
    } catch {}
  };

  const addQuickTask = async (title: string, taskType: string, value: string, action: string, msg: string) => {
    try {
      const newTask: ScheduledTaskItem = {
        id: `task_${Date.now()}`,
        title,
        task_type: taskType,
        schedule_value: value,
        action,
        message: msg,
        enabled: true,
      };
      await invoke("add_scheduled_task", { task: newTask });
      loadScheduledTasks();
      setActionStatus(`Watchdog rule "${title}" saved.`);
    } catch (e: any) {
      setActionStatus(`Failed to add task: ${e}`);
    }
  };

  const deleteScheduleTask = async (id: string) => {
    try {
      await invoke("delete_scheduled_task", { id });
      loadScheduledTasks();
      setActionStatus("Scheduled watchdog removed.");
    } catch (e: any) {
      setActionStatus(`Error removing task: ${e}`);
    }
  };

  useEffect(() => {
    if (activeTab === "forge") {
      invoke<ForgedSkill[]>("list_forged_skills")
        .then((res) => setSkills(res))
        .catch(() => setSkills([]));
    } else if (activeTab === "security") {
      loadNetworkApps();
    } else if (activeTab === "doctor") {
      loadScheduledTasks();
    }
  }, [activeTab]);

  const handleSaveAndSync = async () => {
    saveAngelConfig(cfg);
    setSyncing(true);
    setSyncMsg("Connecting to Supabase Cloud...");
    const res = await onSyncCloud();
    setSyncMsg(res.message);
    setSyncing(false);
  };

  const runRustCommand = async (cmdName: string, args: Record<string, any> = {}) => {
    setActionStatus("Executing...");
    try {
      let res = "";
      try {
        res = await invoke<string>(cmdName, args);
      } catch (err) {
        if (cmdName === "block_app_internet") {
          res = await invoke<string>("block_network_app", args);
        } else {
          throw err;
        }
      }
      setActionStatus(res);
      if (cmdName === "block_network_app" || cmdName === "block_app_internet") {
        loadNetworkApps();
      }
    } catch (e: any) {
      setActionStatus(`Error: ${e}`);
    }
  };

  const navItems: { id: TabId; label: string; icon: any }[] = [
    { id: "config", label: "Configuration", icon: Settings },
    { id: "security", label: "AI Antivirus & Firewall", icon: Shield },
    { id: "voice", label: "Voice & Audio", icon: Mic },
    { id: "doctor", label: "OS Doctor", icon: Stethoscope },
    { id: "forge", label: "Skill Forge", icon: Hammer },
  ];

  return (
    <div className="flex-1 grid grid-cols-12 gap-4 my-2 overflow-hidden text-white">
      {/* LEFT VERTICAL SIDEBAR (4 Columns) */}
      <div className="col-span-4 h-full rounded-2xl bg-slate-950/55 border border-cyan-300/30 p-3 flex flex-col justify-between">
        <div className="space-y-2">
          <div className="px-2 py-1.5 text-xs font-extrabold tracking-widest text-cyan-300 uppercase border-b border-cyan-400/20 mb-2">
            Control Center
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setActionStatus("");
                }}
                className={`w-full px-3.5 py-3 rounded-xl text-left text-sm font-bold flex items-center gap-3 transition-all ${
                  isActive
                    ? "bg-cyan-500/30 border border-cyan-300/60 text-white shadow-[0_0_15px_rgba(0,240,255,0.25)]"
                    : "bg-white/5 border border-transparent hover:bg-white/10 text-slate-300"
                }`}
              >
                <Icon size={18} className={isActive ? "text-cyan-300" : "text-slate-400"} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Back to Angel HUD Button */}
        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-rose-500/20 border border-rose-400/40 hover:bg-rose-500/35 text-rose-200 text-sm font-bold flex items-center justify-center gap-2 transition"
        >
          <ArrowLeft size={16} /> Back to Angel HUD
        </button>
      </div>

      {/* RIGHT CONTENT PANEL (8 Columns) */}
      <div className="col-span-8 h-full rounded-2xl bg-slate-950/45 border border-cyan-300/30 p-5 flex flex-col justify-between overflow-y-auto">
        {/* TAB 1: CONFIGURATION & CLOUD SYNC */}
        {activeTab === "config" && (
          <div className="space-y-3.5">
            <h3 className="text-base font-bold text-cyan-300 flex items-center gap-2">
              <Settings size={18} /> Cloud Brain & Startup Configuration
            </h3>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Gemini API Key</label>
              <input
                type="password"
                value={cfg.geminiKey}
                onChange={(e) => setCfg({ ...cfg, geminiKey: e.target.value })}
                placeholder="AIzaSy..."
                className="w-full bg-white/10 border border-cyan-400/35 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-cyan-300"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Supabase Project URL</label>
                <input
                  type="text"
                  value={cfg.supabaseUrl}
                  onChange={(e) => setCfg({ ...cfg, supabaseUrl: e.target.value })}
                  placeholder="https://xyz.supabase.co"
                  className="w-full bg-white/10 border border-cyan-400/35 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-cyan-300"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Supabase Anon Key</label>
                <input
                  type="password"
                  value={cfg.supabaseKey}
                  onChange={(e) => setCfg({ ...cfg, supabaseKey: e.target.value })}
                  placeholder="eyJhbGci..."
                  className="w-full bg-white/10 border border-cyan-400/35 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none focus:border-cyan-300"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                onClick={() => runRustCommand("set_auto_start", { enable: true })}
                className="px-4 py-2.5 rounded-xl bg-white/10 border border-cyan-300/35 hover:bg-cyan-500/25 text-xs font-bold flex items-center gap-2"
              >
                <Power size={15} className="text-emerald-400" /> Enable Windows Auto-Start
              </button>

              <div className="px-3 py-2 rounded-xl bg-cyan-950/60 border border-cyan-400/25 text-xs text-sky-300 flex items-center gap-2">
                <Cloud size={15} className="text-cyan-400" />
                <span>{syncMsg}</span>
              </div>
            </div>

            <button
              onClick={handleSaveAndSync}
              disabled={syncing}
              className="w-full py-3 rounded-xl bg-cyan-500/35 border border-cyan-300/60 hover:bg-cyan-500/55 text-white text-sm font-bold flex items-center justify-center gap-2 transition"
            >
              <Save size={16} /> {syncing ? "Syncing Cloud..." : "Save Settings & Sync Supabase"}
            </button>
          </div>
        )}

        {/* TAB 2: AI ANTIVIRUS & SMART FIREWALL */}
        {activeTab === "security" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-cyan-300 flex items-center gap-2">
                <Shield size={18} className="text-emerald-400" /> AI Antivirus & Smart Firewall
              </h3>
              <button
                onClick={loadNetworkApps}
                disabled={loadingApps}
                className="px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-300/40 hover:bg-cyan-500/35 text-xs text-cyan-200 flex items-center gap-1.5"
              >
                <RefreshCw size={13} className={loadingApps ? "animate-spin" : ""} /> Scan Live Network Apps
              </button>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Protection Mode</label>
              <select
                value={cfg.avMode}
                onChange={(e) => {
                  const updated = { ...cfg, avMode: e.target.value as any };
                  setCfg(updated);
                  saveAngelConfig(updated);
                }}
                className="w-full bg-slate-900 border border-cyan-400/40 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
              >
                <option value="copilot">Co-Pilot Mode (Works alongside Windows Defender)</option>
                <option value="standalone">Standalone Shield Mode (Full Active Sentinel)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => runRustCommand("run_aegis_quick_scan")}
                className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-400/40 hover:bg-emerald-500/35 text-xs font-bold flex items-center gap-2"
              >
                <Shield size={16} className="text-emerald-300" /> Run Quick Malware Scan
              </button>

              <button
                onClick={() => runRustCommand("get_network_status")}
                className="p-3 rounded-xl bg-sky-500/20 border border-sky-400/40 hover:bg-sky-500/35 text-xs font-bold flex items-center gap-2"
              >
                <Radio size={16} className="text-sky-300" /> Network Security Status
              </button>

              <button
                onClick={() => runRustCommand("set_firewall_lockdown", { enable: true })}
                className="p-3 rounded-xl bg-rose-500/25 border border-rose-400/50 hover:bg-rose-500/45 text-xs font-bold flex items-center gap-2 text-rose-200"
              >
                <Lock size={16} /> Emergency Internet Lockdown
              </button>

              <button
                onClick={() => runRustCommand("set_firewall_lockdown", { enable: false })}
                className="p-3 rounded-xl bg-white/10 border border-cyan-300/35 hover:bg-cyan-500/25 text-xs font-bold flex items-center gap-2"
              >
                <Unlock size={16} className="text-cyan-300" /> Restore Internet Access
              </button>
            </div>

            {/* Live Active Network Applications */}
            <div className="space-y-2 pt-2 border-t border-cyan-400/20">
              <div className="flex items-center justify-between text-xs font-bold text-cyan-200">
                <span>Active Network Applications ({networkApps.length})</span>
                <span className="text-[11px] text-slate-400 font-normal">One-click outbound firewall block</span>
              </div>

              {networkApps.length === 0 ? (
                <div className="p-3 rounded-xl bg-white/5 border border-cyan-300/20 text-xs text-slate-300 text-center">
                  {loadingApps ? "Scanning active network sockets..." : "No active outbound connections detected."}
                </div>
              ) : (
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                  {networkApps.map((app) => (
                    <div
                      key={app.pid}
                      className="p-2.5 rounded-xl bg-white/5 border border-cyan-300/25 flex items-center justify-between text-xs hover:bg-white/10 transition"
                    >
                      <div className="overflow-hidden mr-2">
                        <div className="font-bold text-cyan-100 flex items-center gap-2">
                          <span>{app.app_name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">PID {app.pid}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">
                            {app.connections_count} conn
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-sm" title={app.exe_path}>
                          {app.exe_path}
                        </div>
                      </div>

                      <button
                        onClick={() => runRustCommand("block_app_internet", { exePath: app.exe_path })}
                        title={`Block network access for ${app.app_name || app.name}`}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-500/20 border border-rose-400/40 hover:bg-rose-500/40 text-rose-200 font-semibold text-[11px] flex items-center gap-1 shrink-0 transition"
                      >
                        <Ban size={13} /> Block Internet
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: VOICE & AUDIO */}
        {activeTab === "voice" && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-cyan-300 flex items-center gap-2">
              <Mic size={18} /> Voice Input & Neural Speech Output
            </h3>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Preferred Microphone Device</label>
              <input
                type="text"
                value={cfg.preferredMic}
                onChange={(e) => {
                  const updated = { ...cfg, preferredMic: e.target.value };
                  setCfg(updated);
                  saveAngelConfig(updated);
                }}
                className="w-full bg-white/10 border border-cyan-400/35 rounded-xl px-3.5 py-2.5 text-sm text-white outline-none"
              />
            </div>

            <div className="p-3.5 rounded-xl bg-white/5 border border-cyan-300/25 text-xs space-y-1.5 text-slate-200">
              <p className="font-bold text-cyan-300">Active Audio Engines:</p>
              <p>• Online STT/TTS: Gemini Multimodal Audio + Tamil Pallavi Neural Voice</p>
              <p>• Smart VAD: Real-Time Web Audio API Silence Detection (auto-stop 1.2s)</p>
              <p>• Offline STT/TTS: Windows SAPI + Piper Neural Engine (`en_US-lessac-medium`)</p>
              <p>• Wake Word Engine: "Hey Angel" Hands-Free Background Listener</p>
            </div>

            {onTestVoice && (
              <button
                onClick={onTestVoice}
                className="px-5 py-3 rounded-xl bg-cyan-500/30 border border-cyan-300/50 hover:bg-cyan-500/50 text-xs font-bold flex items-center gap-2"
              >
                <CheckCircle2 size={16} /> Test Angel Neural Voice
              </button>
            )}
          </div>
        )}

        {/* TAB 4: OS DOCTOR */}
        {activeTab === "doctor" && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-cyan-300 flex items-center gap-2">
              <Stethoscope size={18} className="text-amber-300" /> Windows OS Doctor & Self-Healing
            </h3>

            <p className="text-xs text-slate-300">
              Automatically diagnose Windows Event Log errors, restart crashed Audio/Network services, clear corrupt temp caches, or run deep system file repair.
            </p>

            <div className="space-y-2.5">
              <button
                onClick={() => runRustCommand("scan_windows_errors")}
                className="w-full p-3.5 rounded-xl bg-white/10 border border-cyan-300/35 hover:bg-cyan-500/25 text-xs font-bold text-left flex items-center gap-2.5"
              >
                <Stethoscope size={16} className="text-cyan-300" /> 1. Scan Windows System Error Logs
              </button>

              <button
                onClick={() => runRustCommand("heal_windows_services")}
                className="w-full p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-400/40 hover:bg-emerald-500/35 text-xs font-bold text-left flex items-center gap-2.5"
              >
                <RefreshCw size={16} className="text-emerald-300" /> 2. Auto-Heal Audio, DNS & Temp Cache
              </button>

              <button
                onClick={() => runRustCommand("run_deep_os_repair")}
                className="w-full p-3.5 rounded-xl bg-amber-500/20 border border-amber-400/40 hover:bg-amber-500/35 text-xs font-bold text-left flex items-center gap-2.5"
              >
                <Shield size={16} className="text-amber-300" /> 3. Deep System File Repair (SFC /scannow)
              </button>
            </div>

            {/* Autonomous Scheduler & Watchdogs Section */}
            <div className="pt-3 border-t border-cyan-400/20 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-cyan-200 flex items-center gap-2">
                  <Clock size={16} className="text-cyan-400" /> Autonomous Scheduler & Watchdogs
                </h4>
                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      addQuickTask(
                        "Auto-Clean Temp Cache",
                        "interval_hours",
                        "3",
                        "clean_temp",
                        "Project Angel background watchdog cleared corrupt temporary caches."
                      )
                    }
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/35 hover:bg-emerald-500/35 text-[11px] font-bold text-emerald-200 flex items-center gap-1 transition"
                  >
                    <Plus size={12} /> +Auto-Clean 3h
                  </button>
                  <button
                    onClick={() =>
                      addQuickTask(
                        "High RAM Guard (85%)",
                        "ram_threshold",
                        "85",
                        "alert",
                        "System Alert: RAM usage exceeded 85%. Freeing background allocations."
                      )
                    }
                    className="px-2.5 py-1 rounded-lg bg-sky-500/20 border border-sky-400/35 hover:bg-sky-500/35 text-[11px] font-bold text-sky-200 flex items-center gap-1 transition"
                  >
                    <Plus size={12} /> +RAM Guard
                  </button>
                </div>
              </div>

              {scheduledTasks.length === 0 ? (
                <div className="p-3 rounded-xl bg-white/5 border border-cyan-300/20 text-xs text-slate-300 text-center">
                  No active scheduler watchdogs. Click + to add automatic background rules.
                </div>
              ) : (
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                  {scheduledTasks.map((t) => (
                    <div
                      key={t.id}
                      className="p-2.5 rounded-xl bg-white/5 border border-cyan-300/25 flex items-center justify-between text-xs hover:bg-white/10 transition"
                    >
                      <div>
                        <div className="font-bold text-cyan-100 flex items-center gap-2">
                          <span>{t.title}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
                            {t.task_type === "interval_hours"
                              ? `Every ${t.schedule_value}h`
                              : t.task_type === "ram_threshold"
                              ? `>${t.schedule_value}% RAM`
                              : `@${t.schedule_value}`}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-xs">{t.message}</div>
                      </div>

                      <button
                        onClick={() => deleteScheduleTask(t.id)}
                        title="Delete watchdog"
                        className="p-1.5 rounded-lg bg-rose-500/20 border border-rose-400/40 hover:bg-rose-500/40 text-rose-200 transition"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: SKILL FORGE & PLUGINS */}
        {activeTab === "forge" && (
          <div className="space-y-3">
            <h3 className="text-base font-bold text-cyan-300 flex items-center gap-2">
              <Hammer size={18} className="text-purple-300" /> Skill Forge & Dynamic Plugins
            </h3>

            <p className="text-xs text-slate-300">
              Skills automatically learned and forged by Angel AI. Say <i>"Create a new skill to..."</i> on the main screen to forge a new automation plugin.
            </p>

            {skills.length === 0 ? (
              <div className="p-4 rounded-xl bg-white/5 border border-cyan-300/20 text-xs text-slate-300">
                No custom forged plugins yet. Ask Angel to create one anytime!
              </div>
            ) : (
              <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                {skills.map((sk, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-white/10 border border-cyan-300/30 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-cyan-200">{sk.name}</div>
                      <div className="text-slate-300">Trigger: "{sk.trigger}" • {sk.description}</div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-purple-500/25 border border-purple-400/40 text-purple-200 font-semibold">
                      {sk.command_type}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bottom Live Feedback Bar inside Settings */}
        {actionStatus && (
          <div className="mt-3 p-3 rounded-xl bg-cyan-950/70 border border-cyan-400/40 text-xs text-cyan-100">
            {actionStatus}
          </div>
        )}
      </div>
    </div>
  );
}

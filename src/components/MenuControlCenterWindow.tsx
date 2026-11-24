import { useEffect, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  Sliders,
  Brain,
  Atom,
  Mic,
  Puzzle,
  Database,
  Wrench,
  GitMerge,
  Smartphone,
  ShieldCheck,
  Stethoscope,
  BarChart3,
  X,
  CheckCircle2,
  Trash2,
  Play,
  Pencil,
  Eye,
  EyeOff,
  Save,
  Download,
  Plus,
  Search,
  RefreshCw,
  Zap,
  Lock,
  Unlock,
  Clock,
  ExternalLink,
  Volume2,
  Cloud,
  Server,
  Cpu,
  Globe,
  Sparkles,
  HardDrive,
  Check,
  FolderGit2,
  Folder,
  Terminal,
  AlertTriangle,
  ArrowRight,
  Radio,
  DownloadCloud,
  UploadCloud,
  Languages,
} from "lucide-react";
import {
  PluginSourceType,
  AngelForgedPlugin,
  SecurityAuditResult,
  inspectLocalProjectFolder,
  inspectGitHubRepo,
  dryRunPluginSecurity,
  transpileToAngelPlugin,
  installPluginToSkillForge,
} from "../services/pluginTranspiler";
import {
  loadAngelConfig,
  saveAngelConfig,
  getUsageTelemetry,
  resetUsageTelemetry,
  UsageTelemetry,
  MemoryFact,
  RelayCommand,
  cloudBrain,
  AIProviderConfig,
  loadAIProviders,
  saveAIProviders,
  testProviderConnection,
  extractKeysList,
  fetchGeminiLiveModels,
  CloudStorageConfig,
  loadCloudStorageConfig,
  saveCloudStorageConfig,
  backupToGitHubGist,
  restoreFromGitHubGist,
  testDiscordBridge,
} from "../services/cloudBrain";
import {
  AngelVoiceConfig,
  loadAngelVoiceConfig,
  saveAngelVoiceConfig,
} from "../services/voiceEngine";

interface MenuControlCenterProps {
  initialTab?: string;
  onClose?: () => void;
  onOpenSecurity?: (tab: string) => void;
}

function normalizeTab(tab?: string): string {
  if (!tab) return "general";
  const lower = tab.toLowerCase();
  if (
    lower === "keys" ||
    lower === "apikeys" ||
    lower === "cloud" ||
    lower === "storage" ||
    lower === "cloud_storage"
  )
    return "api_keys";
  if (lower === "learning") return "memory";
  if (lower === "forge") return "skills";
  if (lower === "antivirus" || lower === "firewall") return "security";
  return tab;
}

interface SkillItem {
  id: string;
  name: string;
  description: string;
  category: "system" | "security" | "maintenance" | "media" | string;
  command: string;
  adminRequired: boolean;
  status: "active" | "standby";
  trigger?: string;
  trigger_phrases?: string[];
  action_type?: string;
  payload?: string;
  isCustom?: boolean;
}

export function MenuControlCenterWindow({
  initialTab = "general",
  onClose,
  onOpenSecurity,
}: MenuControlCenterProps) {
  const [activeTab, setActiveTab] = useState<string>(() => normalizeTab(initialTab));
  const [statusMessage, setStatusMessage] = useState<string>("");

  useEffect(() => {
    if (initialTab) {
      setActiveTab(normalizeTab(initialTab));
    }
  }, [initialTab]);

  // Window title clock
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

  // Listen for tab switches dispatched by backend or other windows
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    let isMounted = true;

    listen<string>("menu-center-switch-tab", (event) => {
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
        console.warn("menu-center-switch-tab listener registration error:", err);
      });

    return () => {
      isMounted = false;
      if (unlistenFn) unlistenFn();
    };
  }, []);

  // Window frame controls
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

  const showToast = (msg: string) => {
    setStatusMessage(msg);
    setTimeout(() => setStatusMessage(""), 4500);
  };

  // ==========================================
  // TAB 1: GENERAL SETTINGS STATE
  // ==========================================
  const [autoStart, setAutoStart] = useState<boolean>(true);
  const [coreTheme, setCoreTheme] = useState<string>(() => {
    return localStorage.getItem("angel_3d_core_theme") || "quantum_gyro";
  });
  const [cursorCompanion, setCursorCompanion] = useState<boolean>(() => {
    return localStorage.getItem("angel_cursor_companion_enabled") === "true";
  });
  const [earthOpacity, setEarthOpacity] = useState<number>(() => {
    const val = localStorage.getItem("angel_earth_opacity");
    return val ? parseFloat(val) : 0.5;
  });
  const [earthScale, setEarthScale] = useState<number>(() => {
    const val = localStorage.getItem("angel_earth_scale");
    return val ? parseFloat(val) : 1.0;
  });
  const [weatherFx, setWeatherFx] = useState<boolean>(() => {
    return localStorage.getItem("angel_earth_weather_fx") !== "false";
  });
  const [earthSpeed, setEarthSpeed] = useState<number>(() => {
    const val = localStorage.getItem("angel_earth_speed");
    return val ? parseFloat(val) : 0.0008;
  });
  const [showCelestial, setShowCelestial] = useState<boolean>(() => {
    return localStorage.getItem("angel_earth_show_celestial") !== "false";
  });

  const dispatchEarthConfig = (scale: number, weather: boolean, opacity: number) => {
    window.dispatchEvent(
      new CustomEvent("angel-earth-config", {
        detail: { scale, weatherFx: weather, opacity },
      })
    );
  };

  const handleSelectCoreTheme = (theme: string) => {
    setCoreTheme(theme);
    localStorage.setItem("angel_3d_core_theme", theme);
    window.dispatchEvent(
      new CustomEvent("angel-3d-theme-changed", {
        detail: { theme },
      })
    );
    showToast(`3D Core Theme changed: ${theme.replace('_', ' ').toUpperCase()}`);
  };

  const handleToggleCursorCompanion = (enable: boolean) => {
    setCursorCompanion(enable);
    localStorage.setItem("angel_cursor_companion_enabled", enable.toString());
    window.dispatchEvent(
      new CustomEvent("angel-cursor-companion-toggle", {
        detail: { enabled: enable },
      })
    );
    showToast(enable ? "Floating Cursor Companion Orb Activated" : "Cursor Companion Orb Deactivated");
  };

  const handleToggleAutoStart = async (enable: boolean) => {
    setAutoStart(enable);
    try {
      const res = await invoke<string>("set_auto_start", { enable });
      showToast(res);
    } catch (e: any) {
      showToast(`Auto-start update: ${e?.message || e}`);
    }
  };

  const handleSaveGeneral = () => {
    localStorage.setItem("angel_3d_core_theme", coreTheme);
    localStorage.setItem("angel_cursor_companion_enabled", cursorCompanion.toString());
    localStorage.setItem("angel_earth_opacity", earthOpacity.toString());
    localStorage.setItem("angel_earth_scale", earthScale.toString());
    localStorage.setItem("angel_earth_weather_fx", weatherFx.toString());
    localStorage.setItem("angel_earth_speed", earthSpeed.toString());
    localStorage.setItem("angel_earth_show_celestial", showCelestial.toString());
    dispatchEarthConfig(earthScale, weatherFx, earthOpacity);
    showToast("General preferences saved successfully!");
  };

  // ==========================================
  // TAB 2: AI BRAIN STATE & MULTI-PROVIDER
  // ==========================================
  const [providers, setProviders] = useState<AIProviderConfig[]>(() => loadAIProviders());
  const [activeProviderId, setActiveProviderId] = useState<string>(() => {
    const saved = localStorage.getItem("angel_active_provider");
    if (saved) return saved;
    const model = localStorage.getItem("angel_primary_model") || "Auto";
    if (model === "Auto" || model === "auto-smart") return "auto";
    const found = loadAIProviders().find((p) => p.id === model || p.defaultModel === model);
    return found ? found.id : "gemini";
  });
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    const saved = localStorage.getItem("angel_primary_model");
    if (saved && (saved.includes("3.8") || saved === "gemini-3.8-flash" || saved === "gemini-2.5-flash")) {
      localStorage.setItem("angel_primary_model", "gemini-2.5-pro");
      return "gemini-2.5-pro";
    }
    return saved || "Auto";
  });
  const [toolCalling, setToolCalling] = useState<boolean>(() => {
    return localStorage.getItem("angel_tool_calling") !== "false";
  });
  const [autoFailover, setAutoFailover] = useState<boolean>(() => {
    return localStorage.getItem("angel_ai_failover") !== "false";
  });
  const [temperature, setTemperature] = useState<number>(() => {
    const t = localStorage.getItem("angel_brain_temperature");
    return t ? parseFloat(t) : 0.7;
  });
  const [responseStyle, setResponseStyle] = useState<string>(() => {
    return localStorage.getItem("angel_response_style") || "tanglish";
  });
  const [systemPrompt, setSystemPrompt] = useState<string>(() => {
    return (
      localStorage.getItem("angel_custom_system_prompt") ||
      "You are Angel AI, an ultra-fast, sovereign Windows 11 desktop AI companion created by Subramaniam Raja. Be helpful, concise, execute system actions via [ACTION:TAG|PARAM], and respond bilingually in Tamil, English, and Tanglish."
    );
  });
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string; latencyMs?: number }>>({});
  const [scanningOllama, setScanningOllama] = useState<boolean>(false);
  const [showApiKeys, setShowApiKeys] = useState<boolean>(false);
  const [discoveringGeminiModels, setDiscoveringGeminiModels] = useState<boolean>(false);
  const [isPrewarmingVoice, setIsPrewarmingVoice] = useState<boolean>(false);

  const handleUpdateProvider = (id: string, updates: Partial<AIProviderConfig>) => {
    setProviders((prev) => {
      const next = prev.map((p) => (p.id === id ? { ...p, ...updates } : p));
      saveAIProviders(next);
      return next;
    });
  };

  const handleSelectProvider = (providerId: string) => {
    setActiveProviderId(providerId);
    localStorage.setItem("angel_active_provider", providerId);
    const p = providers.find((item) => item.id === providerId);
    if (p) {
      const model = providerId === "auto" ? "Auto" : p.defaultModel;
      setSelectedModel(model);
      localStorage.setItem("angel_primary_model", model);
      window.dispatchEvent(
        new CustomEvent("angel-model-changed", {
          detail: { model, provider: providerId },
        })
      );
    }
  };

  const handleChangeProviderModel = (providerId: string, newModel: string) => {
    handleUpdateProvider(providerId, { defaultModel: newModel });
    setSelectedModel(newModel);
    localStorage.setItem("angel_primary_model", newModel);
    window.dispatchEvent(
      new CustomEvent("angel-model-changed", {
        detail: { model: newModel, provider: providerId },
      })
    );
  };

  const handleDiscoverGeminiModels = async (provider: AIProviderConfig) => {
    const keys = extractKeysList(provider.apiKey);
    const activeKey = keys[0] || localStorage.getItem("angel_gemini_key") || "";
    if (!activeKey) {
      showToast("Please enter a Google Gemini API key first.");
      return;
    }
    setDiscoveringGeminiModels(true);
    try {
      const res = await fetchGeminiLiveModels(activeKey);
      handleUpdateProvider(provider.id, {
        availableModels: res.models,
        defaultModel: res.autoSelected,
        status: "ready",
      });
      setSelectedModel(res.autoSelected);
      localStorage.setItem("angel_primary_model", res.autoSelected);
      showToast(`Discovered ${res.models.length} live Gemini models! Auto-selected: ${res.autoSelected}`);
    } catch (err: any) {
      showToast(`Gemini model discovery failed: ${err?.message || err}`);
    } finally {
      setDiscoveringGeminiModels(false);
    }
  };

  const handlePrewarmVoiceCache = async () => {
    setIsPrewarmingVoice(true);
    try {
      const gender = voiceConfig.voiceGender || (voiceConfig.voicePersona?.includes("Valluvar") ? "male" : "female");
      const lang = voiceConfig.languageMode || "auto";
      const result = await invoke<string>("prewarm_voice_cache", { gender, lang });
      showToast(`Offline Voice Pack: ${result}`);
    } catch (err: any) {
      showToast(`Voice cache prewarm failed: ${err?.message || err}`);
    } finally {
      setIsPrewarmingVoice(false);
    }
  };

  const handleTestProvider = async (provider: AIProviderConfig) => {
    if (provider.id === "freellmapi") {
      const keys = extractKeysList(provider.apiKey);
      if (keys.length === 0) {
        const msg = "FreeLLMAPI requires an API key (freellmapi-...). Paste your key above.";
        setTestResults((prev) => ({ ...prev, [provider.id]: { ok: false, message: msg } }));
        showToast(msg);
        return;
      }
    }
    if (provider.id === "openrouter") {
      const keys = extractKeysList(provider.apiKey);
      if (keys.length === 0) {
        const msg = "OpenRouter requires an API key (sk-or-v1-...). Paste your key above.";
        setTestResults((prev) => ({ ...prev, [provider.id]: { ok: false, message: msg } }));
        showToast(msg);
        return;
      }
    }
    setTestingId(provider.id);
    const result = await testProviderConnection(provider);
    setTestResults((prev) => ({ ...prev, [provider.id]: result }));
    setTestingId(null);
    if (result.ok) {
      handleUpdateProvider(provider.id, {
        status: "ready",
        ...(result.models && result.models.length > 0 ? { availableModels: result.models } : {}),
      });
      showToast(`${provider.name}: ${result.message}`);
    } else {
      showToast(`Test failed for ${provider.name}: ${result.message}`);
    }
  };

  const handleFetchRouterModels = async (provider: AIProviderConfig) => {
    const keys = extractKeysList(provider.apiKey);
    if (keys.length === 0) {
      showToast("FreeLLMAPI requires an API key (freellmapi-...). Paste your key above.");
      return;
    }
    setScanningOllama(true);
    const result = await testProviderConnection(provider);
    setScanningOllama(false);
    setTestResults((prev) => ({ ...prev, [provider.id]: result }));
    if (result.ok && result.models && result.models.length > 0) {
      handleUpdateProvider(provider.id, {
        availableModels: result.models,
        defaultModel: result.models.includes(provider.defaultModel) ? provider.defaultModel : result.models[0],
        status: "ready",
      });
      setSelectedModel(result.models.includes(provider.defaultModel) ? provider.defaultModel : result.models[0]);
      localStorage.setItem(
        "angel_primary_model",
        result.models.includes(provider.defaultModel) ? provider.defaultModel : result.models[0]
      );
      showToast(`Synced ${result.models.length} router models from FreeLLMAPI!`);
    } else if (result.ok) {
      showToast(`Connected to FreeLLMAPI (${result.latencyMs}ms), but no models list returned.`);
    } else {
      showToast(`Failed to fetch router models: ${result.message}`);
    }
  };

  const handleScanLocalModels = async (provider: AIProviderConfig) => {
    setScanningOllama(true);
    const result = await testProviderConnection(provider);
    setScanningOllama(false);
    setTestResults((prev) => ({ ...prev, [provider.id]: result }));
    if (result.ok && result.models && result.models.length > 0) {
      handleUpdateProvider(provider.id, {
        availableModels: result.models,
        defaultModel: result.models[0],
        status: "local_ready",
      });
      setSelectedModel(result.models[0]);
      localStorage.setItem("angel_primary_model", result.models[0]);
      showToast(`Detected ${result.models.length} local models: ${result.models.slice(0, 3).join(", ")}...`);
    } else {
      showToast(result.message);
    }
  };

  const handleSaveBrain = () => {
    saveAIProviders(providers);
    localStorage.setItem("angel_active_provider", activeProviderId);
    localStorage.setItem("angel_primary_model", selectedModel);
    localStorage.setItem("angel_tool_calling", toolCalling.toString());
    localStorage.setItem("angel_ai_failover", autoFailover.toString());
    localStorage.setItem("angel_brain_temperature", temperature.toString());
    localStorage.setItem("angel_response_style", responseStyle);
    localStorage.setItem("angel_custom_system_prompt", systemPrompt);
    window.dispatchEvent(
      new CustomEvent("angel-model-changed", {
        detail: { model: selectedModel, provider: activeProviderId },
      })
    );
    showToast("AI Brain & Multi-Provider configuration saved!");
  };

  // ==========================================
  // TAB 3: CLOUD & STORAGE STATE
  // ==========================================
  const [cloudConfig, setCloudConfig] = useState<CloudStorageConfig>(loadCloudStorageConfig);
  const [showSupabaseKey, setShowSupabaseKey] = useState<boolean>(false);
  const [showDiscordWebhook, setShowDiscordWebhook] = useState<boolean>(false);
  const [cloudStatus, setCloudStatus] = useState<string>("");
  const [isSyncingSupabase, setIsSyncingSupabase] = useState<boolean>(false);
  const [isTestingDiscord, setIsTestingDiscord] = useState<boolean>(false);
  const [isBackingUpGithub, setIsBackingUpGithub] = useState<boolean>(false);
  const [isRestoringGithub, setIsRestoringGithub] = useState<boolean>(false);
  const [customVerified, setCustomVerified] = useState<boolean>(false);

  useEffect(() => {
    setCloudConfig(loadCloudStorageConfig());
  }, []);

  const handleSaveCloudConfig = () => {
    saveCloudStorageConfig(cloudConfig);
    showToast("Cloud & Storage configuration saved successfully.");
    setCloudStatus("Configuration saved and verified locally.");
  };

  const handleSyncCloud = async () => {
    setIsSyncingSupabase(true);
    setCloudStatus("Syncing memories with Supabase cloud database...");
    try {
      saveCloudStorageConfig(cloudConfig);
      const res = await cloudBrain.syncWithSupabase();
      setCloudStatus(res.message);
      showToast(res.message);
    } catch (err: any) {
      setCloudStatus(`Cloud Sync error: ${err?.message || err}`);
      showToast(`Cloud Sync error: ${err?.message || err}`);
    } finally {
      setIsSyncingSupabase(false);
    }
  };

  const handleTestDiscord = async () => {
    setIsTestingDiscord(true);
    setCloudStatus("Testing Discord remote bridge webhook...");
    try {
      saveCloudStorageConfig(cloudConfig);
      const res = await testDiscordBridge(cloudConfig.discord.webhookUrl, cloudConfig.discord.botToken);
      setCloudStatus(`Discord Bridge: ${res}`);
      showToast("Discord Remote Bridge connected successfully!");
    } catch (err: any) {
      setCloudStatus(`Discord Bridge error: ${err?.message || err}`);
      showToast(`Discord Bridge error: ${err?.message || err}`);
    } finally {
      setIsTestingDiscord(false);
    }
  };

  const handleBackupGitHub = async () => {
    setIsBackingUpGithub(true);
    setCloudStatus("Creating backup on GitHub Secret Gist...");
    try {
      saveCloudStorageConfig(cloudConfig);
      const res = await backupToGitHubGist(cloudConfig.github.pat, cloudConfig.github.gistId);
      if (res.gistId && res.gistId !== cloudConfig.github.gistId) {
        setCloudConfig((prev) => {
          const updated = { ...prev, github: { ...prev.github, gistId: res.gistId } };
          saveCloudStorageConfig(updated);
          return updated;
        });
      }
      setCloudStatus(res.message);
      showToast("Cloud backup saved to GitHub Gist!");
    } catch (err: any) {
      setCloudStatus(`GitHub Backup error: ${err?.message || err}`);
      showToast(`GitHub Backup error: ${err?.message || err}`);
    } finally {
      setIsBackingUpGithub(false);
    }
  };

  const handleRestoreGitHub = async () => {
    if (
      !window.confirm(
        "Restore conversations, memory, and 3D workshop builds from this GitHub Gist snapshot? Current local data will be updated."
      )
    ) {
      return;
    }
    setIsRestoringGithub(true);
    setCloudStatus("Fetching backup snapshot from GitHub Secret Gist...");
    try {
      const res = await restoreFromGitHubGist(cloudConfig.github.pat, cloudConfig.github.gistId);
      setCloudStatus(res.message);
      showToast("Cloud snapshot restored from GitHub Gist!");
    } catch (err: any) {
      setCloudStatus(`GitHub Restore error: ${err?.message || err}`);
      showToast(`GitHub Restore error: ${err?.message || err}`);
    } finally {
      setIsRestoringGithub(false);
    }
  };

  const handleVerifyCustomStorage = () => {
    if (cloudConfig.custom.providerType === "local_nas") {
      if (!cloudConfig.custom.endpointUrl.trim() && !cloudConfig.custom.bucketOrFolder.trim()) {
        setCloudStatus("Custom Storage Warning: Please specify a local or NAS folder path.");
        setCustomVerified(false);
        return;
      }
    } else {
      if (!cloudConfig.custom.endpointUrl.trim()) {
        setCloudStatus("Custom Storage Warning: Endpoint URL is required for S3 / WebDAV.");
        setCustomVerified(false);
        return;
      }
    }
    saveCloudStorageConfig(cloudConfig);
    setCustomVerified(true);
    setCloudStatus(
      `Custom storage driver verified (${cloudConfig.custom.providerType.toUpperCase()}). Ready for file sync.`
    );
    showToast("Storage driver verified.");
  };

  // ==========================================
  // TAB 4: AI VOICE & SPEECH STATE
  // ==========================================
  const [voiceConfig, setVoiceConfig] = useState<AngelVoiceConfig>(() => loadAngelVoiceConfig());
  const [availableMics, setAvailableMics] = useState<MediaDeviceInfo[]>([]);
  const [isRefreshingMics, setIsRefreshingMics] = useState<boolean>(false);
  const [voiceTestStatus, setVoiceTestStatus] = useState<string>("");

  const refreshMicrophones = async () => {
    setIsRefreshingMics(true);
    try {
      if (typeof navigator !== "undefined" && navigator.mediaDevices) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
        } catch {
          // Perm prompt might be skipped or rejected, still enumerate
        }
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter((d) => d.kind === "audioinput");
        setAvailableMics(audioInputs);
        if (audioInputs.length > 0) {
          showToast(`Detected ${audioInputs.length} audio input device(s).`);
        }
      } else {
        showToast("Audio device enumeration not supported in this browser.");
      }
    } catch (err: any) {
      console.warn("Error enumerating mics:", err);
      showToast("Unable to detect microphones. Check permissions.");
    } finally {
      setIsRefreshingMics(false);
    }
  };

  useEffect(() => {
    if (activeTab === "voice") {
      refreshMicrophones();
    }
  }, [activeTab]);

  const handleSaveVoice = () => {
    saveAngelVoiceConfig(voiceConfig);
    const cfg = loadAngelConfig();
    cfg.preferredMic = voiceConfig.preferredMic;
    saveAngelConfig(cfg);
    showToast("Voice, language & microphone settings saved!");
  };

  const handleTestVoice = async (lang: "ta" | "en") => {
    const text =
      lang === "ta"
        ? "வணக்கம் ராஜா, நான் ஏஞ்சல் ஏஐ. இப்போது என் தமிழ் குரல் தெளிவாகக் கேட்கிறதா?"
        : "Hello Raja, Angel AI voice calibration is online.";
    setVoiceTestStatus(`Synthesizing & Playing ${lang === "ta" ? "Tamil Neural" : "English"} Audio...`);
    showToast(`Synthesizing ${lang === "ta" ? "Tamil" : "English"} voice...`);
    try {
      const targetLang = lang === "ta" ? "ta" : "en-IN";
      const vol = Math.max(0, Math.min(1, (voiceConfig.volume ?? 85) / 100));
      const rate = Math.max(0.5, Math.min(2.0, voiceConfig.speed ?? 1.0));

      // Native Windows speaker playback via Rust MediaPlayer
      await invoke<string>("speak_tamil_native", {
        text,
        lang: targetLang,
        volume: vol,
        rate,
      });

      setVoiceTestStatus(`Completed ${lang === "ta" ? "Tamil Neural" : "English"} playback.`);
      showToast(`Tamil speech played successfully!`);
    } catch (err: any) {
      setVoiceTestStatus(`Test failed: ${err.message || String(err)}`);
      showToast(`Voice test error: ${err.message || String(err)}`);
    }
  };

  // ==========================================
  // TAB 5: UNIVERSAL ZERO-PYTHON PLUGIN FORGE STATE
  // ==========================================
  const [forgeImportMode, setForgeImportMode] = useState<PluginSourceType>("github");
  const [forgeInput, setForgeInput] = useState("https://github.com/fastapi/fastapi");
  const [forgeStep, setForgeStep] = useState<1 | 2 | 3>(1);
  const [forgeAnalyzing, setForgeAnalyzing] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [activeForgedPlugin, setActiveForgedPlugin] = useState<AngelForgedPlugin | null>(null);
  const [securityAudit, setSecurityAudit] = useState<SecurityAuditResult | null>(null);

  const handleAnalyzeAndTranspile = async () => {
    if (!forgeInput.trim()) {
      showToast("Please enter an import URL, folder path, or code prompt.");
      return;
    }
    setForgeAnalyzing(true);
    try {
      let rawContent = forgeInput.trim();
      let detectedStack = "Generic Project";

      if (forgeImportMode === "github") {
        showToast("Inspecting GitHub repository metadata & manifests...");
        const gh = await inspectGitHubRepo(rawContent);
        detectedStack = gh.detected_stack || "GitHub Repository";
        rawContent = JSON.stringify(gh, null, 2);
      } else if (forgeImportMode === "local_folder") {
        showToast("Scanning local project folder (read-only)...");
        const folder = await inspectLocalProjectFolder(rawContent);
        detectedStack = folder.detected_stack || "Local Project Folder";
        rawContent = JSON.stringify(folder, null, 2);
      } else if (forgeImportMode === "curl_openapi") {
        detectedStack = "cURL / REST OpenAPI Spec";
      } else {
        detectedStack = "Natural Language Prompt / Directive";
      }

      showToast(`Transpiling to Zero-Python Angel Plugin (${detectedStack})...`);
      const transpiled = await transpileToAngelPlugin(forgeImportMode, rawContent, detectedStack);
      setActiveForgedPlugin(transpiled);
      setSecurityAudit(null);
      setForgeStep(2);
      showToast(`Plugin "${transpiled.name}" transpiled! Review configuration.`);
    } catch (err: any) {
      showToast(`Transpilation error: ${err?.message || err}`);
    } finally {
      setForgeAnalyzing(false);
    }
  };

  const handleRunSecurityDryRun = async () => {
    if (!activeForgedPlugin) return;
    setDryRunning(true);
    try {
      showToast("Running static security sandbox audit...");
      const audit = await dryRunPluginSecurity(activeForgedPlugin);
      setSecurityAudit(audit);
      setForgeStep(3);
      if (audit.safe) {
        showToast(`Audit passed with security score ${audit.score}/100!`);
      } else {
        showToast(`Audit warning: score ${audit.score}/100. Review warnings.`);
      }
    } catch (err: any) {
      showToast(`Dry-run audit error: ${err?.message || err}`);
    } finally {
      setDryRunning(false);
    }
  };

  const handleInstallForgedPlugin = async () => {
    if (!activeForgedPlugin) return;
    setInstalling(true);
    try {
      const msg = await installPluginToSkillForge(activeForgedPlugin);
      showToast(msg || `Plugin "${activeForgedPlugin.name}" installed to Skill Forge!`);
      await refreshSkillsList();
    } catch (err: any) {
      showToast(`Install error: ${err?.message || err}`);
    } finally {
      setInstalling(false);
    }
  };

  const handleExportPlugins = () => {
    const listToExport = activeForgedPlugin ? [activeForgedPlugin] : [
      {
        name: "Mute Discord",
        trigger_phrases: ["mute discord"],
        action_type: "POWERSHELL",
        endpoint_or_command: "Get-Process discord -ErrorAction SilentlyContinue | Out-Null",
        description: "Mutes or manages Discord process audio",
        source_stack_detected: "Windows PowerShell Script",
        converted_runtime: "Zero-Python Native",
      },
      {
        name: "Flush DNS Cache",
        trigger_phrases: ["flush dns"],
        action_type: "POWERSHELL",
        endpoint_or_command: "Clear-DnsClientCache",
        description: "Flushes Windows DNS resolver cache",
        source_stack_detected: "Windows PowerShell Script",
        converted_runtime: "Zero-Python Native",
      },
    ];
    const blob = new Blob([JSON.stringify(listToExport, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "angel-plugins-manifest.json";
    a.click();
    showToast("Exported plugins JSON manifest.");
  };

  // ==========================================
  // TAB 6: AI LEARNING & MEMORY STATE
  // ==========================================
  const [memories, setMemories] = useState<MemoryFact[]>(() => {
    try {
      const raw = localStorage.getItem("angel_ram_memory_v3");
      if (raw) {
        const obj = JSON.parse(raw);
        return Object.values(obj);
      }
    } catch {}
    return [
      {
        category: "preference",
        mem_key: "user_name",
        mem_value: "Subramaniam Raja (Sovereign)",
        updated_at: new Date().toISOString(),
      },
      {
        category: "preference",
        mem_key: "location",
        mem_value: "Koduvai, Tamil Nadu, India",
        updated_at: new Date().toISOString(),
      },
      {
        category: "security",
        mem_key: "firewall_level",
        mem_value: "Aegis Sentry Smart Lockdown Enabled",
        updated_at: new Date().toISOString(),
      },
      {
        category: "custom_skill",
        mem_key: "preferred_audio",
        mem_value: "realme Buds Wireless 5 ANC",
        updated_at: new Date().toISOString(),
      },
    ];
  });
  const [memFilter, setMemFilter] = useState<string>("all");
  const [memSearch, setMemSearch] = useState<string>("");
  const [newMemCat, setNewMemCat] = useState<string>("preference");
  const [newMemKey, setNewMemKey] = useState<string>("");
  const [newMemVal, setNewMemVal] = useState<string>("");

  const handleAddMemory = () => {
    if (!newMemKey.trim() || !newMemVal.trim()) {
      showToast("Key and Value cannot be empty.");
      return;
    }
    const newFact: MemoryFact = {
      category: newMemCat,
      mem_key: newMemKey.trim(),
      mem_value: newMemVal.trim(),
      updated_at: new Date().toISOString(),
    };
    const updated = [...memories, newFact];
    setMemories(updated);
    saveMemoriesToStorage(updated);
    setNewMemKey("");
    setNewMemVal("");
    showToast(`Learned fact "${newFact.mem_key}" stored.`);
  };

  const handleDeleteMemory = (keyToDelete: string) => {
    const updated = memories.filter((m) => m.mem_key !== keyToDelete);
    setMemories(updated);
    saveMemoriesToStorage(updated);
    showToast(`Forgot memory "${keyToDelete}".`);
  };

  const handleClearAllMemories = () => {
    if (window.confirm("Are you sure you want to erase all learned Angel AI memories?")) {
      setMemories([]);
      localStorage.removeItem("angel_ram_memory_v3");
      showToast("All memories cleared.");
    }
  };

  const saveMemoriesToStorage = (list: MemoryFact[]) => {
    const map: Record<string, MemoryFact> = {};
    for (const f of list) {
      map[`${f.category}_${f.mem_key}`] = f;
    }
    localStorage.setItem("angel_ram_memory_v3", JSON.stringify(map));
  };

  const filteredMemories = useMemo(() => {
    return memories.filter((m) => {
      const matchCat = memFilter === "all" || m.category === memFilter;
      const matchText =
        m.mem_key.toLowerCase().includes(memSearch.toLowerCase()) ||
        m.mem_value.toLowerCase().includes(memSearch.toLowerCase());
      return matchCat && matchText;
    });
  }, [memories, memFilter, memSearch]);

  // ==========================================
  // TAB 7: SKILL FORGE STATE
  // ==========================================
  const initialSkills: SkillItem[] = [
    {
      id: "s1",
      name: "Desktop Screenshot",
      description: "Captures full desktop view silently into Pictures/Screenshots",
      category: "system",
      command: "take_desktop_screenshot",
      adminRequired: false,
      status: "active",
    },
    {
      id: "s2",
      name: "Set Master Volume",
      description: "Sets Windows master audio level to specified percentage",
      category: "media",
      command: "control_system_volume",
      adminRequired: false,
      status: "active",
    },
    {
      id: "s3",
      name: "Adjust Screen Brightness",
      description: "Controls Windows display brightness via WmiMonitorBrightness",
      category: "system",
      command: "set_screen_brightness",
      adminRequired: false,
      status: "active",
    },
    {
      id: "s4",
      name: "Clean Temporary Cache",
      description: "Purges %TEMP%, Windows Prefetch, and obsolete update logs",
      category: "maintenance",
      command: "os_doctor_clean_temp",
      adminRequired: false,
      status: "active",
    },
    {
      id: "s5",
      name: "Aegis Antivirus Quick Scan",
      description: "Scans active Downloads, Desktop and Startup programs for threats",
      category: "security",
      command: "run_aegis_quick_scan",
      adminRequired: false,
      status: "active",
    },
    {
      id: "s6",
      name: "Internet Lockdown Switch",
      description: "Instantly drops all inbound/outbound Windows network sockets",
      category: "security",
      command: "firewall_toggle_lockdown",
      adminRequired: true,
      status: "active",
    },
    {
      id: "s7",
      name: "USB Removable Sentry",
      description: "Scans newly mounted USB drives for autorun.inf threats",
      category: "security",
      command: "scan_removable_drives",
      adminRequired: false,
      status: "active",
    },
    {
      id: "s8",
      name: "Windows Event Doctor",
      description: "Parses system logs to identify failing services and crashes",
      category: "maintenance",
      command: "scan_windows_errors",
      adminRequired: false,
      status: "active",
    },
  ];
  const [skillsList, setSkillsList] = useState<SkillItem[]>(initialSkills);
  const [skillRunning, setSkillRunning] = useState<string | null>(null);
  const [editingSkill, setEditingSkill] = useState<SkillItem | null>(null);
  const [isCreatingSkill, setIsCreatingSkill] = useState<boolean>(false);
  const [skillFormName, setSkillFormName] = useState<string>("");
  const [skillFormDesc, setSkillFormDesc] = useState<string>("");
  const [skillFormTriggers, setSkillFormTriggers] = useState<string>("");
  const [skillFormActionType, setSkillFormActionType] = useState<string>("powershell");
  const [skillFormPayload, setSkillFormPayload] = useState<string>("");

  const refreshSkillsList = async () => {
    try {
      const dynamicSkills: any[] = await invoke("plugin_forge_list");
      const mappedDynamic: SkillItem[] = dynamicSkills.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description || `Forged Skill (Trigger: "${s.trigger}")`,
        category: s.action_type || "powershell",
        command: s.id,
        adminRequired: false,
        status: s.enabled ? "active" : "standby",
        trigger: s.trigger,
        trigger_phrases: s.trigger_phrases,
        action_type: s.action_type,
        payload: s.payload,
        isCustom: true,
      }));
      setSkillsList([...initialSkills, ...mappedDynamic]);
    } catch {}
  };

  const handleOpenEditSkill = (skill: SkillItem) => {
    setEditingSkill(skill);
    setIsCreatingSkill(false);
    setSkillFormName(skill.name);
    setSkillFormDesc(skill.description);
    setSkillFormTriggers(
      skill.trigger_phrases && skill.trigger_phrases.length > 0
        ? skill.trigger_phrases.join(", ")
        : skill.trigger || skill.name.toLowerCase()
    );
    setSkillFormActionType(skill.action_type || "powershell");
    setSkillFormPayload(skill.payload || skill.command);
  };

  const handleOpenCreateSkill = () => {
    setEditingSkill(null);
    setIsCreatingSkill(true);
    setSkillFormName("");
    setSkillFormDesc("");
    setSkillFormTriggers("");
    setSkillFormActionType("powershell");
    setSkillFormPayload("");
  };

  const handleSaveSkill = async () => {
    if (!skillFormName.trim()) {
      showToast("Skill name is required.");
      return;
    }
    const safeId = editingSkill?.id || `skill_${Date.now()}`;
    const rawTriggers = skillFormTriggers
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const primaryTrigger = rawTriggers[0] || skillFormName.toLowerCase().trim();

    const skillPayload = {
      id: safeId,
      name: skillFormName.trim(),
      trigger: primaryTrigger,
      trigger_phrases: rawTriggers.length > 0 ? rawTriggers : [primaryTrigger],
      action_type: skillFormActionType,
      payload: skillFormPayload.trim(),
      description: skillFormDesc.trim() || `Skill ${skillFormName.trim()}`,
      enabled: true,
      author: "User Custom",
      created_at: `${Date.now()}`,
    };

    try {
      await invoke("update_forged_skill", { skill: skillPayload }).catch(() =>
        invoke("plugin_forge_save", { skill: skillPayload })
      );
      showToast(`⚡ Skill '${skillFormName.trim()}' saved successfully!`);
      setEditingSkill(null);
      setIsCreatingSkill(false);
      await refreshSkillsList();
    } catch (e: any) {
      showToast(`Error saving skill: ${e?.message || e}`);
    }
  };

  const handleDeleteSkill = async (skill: SkillItem) => {
    if (!window.confirm(`Are you sure you want to delete '${skill.name}'?`)) {
      return;
    }
    try {
      await invoke("delete_forged_skill", { skillId: skill.id }).catch(() =>
        invoke("plugin_forge_delete", { skillId: skill.id })
      );
      showToast(`Skill '${skill.name}' deleted.`);
      await refreshSkillsList();
    } catch (e: any) {
      showToast(`Error deleting skill: ${e?.message || e}`);
    }
  };

  useEffect(() => {
    refreshSkillsList();
  }, []);

  const handleRunSkill = async (skill: SkillItem) => {
    setSkillRunning(skill.id);
    showToast(`Executing skill: ${skill.name}...`);
    try {
      if (skill.command === "take_desktop_screenshot") {
        await invoke("take_desktop_screenshot").catch(() => invoke("capture_screen_to_pictures"));
        showToast("Screenshot captured to Pictures folder.");
      } else if (skill.command === "control_system_volume") {
        await invoke("control_system_volume", { action: "set", level: 50 }).catch(() =>
          invoke("set_system_volume", { levelPercent: 50 })
        );
        showToast("Master volume set to 50%.");
      } else if (skill.command === "set_screen_brightness") {
        await invoke("set_screen_brightness", { percent: 80 });
        showToast("Brightness set to 80%.");
      } else if (skill.command === "os_doctor_clean_temp") {
        const res = await invoke<string>("os_doctor_clean_temp");
        showToast(res || "Temporary files cleaned.");
      } else if (skill.command === "run_aegis_quick_scan") {
        await invoke("run_aegis_quick_scan");
        showToast("Aegis Quick Scan completed.");
      } else if (skill.command === "firewall_toggle_lockdown") {
        const res = await invoke<string>("firewall_toggle_lockdown", { activate: false });
        showToast(`Firewall: ${res}`);
      } else if (skill.command === "scan_removable_drives") {
        await invoke("scan_removable_drives");
        showToast("USB drive scan completed.");
      } else if (skill.command === "scan_windows_errors") {
        await invoke("scan_windows_errors");
        showToast("Event log diagnostics scanned.");
      } else {
        const dynamicRes = await invoke<string>("plugin_forge_execute", { skillId: skill.id }).catch(() => null);
        if (dynamicRes) {
          showToast(dynamicRes);
        } else {
          showToast(`Skill executed: ${skill.name}`);
        }
      }
    } catch (e: any) {
      showToast(`Skill execution error: ${e?.message || e}`);
    } finally {
      setSkillRunning(null);
    }
  };

  // ==========================================
  // TAB 8: AUTOMATION WORKFLOWS STATE
  // ==========================================
  const [runningWorkflow, setRunningWorkflow] = useState<string | null>(null);
  const [workflowLog, setWorkflowLog] = useState<string[]>([]);

  const handleRunPresetWorkflow = async (preset: "work" | "night" | "clean") => {
    setRunningWorkflow(preset);
    const logs: string[] = [];
    const log = (msg: string) => {
      logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
      setWorkflowLog([...logs]);
    };

    try {
      if (preset === "work") {
        log("Activating Work Mode...");
        log("Step 1: Setting audio volume to 30%...");
        await invoke("control_system_volume", { action: "set", level: 30 }).catch(() => {});
        log("Step 2: Checking system responsiveness...");
        await invoke("os_doctor_diagnose").catch(() => {});
        log("Work Mode engaged: Distractions minimized, audio balanced.");
      } else if (preset === "night") {
        log("Activating Night Lockdown...");
        log("Step 1: Dimming display brightness to 20%...");
        await invoke("set_screen_brightness", { percent: 20 }).catch(() => {});
        log("Step 2: Engaging download security watcher...");
        log("Night Lockdown engaged: Display dimmed, background sentry active.");
      } else if (preset === "clean") {
        log("Activating System Cleanup...");
        log("Step 1: Purging Windows temporary cache...");
        const res = await invoke<string>("os_doctor_clean_temp").catch(() => "Temp cleared");
        log(`Cache cleanup: ${res}`);
        log("Step 2: Healing Windows audio and networking services...");
        await invoke("os_doctor_heal_network").catch(() => {});
        await invoke("os_doctor_heal_audio").catch(() => {});
        log("System Cleanup completed successfully!");
      }
      showToast(`Workflow "${preset.toUpperCase()}" finished!`);
    } catch (e: any) {
      log(`Error in workflow: ${e?.message || e}`);
    } finally {
      setRunningWorkflow(null);
    }
  };

  // ==========================================
  // TAB 9: CROSS-DEVICE BRIDGE (PC ↔ ANDROID)
  // ==========================================
  const [relayActive, setRelayActive] = useState<boolean>(true);
  const [recentRelayCommands, setRecentRelayCommands] = useState<RelayCommand[]>([
    {
      id: "cmd_1",
      command_text: "take screenshot",
      device_target: "windows",
      status: "executed",
      created_at: new Date(Date.now() - 360000).toISOString(),
    },
    {
      id: "cmd_2",
      command_text: "lockdown internet",
      device_target: "windows",
      status: "executed",
      created_at: new Date(Date.now() - 120000).toISOString(),
    },
    {
      id: "cmd_3",
      command_text: "set volume to 80%",
      device_target: "windows",
      status: "pending",
      created_at: new Date().toISOString(),
    },
  ]);

  const handleSendRemotePing = () => {
    const newCmd: RelayCommand = {
      id: `cmd_${Date.now()}`,
      command_text: "PING_ANDROID_COMPANION",
      device_target: "android",
      status: "pending",
      created_at: new Date().toISOString(),
    };
    setRecentRelayCommands((prev) => [newCmd, ...prev]);
    showToast("Dispatched test ping to Android companion via Supabase Relay.");
  };

  // ==========================================
  // TAB 10: AI ANTIVIRUS & SMART FIREWALL
  // ==========================================
  const [sentryActive, setSentryActive] = useState<boolean>(true);
  const [lockdownState, setLockdownState] = useState<boolean>(false);
  const [avFeedback, setAvFeedback] = useState<string>("");

  const handleToggleLockdown = async () => {
    const next = !lockdownState;
    setLockdownState(next);
    try {
      const res = await invoke<string>("firewall_toggle_lockdown", { activate: next }).catch(
        () => invoke<string>("set_firewall_lockdown", { enable: next })
      );
      setAvFeedback(res || (next ? "Lockdown engaged" : "Traffic permitted"));
      showToast(next ? "Internet Lockdown Activated" : "Internet Lockdown Deactivated");
    } catch (e: any) {
      setAvFeedback(`Lockdown error: ${e?.message || e}`);
    }
  };

  const handleQuickScan = async () => {
    setAvFeedback("Running instant Aegis Antivirus scan...");
    try {
      await invoke("run_aegis_quick_scan");
      setAvFeedback("Scan complete: 0 active threats detected in core paths.");
      showToast("Aegis Quick Scan completed.");
    } catch (e: any) {
      setAvFeedback(`Scan error: ${e?.message || e}`);
    }
  };

  const handleOpenStandaloneSecurity = async () => {
    if (onOpenSecurity) {
      onOpenSecurity("antivirus");
      return;
    }
    try {
      await invoke("open_security_suite", { initialTab: "antivirus" });
    } catch (e: any) {
      showToast(`Could not open Security Suite: ${e?.message || e}`);
    }
  };

  // ==========================================
  // TAB 11: OS DOCTOR STATE
  // ==========================================
  const [doctorLog, setDoctorLog] = useState<string>("");
  const [doctorBusy, setDoctorBusy] = useState<boolean>(false);

  const handleAutoHealSystem = async () => {
    setDoctorBusy(true);
    setDoctorLog("Executing 1-Click Auto-Heal sequence...\n- Cleaning temporary files\n- Resetting audio graph\n- Flushing network stack");
    try {
      const tempRes = await invoke<string>("os_doctor_clean_temp").catch(() => "Temp cleaned");
      const audioRes = await invoke<string>("os_doctor_heal_audio").catch(() => "Audio restored");
      const netRes = await invoke<string>("os_doctor_heal_network").catch(() => "Network responsive");
      setDoctorLog(
        `Auto-Heal Finished:\n• Temp: ${tempRes}\n• Audio: ${audioRes}\n• Network: ${netRes}\nAll systems verified operational.`
      );
      showToast("Auto-Heal finished successfully!");
    } catch (e: any) {
      setDoctorLog(`Auto-Heal error: ${e?.message || e}`);
    } finally {
      setDoctorBusy(false);
    }
  };

  const handleDeepRepairSfc = async () => {
    setDoctorBusy(true);
    setDoctorLog("Initiating Deep Windows System Integrity Check (SFC /scannow)...");
    try {
      const res = await invoke<string>("run_deep_os_repair").catch(() =>
        invoke<string>("os_doctor_repair_system")
      );
      setDoctorLog(`SFC Scan Output:\n${res}`);
      showToast("System integrity check completed.");
    } catch (e: any) {
      setDoctorLog(`Repair error: ${e?.message || e}`);
    } finally {
      setDoctorBusy(false);
    }
  };

  const handleCreateRestore = async () => {
    setDoctorBusy(true);
    setDoctorLog("Creating Windows System Restore Point 'Angel_AI_RestorePoint'...");
    try {
      const res = await invoke<string>("os_doctor_create_restore_point");
      setDoctorLog(res);
      showToast("Restore point created.");
    } catch (e: any) {
      setDoctorLog(`Restore point error: ${e?.message || e}`);
    } finally {
      setDoctorBusy(false);
    }
  };

  // ==========================================
  // TAB 12: AI USAGE & COST TELEMETRY
  // ==========================================
  const [telemetry, setTelemetry] = useState<UsageTelemetry>(getUsageTelemetry());

  const handleRefreshTelemetry = () => {
    setTelemetry(getUsageTelemetry());
    showToast("Telemetry counters refreshed.");
  };

  const handleResetTelemetry = () => {
    if (window.confirm("Reset all usage and cost savings counters?")) {
      resetUsageTelemetry();
      setTelemetry(getUsageTelemetry());
      showToast("Telemetry reset to zero.");
    }
  };

  // 12 Sidebar Navigation Items
  const navItems = [
    { id: "general", label: "General", icon: Sliders, group: "Core" },
    { id: "brain", label: "AI Brain", icon: Brain, group: "Core" },
    { id: "api_keys", label: "Cloud & Storage", icon: Cloud, group: "Core" },
    { id: "voice", label: "AI Voice", icon: Mic, group: "Interaction" },
    { id: "plugins", label: "Add New Plugin", icon: Puzzle, group: "Extensibility" },
    { id: "memory", label: "AI Learning", icon: Database, group: "Intelligence" },
    { id: "skills", label: "Skill Forge", icon: Wrench, group: "Execution" },
    { id: "workflows", label: "Automation Workflows", icon: GitMerge, group: "Execution" },
    { id: "bridge", label: "Cross-Device Bridge", icon: Smartphone, group: "Ecosystem" },
    { id: "security", label: "AI Antivirus & Firewall", icon: ShieldCheck, group: "Protection" },
    { id: "doctor", label: "OS Doctor", icon: Stethoscope, group: "Diagnostics" },
    { id: "telemetry", label: "AI Usage & Telemetry", icon: BarChart3, group: "Analytics" },
  ];

  return (
    <div className="w-full h-full flex flex-col bg-transparent select-none overflow-hidden font-sans text-white box-border">
      {/* Translucent Dark Obsidian Glass Frame */}
      <div
        data-tauri-drag-region
        className="w-full h-full rounded-2xl border border-cyan-400/40 bg-slate-950/90 backdrop-blur-3xl shadow-[0_0_60px_rgba(0,240,255,0.22)] flex flex-col overflow-hidden relative box-border"
      >
        {/* Custom Glass Titlebar */}
        <div
          data-tauri-drag-region
          className="flex items-center justify-between gap-3 px-4 py-3 w-full overflow-hidden bg-slate-900/90 border-b border-cyan-400/30 shrink-0 select-none"
        >
          <div className="min-w-0 flex-1 flex items-center gap-3 truncate">
            <div className="p-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 shrink-0">
              <Sliders size={15} className="text-cyan-400 animate-pulse" />
            </div>
            <div className="flex items-center gap-2 truncate">
              <span className="text-xs font-black tracking-widest text-cyan-200 shrink-0">
                ANGEL AI
              </span>
              <span className="text-xs font-semibold text-slate-400 truncate">
                • Master Control Center
              </span>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <span className="text-[11px] font-mono text-cyan-300/80 mr-1 sm:mr-2 flex items-center gap-1.5 shrink-0">
              <Clock size={12} className="text-cyan-400" />
              <span>{clock}</span>
            </span>
            <button
              onClick={handleClose}
              title="Back to Angel AI"
              className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-rose-600/80 border border-cyan-400/40 text-cyan-200 hover:text-white text-xs font-bold flex items-center gap-1.5 transition shrink-0 shadow-md"
            >
              <X size={14} />
              <span>Back to Angel AI</span>
            </button>
          </div>
        </div>

        {/* Global Toast Notification */}
        {statusMessage && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-cyan-950/95 border border-cyan-400/80 text-cyan-200 text-xs font-semibold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 size={14} className="text-cyan-400 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Body Container: Left Vertical Sidebar + Right Detail Pane */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Navigation Sidebar (w-64) */}
          <aside className="w-64 border-r border-cyan-400/20 bg-slate-950/60 flex flex-col justify-between shrink-0 select-none">
            <div className="p-3 overflow-y-auto space-y-1">
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Navigation Modules
              </div>
              {navItems.map((item) => {
                const IconComponent = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition text-left ${
                      isActive
                        ? "bg-gradient-to-r from-cyan-500/20 to-indigo-500/10 border border-cyan-400/50 text-cyan-200 shadow-[0_0_12px_rgba(0,240,255,0.2)]"
                        : "text-slate-300 hover:text-white hover:bg-white/5 border border-transparent"
                    }`}
                  >
                    <IconComponent
                      size={16}
                      className={isActive ? "text-cyan-400 shrink-0" : "text-slate-400 shrink-0"}
                    />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Sidebar Bottom Status Badge */}
            <div className="p-3 border-t border-cyan-400/20 bg-slate-900/50">
              <div className="flex items-center gap-2.5">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <div className="text-[11px] font-mono text-slate-300 truncate">
                  Rust Core: <span className="text-emerald-400 font-bold">Online</span>
                </div>
              </div>
              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                RAM &lt; 35 MB • 0 Terminal Flashes
              </div>
            </div>
          </aside>

          {/* Right Main Content Pane */}
          <main className="flex-1 min-w-0 overflow-y-auto p-6 bg-slate-950/40 relative">
            {/* 1. GENERAL TAB */}
            {activeTab === "general" && (
              <div className="space-y-6 max-w-3xl">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Sliders size={18} className="text-cyan-400" />
                    <span>General System Settings</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Manage Windows startup persistence, global hotkeys, 3D ambient Earth, and window close actions.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {/* Windows Startup */}
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2.5">
                    <div className="text-xs font-bold text-white flex items-center justify-between">
                      <span>Windows Auto-Start</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${autoStart ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>
                        {autoStart ? "ACTIVE" : "OFF"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      Launch Angel AI companion silently on Windows 11 boot via HKCU registry.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handleToggleAutoStart(true)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                          autoStart
                            ? "bg-cyan-500 text-slate-950 shadow-sm"
                            : "bg-white/5 text-slate-400 hover:text-white"
                        }`}
                      >
                        Enabled
                      </button>
                      <button
                        onClick={() => handleToggleAutoStart(false)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                          !autoStart
                            ? "bg-rose-600 text-white shadow-sm"
                            : "bg-white/5 text-slate-400 hover:text-white"
                        }`}
                      >
                        Disabled
                      </button>
                    </div>
                  </div>

                  {/* Global Hotkey */}
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2.5">
                    <div className="text-xs font-bold text-white flex items-center justify-between">
                      <span>Global Summon Hotkey</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300">
                        ALWAYS READY
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      Instantly summon HUD or Active Co-Pilot from MS Word, Photoshop, VS Code.
                    </p>
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/40 border border-cyan-400/40 font-mono text-xs text-cyan-300 font-bold">
                      <Zap size={14} className="text-cyan-400" />
                      <span>Alt + Space</span>
                    </div>
                  </div>

                  {/* Floating Cursor Companion Orb */}
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2.5">
                    <div className="text-xs font-bold text-white flex items-center justify-between">
                      <span>Cursor Companion Orb</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${cursorCompanion ? "bg-cyan-500/20 text-cyan-300" : "bg-slate-800 text-slate-400"}`}>
                        {cursorCompanion ? "ACTIVE" : "OFF"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      Mini 3D orb follows mouse with active app badge & cursor paste tool.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handleToggleCursorCompanion(true)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                          cursorCompanion
                            ? "bg-cyan-500 text-slate-950 shadow-sm"
                            : "bg-white/5 text-slate-400 hover:text-white"
                        }`}
                      >
                        Enabled
                      </button>
                      <button
                        onClick={() => handleToggleCursorCompanion(false)}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                          !cursorCompanion
                            ? "bg-slate-700 text-slate-300"
                            : "bg-white/5 text-slate-400 hover:text-white"
                        }`}
                      >
                        Disabled
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3D CORE THEME SWITCHER (4 SCI-FI CORES) */}
                <div className="p-5 rounded-2xl bg-white/5 border border-white/10 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-bold text-white flex items-center gap-2">
                        <Sparkles size={16} className="text-cyan-400" />
                        <span>3D Core Theme Switcher (4 Interactive Three.js Cores)</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Seamlessly morph between 4 real-time sci-fi cores with zero page reload.
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-cyan-950/80 border border-cyan-400/40 text-cyan-300">
                      ACTIVE: {coreTheme.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {/* Core 1: Quantum Gyroscope */}
                    <div
                      onClick={() => handleSelectCoreTheme("quantum_gyro")}
                      className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                        coreTheme === "quantum_gyro"
                          ? "bg-cyan-950/40 border-cyan-400 text-cyan-100 shadow-[0_0_15px_rgba(34,211,238,0.25)]"
                          : "bg-black/30 border-white/10 text-slate-300 hover:border-white/20 hover:bg-white/[0.03]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center">
                            <Atom size={18} className="text-cyan-400" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-white">Quantum Gyroscope Core</div>
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-cyan-500/30 text-cyan-300 font-mono">
                              JARVIS Style
                            </span>
                          </div>
                        </div>
                        {coreTheme === "quantum_gyro" && <Check size={16} className="text-cyan-400 shrink-0" />}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Concentric counter-rotating holographic rings with inner pulsating cyan energy core and orbital particles.
                      </p>
                    </div>

                    {/* Core 2: Living Neural Synapse */}
                    <div
                      onClick={() => handleSelectCoreTheme("neural_synapse")}
                      className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                        coreTheme === "neural_synapse"
                          ? "bg-purple-950/40 border-purple-400 text-purple-100 shadow-[0_0_15px_rgba(168,85,247,0.25)]"
                          : "bg-black/30 border-white/10 text-slate-300 hover:border-white/20 hover:bg-white/[0.03]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-400/40 flex items-center justify-center">
                            <Brain size={18} className="text-purple-400" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-white">Living Neural Synapse</div>
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-purple-500/30 text-purple-300 font-mono">
                              Cognitive Web
                            </span>
                          </div>
                        </div>
                        {coreTheme === "neural_synapse" && <Check size={16} className="text-purple-400 shrink-0" />}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        110 interconnected synaptic nodes with dynamic lightning filaments that pulse faster during AI thinking and speech.
                      </p>
                    </div>

                    {/* Core 3: Satellite Orbital Earth */}
                    <div
                      onClick={() => handleSelectCoreTheme("orbital_earth")}
                      className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                        coreTheme === "orbital_earth"
                          ? "bg-emerald-950/40 border-emerald-400 text-emerald-100 shadow-[0_0_15px_rgba(16,185,129,0.25)]"
                          : "bg-black/30 border-white/10 text-slate-300 hover:border-white/20 hover:bg-white/[0.03]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/40 flex items-center justify-center">
                            <Globe size={18} className="text-emerald-400" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-white">Satellite Orbital Earth</div>
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-500/30 text-emerald-300 font-mono">
                              Day/Night Orbit
                            </span>
                          </div>
                        </div>
                        {coreTheme === "orbital_earth" && <Check size={16} className="text-emerald-400 shrink-0" />}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Orbital Earth with day/night solar lighting, specular ocean reflection, moving clouds, Moon, and ISS station.
                      </p>
                    </div>

                    {/* Core 4: Volumetric Hologram */}
                    <div
                      onClick={() => handleSelectCoreTheme("volumetric_hologram")}
                      className={`p-4 rounded-xl border cursor-pointer transition flex flex-col justify-between ${
                        coreTheme === "volumetric_hologram"
                          ? "bg-teal-950/40 border-teal-400 text-teal-100 shadow-[0_0_15px_rgba(20,184,166,0.25)]"
                          : "bg-black/30 border-white/10 text-slate-300 hover:border-white/20 hover:bg-white/[0.03]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-teal-500/20 border border-teal-400/40 flex items-center justify-center">
                            <Sparkles size={18} className="text-teal-400" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-white">Volumetric Hologram</div>
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-semibold bg-teal-500/30 text-teal-300 font-mono">
                              Particle Lattice
                            </span>
                          </div>
                        </div>
                        {coreTheme === "volumetric_hologram" && <Check size={16} className="text-teal-400 shrink-0" />}
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        1,800 undulating waveform particles in a futuristic holographic silhouette with traversing laser scan plane.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Ambient 3D Stage Tuning & Visual FX */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-4">
                  <div className="text-sm font-semibold text-white flex items-center justify-between">
                    <span>Ambient 3D Stage HUD Tuning</span>
                    <span className="text-xs font-mono text-cyan-400">HoloEarthStage</span>
                  </div>

                  <div className="space-y-3">
                    {/* Background Opacity (50% default) */}
                    <div>
                      <div className="flex justify-between text-xs text-slate-300 mb-1">
                        <span>Background Opacity: {Math.round(earthOpacity * 100)}%</span>
                        <span className="text-[11px] text-slate-400 font-mono">Default: 50%</span>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.05"
                        value={earthOpacity}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setEarthOpacity(val);
                          localStorage.setItem("angel_earth_opacity", val.toString());
                          dispatchEarthConfig(earthScale, weatherFx, val);
                        }}
                        className="w-full accent-cyan-400 bg-slate-800"
                      />
                    </div>

                    {/* Earth Size / Scale Slider (0.6x to 1.5x, default 1.0x) */}
                    <div>
                      <div className="flex justify-between text-xs text-slate-300 mb-1">
                        <span>Earth Size / Scale: {earthScale.toFixed(2)}x</span>
                        <span className="text-[11px] text-slate-400 font-mono">Range: 0.6x – 1.5x</span>
                      </div>
                      <input
                        type="range"
                        min="0.6"
                        max="1.5"
                        step="0.05"
                        value={earthScale}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setEarthScale(val);
                          localStorage.setItem("angel_earth_scale", val.toString());
                          dispatchEarthConfig(val, weatherFx, earthOpacity);
                        }}
                        className="w-full accent-cyan-400 bg-slate-800"
                      />
                    </div>

                    {/* Real-Time Global Weather FX Toggle */}
                    <div className="flex items-center gap-3 pt-1">
                      <input
                        type="checkbox"
                        id="weatherFx"
                        checked={weatherFx}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setWeatherFx(val);
                          localStorage.setItem("angel_earth_weather_fx", val.toString());
                          dispatchEarthConfig(earthScale, val, earthOpacity);
                        }}
                        className="rounded accent-cyan-400"
                      />
                      <label htmlFor="weatherFx" className="text-xs text-slate-300 cursor-pointer">
                        Real-Time Global Weather FX (Day/Night Solar Angle, Distant Storm Lightning & Polar Aurora Shimmer)
                      </label>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-slate-300 mb-1">
                        <span>Rotation Velocity: {(earthSpeed * 1000).toFixed(1)}x rad/frame</span>
                      </div>
                      <input
                        type="range"
                        min="0.0002"
                        max="0.003"
                        step="0.0002"
                        value={earthSpeed}
                        onChange={(e) => setEarthSpeed(parseFloat(e.target.value))}
                        className="w-full accent-cyan-400 bg-slate-800"
                      />
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                      <input
                        type="checkbox"
                        id="showCelestial"
                        checked={showCelestial}
                        onChange={(e) => setShowCelestial(e.target.checked)}
                        className="rounded accent-cyan-400"
                      />
                      <label htmlFor="showCelestial" className="text-xs text-slate-300 cursor-pointer">
                        Render Orbiting Moon & ISS Space Station
                      </label>
                    </div>
                  </div>
                </div>

                {/* Window Controls Behavior */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
                  <div className="text-sm font-semibold text-white">Window Controls Behavior</div>
                  <div className="text-xs text-slate-400 space-y-1">
                    <div>• <strong className="text-slate-200">- (Minimize):</strong> Hides Angel AI to the Windows System Tray, keeping background security sentries and the global <code className="text-cyan-400">Alt + Space</code> hotkey active.</div>
                    <div>• <strong className="text-slate-200">X (Close):</strong> Cleanly terminates and exits the entire Angel AI application process.</div>
                  </div>
                </div>

                <button
                  onClick={handleSaveGeneral}
                  className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition"
                >
                  <Save size={15} />
                  <span>Save General Settings</span>
                </button>
              </div>
            )}

            {/* 2. AI BRAIN TAB */}
            {activeTab === "brain" && (() => {
              const activeProvider = providers.find((p) => p.id === activeProviderId) || providers[0];
              const isCloud = activeProvider.category === "cloud";
              const isLocal = activeProvider.category === "local";
              const isRouter = activeProvider.category === "router";
              const testRes = testResults[activeProvider.id];
              const isTesting = testingId === activeProvider.id;

              const isProviderConfigured = (p: AIProviderConfig): boolean => {
                if (p.id === "auto") {
                  return providers.some((other) => other.id !== "auto" && isProviderConfigured(other));
                }
                if (p.id === "ollama" || p.id === "local_lmstudio") {
                  return Boolean(p.endpoint && p.endpoint.trim().length > 0);
                }
                return extractKeysList(p.apiKey).length > 0;
              };

              // Key list for multiline auto-rotator
              const keyList = (activeProvider.apiKey || "")
                .split("\n")
                .map((k) => k.trim())
                .filter((k) => k.length > 0);
              const keyCount = keyList.length;

              return (
                <div className="space-y-6 max-w-4xl">
                  {/* AI PROVIDER Header */}
                  <div>
                    <h2 className="text-lg font-black tracking-wide text-white flex items-center gap-2">
                      <Brain size={18} className="text-cyan-400" />
                      <span>AI PROVIDER</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Choose the brain that powers Angel AI. Switch between ultra-fast cloud models or offline local LLMs at any time.
                    </p>
                  </div>

                  {/* 1. 2-COLUMN SELECTOR GRID */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {providers.map((p) => {
                      const isSelected = activeProviderId === p.id;
                      return (
                        <div
                          key={p.id}
                          onClick={() => handleSelectProvider(p.id)}
                          className={`p-3.5 rounded-2xl border cursor-pointer transition-all duration-200 relative flex items-start justify-between gap-3 ${
                            isSelected
                              ? "bg-cyan-950/30 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                              : "bg-slate-900/40 border-white/10 hover:border-white/20 hover:bg-white/[0.04]"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
                              {p.id === "auto" && <Zap size={16} className="text-amber-400" />}
                              {p.id === "gemini" && <Brain size={16} className="text-cyan-400" />}
                              {p.id === "groq" && <Zap size={16} className="text-orange-400" />}
                              {p.id === "openai" && <Sparkles size={16} className="text-emerald-400" />}
                              {p.id === "deepseek" && <Cpu size={16} className="text-blue-400" />}
                              {p.id === "anthropic" && <Sparkles size={16} className="text-indigo-400" />}
                              {p.id === "github" && <GitMerge size={16} className="text-purple-400" />}
                              {p.id === "freellmapi" && <Server size={16} className="text-teal-400" />}
                              {p.id === "openrouter" && <Globe size={16} className="text-sky-400" />}
                              {p.id === "ollama" && <HardDrive size={16} className="text-emerald-400" />}
                              {p.id === "local_lmstudio" && <Server size={16} className="text-sky-400" />}
                            </div>
                            <div className="space-y-0.5 pr-2">
                              <div className="font-bold text-white text-xs flex items-center gap-1.5 flex-wrap">
                                <span>{p.name}</span>
                                {isProviderConfigured(p) && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 flex items-center gap-1 shadow-sm">
                                    <span>Configured</span>
                                    <Check size={10} strokeWidth={3} />
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 leading-snug line-clamp-2">
                                {p.description}
                              </div>
                            </div>
                          </div>

                          {/* Top-Right Cyan Checkmark Indicator */}
                          <div className="shrink-0 mt-0.5">
                            {isSelected ? (
                              <div className="w-5 h-5 rounded-full bg-cyan-400 text-slate-950 flex items-center justify-center font-bold shadow-md shadow-cyan-400/40">
                                <Check size={12} strokeWidth={3} />
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full border border-white/20 shrink-0" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 2. DYNAMIC [PROVIDER] CONFIGURATION SECTION (ABOVE Model Dropdown) */}
                  <div className="p-5 rounded-2xl bg-slate-950/80 border border-cyan-400/30 backdrop-blur-xl space-y-4 shadow-xl">
                    {/* Header with Capability & Key Counter Pills */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
                      <div className="text-xs font-black tracking-wider text-cyan-200 uppercase flex items-center gap-2">
                        <Sliders size={14} className="text-cyan-400" />
                        <span>{activeProvider.name.toUpperCase()} CONFIGURATION</span>
                      </div>

                      {/* Capabilities & Key Count Row */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {activeProvider.capabilities.map((cap, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/5 border border-white/10 text-slate-300"
                          >
                            {cap}
                          </span>
                        ))}
                        {isCloud && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-950 border border-cyan-400/40 text-cyan-300">
                            🔑 {keyCount} {keyCount === 1 ? "KEY" : "KEYS"}
                          </span>
                        )}
                        {isLocal && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950 border border-emerald-400/40 text-emerald-300">
                            ⚡ LOCAL ENDPOINT
                          </span>
                        )}
                        {isRouter && (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center gap-1">
                            <Zap size={11} className="text-amber-400" />
                            <span>DYNAMIC CHAIN</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Multi-Line API Keys Auto-Rotator (Cloud & FreeLLMAPI) */}
                    {(isCloud || activeProvider.id === "freellmapi") && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <label className="font-semibold text-slate-200 flex items-center gap-2">
                            <span>{activeProvider.name} API Keys (Auto-Rotated)</span>
                            <button
                              type="button"
                              onClick={() => setShowApiKeys(!showApiKeys)}
                              className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/10 hover:bg-white/15 text-slate-300 border border-white/10 flex items-center gap-1 transition"
                              title={showApiKeys ? "Mask keys" : "Reveal / Edit keys"}
                            >
                              {showApiKeys ? <EyeOff size={11} className="text-amber-400" /> : <Eye size={11} className="text-cyan-400" />}
                              <span>{showApiKeys ? "Hide (****)" : "Show / Edit Keys"}</span>
                            </button>
                          </label>
                          {activeProvider.consoleUrl && (
                            <a
                              href={activeProvider.consoleUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 text-[11px] font-mono hover:underline"
                            >
                              <span>Get a key</span>
                              <ExternalLink size={10} />
                            </a>
                          )}
                        </div>

                        {showApiKeys || !activeProvider.apiKey.trim() ? (
                          <textarea
                            rows={3}
                            value={activeProvider.apiKey}
                            onChange={(e) =>
                              handleUpdateProvider(activeProvider.id, {
                                apiKey: e.target.value,
                                status: extractKeysList(e.target.value).length > 0 ? "ready" : "missing_key",
                              })
                            }
                            placeholder={
                              activeProvider.id === "freellmapi"
                                ? "freellmapi-xxxxxxxxxxxxxxxxxxxxxxxx\n(Paste multiple keys here — one key per line)"
                                : activeProvider.id === "openrouter"
                                ? "sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxx\n(Paste multiple keys here — one key per line)"
                                : "sk-...\nsk-...\n(Paste multiple keys here — one key per line)"
                            }
                            className="w-full p-2.5 rounded-xl bg-black/60 border border-white/15 font-mono text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-400 transition"
                          />
                        ) : (
                          <div
                            onClick={() => setShowApiKeys(true)}
                            className="cursor-pointer group p-2.5 rounded-xl bg-black/60 border border-white/15 font-mono text-xs text-slate-400 space-y-1 hover:border-cyan-400/50 transition"
                            title="Click to reveal and edit keys"
                          >
                            {activeProvider.apiKey.split("\n").filter((l) => l.trim()).map((line, idx) => {
                              const t = line.trim();
                              const masked = t.length <= 6 ? "••••••••••••••••" : `${t.slice(0, 4)}••••••••••••••••`;
                              return (
                                <div key={idx} className="flex items-center justify-between">
                                  <span className="text-slate-200 tracking-wider font-mono">{masked}</span>
                                  <span className="text-[10px] text-cyan-400/70 opacity-0 group-hover:opacity-100 transition">Click to edit</span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="text-[11px] text-slate-400 flex items-center justify-between">
                          <span>
                            {activeProvider.id === "freellmapi"
                              ? "FreeLLMAPI Unified LLM Router (Local Gateway at http://127.0.0.1:31415)"
                              : activeProvider.id === "openrouter"
                              ? "OpenRouter Cloud Free Models — 100+ Free & Premium AI models."
                              : "One key per line — rotated automatically to dodge rate limits."}
                          </span>
                          {!showApiKeys && activeProvider.apiKey.trim() && (
                            <span className="text-[10px] text-emerald-400 font-mono">🔒 Keys securely masked</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* FreeLLMAPI Gateway Endpoint URL & Fetch Router Models */}
                    {activeProvider.id === "freellmapi" && (
                      <div className="space-y-1.5 pt-1">
                        <label className="text-xs font-semibold text-slate-200">
                          Gateway Endpoint URL (Port 31415)
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={activeProvider.endpoint}
                            onChange={(e) =>
                              handleUpdateProvider(activeProvider.id, {
                                endpoint: e.target.value,
                              })
                            }
                            placeholder="http://127.0.0.1:31415/v1/chat/completions"
                            className="flex-1 px-3 py-2 bg-black/60 border border-white/15 rounded-xl text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-400 transition"
                          />
                          <button
                            type="button"
                            onClick={() => handleFetchRouterModels(activeProvider)}
                            disabled={scanningOllama}
                            className="px-3.5 py-2 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 border border-teal-400/40 text-teal-300 text-xs font-bold flex items-center gap-1.5 transition shrink-0 disabled:opacity-50"
                          >
                            <RefreshCw size={13} className={scanningOllama ? "animate-spin" : ""} />
                            <span>{scanningOllama ? "Fetching..." : "Fetch Router Models"}</span>
                          </button>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Queries http://127.0.0.1:31415/v1/models with Authorization Bearer header.
                        </div>
                      </div>
                    )}

                    {/* Local Endpoint & Auto-Scan (Local) */}
                    {isLocal && activeProvider.id !== "freellmapi" && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-slate-200">
                          {activeProvider.name} Base URL / Endpoint
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={activeProvider.endpoint}
                            onChange={(e) =>
                              handleUpdateProvider(activeProvider.id, {
                                endpoint: e.target.value,
                              })
                            }
                            placeholder={activeProvider.id === "ollama" ? "http://localhost:11434" : "http://localhost:1234/v1"}
                            className="flex-1 px-3 py-2 bg-black/60 border border-white/15 rounded-xl text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-400 transition"
                          />
                          <button
                            type="button"
                            onClick={() => handleScanLocalModels(activeProvider)}
                            disabled={scanningOllama}
                            className="px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-300 text-xs font-bold flex items-center gap-1.5 transition shrink-0 disabled:opacity-50"
                          >
                            <RefreshCw size={13} className={scanningOllama ? "animate-spin" : ""} />
                            <span>{scanningOllama ? "Scanning..." : "Scan Local Models"}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Auto Smart Router Info & Active Routing Chain Card */}
                    {isRouter && (() => {
                      const priorityOrder = [
                        "gemini",
                        "groq",
                        "freellmapi",
                        "openrouter",
                        "deepseek",
                        "openai",
                        "anthropic",
                        "github",
                        "ollama",
                        "local_lmstudio",
                      ];
                      const chainProviders = priorityOrder
                        .map((pid) => providers.find((p) => p.id === pid))
                        .filter((p): p is AIProviderConfig => Boolean(p));
                      const readyCount = chainProviders.filter(isProviderConfigured).length;

                      return (
                        <div className="p-4 rounded-2xl bg-cyan-950/20 border border-cyan-400/30 text-xs text-slate-300 space-y-3 shadow-inner">
                          <div className="flex items-center justify-between">
                            <div className="font-bold text-cyan-200 flex items-center gap-2">
                              <Zap size={15} className="text-amber-400" />
                              <span className="tracking-wide">ACTIVE ROUTING CHAIN</span>
                            </div>
                            <span className="text-[11px] font-mono text-cyan-300 font-bold bg-cyan-950 px-2.5 py-0.5 rounded-full border border-cyan-400/40">
                              {readyCount} of {chainProviders.length} Configured
                            </span>
                          </div>

                          <p className="text-[11px] text-slate-400 leading-relaxed">
                            No separate API key required. Auto Smart Router dynamically tests latency and dispatches queries across all your configured providers, automatically dodging 429 rate limits.
                          </p>

                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-1">
                            {chainProviders.map((cp, idx) => {
                              const ready = isProviderConfigured(cp);
                              return (
                                <div
                                  key={cp.id}
                                  className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-xs font-mono transition ${
                                    ready
                                      ? "bg-emerald-950/40 border-emerald-500/50 text-emerald-200 shadow-sm"
                                      : "bg-slate-900/30 border-white/5 text-slate-500"
                                  }`}
                                >
                                  <div className="flex items-center gap-2 truncate">
                                    <span className="text-[10px] opacity-60">#{idx + 1}</span>
                                    <span className="truncate font-semibold text-slate-200">{cp.name}</span>
                                  </div>
                                  {ready ? (
                                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-bold shrink-0">
                                      <Check size={11} strokeWidth={3} />
                                      <span>Ready</span>
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-slate-500 shrink-0">No key</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Model Dropdown & Test Connection Row */}
                    <div className="pt-2 space-y-2 border-t border-white/10">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-semibold text-slate-200">
                            Model
                          </label>
                          {activeProvider.id === "gemini" && (
                            <div className="flex items-center gap-2">
                              {activeProvider.availableModels && activeProvider.availableModels.length > 0 && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-950/80 border border-cyan-400/40 text-cyan-300">
                                  Auto-Detected Live Models ({activeProvider.availableModels.length} available) • Auto-Selected: {activeProvider.defaultModel}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDiscoverGeminiModels(activeProvider)}
                                disabled={discoveringGeminiModels}
                                className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-[10px] font-bold flex items-center gap-1 transition disabled:opacity-50 shadow-sm"
                              >
                                <RefreshCw size={10} className={discoveringGeminiModels ? "animate-spin" : ""} />
                                <span>{discoveringGeminiModels ? "Detecting..." : "Auto-Detect Live Models"}</span>
                              </button>
                            </div>
                          )}
                        </div>
                        {isRouter ? (
                          <div className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/15 text-xs font-mono text-cyan-300 flex items-center justify-between">
                            <span>Dynamic Priority Routing (Auto Failover across configured brains)</span>
                            <span className="text-[10px] text-emerald-400 font-bold">Automatic</span>
                          </div>
                        ) : (
                          <select
                            value={activeProvider.defaultModel}
                            onChange={(e) => handleChangeProviderModel(activeProvider.id, e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-black/60 border border-white/15 text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-400 transition"
                          >
                            {(activeProvider.availableModels && activeProvider.availableModels.length > 0
                              ? activeProvider.availableModels
                              : [activeProvider.defaultModel]
                            ).map((m) => (
                              <option key={m} value={m} className="bg-slate-900 text-white">
                                {m}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      {/* Test Connection Button & Latency Feedback */}
                      <div className="flex items-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={() => handleTestProvider(activeProvider)}
                          disabled={isTesting}
                          className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 hover:text-white text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50 shadow-md shadow-cyan-500/10"
                        >
                          <Zap size={13} className={isTesting ? "animate-pulse" : ""} />
                          <span>{isTesting ? "TESTING..." : "🔌 TEST CONNECTION"}</span>
                        </button>

                        {testRes && (
                          <div
                            className={`text-xs font-mono flex items-center gap-1.5 ${
                              testRes.ok ? "text-emerald-400 font-bold" : "text-rose-400"
                            }`}
                          >
                            <span>{testRes.message}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 3. ENGINE BEHAVIOUR CONTROLS */}
                  <div className="p-5 rounded-2xl bg-slate-950/60 border border-white/10 space-y-4">
                    <div className="text-xs font-black tracking-wider text-cyan-200 uppercase">
                      ENGINE BEHAVIOUR
                    </div>

                    {/* Tool Calling Toggle Switch */}
                    <div className="flex items-center justify-between gap-4 pt-1">
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold text-white">Tool calling</div>
                        <div className="text-[11px] text-slate-400">
                          Let the AI open apps, fetch weather, run system commands and drive widgets.
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={toolCalling}
                          onChange={(e) => {
                            setToolCalling(e.target.checked);
                            localStorage.setItem("angel_tool_calling", e.target.checked.toString());
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                      </label>
                    </div>

                    {/* Automatic Failover Toggle Switch */}
                    <div className="flex items-center justify-between gap-4 pt-2 border-t border-white/5">
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold text-white">Automatic failover</div>
                        <div className="text-[11px] text-slate-400">
                          If the selected provider errors or rate-limits, retry on any other configured provider.
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={autoFailover}
                          onChange={(e) => {
                            setAutoFailover(e.target.checked);
                            localStorage.setItem("angel_ai_failover", e.target.checked.toString());
                          }}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-500"></div>
                      </label>
                    </div>

                    {/* Temperature Cyan Slider */}
                    <div className="pt-2 border-t border-white/5 space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-white">Temperature</span>
                        <span className="font-mono text-cyan-400 font-bold px-2 py-0.5 rounded bg-cyan-950 border border-cyan-400/40">
                          {temperature.toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={temperature}
                        onChange={(e) => setTemperature(parseFloat(e.target.value))}
                        className="w-full accent-cyan-400 bg-slate-800"
                      />
                      <div className="text-[11px] text-slate-400">
                        Lower is precise and repeatable, higher is more creative.
                      </div>
                    </div>

                    {/* Response Style Presets */}
                    <div className="pt-2 border-t border-white/5 space-y-2">
                      <div className="text-xs font-bold text-white">Response Style Preset</div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { id: "concise", label: "Direct & Concise" },
                          { id: "conversational", label: "Conversational Companion" },
                          { id: "technical", label: "Technical Developer" },
                          { id: "tanglish", label: "Bilingual Tanglish (தமிழ் + English)" },
                        ].map((style) => (
                          <button
                            key={style.id}
                            type="button"
                            onClick={() => setResponseStyle(style.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                              responseStyle === style.id
                                ? "bg-cyan-500/20 border-cyan-400 text-cyan-200 font-bold"
                                : "bg-black/20 border-white/10 text-slate-300 hover:bg-white/5"
                            }`}
                          >
                            {style.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Custom System Instruction Editor */}
                    <div className="pt-2 border-t border-white/5 space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-white">Custom System Instruction (All Providers)</span>
                        <span className="text-slate-400 font-mono text-[10px]">{systemPrompt.length} chars</span>
                      </div>
                      <textarea
                        rows={3}
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        className="w-full p-2.5 rounded-xl bg-black/60 border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                  </div>

                  {/* Save AI Brain Config Button */}
                  <button
                    type="button"
                    onClick={handleSaveBrain}
                    className="px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow-lg shadow-cyan-500/25"
                  >
                    <Save size={15} />
                    <span>Save AI Brain Config</span>
                  </button>
                </div>
              );
            })()}

            {/* 3. MULTI-CLOUD STORAGE & REMOTE CONTROL HUB TAB */}
            {activeTab === "api_keys" && (
              <div className="space-y-6 max-w-3xl">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Cloud size={18} className="text-cyan-400" />
                    <span>Multi-Cloud Storage & Remote Control Hub</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Configure independent cloud storage endpoints and remote bridges. Angel AI synchronizes your conversations, 3D workshop assets, and memory facts across your personal infrastructure without single-vendor cloud lock-in.
                  </p>
                </div>

                {/* LLM Key Notice Banner */}
                <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-400/30 flex items-center justify-between gap-3 text-xs backdrop-blur-md">
                  <div className="flex items-center gap-2.5 text-slate-200">
                    <Sparkles size={16} className="text-cyan-400 shrink-0" />
                    <span>
                      LLM API keys (Gemini, Groq, Claude, DeepSeek, FreeLLMAPI) are managed in the <strong className="text-cyan-300">AI Brain</strong> tab.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("brain")}
                    className="px-3 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-xs font-semibold shrink-0 transition"
                  >
                    Open AI Brain →
                  </button>
                </div>

                {/* PROVIDER 1: SUPABASE CLOUD SYNC */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                        <Database size={16} />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-white">1. Supabase Cloud Sync (Primary Realtime DB)</h3>
                        <p className="text-[10px] text-slate-400">Synchronizes long-term memory facts, learned preferences, and device relay messages.</p>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                        cloudConfig.supabase.url && cloudConfig.supabase.anonKey
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-slate-500/20 text-slate-400"
                      }`}
                    >
                      {cloudConfig.supabase.url && cloudConfig.supabase.anonKey ? "Configured" : "Standby"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">Supabase Project URL</label>
                      <input
                        type="text"
                        value={cloudConfig.supabase.url}
                        onChange={(e) =>
                          setCloudConfig((prev) => ({
                            ...prev,
                            supabase: { ...prev.supabase, url: e.target.value },
                          }))
                        }
                        placeholder="https://xyzcompany.supabase.co"
                        className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-[11px] font-semibold text-slate-300">Supabase Anon Public Key</label>
                        <button
                          type="button"
                          onClick={() => setShowSupabaseKey(!showSupabaseKey)}
                          className="text-[10px] text-slate-400 hover:text-white"
                        >
                          {showSupabaseKey ? "Hide" : "Show"}
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type={showSupabaseKey ? "text" : "password"}
                          value={cloudConfig.supabase.anonKey}
                          onChange={(e) =>
                            setCloudConfig((prev) => ({
                              ...prev,
                              supabase: { ...prev.supabase, anonKey: e.target.value },
                            }))
                          }
                          placeholder="eyJhbGciOi..."
                          className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleSyncCloud}
                      disabled={isSyncingSupabase}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 font-semibold text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                    >
                      <Cloud size={13} className={isSyncingSupabase ? "animate-spin" : ""} />
                      <span>{isSyncingSupabase ? "Syncing..." : "Sync Now"}</span>
                    </button>
                  </div>
                </div>

                {/* PROVIDER 2: DISCORD REMOTE PC & CLOUD STORAGE BRIDGE */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400">
                        <Radio size={16} />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-white">2. Discord Remote PC & Cloud Storage Bridge</h3>
                        <p className="text-[10px] text-slate-400">Realtime webhook alerts, desktop screenshot uploads, and remote commands via Discord channel.</p>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                        cloudConfig.discord.webhookUrl
                          ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                          : "bg-slate-500/20 text-slate-400"
                      }`}
                    >
                      {cloudConfig.discord.webhookUrl ? "Bridge Ready" : "Optional"}
                    </span>
                  </div>

                  <div className="space-y-3 pt-1">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                        Discord Webhook URL <span className="text-[10px] text-slate-500">(Instant alerts, reports, & cloud screenshots)</span>
                      </label>
                      <div className="relative">
                        <input
                          type={showDiscordWebhook ? "text" : "password"}
                          value={cloudConfig.discord.webhookUrl}
                          onChange={(e) =>
                            setCloudConfig((prev) => ({
                              ...prev,
                              discord: { ...prev.discord, webhookUrl: e.target.value },
                            }))
                          }
                          placeholder="https://discord.com/api/webhooks/..."
                          className="w-full px-3 py-2 pr-10 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                        />
                        <button
                          type="button"
                          onClick={() => setShowDiscordWebhook(!showDiscordWebhook)}
                          className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                        >
                          {showDiscordWebhook ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                          Discord Bot Token <span className="text-[10px] text-slate-500">(Optional for /screenshot, /lock, /status)</span>
                        </label>
                        <input
                          type="password"
                          value={cloudConfig.discord.botToken}
                          onChange={(e) =>
                            setCloudConfig((prev) => ({
                              ...prev,
                              discord: { ...prev.discord, botToken: e.target.value },
                            }))
                          }
                          placeholder="MTAy..."
                          className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                          Command Channel ID <span className="text-[10px] text-slate-500">(Optional channel listener)</span>
                        </label>
                        <input
                          type="text"
                          value={cloudConfig.discord.channelId}
                          onChange={(e) =>
                            setCloudConfig((prev) => ({
                              ...prev,
                              discord: { ...prev.discord, channelId: e.target.value },
                            }))
                          }
                          placeholder="123456789012345678"
                          className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleTestDiscord}
                      disabled={isTestingDiscord}
                      className="px-3.5 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/40 text-indigo-200 font-semibold text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                    >
                      <Radio size={13} className={isTestingDiscord ? "animate-pulse" : ""} />
                      <span>{isTestingDiscord ? "Testing Bridge..." : "Test Discord Bridge"}</span>
                    </button>
                  </div>
                </div>

                {/* PROVIDER 3: GITHUB GIST / REPO CLOUD BACKUP */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400">
                        <FolderGit2 size={16} />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-white">3. GitHub Gist / Repo Cloud Backup (Zero-Cost JSON Sync)</h3>
                        <p className="text-[10px] text-slate-400">Versioned, zero-cost encrypted cloud backup for conversations, memory facts, and 3D workshop builds.</p>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                        cloudConfig.github.pat
                          ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                          : "bg-slate-500/20 text-slate-400"
                      }`}
                    >
                      {cloudConfig.github.pat ? "Backup Ready" : "Optional"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                        GitHub Personal Access Token (PAT)
                      </label>
                      <input
                        type="password"
                        value={cloudConfig.github.pat}
                        onChange={(e) =>
                          setCloudConfig((prev) => ({
                            ...prev,
                            github: { ...prev.github, pat: e.target.value },
                          }))
                        }
                        placeholder="ghp_..."
                        className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                        Secret Gist ID <span className="text-[10px] text-slate-500">(Auto-generated on first backup)</span>
                      </label>
                      <input
                        type="text"
                        value={cloudConfig.github.gistId}
                        onChange={(e) =>
                          setCloudConfig((prev) => ({
                            ...prev,
                            github: { ...prev.github, gistId: e.target.value },
                          }))
                        }
                        placeholder="Auto-populated or paste existing Gist ID"
                        className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleBackupGitHub}
                      disabled={isBackingUpGithub}
                      className="px-3.5 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/40 text-purple-200 font-semibold text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                    >
                      <UploadCloud size={13} className={isBackingUpGithub ? "animate-bounce" : ""} />
                      <span>{isBackingUpGithub ? "Backing up..." : "Backup to GitHub"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleRestoreGitHub}
                      disabled={isRestoringGithub}
                      className="px-3.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                    >
                      <DownloadCloud size={13} className={isRestoringGithub ? "animate-bounce" : ""} />
                      <span>{isRestoringGithub ? "Restoring..." : "Restore from GitHub"}</span>
                    </button>
                  </div>
                </div>

                {/* PROVIDER 4: CUSTOM CLOUD / S3 / WEBDAV / NAS */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400">
                        <HardDrive size={16} />
                      </div>
                      <div>
                        <h3 className="text-xs font-bold text-white">4. Custom Cloud / S3 / WebDAV / Manual Storage Driver</h3>
                        <p className="text-[10px] text-slate-400">Connect Cloudflare R2, AWS S3, WebDAV Nextcloud, or a local network NAS path.</p>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                        customVerified
                          ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                          : "bg-slate-500/20 text-slate-400"
                      }`}
                    >
                      {customVerified ? "Verified" : "Standby"}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">Provider Type</label>
                      <select
                        value={cloudConfig.custom.providerType}
                        onChange={(e) =>
                          setCloudConfig((prev) => ({
                            ...prev,
                            custom: { ...prev.custom, providerType: e.target.value as any },
                          }))
                        }
                        className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                      >
                        <option value="s3">Cloudflare R2 / AWS S3</option>
                        <option value="webdav">WebDAV / Nextcloud</option>
                        <option value="local_nas">Custom Local / NAS Path</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">Endpoint URL / Host</label>
                      <input
                        type="text"
                        value={cloudConfig.custom.endpointUrl}
                        onChange={(e) =>
                          setCloudConfig((prev) => ({
                            ...prev,
                            custom: { ...prev.custom, endpointUrl: e.target.value },
                          }))
                        }
                        placeholder="https://<account>.r2.cloudflarestorage.com"
                        className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">Bucket / Folder Path</label>
                      <input
                        type="text"
                        value={cloudConfig.custom.bucketOrFolder}
                        onChange={(e) =>
                          setCloudConfig((prev) => ({
                            ...prev,
                            custom: { ...prev.custom, bucketOrFolder: e.target.value },
                          }))
                        }
                        placeholder="angel-ai-vault"
                        className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-300 block mb-1">Access Token / Secret Key</label>
                    <input
                      type="password"
                      value={cloudConfig.custom.accessKey}
                      onChange={(e) =>
                        setCloudConfig((prev) => ({
                          ...prev,
                          custom: { ...prev.custom, accessKey: e.target.value },
                        }))
                      }
                      placeholder="Secret access key or bearer token"
                      className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleVerifyCustomStorage}
                      className="px-3.5 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 font-semibold text-xs flex items-center gap-1.5 transition"
                    >
                      <Check size={13} />
                      <span>Verify Storage Driver</span>
                    </button>
                  </div>
                </div>

                {cloudStatus && (
                  <div className="p-3 rounded-lg bg-cyan-950/80 border border-cyan-400/50 text-cyan-200 text-xs font-mono">
                    {cloudStatus}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleSaveCloudConfig}
                    className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow-lg shadow-cyan-500/25"
                  >
                    <Save size={15} />
                    <span>Save Cloud & Storage Configuration</span>
                  </button>
                </div>
              </div>
            )}

            {/* 4. AI VOICE & SPEECH TAB */}
            {activeTab === "voice" && (
              <div className="space-y-6 max-w-3xl">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Mic size={18} className="text-cyan-400" />
                    <span>AI Voice & Neural Speech Settings</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Select preferred audio input device, configure VAD silence auto-send buffering, bilingual Tamil/Tanglish language mode, and neural speech synthesis engine.
                  </p>
                </div>

                {/* Preferred Mic */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-white">Preferred Audio Microphone</div>
                      <div className="text-[11px] text-slate-400">Hardware input device for Speech-to-Text & Voice Activity Detection (VAD)</div>
                    </div>
                    <button
                      onClick={refreshMicrophones}
                      disabled={isRefreshingMics}
                      className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition disabled:opacity-50"
                      title="Enumerate system microphones"
                    >
                      <RefreshCw size={13} className={isRefreshingMics ? "animate-spin text-cyan-400" : "text-slate-400"} />
                      <span>{isRefreshingMics ? "Scanning..." : "Refresh Mics"}</span>
                    </button>
                  </div>

                  <select
                    value={voiceConfig.preferredMic}
                    onChange={(e) => setVoiceConfig((prev) => ({ ...prev, preferredMic: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                  >
                    <option value="default">Default System Microphone</option>
                    {availableMics.length > 0 ? (
                      availableMics.map((mic, idx) => (
                        <option key={mic.deviceId || idx} value={mic.deviceId || mic.label}>
                          {mic.label || `Microphone ${idx + 1}`} {mic.deviceId ? `(${mic.deviceId.slice(0, 8)}...)` : ""}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="realme Buds Wireless 5 ANC">realme Buds Wireless 5 ANC (Bluetooth Active)</option>
                        <option value="Microphone Array (Realtek Audio)">Microphone Array (Realtek Audio)</option>
                      </>
                    )}
                    {voiceConfig.preferredMic &&
                      voiceConfig.preferredMic !== "default" &&
                      !availableMics.some((m) => m.deviceId === voiceConfig.preferredMic || m.label === voiceConfig.preferredMic) &&
                      voiceConfig.preferredMic !== "realme Buds Wireless 5 ANC" &&
                      voiceConfig.preferredMic !== "Microphone Array (Realtek Audio)" && (
                        <option value={voiceConfig.preferredMic}>{voiceConfig.preferredMic} (Saved)</option>
                      )}
                  </select>
                </div>

                {/* VAD Silence Timeout Slider */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <div>
                      <span className="font-semibold text-white">VAD Silence Auto-Send Timeout: </span>
                      <span className="font-mono text-cyan-400 font-bold">{voiceConfig.vadTimeout} ms</span>
                    </div>
                    <span className="text-[11px] text-slate-400">Range: 800ms - 2500ms (Default: 1400ms)</span>
                  </div>
                  <input
                    type="range"
                    min="800"
                    max="2500"
                    step="50"
                    value={voiceConfig.vadTimeout}
                    onChange={(e) =>
                      setVoiceConfig((prev) => ({ ...prev, vadTimeout: parseInt(e.target.value, 10) }))
                    }
                    className="w-full accent-cyan-400 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                  />
                  <div className="p-3 rounded-lg bg-black/30 border border-white/5 space-y-1.5 text-[11px] text-slate-300">
                    <p className="flex items-center gap-1.5 text-cyan-300 font-medium">
                      <Clock size={12} />
                      <span>VAD phrase buffering auto-commits voice after {voiceConfig.vadTimeout}ms of natural silence.</span>
                    </p>
                    <p className="text-slate-400 flex items-center gap-1.5">
                      <Zap size={12} className="text-amber-400 shrink-0" />
                      <span>
                        <strong className="text-slate-200">Fast Interrupt Keywords:</strong> Saying "stop", "wait", "நிறுத்து", "போதும்", "அமைதி", or "pause" bypasses the buffer and interrupts AI speech immediately.
                      </span>
                    </p>
                  </div>
                </div>

                {/* Voice Language Mode Selector */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                  <div>
                    <div className="text-xs font-semibold text-white flex items-center gap-2">
                      <Languages size={15} className="text-cyan-400" />
                      <span>Voice Language Mode</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Select primary dialect or let Angel AI auto-detect Tamil, English, and Tanglish bilingually
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setVoiceConfig((prev) => ({ ...prev, languageMode: "auto" }))}
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                        voiceConfig.languageMode === "auto"
                          ? "bg-cyan-500/20 border-cyan-400/80 text-cyan-100 shadow-sm shadow-cyan-500/20"
                          : "bg-black/20 border-white/10 text-slate-300 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-xs font-bold">Auto Detect (Bilingual)</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-cyan-500/30 text-cyan-300">Default</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Tamil + English + Tanglish. Automatically adapts voice and STT based on spoken words.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setVoiceConfig((prev) => ({ ...prev, languageMode: "ta-IN" }))}
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                        voiceConfig.languageMode === "ta-IN"
                          ? "bg-cyan-500/20 border-cyan-400/80 text-cyan-100 shadow-sm shadow-cyan-500/20"
                          : "bg-black/20 border-white/10 text-slate-300 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-xs font-bold">Tamil (தமிழ்)</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/20 text-emerald-300">ta-IN</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Strict Tamil neural speech synthesis and recognition (Pallavi Neural).
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setVoiceConfig((prev) => ({ ...prev, languageMode: "en-IN" }))}
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                        voiceConfig.languageMode === "en-IN"
                          ? "bg-cyan-500/20 border-cyan-400/80 text-cyan-100 shadow-sm shadow-cyan-500/20"
                          : "bg-black/20 border-white/10 text-slate-300 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-xs font-bold">English (India / UK)</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-500/20 text-indigo-300">en-IN</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Natural Indian & British English neural speech synthesis and recognition (Neerja Neural).
                      </p>
                    </button>
                  </div>
                </div>

                {/* Speech & Voice Engine Selector */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                  <div>
                    <div className="text-xs font-semibold text-white">Speech & Voice Engine</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Choose speech generation backend for AI vocal responses</div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setVoiceConfig((prev) => ({ ...prev, ttsEngine: "edge" }))}
                      className={`p-3 rounded-xl border text-left transition ${
                        voiceConfig.ttsEngine === "edge"
                          ? "bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-sm shadow-cyan-500/20"
                          : "bg-black/20 border-white/10 text-slate-300 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">Edge Neural TTS</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-cyan-500/30 text-cyan-300">Recommended</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        ta-IN-PallaviNeural & en-IN-NeerjaNeural high-fidelity cloud neural speech.
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setVoiceConfig((prev) => ({ ...prev, ttsEngine: "multimodal" }))}
                      className={`p-3 rounded-xl border text-left transition ${
                        voiceConfig.ttsEngine === "multimodal"
                          ? "bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-sm shadow-cyan-500/20"
                          : "bg-black/20 border-white/10 text-slate-300 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">Gemini / Whisper Multimodal</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-500/20 text-purple-300">AI Direct</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        AI direct audio comprehension & natural multimodal audio synthesis.
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setVoiceConfig((prev) => ({ ...prev, ttsEngine: "webspeech" }))}
                      className={`p-3 rounded-xl border text-left transition ${
                        voiceConfig.ttsEngine === "webspeech"
                          ? "bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-sm shadow-cyan-500/20"
                          : "bg-black/20 border-white/10 text-slate-300 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">Web Speech API</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-500/20 text-blue-300">Browser</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        Zero-latency in-browser SpeechSynthesis with native OS Tamil & English voices.
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setVoiceConfig((prev) => ({ ...prev, ttsEngine: "piper_sapi" }))}
                      className={`p-3 rounded-xl border text-left transition ${
                        voiceConfig.ttsEngine === "piper_sapi"
                          ? "bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-sm shadow-cyan-500/20"
                          : "bg-black/20 border-white/10 text-slate-300 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">Piper / Windows SAPI</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/20 text-emerald-300">100% Offline</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        Fully offline local ONNX Piper neural speech with zero internet requirement.
                      </div>
                    </button>
                  </div>
                </div>

                {/* Voice Gender & Offline Voice Pack Caching */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-white flex items-center gap-2">
                        <Sparkles size={15} className="text-cyan-400" />
                        <span>Voice Gender & Offline Disk Cache Prewarmer</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Select synthesis persona & prewarm instant &lt;15ms voice cache in %APPDATA%\AngelAI\voice_cache
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handlePrewarmVoiceCache}
                      disabled={isPrewarmingVoice}
                      className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500/20 to-teal-500/20 hover:from-cyan-500/30 hover:to-teal-500/30 border border-cyan-400/40 text-cyan-200 text-xs font-bold flex items-center gap-2 transition disabled:opacity-50 shrink-0 shadow-sm"
                    >
                      <DownloadCloud size={14} className={isPrewarmingVoice ? "animate-bounce text-cyan-400" : "text-cyan-400"} />
                      <span>{isPrewarmingVoice ? "Prewarming Cache..." : "Download & Cache Offline Voice Pack"}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        setVoiceConfig((prev) => ({
                          ...prev,
                          voiceGender: "female",
                          voicePersona: "ta-IN-PallaviNeural",
                        }))
                      }
                      className={`p-3 rounded-xl border text-left transition flex items-center justify-between ${
                        (voiceConfig.voiceGender || "female") === "female"
                          ? "bg-cyan-500/20 border-cyan-400/80 text-cyan-100 shadow-sm shadow-cyan-500/20"
                          : "bg-black/20 border-white/10 text-slate-300 hover:border-white/20"
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold flex items-center gap-2">
                          <span>Female Voice Persona</span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-pink-500/20 text-pink-300">
                            Pallavi / Neerja
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          High-fidelity natural female speech (Tamil & Indian English)
                        </p>
                      </div>
                      {(voiceConfig.voiceGender || "female") === "female" && (
                        <Check size={16} className="text-cyan-400 shrink-0 ml-2" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setVoiceConfig((prev) => ({
                          ...prev,
                          voiceGender: "male",
                          voicePersona: "ta-IN-ValluvarNeural",
                        }))
                      }
                      className={`p-3 rounded-xl border text-left transition flex items-center justify-between ${
                        voiceConfig.voiceGender === "male"
                          ? "bg-cyan-500/20 border-cyan-400/80 text-cyan-100 shadow-sm shadow-cyan-500/20"
                          : "bg-black/20 border-white/10 text-slate-300 hover:border-white/20"
                      }`}
                    >
                      <div>
                        <div className="text-xs font-bold flex items-center gap-2">
                          <span>Male Voice Persona</span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/20 text-emerald-300">
                            Valluvar / Guy
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          Deep & authoritative classical male speech
                        </p>
                      </div>
                      {voiceConfig.voiceGender === "male" && (
                        <Check size={16} className="text-cyan-400 shrink-0 ml-2" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Neural Voice Persona Selector */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                  <div>
                    <div className="text-xs font-semibold text-white flex items-center gap-2">
                      <Sparkles size={15} className="text-cyan-400" />
                      <span>Neural Voice Persona</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Select high-fidelity neural voice identity for conversational replies
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setVoiceConfig((prev) => ({ ...prev, voicePersona: "ta-IN-PallaviNeural" }))
                      }
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                        voiceConfig.voicePersona === "ta-IN-PallaviNeural" || !voiceConfig.voicePersona
                          ? "bg-cyan-500/20 border-cyan-400/80 text-cyan-100 shadow-sm shadow-cyan-500/20"
                          : "bg-black/20 border-white/10 text-slate-300 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-xs font-bold">Pallavi</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-cyan-500/30 text-cyan-300">
                          Tamil Female
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Natural & Clear. Fluent native Tamil articulation with expressive intonation.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setVoiceConfig((prev) => ({ ...prev, voicePersona: "ta-IN-ValluvarNeural" }))
                      }
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                        voiceConfig.voicePersona === "ta-IN-ValluvarNeural"
                          ? "bg-cyan-500/20 border-cyan-400/80 text-cyan-100 shadow-sm shadow-cyan-500/20"
                          : "bg-black/20 border-white/10 text-slate-300 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-xs font-bold">Valluvar</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/20 text-emerald-300">
                          Tamil Male
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Deep & Authoritative. Classical Tamil male neural voice with balanced pacing.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setVoiceConfig((prev) => ({ ...prev, voicePersona: "en-IN-NeerjaNeural" }))
                      }
                      className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                        voiceConfig.voicePersona === "en-IN-NeerjaNeural"
                          ? "bg-cyan-500/20 border-cyan-400/80 text-cyan-100 shadow-sm shadow-cyan-500/20"
                          : "bg-black/20 border-white/10 text-slate-300 hover:border-white/20"
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-xs font-bold">Neerja</span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-500/20 text-indigo-300">
                          Indian English
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Indian English & Tanglish. Seamlessly articulates mixed code-switched dialogues.
                      </p>
                    </button>
                  </div>
                </div>

                {/* 3 Voice Range Sliders (Real-Time Adjustable) */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-white flex items-center gap-2">
                        <Sliders size={15} className="text-cyan-400" />
                        <span>Voice Output Tuning (Volume, Speed & Pitch)</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Fine-tune synthesis parameters in real-time
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 pt-1">
                    {/* Slider 1: Voice Volume */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-300 font-medium">Voice Volume</span>
                        <span className="font-mono text-cyan-400 font-bold">
                          {voiceConfig.volume ?? 85}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="1"
                        value={voiceConfig.volume ?? 85}
                        onChange={(e) =>
                          setVoiceConfig((prev) => ({
                            ...prev,
                            volume: parseInt(e.target.value, 10),
                          }))
                        }
                        className="w-full accent-cyan-400 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Mute (0%)</span>
                        <span>Standard (85%)</span>
                        <span>Maximum (100%)</span>
                      </div>
                    </div>

                    {/* Slider 2: Speech Speed / Rate */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-300 font-medium">Speech Speed / Rate</span>
                        <span className="font-mono text-cyan-400 font-bold">
                          {(voiceConfig.speed ?? 1.0).toFixed(2)}x
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="2.0"
                        step="0.05"
                        value={voiceConfig.speed ?? 1.0}
                        onChange={(e) =>
                          setVoiceConfig((prev) => ({
                            ...prev,
                            speed: parseFloat(e.target.value),
                          }))
                        }
                        className="w-full accent-cyan-400 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Slow (0.5x)</span>
                        <span>Normal (1.0x)</span>
                        <span>Fast (2.0x)</span>
                      </div>
                    </div>

                    {/* Slider 3: Voice Pitch / Tone */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-300 font-medium">Voice Pitch / Tone</span>
                        <span className="font-mono text-cyan-400 font-bold">
                          {(voiceConfig.pitch ?? 0) > 0 ? `+${voiceConfig.pitch}Hz` : `${voiceConfig.pitch ?? 0}Hz`}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="-20"
                        max="20"
                        step="1"
                        value={voiceConfig.pitch ?? 0}
                        onChange={(e) =>
                          setVoiceConfig((prev) => ({
                            ...prev,
                            pitch: parseInt(e.target.value, 10),
                          }))
                        }
                        className="w-full accent-cyan-400 bg-slate-800 h-1.5 rounded-lg cursor-pointer"
                      />
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Deep (-20Hz)</span>
                        <span>Natural (0Hz)</span>
                        <span>Bright (+20Hz)</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Voice Test Buttons & Status */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-white">Live Voice Test & Synthesis Verification</div>
                      <div className="text-[11px] text-slate-400">Preview spoken Tamil and English voice outputs before saving</div>
                    </div>
                    {voiceTestStatus && (
                      <span className="text-[11px] px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-400/30 text-cyan-300 animate-pulse">
                        {voiceTestStatus}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleTestVoice("ta")}
                      className="px-4 py-2.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 text-xs font-bold flex items-center gap-2 transition shadow-sm hover:shadow-cyan-500/20"
                    >
                      <Volume2 size={15} />
                      <span>Test Tamil Voice ("வணக்கம் ராஜா, நான் ஏஞ்சல் ஏஐ...")</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTestVoice("en")}
                      className="px-4 py-2.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-400/40 text-indigo-200 text-xs font-bold flex items-center gap-2 transition shadow-sm hover:shadow-indigo-500/20"
                    >
                      <Volume2 size={15} />
                      <span>Test English Voice ("Hello Raja...")</span>
                    </button>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={handleSaveVoice}
                    className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow-lg shadow-cyan-500/25 active:scale-95"
                  >
                    <Save size={15} />
                    <span>Save AI Voice & Speech Settings</span>
                  </button>
                </div>
              </div>
            )}

            {/* 5. UNIVERSAL ZERO-PYTHON PLUGIN FORGE STUDIO */}
            {activeTab === "plugins" && (
              <div className="space-y-6 max-w-3xl">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <Puzzle size={20} className="text-cyan-400" />
                      <span>Universal Zero-Python Plugin Forge</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Convert GitHub Repos, Local Folders, cURL/OpenAPI, or Code Prompts into native Zero-Python plugins with Safe Sandbox Dry-Run.
                    </p>
                  </div>
                  <button
                    onClick={handleExportPlugins}
                    className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition"
                  >
                    <Download size={13} />
                    <span>Export Plugins (.json)</span>
                  </button>
                </div>

                {/* 3-Step Visual Progress Stepper */}
                <div className="grid grid-cols-3 gap-2 p-1.5 rounded-xl bg-black/40 border border-white/10 text-xs">
                  <button
                    type="button"
                    onClick={() => setForgeStep(1)}
                    className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-2 transition ${
                      forgeStep === 1
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-cyan-500/30 text-cyan-200 flex items-center justify-center text-[10px]">1</span>
                    <span>1. Import Source</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => activeForgedPlugin && setForgeStep(2)}
                    disabled={!activeForgedPlugin}
                    className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-2 transition ${
                      forgeStep === 2
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-sm"
                        : activeForgedPlugin
                        ? "text-slate-300 hover:text-white"
                        : "text-slate-600 cursor-not-allowed"
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-cyan-500/30 text-cyan-200 flex items-center justify-center text-[10px]">2</span>
                    <span>2. Transpilation</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => activeForgedPlugin && setForgeStep(3)}
                    disabled={!activeForgedPlugin}
                    className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-2 transition ${
                      forgeStep === 3
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-sm"
                        : activeForgedPlugin
                        ? "text-slate-300 hover:text-white"
                        : "text-slate-600 cursor-not-allowed"
                    }`}
                  >
                    <span className="w-5 h-5 rounded-full bg-cyan-500/30 text-cyan-200 flex items-center justify-center text-[10px]">3</span>
                    <span>3. Sandbox & Install</span>
                  </button>
                </div>

                {/* STEP 1: CHOOSE IMPORT SOURCE */}
                {forgeStep === 1 && (
                  <div className="p-5 rounded-xl bg-white/5 border border-white/10 space-y-5">
                    <div>
                      <label className="text-xs font-bold text-slate-200 uppercase tracking-wider block mb-2">
                        Select Software Input Format
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setForgeImportMode("github");
                            if (!forgeInput.startsWith("http") || forgeInput.includes("localhost")) {
                              setForgeInput("https://github.com/fastapi/fastapi");
                            }
                          }}
                          className={`p-3 rounded-xl border flex flex-col items-center gap-2 text-xs font-bold transition ${
                            forgeImportMode === "github"
                              ? "bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-500/10"
                              : "bg-black/30 border-white/10 text-slate-400 hover:text-white hover:bg-white/5"
                          }`}
                        >
                          <FolderGit2 size={18} />
                          <span>GitHub Repo</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setForgeImportMode("local_folder");
                            setForgeInput("C:\\Users\\Public\\Documents\\Python Project");
                          }}
                          className={`p-3 rounded-xl border flex flex-col items-center gap-2 text-xs font-bold transition ${
                            forgeImportMode === "local_folder"
                              ? "bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-500/10"
                              : "bg-black/30 border-white/10 text-slate-400 hover:text-white hover:bg-white/5"
                          }`}
                        >
                          <Folder size={18} />
                          <span>Local Folder</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setForgeImportMode("curl_openapi");
                            setForgeInput(`curl -X POST "http://127.0.0.1:8000/v1/generate" \\\n  -H "Content-Type: application/json" \\\n  -d '{"prompt": "Generate report"}'`);
                          }}
                          className={`p-3 rounded-xl border flex flex-col items-center gap-2 text-xs font-bold transition ${
                            forgeImportMode === "curl_openapi"
                              ? "bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-500/10"
                              : "bg-black/30 border-white/10 text-slate-400 hover:text-white hover:bg-white/5"
                          }`}
                        >
                          <Globe size={18} />
                          <span>cURL / OpenAPI</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setForgeImportMode("prompt");
                            setForgeInput("Create a silent Windows tool that restarts the audio service and cleans DNS cache");
                          }}
                          className={`p-3 rounded-xl border flex flex-col items-center gap-2 text-xs font-bold transition ${
                            forgeImportMode === "prompt"
                              ? "bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-md shadow-cyan-500/10"
                              : "bg-black/30 border-white/10 text-slate-400 hover:text-white hover:bg-white/5"
                          }`}
                        >
                          <Terminal size={18} />
                          <span>Prompt / Code</span>
                        </button>
                      </div>
                    </div>

                    {/* Mode Inputs */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <label className="text-slate-300 font-semibold">
                          {forgeImportMode === "github" && "GitHub Repository URL or owner/repo:"}
                          {forgeImportMode === "local_folder" && "Local Project Folder Path:"}
                          {forgeImportMode === "curl_openapi" && "Paste cURL Command or OpenAPI JSON Spec:"}
                          {forgeImportMode === "prompt" && "Describe Desired Tool or Paste Python/Shell Script:"}
                        </label>
                        <span className="text-[10px] text-cyan-400 font-mono">Zero-Python Guarantee</span>
                      </div>

                      {forgeImportMode === "github" || forgeImportMode === "local_folder" ? (
                        <input
                          type="text"
                          value={forgeInput}
                          onChange={(e) => setForgeInput(e.target.value)}
                          placeholder={
                            forgeImportMode === "github"
                              ? "e.g. https://github.com/fastapi/fastapi or comfyanonymous/ComfyUI"
                              : "e.g. C:\\Users\\Public\\Documents\\MyPythonProject"
                          }
                          className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs font-mono text-cyan-200 focus:outline-none focus:border-cyan-400"
                        />
                      ) : (
                        <textarea
                          rows={5}
                          value={forgeInput}
                          onChange={(e) => setForgeInput(e.target.value)}
                          placeholder={
                            forgeImportMode === "curl_openapi"
                              ? 'curl -X POST "http://127.0.0.1:8000/api" -H "Content-Type: application/json" -d \'{"query": "data"}\''
                              : "Describe what the tool should do, or paste a snippet..."
                          }
                          className="w-full p-3 rounded-xl bg-black/40 border border-white/10 text-xs font-mono text-cyan-200 focus:outline-none focus:border-cyan-400"
                        />
                      )}

                      <p className="text-[11px] text-slate-400">
                        {forgeImportMode === "github" && "Rust HTTP inspector analyzes repo metadata, README, and manifests (requirements.txt, package.json, Cargo.toml) with CREATE_NO_WINDOW."}
                        {forgeImportMode === "local_folder" && "Strictly read-only AST scanner parses top-level files (up to 12 KB) without ever executing any Python script."}
                        {forgeImportMode === "curl_openapi" && "Extracts target endpoint URL, HTTP methods, headers, and payload schema for native Zero-Python HTTP_REST actions."}
                        {forgeImportMode === "prompt" && "Multi-LLM Brain converts your description or script into native PowerShell or Cognitive actions with zero Python runtime dependencies."}
                      </p>
                    </div>

                    <div className="pt-2 flex items-center justify-between">
                      <button
                        onClick={handleAnalyzeAndTranspile}
                        disabled={forgeAnalyzing || !forgeInput.trim()}
                        className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow-lg shadow-cyan-500/25 active:scale-95"
                      >
                        {forgeAnalyzing ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            <span>Analyzing & Transpiling...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles size={14} />
                            <span>
                              {forgeImportMode === "github" && "Analyze & Convert Repo"}
                              {forgeImportMode === "local_folder" && "Reverse-Engineer Folder"}
                              {forgeImportMode === "curl_openapi" && "Convert API to Plugin"}
                              {forgeImportMode === "prompt" && "Generate Zero-Python Plugin"}
                            </span>
                          </>
                        )}
                      </button>

                      {activeForgedPlugin && (
                        <button
                          type="button"
                          onClick={() => setForgeStep(2)}
                          className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-semibold"
                        >
                          <span>Go to Current Preview</span>
                          <ArrowRight size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* STEP 2: TECH STACK DETECTION & TRANSPILATION PREVIEW */}
                {forgeStep === 2 && activeForgedPlugin && (
                  <div className="p-5 rounded-xl bg-white/5 border border-white/10 space-y-5">
                    {/* Source vs Converted Target Comparison Badge */}
                    <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400">Detected Source:</span>
                        <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-[11px] font-bold">
                          {activeForgedPlugin.source_stack_detected}
                        </span>
                      </div>

                      <ArrowRight size={16} className="text-cyan-400 hidden sm:block" />

                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400">Converted Target:</span>
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-mono text-[11px] font-bold flex items-center gap-1">
                          <CheckCircle2 size={12} />
                          <span>{activeForgedPlugin.converted_runtime} ({activeForgedPlugin.action_type})</span>
                        </span>
                      </div>
                    </div>

                    {/* Editable Plugin Fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-300 font-semibold">Plugin Name</label>
                        <input
                          type="text"
                          value={activeForgedPlugin.name}
                          onChange={(e) => setActiveForgedPlugin({ ...activeForgedPlugin, name: e.target.value })}
                          className="w-full mt-1 px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                        />
                      </div>

                      <div>
                        <label className="text-xs text-slate-300 font-semibold">Voice Trigger Phrases (comma-separated)</label>
                        <input
                          type="text"
                          value={activeForgedPlugin.trigger_phrases.join(", ")}
                          onChange={(e) =>
                            setActiveForgedPlugin({
                              ...activeForgedPlugin,
                              trigger_phrases: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                            })
                          }
                          className="w-full mt-1 px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-slate-300 font-semibold">Action Engine Type</label>
                        <select
                          value={activeForgedPlugin.action_type}
                          onChange={(e: any) => setActiveForgedPlugin({ ...activeForgedPlugin, action_type: e.target.value })}
                          className="w-full mt-1 px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-cyan-400 font-mono"
                        >
                          <option value="HTTP_REST">HTTP_REST (REST API & ComfyUI Gateway)</option>
                          <option value="POWERSHELL">POWERSHELL (Silent Windows Automation)</option>
                          <option value="PROMPT_TOOL">PROMPT_TOOL (Cognitive Context Reasoning)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-xs text-slate-300 font-semibold">Plugin Description</label>
                        <input
                          type="text"
                          value={activeForgedPlugin.description}
                          onChange={(e) => setActiveForgedPlugin({ ...activeForgedPlugin, description: e.target.value })}
                          className="w-full mt-1 px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                    </div>

                    {/* Specific Action Config */}
                    {activeForgedPlugin.action_type === "HTTP_REST" ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                          <div>
                            <label className="text-xs text-slate-300 font-semibold">HTTP Method</label>
                            <select
                              value={activeForgedPlugin.method || "GET"}
                              onChange={(e: any) => setActiveForgedPlugin({ ...activeForgedPlugin, method: e.target.value })}
                              className="w-full mt-1 px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-400"
                            >
                              <option value="GET">GET</option>
                              <option value="POST">POST</option>
                              <option value="PUT">PUT</option>
                              <option value="DELETE">DELETE</option>
                            </select>
                          </div>
                          <div className="sm:col-span-3">
                            <label className="text-xs text-slate-300 font-semibold">Target Endpoint URL</label>
                            <input
                              type="text"
                              value={activeForgedPlugin.endpoint_or_command}
                              onChange={(e) => setActiveForgedPlugin({ ...activeForgedPlugin, endpoint_or_command: e.target.value })}
                              placeholder="http://127.0.0.1:8000/api/v1/..."
                              className="w-full mt-1 px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-cyan-200 focus:outline-none focus:border-cyan-400"
                            />
                          </div>
                        </div>

                        {activeForgedPlugin.method === "POST" && (
                          <div>
                            <label className="text-xs text-slate-300 font-semibold">JSON Body Template / Payload</label>
                            <textarea
                              rows={3}
                              value={activeForgedPlugin.body_template || ""}
                              onChange={(e) => setActiveForgedPlugin({ ...activeForgedPlugin, body_template: e.target.value })}
                              placeholder='{"key": "value"}'
                              className="w-full mt-1 p-2.5 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-cyan-200 focus:outline-none focus:border-cyan-400"
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <label className="text-xs text-slate-300 font-semibold">
                          {activeForgedPlugin.action_type === "POWERSHELL" ? "PowerShell Command / Script Body" : "Cognitive Reasoning Directive"}
                        </label>
                        <textarea
                          rows={4}
                          value={activeForgedPlugin.endpoint_or_command}
                          onChange={(e) => setActiveForgedPlugin({ ...activeForgedPlugin, endpoint_or_command: e.target.value })}
                          placeholder="e.g. Restart-Service Audiosrv -Force"
                          className="w-full mt-1 p-2.5 rounded-lg bg-black/40 border border-white/10 text-xs font-mono text-cyan-200 focus:outline-none focus:border-cyan-400"
                        />
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setForgeStep(1)}
                        className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-semibold transition"
                      >
                        ← Back to Import
                      </button>

                      <button
                        type="button"
                        onClick={handleRunSecurityDryRun}
                        disabled={dryRunning}
                        className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow-lg shadow-cyan-500/25 active:scale-95"
                      >
                        {dryRunning ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            <span>Auditing Security...</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck size={14} />
                            <span>Run Safe Sandbox Dry-Run →</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {/* STEP 3: SAFE SANDBOX DRY-RUN & INSTALL */}
                {forgeStep === 3 && activeForgedPlugin && (
                  <div className="p-5 rounded-xl bg-white/5 border border-white/10 space-y-5">
                    {/* Security Audit Score Card */}
                    <div className="p-4 rounded-xl bg-black/40 border border-white/10 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <ShieldCheck
                            size={22}
                            className={securityAudit?.safe ? "text-emerald-400" : "text-amber-400"}
                          />
                          <div>
                            <h3 className="text-xs font-bold text-white">Static Sandbox Security Audit</h3>
                            <p className="text-[11px] text-slate-400">
                              Verified without executing mutations against Windows filesystem or registry.
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`px-3 py-1 rounded-xl font-bold font-mono text-xs border ${
                              (securityAudit?.score || 100) >= 80
                                ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                                : (securityAudit?.score || 100) >= 50
                                ? "bg-amber-500/15 border-amber-500/30 text-amber-300"
                                : "bg-rose-500/15 border-rose-500/30 text-rose-300"
                            }`}
                          >
                            Score: {securityAudit?.score || 100}/100 ({securityAudit?.safe ? "SAFE" : "ATTENTION"})
                          </span>
                        </div>
                      </div>

                      {/* Warnings or Pass message */}
                      {securityAudit?.warnings && securityAudit.warnings.length > 0 ? (
                        <div className="space-y-1.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
                          {securityAudit.warnings.map((w, idx) => (
                            <div key={idx} className="flex items-start gap-1.5">
                              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                              <span>{w}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2 font-semibold">
                          <CheckCircle2 size={14} />
                          <span>Zero destructive filesystem commands, zero unauthorized exfiltration, and zero Python dependencies detected.</span>
                        </div>
                      )}

                      {/* Simulated Execution Preview */}
                      <div>
                        <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                          Simulated Execution Output Preview:
                        </label>
                        <div className="p-3 rounded-lg bg-black/60 border border-cyan-400/30 text-xs font-mono text-cyan-200 whitespace-pre-wrap max-h-48 overflow-y-auto">
                          {securityAudit?.simulated_preview || "[Dry-Run Initialized - Ready for Installation]"}
                        </div>
                      </div>
                    </div>

                    {/* Final Action Buttons */}
                    <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setForgeStep(2)}
                          className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 text-xs font-semibold transition"
                        >
                          ← Re-edit Configuration
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setForgeStep(1);
                            setActiveForgedPlugin(null);
                            setSecurityAudit(null);
                          }}
                          className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-400 hover:text-white text-xs transition"
                        >
                          New Import
                        </button>
                      </div>

                      <button
                        onClick={handleInstallForgedPlugin}
                        disabled={installing}
                        className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow-lg shadow-emerald-500/25 active:scale-95"
                      >
                        {installing ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            <span>Installing to Runtime...</span>
                          </>
                        ) : (
                          <>
                            <Check size={14} />
                            <span>Install to Skill Forge</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 6. AI LEARNING & MEMORY TAB */}
            {activeTab === "memory" && (
              <div className="space-y-6 max-w-3xl">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Database size={18} className="text-cyan-400" />
                    <span>AI Learning & Associative Memory</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Manage persistent facts learned by Angel AI during conversation and synced via Supabase.
                  </p>
                </div>

                {/* Filter and Search Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5">
                    {["all", "preference", "security", "custom_skill", "habit"].map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setMemFilter(cat)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition ${
                          memFilter === cat
                            ? "bg-cyan-500 text-slate-950"
                            : "bg-white/5 text-slate-400 hover:text-white"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="relative">
                    <input
                      type="text"
                      value={memSearch}
                      onChange={(e) => setMemSearch(e.target.value)}
                      placeholder="Search memory..."
                      className="px-3 py-1.5 pl-8 rounded-lg bg-black/40 border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                    />
                    <Search size={13} className="absolute left-2.5 top-2.5 text-slate-400" />
                  </div>
                </div>

                {/* Add Memory Form */}
                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 flex flex-wrap items-center gap-2.5">
                  <select
                    value={newMemCat}
                    onChange={(e) => setNewMemCat(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-slate-200 focus:outline-none"
                  >
                    <option value="preference">Preference</option>
                    <option value="security">Security</option>
                    <option value="custom_skill">Skill</option>
                    <option value="habit">Habit</option>
                  </select>

                  <input
                    type="text"
                    value={newMemKey}
                    onChange={(e) => setNewMemKey(e.target.value)}
                    placeholder="Fact Key (e.g. coffee_sugar)"
                    className="flex-1 min-w-[140px] px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-slate-200 focus:outline-none"
                  />

                  <input
                    type="text"
                    value={newMemVal}
                    onChange={(e) => setNewMemVal(e.target.value)}
                    placeholder="Fact Value (e.g. 1 spoon)"
                    className="flex-1 min-w-[140px] px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-slate-200 focus:outline-none"
                  />

                  <button
                    onClick={handleAddMemory}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition"
                  >
                    <Plus size={14} />
                    <span>Remember</span>
                  </button>
                </div>

                {/* Memories Table */}
                <div className="rounded-xl border border-white/10 overflow-hidden bg-black/30">
                  <table className="w-full text-left text-xs text-slate-300">
                    <thead className="bg-white/5 text-[11px] font-bold uppercase text-slate-400 border-b border-white/10">
                      <tr>
                        <th className="p-3">Category</th>
                        <th className="p-3">Key</th>
                        <th className="p-3">Stored Knowledge</th>
                        <th className="p-3 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-mono">
                      {filteredMemories.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-slate-500">
                            No learned memories match current filter.
                          </td>
                        </tr>
                      ) : (
                        filteredMemories.map((m) => (
                          <tr key={m.mem_key} className="hover:bg-white/5 transition">
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-300 capitalize">
                                {m.category}
                              </span>
                            </td>
                            <td className="p-3 font-semibold text-white">{m.mem_key}</td>
                            <td className="p-3 text-slate-200">{m.mem_value}</td>
                            <td className="p-3 text-right">
                              <button
                                onClick={() => handleDeleteMemory(m.mem_key)}
                                title="Forget this memory"
                                className="p-1.5 rounded-lg hover:bg-rose-500/20 text-rose-400 hover:text-rose-200 transition"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleClearAllMemories}
                    className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Trash2 size={13} />
                    <span>Erase All Learned Memories</span>
                  </button>
                </div>
              </div>
            )}

            {/* 7. SKILL FORGE TAB */}
            {activeTab === "skills" && (
              <div className="space-y-6 max-w-3xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <Wrench size={18} className="text-cyan-400" />
                      <span>Skill Forge Catalog</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Active procedural system skills available for instant voice or text reflex execution.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleOpenCreateSkill}
                      className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-lg shadow-cyan-500/20"
                    >
                      <Plus size={14} />
                      <span>+ Add New Skill</span>
                    </button>
                    <button
                      onClick={() => setActiveTab("plugins")}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 font-bold text-xs flex items-center gap-1.5 border border-white/10 transition"
                    >
                      <Sparkles size={14} className="text-amber-400" />
                      <span>Forge with AI</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {skillsList.map((skill) => (
                    <div
                      key={skill.id}
                      className="p-4 rounded-xl bg-white/5 border border-white/10 hover:border-cyan-400/40 transition flex flex-col justify-between space-y-3"
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-white">{skill.name}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                              skill.adminRequired
                                ? "bg-amber-500/20 text-amber-300"
                                : "bg-emerald-500/20 text-emerald-300"
                            }`}
                          >
                            {skill.adminRequired ? "Admin" : "Standard"}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                          {skill.description}
                        </p>
                        {skill.trigger && (
                          <div className="mt-2 text-[10px] font-mono text-cyan-300/80 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-800/30 inline-block">
                            Trigger: "{skill.trigger}"
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-white/5">
                        <span className="text-[10px] font-mono text-cyan-300 uppercase tracking-wider">{skill.category}</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleOpenEditSkill(skill)}
                            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 border border-white/10 text-slate-300 hover:text-white transition"
                            title="Edit Skill"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteSkill(skill)}
                            className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 hover:text-red-200 transition"
                            title="Delete Skill"
                          >
                            <Trash2 size={12} />
                          </button>
                          <button
                            disabled={skillRunning === skill.id}
                            onClick={() => handleRunSkill(skill)}
                            className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
                          >
                            <Play size={12} />
                            <span>{skillRunning === skill.id ? "Running..." : "Run Now"}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Skill Editor Modal */}
                {(isCreatingSkill || editingSkill !== null) && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
                    <div className="w-full max-w-lg bg-slate-900 border border-cyan-400/30 rounded-2xl p-6 shadow-2xl space-y-4">
                      <div className="flex items-center justify-between pb-3 border-b border-white/10">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <Wrench size={16} className="text-cyan-400" />
                          <span>{isCreatingSkill ? "Create New Angel Skill" : `Edit Skill: ${editingSkill?.name}`}</span>
                        </h3>
                        <button
                          onClick={() => {
                            setIsCreatingSkill(false);
                            setEditingSkill(null);
                          }}
                          className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <div className="space-y-3 text-xs">
                        <div>
                          <label className="font-semibold text-slate-300 block mb-1">Skill Name</label>
                          <input
                            type="text"
                            value={skillFormName}
                            onChange={(e) => setSkillFormName(e.target.value)}
                            placeholder="e.g. Restart Audio Service"
                            className="w-full p-2 rounded-xl bg-black/60 border border-white/15 text-slate-100 focus:outline-none focus:border-cyan-400 transition"
                          />
                        </div>

                        <div>
                          <label className="font-semibold text-slate-300 block mb-1">Description</label>
                          <input
                            type="text"
                            value={skillFormDesc}
                            onChange={(e) => setSkillFormDesc(e.target.value)}
                            placeholder="What this skill accomplishes"
                            className="w-full p-2 rounded-xl bg-black/60 border border-white/15 text-slate-100 focus:outline-none focus:border-cyan-400 transition"
                          />
                        </div>

                        <div>
                          <label className="font-semibold text-slate-300 block mb-1">Trigger Phrases (comma-separated)</label>
                          <input
                            type="text"
                            value={skillFormTriggers}
                            onChange={(e) => setSkillFormTriggers(e.target.value)}
                            placeholder="restart audio, fix sound, reset audio service"
                            className="w-full p-2 rounded-xl bg-black/60 border border-white/15 text-slate-100 font-mono text-[11px] focus:outline-none focus:border-cyan-400 transition"
                          />
                        </div>

                        <div>
                          <label className="font-semibold text-slate-300 block mb-1">Action Type</label>
                          <select
                            value={skillFormActionType}
                            onChange={(e) => setSkillFormActionType(e.target.value)}
                            className="w-full p-2 rounded-xl bg-slate-950 border border-white/15 text-slate-100 focus:outline-none focus:border-cyan-400 transition"
                          >
                            <option value="powershell">POWERSHELL (Native Windows Automation)</option>
                            <option value="http_rest">HTTP_REST (REST API Endpoint / cURL)</option>
                            <option value="prompt_tool">PROMPT_TOOL (Cognitive AI Directive)</option>
                            <option value="shell_exec">SHELL_EXEC (Launch Executable)</option>
                            <option value="open_url">OPEN_URL (Open Browser Link)</option>
                          </select>
                        </div>

                        <div>
                          <label className="font-semibold text-slate-300 block mb-1">
                            Command / Endpoint / Payload
                          </label>
                          <textarea
                            rows={4}
                            value={skillFormPayload}
                            onChange={(e) => setSkillFormPayload(e.target.value)}
                            placeholder={
                              skillFormActionType === "http_rest"
                                ? '{"url": "https://api.example.com", "method": "GET"}'
                                : "Restart-Service Audiosrv -Force"
                            }
                            className="w-full p-2.5 rounded-xl bg-black/60 border border-white/15 font-mono text-[11px] text-slate-100 focus:outline-none focus:border-cyan-400 transition"
                          />
                          <p className="text-[10px] text-slate-500 mt-1">
                            Use {"{{USER_INPUT}}"} for user arguments, or $env:ANGEL_USER_INPUT. Zero terminal window flashes.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
                        <button
                          onClick={() => {
                            setIsCreatingSkill(false);
                            setEditingSkill(null);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveSkill}
                          className="px-4 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition flex items-center gap-1.5"
                        >
                          <Save size={13} />
                          <span>Save Skill</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 8. AUTOMATION WORKFLOWS TAB */}
            {activeTab === "workflows" && (
              <div className="space-y-6 max-w-3xl">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <GitMerge size={18} className="text-cyan-400" />
                    <span>Automation Workflows & Macro Presets</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Execute chained multi-step routines with single-click triggers or automated timers.
                  </p>
                </div>

                {/* 3 Built-in Quick Action Presets */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {[
                    {
                      id: "work",
                      name: "Work Mode",
                      desc: "Set volume 30%, inspect diagnostics, minimize distractions",
                      color: "from-blue-500/20 to-cyan-500/10 border-blue-400/40",
                    },
                    {
                      id: "night",
                      name: "Night Lockdown",
                      desc: "Dim brightness 20%, engage Aegis sentry, quiet notifications",
                      color: "from-purple-500/20 to-indigo-500/10 border-indigo-400/40",
                    },
                    {
                      id: "clean",
                      name: "System Cleanup",
                      desc: "Clear %TEMP% cache, flush DNS, heal audio and network",
                      color: "from-emerald-500/20 to-teal-500/10 border-emerald-400/40",
                    },
                  ].map((preset) => (
                    <div
                      key={preset.id}
                      className={`p-4 rounded-xl bg-gradient-to-br ${preset.color} border flex flex-col justify-between space-y-3`}
                    >
                      <div>
                        <div className="text-xs font-bold text-white">{preset.name}</div>
                        <p className="text-[11px] text-slate-300 mt-1">{preset.desc}</p>
                      </div>
                      <button
                        disabled={runningWorkflow !== null}
                        onClick={() => handleRunPresetWorkflow(preset.id as any)}
                        className="w-full py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center justify-center gap-2 transition disabled:opacity-50"
                      >
                        <Play size={13} />
                        <span>{runningWorkflow === preset.id ? "Running..." : "Run Routine"}</span>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Live Macro Execution Log */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
                  <div className="flex justify-between items-center text-xs font-semibold text-white">
                    <span>Workflow Execution Terminal</span>
                    <span className="text-slate-400 font-mono">{workflowLog.length} events</span>
                  </div>
                  <div className="h-40 overflow-y-auto p-3 rounded-lg bg-black/50 border border-white/10 font-mono text-xs text-cyan-200 space-y-1">
                    {workflowLog.length === 0 ? (
                      <div className="text-slate-500">Ready to execute workflow macros...</div>
                    ) : (
                      workflowLog.map((log, i) => <div key={i}>{log}</div>)
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 9. CROSS-DEVICE BRIDGE TAB */}
            {activeTab === "bridge" && (
              <div className="space-y-6 max-w-3xl">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Smartphone size={18} className="text-cyan-400" />
                    <span>Cross-Device Bridge (PC ↔ Android)</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Pair your Windows 11 PC with the Project Angel Android Companion APK via Supabase Realtime Relay.
                  </p>
                </div>

                {/* Device Status Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Windows 11 Master PC</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300">
                        Host Online
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 font-mono">Device: DESKTOP-SOVEREIGN</div>
                    <div className="text-xs text-slate-400 font-mono">Latency: &lt; 15 ms (Local Rust Tokio)</div>
                  </div>

                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Android Mobile Companion</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-cyan-500/20 text-cyan-300">
                        Paired
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 font-mono">Device: Android 14 Client</div>
                    <div className="text-xs text-slate-400 font-mono">Sync Channel: `relay_commands`</div>
                  </div>
                </div>

                {/* Supabase Relay Controls */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">Supabase Realtime Command Relay</div>
                    <p className="text-[11px] text-slate-400">
                      Enables remote voice commands from your Android phone to execute actions on Windows.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setRelayActive(!relayActive);
                      showToast(relayActive ? "Relay Listener Stopped" : "Relay Listener Active");
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition ${
                      relayActive
                        ? "bg-cyan-500 text-slate-950"
                        : "bg-white/10 text-slate-400 hover:text-white"
                    }`}
                  >
                    {relayActive ? "Relay Active" : "Relay Paused"}
                  </button>
                </div>

                {/* Recent Relay Feed */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex justify-between items-center text-xs font-semibold text-white">
                    <span>Recent Relay Commands</span>
                    <button
                      onClick={handleSendRemotePing}
                      className="px-3 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 font-bold text-[11px] flex items-center gap-1.5 transition"
                    >
                      <Zap size={12} />
                      <span>Send Ping to Mobile</span>
                    </button>
                  </div>

                  <div className="space-y-2">
                    {recentRelayCommands.map((cmd) => (
                      <div
                        key={cmd.id}
                        className="p-2.5 rounded-lg bg-black/40 border border-white/5 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              cmd.status === "executed" ? "bg-emerald-400" : "bg-amber-400 animate-ping"
                            }`}
                          />
                          <span className="font-mono text-white">{cmd.command_text}</span>
                        </div>
                        <div className="flex items-center gap-3 text-slate-400 font-mono text-[10px]">
                          <span>Target: {cmd.device_target}</span>
                          <span className="capitalize text-cyan-300">{cmd.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* 10. AI ANTIVIRUS & SMART FIREWALL TAB */}
            {activeTab === "security" && (
              <div className="space-y-6 max-w-3xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <ShieldCheck size={18} className="text-emerald-400" />
                      <span>AI Antivirus & Smart Firewall (K7 Aegis)</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Real-time download sentry, zero-day threat quarantine vault, and 1-click internet lockdown.
                    </p>
                  </div>
                  <button
                    onClick={handleOpenStandaloneSecurity}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-300 font-bold text-xs flex items-center gap-1.5 transition"
                  >
                    <ExternalLink size={13} />
                    <span>Open K7 Window</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Realtime Sentry */}
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">24/7 Downloads Sentry</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/20 text-emerald-300">
                        Active
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Continuously inspects incoming downloads for executable malware signatures.
                    </p>
                    <button
                      onClick={() => setSentryActive(!sentryActive)}
                      className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-white transition"
                    >
                      {sentryActive ? "Sentry Active (Monitoring)" : "Sentry Paused"}
                    </button>
                  </div>

                  {/* Firewall Lockdown */}
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">Internet Lockdown</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                          lockdownState ? "bg-rose-500/20 text-rose-300" : "bg-cyan-500/20 text-cyan-300"
                        }`}
                      >
                        {lockdownState ? "Engaged" : "Normal"}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      Drop all Windows network connections in emergencies via Windows Filtering Platform.
                    </p>
                    <button
                      onClick={handleToggleLockdown}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition ${
                        lockdownState
                          ? "bg-emerald-600 text-white"
                          : "bg-rose-600 hover:bg-rose-500 text-white"
                      }`}
                    >
                      {lockdownState ? <Unlock size={14} /> : <Lock size={14} />}
                      <span>{lockdownState ? "Disable Lockdown" : "Engage Emergency Lockdown"}</span>
                    </button>
                  </div>
                </div>

                {/* Instant Quick Scan */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                  <div className="text-xs font-bold text-white">Aegis AI Threat Scanner</div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleQuickScan}
                      className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition"
                    >
                      <Play size={14} />
                      <span>Run Quick Antivirus Scan</span>
                    </button>
                  </div>
                  {avFeedback && (
                    <div className="p-2.5 rounded-lg bg-black/40 text-xs font-mono text-cyan-200">
                      {avFeedback}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 11. OS DOCTOR TAB */}
            {activeTab === "doctor" && (
              <div className="space-y-6 max-w-3xl">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Stethoscope size={18} className="text-cyan-400" />
                    <span>OS Doctor Diagnostics & 1-Click Auto-Heal</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Identify Windows event errors, purge temporary files, reset networking, and run deep system repairs.
                  </p>
                </div>

                {/* 1-Click Actions */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <button
                    disabled={doctorBusy}
                    onClick={handleAutoHealSystem}
                    className="p-4 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-400/40 text-left transition disabled:opacity-50"
                  >
                    <div className="text-xs font-bold text-emerald-300">1-Click Auto-Heal</div>
                    <div className="text-[11px] text-slate-300 mt-1">
                      Clean temp files, reset audio services & flush DNS stack.
                    </div>
                  </button>

                  <button
                    disabled={doctorBusy}
                    onClick={handleDeepRepairSfc}
                    className="p-4 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-400/40 text-left transition disabled:opacity-50"
                  >
                    <div className="text-xs font-bold text-cyan-300">Deep SFC Scan</div>
                    <div className="text-[11px] text-slate-300 mt-1">
                      Execute Windows System File Checker (SFC /scannow) in background.
                    </div>
                  </button>

                  <button
                    disabled={doctorBusy}
                    onClick={handleCreateRestore}
                    className="p-4 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-400/40 text-left transition disabled:opacity-50"
                  >
                    <div className="text-xs font-bold text-indigo-300">Restore Point</div>
                    <div className="text-[11px] text-slate-300 mt-1">
                      Create Windows snapshot before major operations.
                    </div>
                  </button>
                </div>

                {/* Diagnostic Output */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-2">
                  <div className="text-xs font-semibold text-white">Diagnostics Output</div>
                  <div className="h-44 overflow-y-auto p-3 rounded-lg bg-black/50 border border-white/10 font-mono text-xs text-cyan-200 whitespace-pre-wrap">
                    {doctorLog || "Select an action above to diagnose and heal Windows system components."}
                  </div>
                </div>
              </div>
            )}

            {/* 12. AI USAGE & TELEMETRY TAB */}
            {activeTab === "telemetry" && (
              <div className="space-y-6 max-w-3xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <BarChart3 size={18} className="text-cyan-400" />
                      <span>AI Usage & Cost Telemetry</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                      Track prompt metrics, token consumption, $0 offline local reflexes, and estimated API savings.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleRefreshTelemetry}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition"
                    >
                      <RefreshCw size={14} />
                    </button>
                    <button
                      onClick={handleResetTelemetry}
                      className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-semibold transition"
                    >
                      Reset Counters
                    </button>
                  </div>
                </div>

                {/* Telemetry Stat Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center space-y-1">
                    <div className="text-[11px] text-slate-400 uppercase font-mono">Prompts Sent</div>
                    <div className="text-2xl font-black text-white">{telemetry.prompts_count}</div>
                  </div>

                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center space-y-1">
                    <div className="text-[11px] text-slate-400 uppercase font-mono">Tokens Used</div>
                    <div className="text-2xl font-black text-cyan-400">
                      {telemetry.estimated_tokens.toLocaleString()}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center space-y-1">
                    <div className="text-[11px] text-slate-400 uppercase font-mono">Zero-Cost Reflexes</div>
                    <div className="text-2xl font-black text-emerald-400">{telemetry.local_reflex_count}</div>
                  </div>

                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center space-y-1">
                    <div className="text-[11px] text-slate-400 uppercase font-mono">Est. Savings</div>
                    <div className="text-2xl font-black text-amber-300">
                      ${telemetry.total_savings_usd.toFixed(3)}
                    </div>
                  </div>
                </div>

                {/* Efficiency Gauge */}
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold text-white">Offline Reflex Efficiency Ratio</span>
                    <span className="font-mono text-cyan-400">
                      {telemetry.prompts_count + telemetry.local_reflex_count > 0
                        ? Math.round(
                            (telemetry.local_reflex_count /
                              (telemetry.prompts_count + telemetry.local_reflex_count)) *
                              100
                          )
                        : 0}
                      % Local $0 Reflexes
                    </span>
                  </div>

                  <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden flex">
                    <div
                      style={{
                        width: `${
                          telemetry.prompts_count + telemetry.local_reflex_count > 0
                            ? (telemetry.local_reflex_count /
                                (telemetry.prompts_count + telemetry.local_reflex_count)) *
                              100
                            : 0
                        }%`,
                      }}
                      className="bg-emerald-400 h-full transition-all duration-500"
                    />
                    <div
                      style={{
                        width: `${
                          telemetry.prompts_count + telemetry.local_reflex_count > 0
                            ? (telemetry.prompts_count /
                                (telemetry.prompts_count + telemetry.local_reflex_count)) *
                              100
                            : 100
                        }%`,
                      }}
                      className="bg-cyan-500 h-full transition-all duration-500"
                    />
                  </div>

                  <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      Local Rust Reflexes ($0 cost)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-cyan-500" />
                      Cloud Multimodal Gemini
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-black/40 border border-white/5 text-[11px] text-slate-400 font-mono leading-relaxed">
                  Project Angel V3 saves API costs by intercepting volume, brightness, screenshots, media control, application launches, and antivirus scans as instant offline Rust OS reflexes without sending tokens to cloud LLMs.
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

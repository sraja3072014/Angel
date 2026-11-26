# ✦ PROJECT ANGEL V3 — Sovereign Desktop AI & Security Operating Layer

[![Tauri v2](https://img.shields.io/badge/Tauri-v2.0-24C8D8?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app/)
[![React 19](https://img.shields.io/badge/React-19.1-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Rust Backend](https://img.shields.io/badge/Rust-MSVC_2024-DEA584?style=for-the-badge&logo=rust&logoColor=black)](https://www.rust-lang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-WebGL_3D-000000?style=for-the-badge&logo=threedotjs&logoColor=white)](https://threejs.org/)
[![Memory Footprint](https://img.shields.io/badge/RAM_Usage-%3C35_MB-00E676?style=for-the-badge&logo=speedtest&logoColor=white)](#)
[![Binary Size](https://img.shields.io/badge/Release_Binary-4.7_MB-7C4DFF?style=for-the-badge&logo=windows&logoColor=white)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-F50057?style=for-the-badge)](LICENSE)

> **Author:** Subramaniam Raja (`sraja3072014`)  
> **Repository:** [https://github.com/sraja3072014/Angel.git](https://github.com/sraja3072014/Angel.git)  
> **Platform:** Windows 11 / Windows 10 (with Cross-Platform Mobile Android Companion)

---

## 1. Project Overview & Architecture

**Project Angel V3** is an ultra-fast, sovereign desktop AI operating layer designed to replace heavy electron-based assistants. Built from the ground up on **Tauri v2 (Rust MSVC)** and **React 19**, Angel executes OS actions, monitors files, inspects network sockets, and speaks naturally in **English, Tamil, and Tanglish** with zero console window flashing (`CREATE_NO_WINDOW = 0x08000000`).

### 💎 Core Architectural Pillars
- **Ultra-Low Resource Footprint**: Consumes **< 35 MB RAM** at idle. The release executable is compiled with Link-Time Optimization (`lto = true`, `strip = true`) yielding a **4.7 MB `.exe`** and a **2.9 MB NSIS installer**.
- **Crystal-Clear 3D Hologram HUD**: Powered by Three.js WebGL rendering a photorealistic 3D Satellite Earth Globe with night-side city lights, specular oceans, and cloud rotation that reacts to voice synthesis and listening states.
- **Global Instant Summon (`Alt + Space`)**: Registered directly in the Windows kernel through a native Win32 `RegisterHotKey` message loop, summoning or hiding the interface instantly from anywhere in the OS without latency.
- **Dual Neural Voice Engine**: Online synthesis powered by Gemini Multimodal Audio and Microsoft Edge Neural Tamil (`ta-IN-PallaviNeural`), with offline fallback to Piper ONNX (`en_US-lessac-medium.onnx`) and Windows SAPI.
- **Screen Vision AI**: Real-time in-RAM screen capture (JPEG max 1280px) analyzed by Gemini Multimodal models with zero temporary files written to disk.
- **Aegis AI Security Sentinel**: 24/7 background folder watcher, heuristic malware scanner, isolated quarantine vault, and interactive active network app firewall blocker.

---

### 🚀 Latest Architecture & Feature Update (Nov 26, 2026)

- **100% Zero-Python Native Stack**: Powered strictly by **Tauri v2 + Rust**, **React 19 + TypeScript**, **Tailwind CSS**, **Three.js**, and **Lucide Icons** with `CREATE_NO_WINDOW = 0x08000000` on all Windows child processes (zero terminal flashes) and app-wide invisible scrollbars (`scrollbar-width: none`, `::-webkit-scrollbar { display: none }`).
- **Clean 6-Section Menu Control Center**:
  1. **General**: Personal assistant profile, custom Boss greeting, Daily Briefing & Smart Reminders, Wellness Break Timer (`30m / 45m / 60m / Off`), live logs, and 2D Animated Companion Engine (8 states, lip-sync, cursor tracking).
  2. **AI Brain**: Structured 2-table provider hub separating **Online Brain (Cloud Heavy Engine)** (`Antigravity`, `Google Gemini`, `DeepSeek`, `Groq`, `Anthropic Claude`, `GitHub Copilot`, `OpenRouter`, `OpenAI / Codex`) from **Offline & Local Engine** (`Ollama`, `FreeLLMAPI`, `Local LLM`), with Smart Auto-Routing and live verified model sync.
  3. **Avatar & Voice**: Natural-paced Tamil / Tanglish / English neural & Web Speech synthesis with clause-aware breathing pauses, VAD mic tuning, and voice persona controls.
  4. **CyberShield**: Native **Angel CyberShield** CyberSecurity & OS Doctor window with folder/drive threat scanner, quarantine vault, and firewall lockdown.
  5. **Tools**: Installed MCP & Zero-Python tools, GitHub-to-Tool converter, and Smart Project Tool Advisor.
  6. **Settings & Support**: 8 organized sub-tabs for **Windows Options**, **Themes** (`Windows 11 Acrylic` / `Dark Glassmorphism`, `4 Interactive Three.js Cores` with unified `0.5x–1.8x` scale control), **Language** (`English / தமிழ்`), **Multi-Cloud** (Supabase + On-Demand GitHub Backup), **AI Memory**, **Cross-Device**, **AI Usage & Cost**, and **Support & Diagnostics**.
- **Dashboard & Universal Autonomous Agent**: Clean HUD header/sidebar, working Global Search, bottom User Profile auth, structured Library category boxes (`Images`, `2D Work`, `3D Work`, `Animation Work`, `3D Workspace`), inline **Weather & Reminders / Code Builder / App Co-Pilot** action cards, and a 4-tool **Universal Autonomous Agent** (`exec_shell`, `read_file`, `write_file`, `ui_action`) with live step pills.

---

## 2. Quick Start & Installation

### Prerequisites
1. **Node.js**: v18.0.0 or higher ([Download Node.js](https://nodejs.org/))
2. **Rust & Cargo**: Latest stable toolchain targeting `x86_64-pc-windows-msvc` ([Install Rust](https://rustup.rs/))
3. **Microsoft C++ Build Tools**: Visual Studio 2022 Build Tools with Desktop development with C++
4. **WebView2**: Built into Windows 11/10

### Clone & Run Development Mode
```powershell
# 1. Clone repository
git clone https://github.com/sraja3072014/Angel.git
cd Angel

# 2. Install dependencies
npm install

# 3. Launch live development environment
npm run tauri dev
```

### Production Release Build (~4.7 MB Executable & NSIS Installer)
```powershell
# Builds optimized frontend and compiles release binary with LTO
npm run tauri build
```
- Standalone Executable: `src-tauri/target/release/project_angel_tauri.exe` (4.71 MB)
- Setup Installer: `src-tauri/target/release/bundle/nsis/Angel AI_2.0.0_x64-setup.exe` (2.95 MB)

---

## 3. First-Time Configuration (Vertical Control Center)

Click the **Settings** button at the top-right corner of the Angel HUD to configure the five core subsystems:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ✦ CONTROL CENTER (SETTINGS DRAWER)                                          │
├─────────────────────┬───────────────────────────────────────────────────────┤
│ ⚙️ Configuration    │ Cloud Brain API Keys, Supabase Sync & Auto-Start      │
│ 🛡️ AI Antivirus     │ Co-Pilot / Standalone Sentinel & Live Network Blocker │
│ 🎙️ Voice & Audio    │ Mic Device, Real-Time VAD, "Hey Angel" Wake Word      │
│ 🩺 OS Doctor        │ Windows Error Diagnostics, Self-Healing & SFC Repair │
│ 🔨 Skill Forge      │ Dynamic Plugin Builder & Hot-Reloaded Automation      │
└─────────────────────┴───────────────────────────────────────────────────────┘
```

### 1. Configuration Tab
- **Gemini API Key**: Enter your Google AI Studio key (`AIzaSy...`). Keys are stored strictly in browser `localStorage` and memory—never hardcoded.
- **Supabase Project URL & Anon Key**: Connects your sovereign memory vault. Click **Save Settings & Sync Supabase** to bidirectionally sync learned facts.
- **Windows Auto-Start**: Click **Enable Windows Auto-Start** to register Angel in `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.

### 2. AI Antivirus & Smart Firewall Tab
- **Protection Mode**: Select between *Co-Pilot Mode* (coexists with Windows Defender) or *Standalone Shield Mode*.
- **Quick Malware Scan**: Scans Downloads, Desktop, and Temp directories for obfuscated scripts or suspicious executables.
- **Scan Live Network Apps**: Inspects live TCP connections and lists all active processes. Click **Block Internet** to permanently add an outbound blocking rule in Windows Firewall.
- **Emergency Internet Lockdown**: Instantly severs all outbound internet connections if malware activity is suspected.

### 3. Voice & Audio Tab
- **Microphone Selection**: Choose your preferred input device (e.g., Bluetooth headsets with ANC).
- **Voice Activity Detection (VAD)**: Real-time `AnalyserNode` automatically cuts off recording **1.25 seconds** after you stop speaking.
- **Hands-Free Wake Word**: Toggle the `"Hey Angel"` background listener on the main HUD or in settings.
- **File Voice Input**: Click the **WAV/MP3** button to feed pre-recorded voice commands directly into the engine.

### 4. OS Doctor Tab
- **Scan Windows System Error Logs**: Diagnoses recent critical events from `System` and `Application` logs via `wevtutil`.
- **Auto-Heal Audio, DNS & Temp Cache**: Restarts `Audiosrv`, flushes DNS cache (`ipconfig /flushdns`), and cleans `%TEMP%`.
- **Deep System Repair**: Executes native Windows `SFC /scannow` in the background with zero command prompt window popup.
- **Autonomous Watchdogs**: Schedule automatic temp-cleaning every 3 hours or alert when RAM exceeds 85%.

### 5. Skill Forge Tab
- View dynamic plugins generated on the fly. To teach Angel a new capability, simply state: *"Create a new skill to..."*

---

## 4. Master Voice & Text Command Cheat Sheet

Angel accepts natural language in **English, Tamil, and Tanglish**. You can speak through the microphone or type into the input bar.

### Global Hotkeys & Persistence
| Action | Key / Action | Description |
| :--- | :--- | :--- |
| **Summon / Hide HUD** | `Alt + Space` | Instant global toggle from anywhere in Windows 11 |
| **Minimize to Tray** | Click `X` Button | Minimizes window while keeping the 24/7 background sentinel running |
| **System Tray Menu** | Right-Click Tray Icon | Access HUD, Run Antivirus Scan, Toggle Lockdown, or Quit |

---

### System & Media Automation Commands
| Category | English Command Example | Tamil / Tanglish Command Example |
| :--- | :--- | :--- |
| **Volume Control** | *"Set volume to 80%"* | *"வால்யூமை 70 ஆக்கு"* / *"Sound குறை"* |
| **Mute / Unmute** | *"Mute system audio"* | *"ஆடியோவை மியூட் செய்"* |
| **Brightness** | *"Set screen brightness to 90%"* | *"பிரைட்னஸ் 50% வை"* |
| **Media Playback** | *"Play media"* / *"Next track"* | *"பாட்டை நிறுத்து"* / *"அடுத்த பாடல்"* |
| **Screenshot** | *"Take a desktop screenshot"* | *"ஸ்கிரீன்ஷாட் எடு"* |
| **File Search** | *"Search files for invoice"* | *"என் ரெஸ்யூம் ஃபைலைத் தேடு"* |
| **App Launcher** | *"Open Notepad"* / *"Open Calculator"* | *"நோட்பேட் திற"* / *"கால்குலேட்டர் ஓபன் பண்ணு"* |
| **Browser & Music** | *"Open Firefox and play Tamil melody songs"* | *"Firefox-ல் இளையராஜா பாடல்கள் போடு"* |

---

### Multi-Action Chained Commands
Angel executes complex multi-step pipelines sequentially from a single sentence:

```text
User: "Set volume to 80%, take a screenshot, and open Firefox with YouTube"
Angel: "Sure Raja, adjusting volume to 80%, capturing your screen, and launching Firefox with YouTube now."
[ACTION:SET_VOLUME|80] ➔ [ACTION:SCREENSHOT] ➔ [ACTION:OPEN_TARGET|firefox https://www.youtube.com]
```

```text
User: "வால்யூமை 60% ஆக்கி நோட்பேடைத் திற"
Angel: "சரி ராஜா, ஒலியளவை 60% ஆக மாற்றி Notepad-ஐ திறக்கிறேன்."
[ACTION:SET_VOLUME|60] ➔ [ACTION:OPEN_TARGET|notepad]
```

---

### Screen Vision AI ("Look at my screen")
| Intent | Voice / Text Command | Action Performed |
| :--- | :--- | :--- |
| **Analyze Screen** | *"Look at my screen right now"* | Captures RAM screenshot & describes active window |
| **Diagnose Errors** | *"What error is on my screen?"* | Reads error dialog text and provides actionable fixes |
| **Summarize Page** | *"Summarize this document on my screen"* | Synthesizes open document contents into bullet points |
| **Quick Button** | Click **Vision** button beside input bar | Instant visual capture and multimodal analysis |

---

### AI Antivirus & Smart Firewall Commands
| Capability | Voice / Text Command | Result |
| :--- | :--- | :--- |
| **Malware Scan** | *"Run system scan"* / *"மால்வேர் ஸ்கேன் செய்"* | Scans target folders for suspicious scripts & temp exes |
| **Firewall Status** | *"Check firewall status"* | Reports open TCP connections and active policies |
| **Internet Lockdown** | *"Lockdown mode"* / *"இணையத்தை நிறுத்து"* | Cuts off all outbound internet traffic |
| **Restore Internet** | *"Unlock internet"* / *"இணையத்தை அனுமதி"* | Restores normal outbound traffic |
| **Quarantine Threat** | Click **Quarantine Now** on alert card | Moves threat file to isolated `.angel_quarantine` vault |

---

### Self-Learning Memory & Skill Forge
| Function | Voice Command Example | Behavior |
| :--- | :--- | :--- |
| **Teach Rule** | *"Remember that my primary monitor is 4K"* | Persists fact to RAM and syncs to Supabase |
| **Recall Facts** | *"What do you know about my setup?"* | Retrieves all stored facts from memory vault |
| **Forge Plugin** | *"Create a new skill to clear DNS cache on 'flush dns'"* | Writes safe PowerShell micro-skill JSON & registers trigger |

---

## 5. Troubleshooting & Privacy Notes

### Administrator Elevation
- Features such as **Windows Firewall policy changes**, **DNS flushing**, and **SFC repair** require elevated privileges.
- Project Angel embeds an execution manifest requesting administrator permissions when required, ensuring commands execute without access denied errors.

### Zero-Flashing Terminal Policy
- All background commands (`powershell`, `cmd`, `netsh`, `wevtutil`, `sc`) are executed via Rust's `CommandExt` with creation flag `CREATE_NO_WINDOW = 0x08000000`. No black console windows will pop up during use.

### Privacy & Data Protection
- **No Telemetry or Third-Party Tracking**: Angel communicates exclusively with your configured Gemini API key and Supabase project.
- **Zero Disk Audio Clutter**: Voice recordings and Screen Vision captures are held temporarily in streaming memory buffers and discarded after processing.
- **Offline Security Sentinel**: The 24/7 Aegis folder watcher operates completely offline using native SHA-256 hash checks and heuristic signature rules.

---

## 6. Project Structure

```
Project_Angel_Tauri/
├── src/
│   ├── components/
│   │   ├── HoloEarthStage.tsx      # Three.js 3D Hologram Satellite Earth Globe
│   │   └── SettingsDrawer.tsx       # Vertical 5-Tab System Control Center
│   ├── services/
│   │   ├── cloudBrain.ts           # Gemini Streaming, Multimodal Vision & Supabase Sync
│   │   └── voiceEngine.ts          # Web Audio API VAD, Neural TTS & Wake Word
│   ├── App.tsx                     # Main Glassmorphic Translucent HUD
│   └── main.tsx                    # React 19 Entrypoint
├── src-tauri/
│   ├── src/
│   │   ├── aegis_av.rs             # 24/7 AI Antivirus Watcher & Quarantine Vault
│   │   ├── os_automation.rs        # Volume, Screen Brightness, Screenshot & Vision
│   │   ├── os_doctor.rs            # Windows Diagnostics, Self-Healing & SFC Repair
│   │   ├── plugin_forge.rs         # Dynamic Skill Forge Engine
│   │   ├── scheduler.rs            # Autonomous 60s Background Watchdog Ticker
│   │   ├── smart_firewall.rs       # Active Socket Inspector & App Blocker
│   │   ├── voice_bridge.rs         # Offline SAPI & Piper TTS Bridge
│   │   └── lib.rs                  # Tray Icon, Win32 Alt+Space Hotkey & Handlers
│   ├── Cargo.toml                  # Release LTO profile optimizations
│   └── tauri.conf.json             # Tauri v2 bundle configuration
├── public/                         # Satellite textures (satellite, clouds, lights)
└── README.md                       # Comprehensive User Manual
```

---

*Project Angel V3 — Crafted with passion by Subramaniam Raja (`sraja3072014`).*

use serde::{Deserialize, Serialize};
use std::fs;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use sysinfo::{Disks, System};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchedFile {
    pub name: String,
    pub path: String,
    pub size_kb: u64,
    pub extension: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemTelemetry {
    pub cpu_percent: f32,
    pub ram_used_mb: f64,
    pub ram_total_mb: f64,
    pub ram_percent: f32,
    pub disk_free_gb: f64,
    pub disk_total_gb: f64,
    pub battery_percent: Option<u32>,
    pub is_charging: bool,
}

/// 1. Comprehensive System Master Volume Control (Mute, Unmute, Up, Down, or 0-100%)
#[tauri::command]
pub fn control_system_volume(action: String, level: Option<u32>) -> Result<String, String> {
    let act = action.to_lowercase();

    // If an explicit level is provided or action is a number/set
    if let Some(target_level) = level {
        return apply_volume_percentage(target_level);
    }

    if let Ok(num) = act.parse::<u32>() {
        return apply_volume_percentage(num);
    }

    match act.as_str() {
        "mute" => {
            send_vk_key(173)?;
            Ok("🔇 System audio muted.".to_string())
        }
        "unmute" => {
            send_vk_key(173)?;
            Ok("🔊 System audio unmuted.".to_string())
        }
        "up" | "volume_up" | "increase" => {
            // Send volume up twice for a tangible boost
            send_vk_key(175)?;
            send_vk_key(175)?;
            Ok("🔊 Master volume increased.".to_string())
        }
        "down" | "volume_down" | "decrease" => {
            send_vk_key(174)?;
            send_vk_key(174)?;
            Ok("🔉 Master volume decreased.".to_string())
        }
        _ => {
            // Default to 50 if unable to parse
            apply_volume_percentage(50)
        }
    }
}

/// Backwards-compatible wrapper for set_system_volume
#[tauri::command]
pub fn set_system_volume(level_percent: u32) -> Result<String, String> {
    control_system_volume("set".to_string(), Some(level_percent))
}

fn apply_volume_percentage(level_percent: u32) -> Result<String, String> {
    let safe_level = level_percent.min(100);
    let ps = format!(
        r#"
        $vol = [Math]::Max(0, [Math]::Min(100, {}));
        Add-Type -TypeDefinition @'
        using System;
        using System.Runtime.InteropServices;
        [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IAudioEndpointVolume {{
            int f1(); int f2(); int f3(); int f4(); int f5(); int f6(); int f7();
            int SetMasterVolumeLevelScalar(float fLevel, Guid pguidEventContext);
        }}
        [Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDevice {{
            int Activate(ref Guid id, int clsCtx, int activationParams, out IAudioEndpointVolume aev);
        }}
        [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        interface IMMDeviceEnumerator {{
            int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
        }}
        [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumeratorComObject {{ }}
        public class AudioHelper {{
            public static void SetVolume(float level) {{
                try {{
                    var enumerator = new MMDeviceEnumeratorComObject() as IMMDeviceEnumerator;
                    IMMDevice dev = null;
                    enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
                    var iid = typeof(IAudioEndpointVolume).GUID;
                    IAudioEndpointVolume epv = null;
                    dev.Activate(ref iid, 23, 0, out epv);
                    epv.SetMasterVolumeLevelScalar(level / 100.0f, Guid.Empty);
                }} catch {{}}
            }}
        }}
        '@
        [AudioHelper]::SetVolume($vol)
        "#,
        safe_level
    );

    let _ = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;

    Ok(format!("🔊 Master Volume set to {}%", safe_level))
}

/// 2. Set Screen Brightness (0-100%)
#[tauri::command]
pub fn set_screen_brightness(percent: u32) -> Result<String, String> {
    let safe_brightness = percent.min(100);
    let ps = format!(
        "(Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction SilentlyContinue) | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{{ Timeout = 1; Brightness = {} }}",
        safe_brightness
    );

    let _ = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;

    Ok(format!("🔆 Screen brightness adjusted to {}%", safe_brightness))
}

/// 3. Media Controls (Play/Pause, Next, Previous)
#[tauri::command]
pub fn control_media_playback(action: String) -> Result<String, String> {
    let act = action.to_lowercase();
    let (code, label) = match act.as_str() {
        "play_pause" | "play" | "pause" | "toggle" => (179, "Play/Pause"),
        "next" | "forward" | "skip" => (176, "Next Track"),
        "prev" | "previous" | "back" => (177, "Previous Track"),
        "stop" => (178, "Stop"),
        _ => return Err(format!("Unknown media action: {}", action)),
    };

    send_vk_key(code)?;
    Ok(format!("🎵 Media: {}", label))
}

/// Backwards-compatible wrapper for media_control
#[tauri::command]
pub fn media_control(action: String) -> Result<String, String> {
    match action.to_lowercase().as_str() {
        "mute" | "volume_up" | "volume_down" => control_system_volume(action, None),
        _ => control_media_playback(action),
    }
}

fn send_vk_key(char_code: u32) -> Result<(), String> {
    let ps = format!(
        "$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys([char]{})",
        char_code
    );

    let _ = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// 4. Capture Desktop Screenshot directly to Pictures\Angel_Screenshots
#[tauri::command]
pub fn take_desktop_screenshot() -> Result<String, String> {
    let user_profile = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\Default".to_string());
    let target_dir = PathBuf::from(user_profile).join("Pictures").join("Angel_Screenshots");
    let _ = fs::create_dir_all(&target_dir);

    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    let file_path = target_dir.join(format!("Angel_Shot_{}.png", timestamp));

    let ps = format!(
        r#"
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
        $graphics = [System.Drawing.Graphics]::FromImage($bmp)
        $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
        $bmp.Save('{}', [System.Drawing.Imaging.ImageFormat]::Png)
        $graphics.Dispose()
        $bmp.Dispose()
        "#,
        file_path.display().to_string().replace('\'', "''")
    );

    let output = Command::new("powershell")
        .args(["-NoProfile", "-Command", &ps])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() && file_path.exists() {
        Ok(format!("📸 Screenshot saved to Pictures\\Angel_Screenshots\\Angel_Shot_{}.png", timestamp))
    } else {
        Err("Failed to capture screenshot".to_string())
    }
}

/// Backwards-compatible wrapper for capture_screen_to_pictures
#[tauri::command]
pub fn capture_screen_to_pictures() -> Result<String, String> {
    take_desktop_screenshot()
}

/// Screen Vision: Capture primary screen in RAM, downscaled to max width 1280px JPEG, returns Base64 (zero disk writes)
#[tauri::command]
pub fn capture_screen_base64() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let ps = r#"
        Add-Type -AssemblyName System.Windows.Forms
        Add-Type -AssemblyName System.Drawing
        $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
        $graphics = [System.Drawing.Graphics]::FromImage($bmp)
        $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)

        $maxWidth = 1280
        if ($bounds.Width -gt $maxWidth) {
            $scale = $maxWidth / $bounds.Width
            $newWidth = $maxWidth
            $newHeight = [int]($bounds.Height * $scale)
            $resized = New-Object System.Drawing.Bitmap $newWidth, $newHeight
            $rg = [System.Drawing.Graphics]::FromImage($resized)
            $rg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $rg.DrawImage($bmp, 0, 0, $newWidth, $newHeight)
            $rg.Dispose()
            $targetBmp = $resized
            $bmp.Dispose()
        } else {
            $targetBmp = $bmp
        }

        $ms = New-Object System.IO.MemoryStream
        $targetBmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Jpeg)
        $base64 = [Convert]::ToBase64String($ms.ToArray())
        $ms.Dispose()
        $targetBmp.Dispose()
        $graphics.Dispose()
        [Console]::Write($base64)
        "#;

        let output = Command::new("powershell")
            .args(["-NoProfile", "-Command", ps])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| e.to_string())?;

        if output.status.success() {
            let b64 = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !b64.is_empty() {
                return Ok(b64);
            }
        }
        Err("Failed to capture in-memory screen".to_string())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Screen capture is only supported on Windows host".to_string())
    }
}

/// 5. Fast Search User Files across Desktop, Downloads, and Documents
#[tauri::command]
pub fn search_user_files(
    keyword: Option<String>,
    query: Option<String>,
    search_dir: Option<String>,
) -> Vec<MatchedFile> {
    let term = keyword.or(query).unwrap_or_default().to_lowercase().trim().to_string();
    if term.is_empty() {
        return Vec::new();
    }

    let user_profile = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\Default".to_string());
    let mut search_paths = Vec::new();

    if let Some(dir) = search_dir {
        search_paths.push(PathBuf::from(dir));
    } else {
        search_paths.push(PathBuf::from(&user_profile).join("Desktop"));
        search_paths.push(PathBuf::from(&user_profile).join("Downloads"));
        search_paths.push(PathBuf::from(&user_profile).join("Documents"));
    }

    let mut matches = Vec::new();

    for base in search_paths {
        if !base.exists() {
            continue;
        }
        scan_dir_for_files(&base, &term, &mut matches, 0, 3);
        if matches.len() >= 15 {
            break;
        }
    }

    matches
}

fn scan_dir_for_files(dir: &Path, query: &str, matches: &mut Vec<MatchedFile>, depth: u32, max_depth: u32) {
    if depth > max_depth || matches.len() >= 15 {
        return;
    }

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(file_name) = path.file_name().and_then(|n| n.to_str()) {
                    if file_name.to_lowercase().contains(query) {
                        let size_kb = entry.metadata().map(|m| m.len() / 1024).unwrap_or(0);
                        let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_string();
                        matches.push(MatchedFile {
                            name: file_name.to_string(),
                            path: path.to_string_lossy().to_string(),
                            size_kb,
                            extension: ext,
                        });
                        if matches.len() >= 15 {
                            return;
                        }
                    }
                }
            } else if path.is_dir() {
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if !name.starts_with('.') && !name.eq_ignore_ascii_case("node_modules") && !name.eq_ignore_ascii_case("target") {
                        scan_dir_for_files(&path, query, matches, depth + 1, max_depth);
                    }
                }
            }
        }
    }
}

/// 6. System Telemetry (CPU, RAM, Disks, Battery)
#[tauri::command]
pub fn get_system_telemetry() -> SystemTelemetry {
    let mut sys = System::new_all();
    sys.refresh_all();

    let cpu_percent = sys.global_cpu_usage();
    let ram_used = (sys.used_memory() as f64) / (1024.0 * 1024.0);
    let ram_total = (sys.total_memory() as f64) / (1024.0 * 1024.0);
    let ram_percent = if ram_total > 0.0 {
        ((ram_used / ram_total) * 100.0) as f32
    } else {
        0.0
    };

    let disks = Disks::new_with_refreshed_list();
    let mut disk_free = 0.0;
    let mut disk_total = 0.0;
    for disk in &disks {
        disk_free += (disk.available_space() as f64) / (1024.0 * 1024.0 * 1024.0);
        disk_total += (disk.total_space() as f64) / (1024.0 * 1024.0 * 1024.0);
    }

    // Battery status via PowerShell (instant query, hidden window)
    let battery_ps = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "(Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue) | Select-Object -Property EstimatedChargeRemaining, BatteryStatus | ConvertTo-Json -Compress",
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .output();

    let mut battery_percent = None;
    let mut is_charging = false;

    if let Ok(out) = battery_ps {
        let json_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&json_str) {
            if let Some(pct) = val.get("EstimatedChargeRemaining").and_then(|v| v.as_u64()) {
                battery_percent = Some(pct as u32);
            }
            if let Some(status) = val.get("BatteryStatus").and_then(|v| v.as_u64()) {
                is_charging = status == 2 || status == 6 || status == 7 || status == 8;
            }
        }
    }

    SystemTelemetry {
        cpu_percent,
        ram_used_mb: (ram_used * 10.0).round() / 10.0,
        ram_total_mb: (ram_total * 10.0).round() / 10.0,
        ram_percent: (ram_percent * 10.0).round() / 10.0,
        disk_free_gb: (disk_free * 10.0).round() / 10.0,
        disk_total_gb: (disk_total * 10.0).round() / 10.0,
        battery_percent,
        is_charging,
    }
}

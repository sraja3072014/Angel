use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveWindowInfo {
    pub app_name: String,
    pub process_name: String,
    pub window_title: String,
    pub context_hint: String,
}

fn allowed_root_dirs() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        roots.push(cwd);
    }
    if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
        let base = PathBuf::from(home);
        roots.push(base.join("Documents"));
        roots.push(base.join("Desktop"));
        roots.push(base.join("Downloads"));
    }
    roots
}

fn validate_safe_path(raw_path: &str) -> Result<PathBuf, String> {
    let target = Path::new(raw_path);
    let canonical = if target.exists() {
        fs::canonicalize(target).map_err(|e| format!("Invalid path: {e}"))?
    } else if let Some(parent) = target.parent() {
        let can_parent = fs::canonicalize(parent).map_err(|e| format!("Invalid parent directory: {e}"))?;
        let file_name = target.file_name().ok_or("Missing filename")?;
        can_parent.join(file_name)
    } else {
        return Err("Invalid path".to_string());
    };

    let allowed = allowed_root_dirs();
    let is_allowed = allowed.iter().any(|root| {
        if let Ok(can_root) = fs::canonicalize(root) {
            canonical.starts_with(&can_root)
        } else {
            false
        }
    });

    if !is_allowed {
        return Err("Access denied: Path is outside allowed workspace or user directories (Documents/Desktop/Downloads).".to_string());
    }
    Ok(canonical)
}

#[tauri::command]
pub fn os_read_safe_file(path: String) -> Result<String, String> {
    let safe_path = validate_safe_path(&path)?;
    let meta = fs::metadata(&safe_path).map_err(|e| format!("Metadata error: {e}"))?;
    if meta.len() > 2 * 1024 * 1024 {
        return Err("File exceeds 2MB safe read limit.".to_string());
    }
    fs::read_to_string(&safe_path).map_err(|e| format!("Read error: {e}"))
}

#[tauri::command]
pub fn os_write_safe_file(path: String, content: String) -> Result<String, String> {
    let safe_path = validate_safe_path(&path)?;
    fs::write(&safe_path, content.as_bytes()).map_err(|e| format!("Write error: {e}"))?;
    Ok(format!("Successfully wrote {} bytes to {}", content.len(), safe_path.display()))
}

#[tauri::command]
pub fn os_launch_application(target: String, args: Option<Vec<String>>) -> Result<String, String> {
    let clean_target = target.trim();
    if clean_target.is_empty() || clean_target.contains('&') || clean_target.contains('|') || clean_target.contains(';') {
        return Err("Blocked unsafe application target.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let mut cmd = std::process::Command::new("cmd");
        let mut full_args = vec!["/C", "start", "", clean_target];
        let owned_args = args.unwrap_or_default();
        for a in &owned_args {
            full_args.push(a.as_str());
        }
        cmd.args(&full_args)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Failed to launch {clean_target}: {e}"))?;
        return Ok(format!("Launched {clean_target}"));
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = args;
        Err("Unsupported OS".to_string())
    }
}

#[tauri::command]
pub fn os_get_clipboard_text() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let out = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", "Get-Clipboard -Raw"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Clipboard read error: {e}"))?;
        Ok(String::from_utf8_lossy(&out.stdout).to_string())
    }
    #[cfg(not(target_os = "windows"))]
    Ok(String::new())
}

#[tauri::command]
pub fn os_set_clipboard_text(text: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let temp_file = std::env::temp_dir().join("angel_clip_set.txt");
        fs::write(&temp_file, text.as_bytes()).map_err(|e| e.to_string())?;
        let escaped = temp_file.to_string_lossy().replace('\\', "\\\\");
        let ps = format!(
            "Add-Type -AssemblyName System.Windows.Forms; $t = [System.IO.File]::ReadAllText('{}', [System.Text.Encoding]::UTF8); [System.Windows.Forms.Clipboard]::SetText($t)",
            escaped
        );
        let _ = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Clipboard write error: {e}"))?;
        Ok("Clipboard updated.".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = text;
        Ok("Clipboard updated.".to_string())
    }
}

#[tauri::command]
pub fn os_inspect_active_window() -> Result<ActiveWindowInfo, String> {
    #[cfg(target_os = "windows")]
    {
        let ps = r#"
            Add-Type @"
                using System;
                using System.Runtime.InteropServices;
                using System.Text;
                public class AngelWinInspect {
                    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
                    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);
                    [DllImport("user32.dll", SetLastError = true)] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
                }
"@ -ErrorAction SilentlyContinue
            $hwnd = [AngelWinInspect]::GetForegroundWindow()
            $sb = New-Object System.Text.StringBuilder 512
            [AngelWinInspect]::GetWindowText($hwnd, $sb, 512) | Out-Null
            $title = $sb.ToString()
            $pidOut = 0
            [AngelWinInspect]::GetWindowThreadProcessId($hwnd, [ref]$pidOut) | Out-Null
            $proc = Get-Process -Id $pidOut -ErrorAction SilentlyContinue
            $pname = if ($proc) { $proc.ProcessName } else { "Unknown" }
            $lower = ($pname + " " + $title).ToLower()
            $hint = "general"
            if ($lower -match "code|devenv|cursor|windsurf") { $hint = "vscode" }
            elseif ($lower -match "grace|church") { $hint = "grace_church" }
            elseif ($lower -match "chrome|edge|firefox") { $hint = "browser" }
            [PSCustomObject]@{
                app_name = $pname
                process_name = "$pname.exe"
                window_title = $title
                context_hint = $hint
            } | ConvertTo-Json -Compress
        "#;
        let out = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", ps])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Active window inspect error: {e}"))?;
        let raw = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if let Ok(info) = serde_json::from_str::<ActiveWindowInfo>(&raw) {
            return Ok(info);
        }
    }
    Ok(ActiveWindowInfo {
        app_name: "Desktop".to_string(),
        process_name: "explorer.exe".to_string(),
        window_title: "Windows Desktop".to_string(),
        context_hint: "general".to_string(),
    })
}

/// Captures the active foreground window (or full primary screen) into an optimized base64 JPEG in RAM.
#[tauri::command]
pub fn os_capture_active_screen_base64() -> Result<String, String> {
    crate::os_automation::capture_screen_base64()
}

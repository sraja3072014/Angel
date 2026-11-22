use serde::{Deserialize, Serialize};
use std::fs;
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use sysinfo::System;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreatItem {
    pub id: String,
    pub file_name: String,
    pub file_path: String,
    pub threat_type: String,
    pub sha256: String,
    pub detected_at: String,
    pub severity: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    pub files_scanned: usize,
    pub threats_found: Vec<ThreatItem>,
    pub scan_duration_ms: u128,
}

pub fn get_quarantine_dir() -> PathBuf {
    let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| "C:\\ProgramData".to_string());
    let path = PathBuf::from(local_app_data).join("ProjectAngel").join("quarantine");
    let _ = fs::create_dir_all(&path);
    path
}

fn get_quarantine_manifest_path() -> PathBuf {
    get_quarantine_dir().join("quarantine_manifest.json")
}

pub fn compute_file_sha256(path: &str) -> String {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("certutil")
            .args(["-hashfile", path, "SHA256"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        if let Ok(out) = output {
            let text = String::from_utf8_lossy(&out.stdout);
            let lines: Vec<&str> = text.lines().map(|l| l.trim()).collect();
            if lines.len() >= 2 {
                return lines[1].replace(' ', "").to_lowercase();
            }
        }
        "UNKNOWN_HASH".to_string()
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
        "SHA256_HASH_MOBILE".to_string()
    }
}

pub fn inspect_file_heuristics(path: &Path) -> Option<ThreatItem> {
    let file_name = path.file_name()?.to_string_lossy().to_string();
    let _lower_name = file_name.to_lowercase();
    let extension = path.extension()?.to_string_lossy().to_lowercase();

    // Check double extension trick: e.g., report.pdf.exe, invoice.docx.bat
    let parts: Vec<&str> = file_name.split('.').collect();
    if parts.len() > 2 {
        let second_to_last = parts[parts.len() - 2].to_lowercase();
        if matches!(second_to_last.as_str(), "pdf" | "docx" | "xlsx" | "jpg" | "png" | "txt")
            && matches!(extension.as_str(), "exe" | "bat" | "cmd" | "ps1" | "vbs" | "js" | "scr")
        {
            let sha256 = compute_file_sha256(&path.to_string_lossy());
            return Some(ThreatItem {
                id: format!("THREAT_{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis()),
                file_name,
                file_path: path.to_string_lossy().to_string(),
                threat_type: "Double Extension Masquerade".to_string(),
                sha256,
                detected_at: chrono_timestamp(),
                severity: "CRITICAL".to_string(),
                status: "DETECTED".to_string(),
            });
        }
    }

    // Check script files for dangerous payloads
    if matches!(extension.as_str(), "bat" | "cmd" | "ps1" | "vbs" | "js") {
        if let Ok(content) = fs::read_to_string(path) {
            let lower_content = content.to_lowercase();
            let mut detected_indicators = Vec::new();

            if lower_content.contains("invoke-expression") || lower_content.contains("iex(") || lower_content.contains("iex (") {
                detected_indicators.push("Obfuscated PowerShell Invocation");
            }
            if lower_content.contains("downloadstring") || lower_content.contains("downloaddata") {
                detected_indicators.push("Remote Payload Dropper");
            }
            if lower_content.contains("-executionpolicy bypass") || lower_content.contains("-w hidden") {
                detected_indicators.push("Stealth Execution Flag");
            }
            if lower_content.contains("mimikatz") || lower_content.contains("samdump") {
                detected_indicators.push("Credential Theft Signature");
            }
            if lower_content.contains("net user /add") || lower_content.contains("net localgroup administrators") {
                detected_indicators.push("Unauthorized Privilege Escalation");
            }

            if !detected_indicators.is_empty() {
                let sha256 = compute_file_sha256(&path.to_string_lossy());
                return Some(ThreatItem {
                    id: format!("THREAT_{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis()),
                    file_name,
                    file_path: path.to_string_lossy().to_string(),
                    threat_type: format!("Malicious Script: {}", detected_indicators.join(", ")),
                    sha256,
                    detected_at: chrono_timestamp(),
                    severity: "HIGH".to_string(),
                    status: "DETECTED".to_string(),
                });
            }
        }
    }

    // Check executables in Temp
    if matches!(extension.as_str(), "exe" | "scr") {
        let path_str = path.to_string_lossy().to_lowercase();
        if path_str.contains("\\temp\\") || path_str.contains("\\appdata\\local\\temp") {
            let sha256 = compute_file_sha256(&path.to_string_lossy());
            return Some(ThreatItem {
                id: format!("THREAT_{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis()),
                file_name,
                file_path: path.to_string_lossy().to_string(),
                threat_type: "Suspicious Temp Executable".to_string(),
                sha256,
                detected_at: chrono_timestamp(),
                severity: "HIGH".to_string(),
                status: "DETECTED".to_string(),
            });
        }
    }

    None
}

fn chrono_timestamp() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    format!("{now}")
}

// Inspect running processes for suspicious paths
pub fn inspect_processes() -> Vec<ThreatItem> {
    let mut sys = System::new_all();
    sys.refresh_all();
    let mut threats = Vec::new();

    for (pid, process) in sys.processes() {
        if let Some(exe_path) = process.exe() {
            let path_str = exe_path.to_string_lossy().to_lowercase();
            if path_str.contains("\\appdata\\local\\temp\\") && path_str.ends_with(".exe") {
                threats.push(ThreatItem {
                    id: format!("PROC_{}", pid),
                    file_name: process.name().to_string_lossy().to_string(),
                    file_path: exe_path.to_string_lossy().to_string(),
                    threat_type: format!("Suspicious Process running from Temp (PID: {})", pid),
                    sha256: compute_file_sha256(&exe_path.to_string_lossy()),
                    detected_at: chrono_timestamp(),
                    severity: "CRITICAL".to_string(),
                    status: "DETECTED".to_string(),
                });
            }
        }
    }
    threats
}

pub fn scan_target_folders() -> ScanResult {
    let start = SystemTime::now();
    let mut files_scanned = 0;
    let mut threats = Vec::new();

    let user_profile = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\Default".to_string());
    let temp_dir = std::env::var("TEMP").unwrap_or_else(|_| "C:\\Windows\\Temp".to_string());

    let watch_dirs = vec![
        PathBuf::from(&user_profile).join("Downloads"),
        PathBuf::from(&user_profile).join("Desktop"),
        PathBuf::from(temp_dir),
    ];

    for dir in watch_dirs {
        if !dir.exists() {
            continue;
        }
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    files_scanned += 1;
                    if let Some(threat) = inspect_file_heuristics(&path) {
                        threats.push(threat);
                    }
                }
            }
        }
    }

    // Also include process threats
    threats.extend(inspect_processes());

    let duration = SystemTime::now()
        .duration_since(start)
        .unwrap_or_default()
        .as_millis();

    ScanResult {
        files_scanned,
        threats_found: threats,
        scan_duration_ms: duration,
    }
}

pub fn quarantine_file_inner(file_path: &str) -> Result<String, String> {
    let source = Path::new(file_path);
    if !source.exists() {
        return Err("File does not exist".to_string());
    }

    let quarantine_dir = get_quarantine_dir();
    let file_name = source
        .file_name()
        .ok_or_else(|| "Invalid file name".to_string())?
        .to_string_lossy();

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis();

    let dest_name = format!("{}_{}.angel_quarantine", file_name, timestamp);
    let destination = quarantine_dir.join(&dest_name);

    fs::rename(source, &destination).or_else(|_| fs::copy(source, &destination).map(|_| {
        let _ = fs::remove_file(source);
    })).map_err(|e| format!("Failed to quarantine: {}", e))?;

    // Record in manifest
    let mut manifest = read_quarantine_manifest();
    manifest.push(ThreatItem {
        id: format!("Q_{}", timestamp),
        file_name: file_name.to_string(),
        file_path: destination.to_string_lossy().to_string(),
        threat_type: "Manually Quarantined".to_string(),
        sha256: compute_file_sha256(&destination.to_string_lossy()),
        detected_at: chrono_timestamp(),
        severity: "HIGH".to_string(),
        status: "QUARANTINED".to_string(),
    });
    save_quarantine_manifest(&manifest);

    Ok(format!("Threat successfully isolated in Quarantine Vault: {}", dest_name))
}

pub fn restore_file(quarantine_file_path: &str, restore_path: &str) -> Result<String, String> {
    let source = Path::new(quarantine_file_path);
    if !source.exists() {
        return Err("Quarantined file not found".to_string());
    }

    fs::copy(source, restore_path)
        .map_err(|e| format!("Failed to restore file: {}", e))?;
    let _ = fs::remove_file(source);

    let mut manifest = read_quarantine_manifest();
    manifest.retain(|item| item.file_path != quarantine_file_path);
    save_quarantine_manifest(&manifest);

    Ok("File restored successfully.".to_string())
}

pub fn read_quarantine_manifest() -> Vec<ThreatItem> {
    let path = get_quarantine_manifest_path();
    if let Ok(content) = fs::read_to_string(path) {
        if let Ok(items) = serde_json::from_str(&content) {
            return items;
        }
    }
    Vec::new()
}

fn save_quarantine_manifest(items: &[ThreatItem]) {
    let path = get_quarantine_manifest_path();
    if let Ok(json) = serde_json::to_string_pretty(items) {
        let _ = fs::write(path, json);
    }
}

// Tauri commands
#[tauri::command]
pub fn aegis_scan_system() -> ScanResult {
    scan_target_folders()
}

#[tauri::command]
pub fn quarantine_file(file_path: String) -> Result<String, String> {
    quarantine_file_inner(&file_path)
}

#[tauri::command]
pub fn aegis_quarantine_file(file_path: String) -> Result<String, String> {
    quarantine_file_inner(&file_path)
}

#[tauri::command]
pub fn aegis_restore_file(quarantine_path: String, target_path: String) -> Result<String, String> {
    restore_file(&quarantine_path, &target_path)
}

#[tauri::command]
pub fn aegis_list_quarantine() -> Vec<ThreatItem> {
    read_quarantine_manifest()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuarantinedFileInfo {
    pub id: String,
    pub original_name: String,
    pub file_name: String,
    pub file_path: String,
    pub file_size: u64,
    pub quarantined_at: String,
    pub threat_type: String,
    pub sha256: String,
}

#[tauri::command]
pub fn list_quarantined_files() -> Vec<QuarantinedFileInfo> {
    let q_dir = get_quarantine_dir();
    let manifest = read_quarantine_manifest();
    let mut results = Vec::new();

    if let Ok(entries) = fs::read_dir(&q_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
                if name == "quarantine_manifest.json" {
                    continue;
                }
                let meta = entry.metadata().ok();
                let file_size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
                let time_str = meta.and_then(|m| m.created().or_else(|_| m.modified()).ok())
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_secs().to_string())
                    .unwrap_or_else(chrono_timestamp);

                // Match in manifest if available
                let matched = manifest.iter().find(|m| m.file_path == path.to_string_lossy() || m.file_name == name);

                let id = matched.map(|m| m.id.clone()).unwrap_or_else(|| format!("Q_{}", name));
                let original_name = matched.map(|m| m.file_name.clone()).unwrap_or_else(|| {
                    if let Some(pos) = name.rfind('_') {
                        name[..pos].to_string()
                    } else {
                        name.clone()
                    }
                });
                let threat_type = matched.map(|m| m.threat_type.clone()).unwrap_or_else(|| "Quarantined Suspicious File".to_string());
                let sha256 = matched.map(|m| m.sha256.clone()).unwrap_or_else(|| compute_file_sha256(&path.to_string_lossy()));

                results.push(QuarantinedFileInfo {
                    id,
                    original_name,
                    file_name: name,
                    file_path: path.to_string_lossy().to_string(),
                    file_size,
                    quarantined_at: time_str,
                    threat_type,
                    sha256,
                });
            }
        }
    }

    results
}

#[tauri::command]
pub fn delete_quarantined_file(file_name: String) -> Result<String, String> {
    let q_dir = get_quarantine_dir();
    let manifest = read_quarantine_manifest();

    let mut target_path = None;
    for item in &manifest {
        if item.file_name == file_name || item.id == file_name || item.file_path == file_name {
            target_path = Some(PathBuf::from(&item.file_path));
            break;
        }
    }

    if target_path.is_none() {
        let direct_path = q_dir.join(&file_name);
        if direct_path.exists() {
            target_path = Some(direct_path);
        }
    }

    if let Some(path) = target_path {
        let path_str = path.to_string_lossy().to_string();
        if path.exists() {
            let _ = fs::remove_file(&path);
        }
        let updated: Vec<ThreatItem> = manifest
            .into_iter()
            .filter(|m| m.file_path != path_str && m.file_name != file_name && m.id != file_name)
            .collect();
        save_quarantine_manifest(&updated);
        Ok(format!("Threat purged permanently from Quarantine Vault: {}", file_name))
    } else {
        let updated: Vec<ThreatItem> = manifest
            .into_iter()
            .filter(|m| m.file_name != file_name && m.id != file_name && m.file_path != file_name)
            .collect();
        save_quarantine_manifest(&updated);
        Ok(format!("Cleaned quarantine entry for: {}", file_name))
    }
}

#[tauri::command]
pub fn restore_quarantined_file(file_name: String, target_path: Option<String>) -> Result<String, String> {
    let q_dir = get_quarantine_dir();
    let manifest = read_quarantine_manifest();

    let matched = manifest.iter().find(|m| m.file_name == file_name || m.id == file_name || m.file_path == file_name);

    let src_path = if let Some(m) = matched {
        PathBuf::from(&m.file_path)
    } else {
        q_dir.join(&file_name)
    };

    if !src_path.exists() {
        return Err("Quarantined file not found on disk.".to_string());
    }

    let dest_path = if let Some(custom) = target_path {
        PathBuf::from(custom)
    } else {
        let user_profile = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\Default".to_string());
        let desktop = PathBuf::from(user_profile).join("Desktop");
        let orig_name = matched.map(|m| m.file_name.as_str()).unwrap_or(file_name.as_str());
        desktop.join(orig_name)
    };

    let _ = fs::copy(&src_path, &dest_path).map_err(|e| format!("Restore copy failed: {}", e))?;
    let _ = fs::remove_file(&src_path);

    let updated: Vec<ThreatItem> = manifest
        .into_iter()
        .filter(|m| m.file_path != src_path.to_string_lossy() && m.file_name != file_name && m.id != file_name)
        .collect();
    save_quarantine_manifest(&updated);

    Ok(format!("File successfully restored to: {}", dest_path.to_string_lossy()))
}

#[tauri::command]
pub fn run_aegis_quick_scan() -> ScanResult {
    scan_target_folders()
}

#[tauri::command]
pub fn run_aegis_deep_scan() -> ScanResult {
    let start = SystemTime::now();
    let mut files_scanned = 0;
    let mut threats = Vec::new();

    let base_scan = scan_target_folders();
    files_scanned += base_scan.files_scanned;
    threats.extend(base_scan.threats_found);

    let app_data = std::env::var("APPDATA").unwrap_or_default();
    if !app_data.is_empty() {
        let startup_dir = PathBuf::from(&app_data).join("Microsoft\\Windows\\Start Menu\\Programs\\Startup");
        if startup_dir.exists() {
            if let Ok(entries) = fs::read_dir(startup_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        files_scanned += 1;
                        if let Some(t) = inspect_file_heuristics(&path) {
                            threats.push(t);
                        }
                    }
                }
            }
        }
    }

    let duration = SystemTime::now().duration_since(start).unwrap_or_default().as_millis();
    ScanResult {
        files_scanned,
        threats_found: threats,
        scan_duration_ms: duration,
    }
}

#[tauri::command]
pub fn scan_removable_drives() -> Vec<ThreatItem> {
    let mut threats = Vec::new();
    #[cfg(target_os = "windows")]
    {
        for drive_letter in b'D'..=b'Z' {
            let root_str = format!("{}:\\", drive_letter as char);
            let root_path = Path::new(&root_str);
            if root_path.exists() {
                if let Ok(entries) = fs::read_dir(root_path) {
                    for entry in entries.flatten() {
                        let path = entry.path();
                        if path.is_file() {
                            let fname = path.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
                            if fname == "autorun.inf" {
                                threats.push(ThreatItem {
                                    id: format!("USB_AUTORUN_{}", chrono_timestamp()),
                                    file_name: fname,
                                    file_path: path.to_string_lossy().to_string(),
                                    threat_type: "Suspicious Autorun.inf on Removable Drive".to_string(),
                                    sha256: compute_file_sha256(&path.to_string_lossy()),
                                    detected_at: chrono_timestamp(),
                                    severity: "HIGH".to_string(),
                                    status: "DETECTED".to_string(),
                                });
                            } else if let Some(t) = inspect_file_heuristics(&path) {
                                threats.push(t);
                            }
                        }
                    }
                }
            }
        }
    }
    threats
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThreatAlert {
    pub file_name: String,
    pub file_path: String,
    pub sha256: String,
    pub risk_level: String,
    pub threat_type: String,
    pub timestamp: String,
}

pub type ThreatAlertPayload = ThreatAlert;

pub fn start_realtime_watcher(app_handle: tauri::AppHandle) {
    use tauri::Emitter;
    std::thread::spawn(move || {
        let mut seen_ids = std::collections::HashSet::new();
        loop {
            std::thread::sleep(std::time::Duration::from_secs(10));
            let scan = scan_target_folders();
            for threat in &scan.threats_found {
                if !seen_ids.contains(&threat.id) {
                    seen_ids.insert(threat.id.clone());
                    let payload = ThreatAlert {
                        file_name: threat.file_name.clone(),
                        file_path: threat.file_path.clone(),
                        sha256: threat.sha256.clone(),
                        risk_level: threat.severity.clone(),
                        threat_type: threat.threat_type.clone(),
                        timestamp: threat.detected_at.clone(),
                    };
                    let _ = app_handle.emit("ThreatAlert", &payload);
                    let _ = app_handle.emit("aegis_threat_detected", &payload);
                    let _ = app_handle.emit("aegis_security_alert", &payload);
                    let _ = app_handle.emit("aegis-threat-detected", &vec![threat.clone()]);
                }
            }
        }
    });
}

pub mod aegis_av;
pub mod os_automation;
pub mod os_doctor;
pub mod plugin_forge;
pub mod scheduler;
pub mod smart_firewall;
pub mod voice_bridge;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::sync::atomic::{AtomicU32, Ordering};
use sysinfo::{Pid, System};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[cfg(target_os = "windows")]
#[repr(C)]
struct MSG {
    hwnd: *mut std::ffi::c_void,
    message: u32,
    w_param: usize,
    l_param: isize,
    time: u32,
    pt_x: i32,
    pt_y: i32,
}

#[cfg(target_os = "windows")]
#[link(name = "user32")]
unsafe extern "system" {
    fn RegisterHotKey(hWnd: *mut std::ffi::c_void, id: i32, fsModifiers: u32, vk: u32) -> i32;
    fn GetMessageW(lpMsg: *mut MSG, hWnd: *mut std::ffi::c_void, wMsgFilterMin: u32, wMsgFilterMax: u32) -> i32;
}

#[cfg(target_os = "windows")]
#[link(name = "winmm")]
unsafe extern "system" {
    fn mciSendStringW(
        lpstrCommand: *const u16,
        lpstrReturnString: *mut u16,
        uReturnLength: u32,
        hwndCallback: *mut std::ffi::c_void,
    ) -> u32;
}

#[cfg(target_os = "windows")]
fn send_mci_command(cmd: &str) -> u32 {
    use std::os::windows::ffi::OsStrExt;
    let wide: Vec<u16> = std::ffi::OsStr::new(cmd)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    unsafe { mciSendStringW(wide.as_ptr(), std::ptr::null_mut(), 0, std::ptr::null_mut()) }
}

#[cfg(target_os = "windows")]
fn send_mci_command_with_return(cmd: &str) -> (u32, String) {
    use std::os::windows::ffi::OsStrExt;
    let wide: Vec<u16> = std::ffi::OsStr::new(cmd)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut return_buffer = vec![0u16; 256];
    let code = unsafe {
        mciSendStringW(
            wide.as_ptr(),
            return_buffer.as_mut_ptr(),
            return_buffer.len() as u32,
            std::ptr::null_mut(),
        )
    };
    let null_idx = return_buffer.iter().position(|&c| c == 0).unwrap_or(return_buffer.len());
    let ret_str = String::from_utf16_lossy(&return_buffer[..null_idx]);
    (code, ret_str)
}

#[cfg(target_os = "windows")]
const MOD_ALT: u32 = 0x0001;
#[cfg(target_os = "windows")]
const VK_SPACE: u32 = 0x20;
#[cfg(target_os = "windows")]
const WM_HOTKEY: u32 = 0x0312;

#[cfg(target_os = "windows")]
fn start_global_hotkey_listener(app_handle: tauri::AppHandle) {
    std::thread::spawn(move || unsafe {
        // Register Alt + Space (ID: 9999)
        if RegisterHotKey(std::ptr::null_mut(), 9999, MOD_ALT, VK_SPACE) != 0 {
            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, std::ptr::null_mut(), 0, 0) > 0 {
                if msg.message == WM_HOTKEY && msg.w_param == 9999 {
                    use tauri::Emitter;
                    let _ = app_handle.emit("angel-summon-copilot", ());
                    if let Some(window) = app_handle.get_webview_window("main") {
                        if window.is_visible().unwrap_or(false) {
                            let _ = window.hide();
                        } else {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                }
            }
        }
    });
}

#[cfg(not(target_os = "windows"))]
fn start_global_hotkey_listener(_app_handle: tauri::AppHandle) {}

#[cfg(target_os = "windows")]
#[link(name = "shell32")]
unsafe extern "system" {
    #[link_name = "ShellExecuteW"]
    fn shell_execute_w(
        window: *mut std::ffi::c_void,
        operation: *const u16,
        file: *const u16,
        parameters: *const u16,
        directory: *const u16,
        show_command: i32,
    ) -> isize;
}

#[cfg(target_os = "windows")]
fn shell_execute(file: &str, parameters: Option<&str>) -> Result<(), String> {
    let operation = "open".encode_utf16().chain(std::iter::once(0)).collect::<Vec<_>>();
    let file = file.encode_utf16().chain(std::iter::once(0)).collect::<Vec<_>>();
    let parameters = parameters.map(|value| {
        value.encode_utf16().chain(std::iter::once(0)).collect::<Vec<_>>()
    });

    let result = unsafe {
        shell_execute_w(
            std::ptr::null_mut(),
            operation.as_ptr(),
            file.as_ptr(),
            parameters
                .as_ref()
                .map_or(std::ptr::null(), |value| value.as_ptr()),
            std::ptr::null(),
            1,
        )
    };
    if result <= 32 {
        return Err(format!("Windows could not open the target (error {result})."));
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn shell_execute(_file: &str, _parameters: Option<&str>) -> Result<(), String> {
    Ok(())
}

// 1. Live RAM Usage (< 35 MB) Monitor
#[tauri::command]
fn get_angel_ram_mb() -> f64 {
    let mut sys = System::new_all();
    sys.refresh_all();
    let pid = Pid::from_u32(std::process::id());
    if let Some(process) = sys.process(pid) {
        return (process.memory() as f64) / (1024.0 * 1024.0);
    }
    0.0
}

// Minimize to System Tray command (keeps background watcher and global Alt+Space hotkey alive)
#[tauri::command]
fn minimize_to_tray(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

// 2. Sub-1ms Tier-1 Reflex & Instant System Commands (Zero Terminal Flash)
#[tauri::command]
fn execute_os_reflex(command: String) -> String {
    let cmd_lower = command.to_lowercase();

    #[cfg(target_os = "windows")]
    {
        // Reflex: WhatsApp
        if cmd_lower.contains("open whatsapp") || cmd_lower.contains("வாட்ஸ்அப்") {
            let _ = Command::new("cmd")
                .args(["/c", "start", "", "whatsapp:"])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn();
            return "WhatsApp திறக்கப்படுகிறது.".to_string();
        }
        // Reflex: Notepad
        if cmd_lower.contains("open notepad") || cmd_lower.contains("நோட்பேட்") {
            let _ = Command::new("cmd")
                .args(["/c", "start", "", "notepad.exe"])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn();
            return "Notepad திறக்கப்படுகிறது.".to_string();
        }
        if cmd_lower.contains("firefox") {
            let _ = Command::new("cmd")
                .args(["/c", "start", "", "firefox"])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn();
            if !cmd_lower.contains("youtube") && !cmd_lower.contains("song") {
                return "Firefox opened, Raja.".to_string();
            }
        }
        // Reflex: Calculator
        if cmd_lower.contains("open calculator") || cmd_lower.contains("கணக்கீட்டு கருவி") {
            let _ = Command::new("cmd")
                .args(["/c", "start", "", "calc.exe"])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn();
            return "Calculator திறக்கப்படுகிறது.".to_string();
        }

        // Reflex: Chrome / Browser
        if cmd_lower.contains("open browser") || cmd_lower.contains("open chrome") || cmd_lower.contains("வலை உலாவி") {
            let _ = Command::new("cmd")
                .args(["/c", "start", "https://google.com"])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn();
            return "வலை உலாவி திறக்கப்படுகிறது.".to_string();
        }
    }

    // Reflex: Firewall Lockdown
    if cmd_lower.contains("lockdown mode") || cmd_lower.contains("block internet") || cmd_lower.contains("இணையத்தை நிறுத்து") {
        let _ = smart_firewall::firewall_toggle_lockdown(true);
        return "🛡️ எச்சரிக்கை! Firewall Lockdown Mode இயக்கப்பட்டது. அணைத்து வெளிச்செல்லும் தொடர்புகளும் துண்டிக்கப்பட்டன.".to_string();
    }

    if cmd_lower.contains("unlock internet") || cmd_lower.contains("இணையத்தை அனுமதி") {
        let _ = smart_firewall::firewall_toggle_lockdown(false);
        return "✅ இணையத் தொடர்பு மீண்டும் அனுமதிக்கப்பட்டது.".to_string();
    }

    // Reflex: OS Doctor Quick Heal
    if cmd_lower.contains("heal audio") || cmd_lower.contains("ஆடியோ சரிசெய்") {
        let _ = os_doctor::os_doctor_heal_audio();
        return "🔊 ஆடியோ சர்வீஸ் புதுப்பிக்கப்பட்டது.".to_string();
    }

    if cmd_lower.contains("clean temp") || cmd_lower.contains("கேச் அழி") {
        let _ = os_doctor::os_doctor_clean_temp();
        return "🧹 தற்காலிக கோப்புகள் அழிக்கப்பட்டன.".to_string();
    }

    // Reflex: 3D Workshop Triggers
    if cmd_lower.contains("open 3d workshop") || cmd_lower.contains("open workshop") || cmd_lower.contains("3d பட்டறை") {
        return "3D_WORKSHOP_TRIGGER".to_string();
    }

    // Check dynamic hot-loaded skills in Plugin Forge
    if let Some(plugin_res) = plugin_forge::plugin_forge_match_and_run(command) {
        return plugin_res;
    }

    "CLOUD_BRAIN".to_string()
}

#[tauri::command]
fn open_system_target(target: String) -> Result<String, String> {
    let clean = target.trim();
    if clean.is_empty() || clean.len() > 2048 || clean.chars().any(char::is_control) {
        return Err("Target is empty or invalid.".to_string());
    }

    if is_http_url(clean) {
        shell_execute(clean, None)?;
        return Ok(format!("Opened: {clean}"));
    }

    let mut parts = clean.splitn(2, char::is_whitespace);
    let app = parts.next().unwrap_or_default().to_ascii_lowercase();
    let argument = parts.next().map(str::trim).unwrap_or_default();
    let executable = match app.as_str() {
        "firefox" => "firefox.exe",
        "chrome" => "chrome.exe",
        "notepad" => "notepad.exe",
        "calculator" | "calc" => "calc.exe",
        _ => {
            return Err("Only Firefox, Chrome, Notepad, and Calculator can be opened.".to_string())
        }
    };

    if !argument.is_empty()
        && (!matches!(app.as_str(), "firefox" | "chrome") || !is_http_url(argument))
    {
        return Err("Only HTTP(S) URLs can be passed to a browser.".to_string());
    }

    shell_execute(executable, (!argument.is_empty()).then_some(argument))?;

    Ok(format!("Opened: {clean}"))
}

fn is_http_url(value: &str) -> bool {
    if value
        .chars()
        .any(|character| {
            character.is_whitespace() || character.is_control() || matches!(character, '"' | '\\')
        })
    {
        return false;
    }

    let Some((scheme, remainder)) = value.split_once("://") else {
        return false;
    };
    if !scheme.eq_ignore_ascii_case("http") && !scheme.eq_ignore_ascii_case("https") {
        return false;
    }

    let host = remainder
        .split(|character| matches!(character, '/' | '?' | '#'))
        .next()
        .unwrap_or_default();
    !host.is_empty()
        && !host.contains('@')
        && host.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | ':' | '[' | ']')
        })
}

#[tauri::command]
fn set_auto_start(enable: bool) -> String {
    #[cfg(target_os = "windows")]
    {
        let exe_path = match std::env::current_exe() {
            Ok(path) => path.to_string_lossy().to_string(),
            Err(error) => return format!("⚠️ Auto-Start அமைப்பதில் பிழை: {error}"),
        };

        let res = if enable {
            Command::new("reg")
                .args([
                    "add",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                    "/v",
                    "ProjectAngel",
                    "/t",
                    "REG_SZ",
                    "/d",
                    &format!("\"{}\"", exe_path),
                    "/f",
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
        } else {
            Command::new("reg")
                .args([
                    "delete",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                    "/v",
                    "ProjectAngel",
                    "/f",
                ])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
        };

        match res {
            Ok(output) if output.status.success() => {
                if enable {
                    "✅ Windows Auto-Start இயக்கப்பட்டது!".into()
                } else {
                    "🔇 Windows Auto-Start நிறுத்தப்பட்டது.".into()
                }
            }
            Ok(output) => {
                let error = String::from_utf8_lossy(&output.stderr).trim().to_string();
                format!("⚠️ Auto-Start அமைப்பதில் பிழை: {error}")
            }
            Err(error) => format!("⚠️ Auto-Start அமைப்பதில் பிழை: {error}"),
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = enable;
        "Auto-start is managed by mobile system.".into()
    }
}

#[tauri::command]
fn open_menu_window(app: tauri::AppHandle, initial_tab: Option<String>) -> Result<(), String> {
    let tab = initial_tab.unwrap_or_else(|| "general".to_string());
    if let Some(window) = app.get_webview_window("menu-center") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("menu-center-switch-tab", &tab);
        return Ok(());
    }

    let route = format!("/?window=menu&tab={}", tab);
    let builder = WebviewWindowBuilder::new(
        &app,
        "menu-center",
        WebviewUrl::App(route.into()),
    )
    .title("Angel AI — Control Center")
    .inner_size(1060.0, 700.0)
    .min_inner_size(900.0, 600.0)
    .transparent(true)
    .decorations(false)
    .resizable(true)
    .center();

    let window = builder.build().map_err(|e| format!("Failed to create menu window: {}", e))?;
    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
fn open_security_suite(app: tauri::AppHandle, initial_tab: Option<String>) -> Result<(), String> {
    let tab = initial_tab.unwrap_or_else(|| "antivirus".to_string());
    if let Some(window) = app.get_webview_window("security-suite") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        let _ = window.emit("security-suite-switch-tab", &tab);
        return Ok(());
    }

    let route = format!("/?window=security&tab={}", tab);
    let builder = WebviewWindowBuilder::new(
        &app,
        "security-suite",
        WebviewUrl::App(route.into()),
    )
    .title("Project Angel — CyberShield Command Center & OS Doctor")
    .inner_size(1020.0, 700.0)
    .min_inner_size(880.0, 600.0)
    .transparent(true)
    .decorations(false)
    .resizable(true)
    .center();

    let window = builder.build().map_err(|e| format!("Failed to create window: {}", e))?;
    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
}

#[tauri::command]
async fn proxy_local_llm_request(
    url: String,
    api_key: Option<String>,
    payload: String,
    timeout_secs: Option<u64>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let is_post = !payload.trim().is_empty();
        let mut cmd = Command::new("curl.exe");

        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        let timeout = timeout_secs.unwrap_or(25);
        cmd.arg("-s").arg("-S");
        cmd.arg("-m").arg(timeout.to_string());
        cmd.arg("--connect-timeout").arg("5");
        cmd.arg("-X").arg(if is_post { "POST" } else { "GET" });
        cmd.arg(&url);

        if is_post {
            cmd.arg("-H").arg("Content-Type: application/json");
        }

        if let Some(ref key) = api_key {
            let trimmed = key.trim();
            if !trimmed.is_empty() {
                cmd.arg("-H").arg(format!("Authorization: Bearer {}", trimmed));
            }
        }

        if is_post {
            cmd.arg("--data-binary").arg("@-");
            cmd.stdin(std::process::Stdio::piped());
        }

        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn curl: {e}"))?;

        if is_post {
            use std::io::Write;
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(payload.as_bytes());
            }
        }

        let output = child.wait_with_output().map_err(|e| format!("Request failed: {e}"))?;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if !output.status.success() && stdout.trim().is_empty() {
            return Err(if !stderr.trim().is_empty() {
                stderr
            } else {
                format!("Curl exited with status: {}", output.status)
            });
        }

        Ok(stdout)
    })
    .await
    .map_err(|e| format!("Task execution error: {e}"))?
}

#[tauri::command]
async fn send_discord_webhook(
    webhook_url: String,
    message: String,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let trimmed_url = webhook_url.trim();
        if !trimmed_url.starts_with("https://discord.com/api/webhooks/")
            && !trimmed_url.starts_with("https://discordapp.com/api/webhooks/")
        {
            return Err("Invalid Discord Webhook URL. It must begin with https://discord.com/api/webhooks/".to_string());
        }

        let mut cmd = Command::new("curl.exe");

        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        cmd.arg("-s").arg("-S");
        cmd.arg("-X").arg("POST");
        cmd.arg(trimmed_url);
        cmd.arg("-H").arg("Content-Type: application/json");
        cmd.arg("--data-binary").arg("@-");
        cmd.stdin(std::process::Stdio::piped());
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());

        let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn curl: {e}"))?;

        {
            use std::io::Write;
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(message.as_bytes());
            }
        }

        let output = child.wait_with_output().map_err(|e| format!("Request failed: {e}"))?;
        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if !output.status.success() && stdout.trim().is_empty() {
            return Err(if !stderr.trim().is_empty() {
                stderr
            } else {
                format!("Curl exited with status: {}", output.status)
            });
        }

        Ok(if stdout.trim().is_empty() {
            "Message delivered successfully to Discord.".to_string()
        } else {
            stdout
        })
    })
    .await
    .map_err(|e| format!("Task execution error: {e}"))?
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct StlFilePayload {
    pub filename: String,
    pub content: String,
}

#[tauri::command]
fn export_workshop_stl_files(
    project_name: String,
    files: Vec<StlFilePayload>,
) -> Result<String, String> {
    let clean_name = project_name
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '_' || c == '-' { c } else { '_' })
        .collect::<String>();

    let user_profile = std::env::var("USERPROFILE").unwrap_or_else(|_| "C:\\Users\\Public".to_string());
    let export_dir = std::path::PathBuf::from(user_profile)
        .join("Downloads")
        .join("Angel_3D_Builds")
        .join(&clean_name);

    std::fs::create_dir_all(&export_dir)
        .map_err(|e| format!("Failed to create export directory: {}", e))?;

    for file in files {
        let clean_filename = file
            .filename
            .chars()
            .map(|c| if c.is_alphanumeric() || c == '.' || c == '_' || c == '-' { c } else { '_' })
            .collect::<String>();
        let target_path = export_dir.join(&clean_filename);
        std::fs::write(&target_path, file.content.as_bytes())
            .map_err(|e| format!("Failed to write STL file {}: {}", clean_filename, e))?;
    }

    Ok(export_dir.to_string_lossy().to_string())
}

fn to_base64_string(bytes: &[u8]) -> String {
    const CHARSET: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARSET[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARSET[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARSET[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARSET[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

fn url_encode_tts_text(input: &str) -> String {
    let mut encoded = String::new();
    for b in input.bytes() {
        if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
            encoded.push(b as char);
        } else if b == b' ' {
            encoded.push('+');
        } else {
            encoded.push_str(&format!("%{:02X}", b));
        }
    }
    encoded
}

static CURRENT_TTS_PID: AtomicU32 = AtomicU32::new(0);

fn get_voice_cache_dir() -> std::path::PathBuf {
    let base = std::env::var("APPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir());
    let dir = base.join("AngelAI").join("voice_cache");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn hash_tts_key(text: &str, lang: &str, gender: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    text.trim().to_lowercase().hash(&mut hasher);
    lang.trim().to_lowercase().hash(&mut hasher);
    gender.trim().to_lowercase().hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

#[tauri::command]
fn stop_native_tts() {
    #[cfg(target_os = "windows")]
    {
        send_mci_command("stop angel_voice");
        send_mci_command("close angel_voice");
        send_mci_command("close all");
    }

    let pid = CURRENT_TTS_PID.swap(0, Ordering::SeqCst);
    if pid > 0 {
        #[cfg(target_os = "windows")]
        {
            let _ = Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
        }
    }
}

fn fetch_tts_mp3_bytes(clean_text: &str, target_lang: &str) -> Result<Vec<u8>, String> {
    let words = clean_text.split_whitespace().collect::<Vec<_>>();
    let mut chunks = Vec::new();
    let mut current_chunk = String::new();
    for word in words {
        if current_chunk.len() + word.len() + 1 > 180 {
            if !current_chunk.is_empty() {
                chunks.push(current_chunk);
                current_chunk = String::new();
            }
        }
        if !current_chunk.is_empty() {
            current_chunk.push(' ');
        }
        current_chunk.push_str(word);
    }
    if !current_chunk.is_empty() {
        chunks.push(current_chunk);
    }

    if chunks.is_empty() {
        return Err("No text chunks available for audio synthesis.".into());
    }

    let temp_dir = std::env::temp_dir();
    let mut full_audio_bytes = Vec::new();

    for (idx, chunk) in chunks.iter().enumerate() {
        let encoded_q = url_encode_tts_text(chunk);
        let url = format!(
            "https://translate.googleapis.com/translate_tts?ie=UTF-8&client=gtx&tl={}&q={}",
            target_lang, encoded_q
        );

        let chunk_temp = temp_dir.join(format!(
            "angel_tts_chunk_{}_{}_{}.mp3",
            std::process::id(),
            idx,
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        ));

        let mut curl_cmd = Command::new("curl.exe");
        #[cfg(target_os = "windows")]
        curl_cmd.creation_flags(CREATE_NO_WINDOW);

        curl_cmd
            .arg("-s")
            .arg("-S")
            .arg("-m")
            .arg("10")
            .arg("--connect-timeout")
            .arg("5")
            .arg("-A")
            .arg("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
            .arg(&url)
            .arg("-o")
            .arg(&chunk_temp);

        let res = curl_cmd.output();
        if let Ok(out) = res {
            if out.status.success() && chunk_temp.exists() {
                if let Ok(bytes) = std::fs::read(&chunk_temp) {
                    if bytes.len() > 100 {
                        full_audio_bytes.extend_from_slice(&bytes);
                    }
                }
                let _ = std::fs::remove_file(&chunk_temp);
            } else if chunk_temp.exists() {
                let _ = std::fs::remove_file(&chunk_temp);
            }
        }
    }

    if full_audio_bytes.is_empty() {
        return Err("Audio synthesis failed to fetch MP3 audio stream.".into());
    }

    Ok(full_audio_bytes)
}

#[tauri::command]
async fn speak_tamil_native(
    text: String,
    lang: Option<String>,
    gender: Option<String>,
    volume: Option<f64>,
    _rate: Option<f64>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        // 1. Stop any currently playing TTS
        let old_pid = CURRENT_TTS_PID.swap(0, Ordering::SeqCst);
        if old_pid > 0 {
            #[cfg(target_os = "windows")]
            {
                let _ = Command::new("taskkill")
                    .args(["/F", "/PID", &old_pid.to_string()])
                    .creation_flags(CREATE_NO_WINDOW)
                    .output();
            }
        }

        let clean_text = text
            .replace("[ACTION:", "")
            .replace(']', "")
            .replace('*', "")
            .replace('#', "")
            .replace('_', "")
            .replace('`', "")
            .trim()
            .to_string();

        if clean_text.is_empty() {
            return Err("Empty text provided for speech.".into());
        }

        let has_tamil = clean_text.chars().any(|c| ('\u{0B80}'..='\u{0BFF}').contains(&c));
        let target_lang = if has_tamil {
            "ta"
        } else if let Some(ref l) = lang {
            let trimmed = l.trim();
            if trimmed == "ta" || trimmed == "ta-IN" {
                "ta"
            } else if trimmed.starts_with("en") {
                "en-IN"
            } else {
                trimmed
            }
        } else {
            "en-IN"
        };

        let voice_gender = gender.unwrap_or_else(|| "female".to_string());
        let cache_key = hash_tts_key(&clean_text, target_lang, &voice_gender);
        let cache_dir = get_voice_cache_dir();
        let cached_file = cache_dir.join(format!("{}.mp3", cache_key));

        // Check persistent disk cache (<15ms instantaneous resolution)
        let (audio_bytes, playback_path) = if cached_file.exists() && std::fs::metadata(&cached_file).map(|m| m.len()).unwrap_or(0) > 100 {
            let bytes = std::fs::read(&cached_file).unwrap_or_default();
            (bytes, cached_file.clone())
        } else {
            let downloaded = fetch_tts_mp3_bytes(&clean_text, target_lang)?;
            let _ = std::fs::write(&cached_file, &downloaded);
            (downloaded, cached_file.clone())
        };

        #[cfg(target_os = "windows")]
        if playback_path.exists() {
            let escaped_path = playback_path.to_string_lossy();
            // Sub-20ms in-process hardware playback using WinMM MCI
            send_mci_command("stop angel_voice");
            send_mci_command("close angel_voice");
            let open_cmd = format!("open \"{}\" type mpegvideo alias angel_voice", escaped_path);
            let open_res = send_mci_command(&open_cmd);
            if open_res == 0 {
                // Set volume (0 to 1000 scale in WinMM)
                let vol_val = (volume.unwrap_or(0.85).clamp(0.0, 1.0) * 1000.0) as u32;
                send_mci_command(&format!("setaudio angel_voice volume to {}", vol_val));
                // Play synchronously to duration or until complete
                let (_, len_str) = send_mci_command_with_return("status angel_voice length");
                let duration_ms = len_str.trim().parse::<u64>().unwrap_or(2500);
                send_mci_command("play angel_voice from 0");

                let start_time = std::time::Instant::now();
                while start_time.elapsed().as_millis() < (duration_ms + 150) as u128 {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                    let (_, status) = send_mci_command_with_return("status angel_voice mode");
                    if status.trim() == "stopped" {
                        break;
                    }
                }
                send_mci_command("close angel_voice");
            } else {
                // Fallback to minimal sound command if mci alias error
                let ps_script = format!(
                    r#"$p = New-Object System.Media.SoundPlayer; $p.SoundLocation = '{}'; $p.PlaySync()"#,
                    escaped_path.replace('\'', "''")
                );
                let _ = Command::new("powershell.exe")
                    .args(["-NoProfile", "-NonInteractive", "-Command", &ps_script])
                    .creation_flags(CREATE_NO_WINDOW)
                    .output();
            }
        }

        let b64 = to_base64_string(&audio_bytes);
        Ok(format!("data:audio/mp3;base64,{}", b64))
    })
    .await
    .map_err(|e| format!("Native TTS task error: {e}"))?
}

#[tauri::command]
async fn prewarm_voice_cache(
    gender: Option<String>,
    _lang: Option<String>,
) -> Result<usize, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let voice_gender = gender.unwrap_or_else(|| "female".to_string());
        let phrases_ta = [
            "வணக்கம் ராஜா",
            "நான் ஏஞ்சல் ஏஐ",
            "உங்களுக்கு என்ன உதவி வேண்டும்?",
            "கட்டளை ஏற்றுக்கொள்ளப்பட்டது",
            "செயல்பாடு வெற்றிகரமாக முடிந்தது",
            "அனைத்து அமைப்புகளும் சரியாக இயங்குகின்றன",
            "தயாராக உள்ளேன் ராஜா",
            "ஒரு நிமிடம் ராஜா",
            "கணினி பாதுகாப்பு எச்சரிக்கை!",
            "வானிலை மற்றும் செய்திகள் தயாராக உள்ளன",
            "ஆணையிடுங்கள் ராஜா",
        ];

        let phrases_en = [
            "Hello Raja",
            "I am Angel AI",
            "How can I help you today?",
            "Command received",
            "Task completed successfully",
            "All systems nominal and secure",
            "Standing by, Raja",
            "Processing your request",
            "Warning, security alert detected",
            "Welcome back Raja, all cores ready",
            "At your service, Raja",
        ];

        let cache_dir = get_voice_cache_dir();
        let mut cached_count = 0;

        for phrase in phrases_ta {
            let key = hash_tts_key(phrase, "ta", &voice_gender);
            let file = cache_dir.join(format!("{}.mp3", key));
            if !file.exists() || std::fs::metadata(&file).map(|m| m.len()).unwrap_or(0) < 100 {
                if let Ok(bytes) = fetch_tts_mp3_bytes(phrase, "ta") {
                    let _ = std::fs::write(&file, &bytes);
                    cached_count += 1;
                }
            } else {
                cached_count += 1;
            }
        }

        for phrase in phrases_en {
            let key = hash_tts_key(phrase, "en-IN", &voice_gender);
            let file = cache_dir.join(format!("{}.mp3", key));
            if !file.exists() || std::fs::metadata(&file).map(|m| m.len()).unwrap_or(0) < 100 {
                if let Ok(bytes) = fetch_tts_mp3_bytes(phrase, "en-IN") {
                    let _ = std::fs::write(&file, &bytes);
                    cached_count += 1;
                }
            } else {
                cached_count += 1;
            }
        }

        Ok(cached_count)
    })
    .await
    .map_err(|e| format!("Prewarm task error: {e}"))?
}

#[tauri::command]
async fn synthesize_neural_tts(
    text: String,
    lang: Option<String>,
    voice: Option<String>,
    _rate_percent: Option<i32>,
    _pitch_hz: Option<i32>,
) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let clean_text = text
            .replace("[ACTION:", "")
            .replace(']', "")
            .replace('*', "")
            .replace('#', "")
            .replace('_', "")
            .replace('`', "")
            .trim()
            .to_string();

        if clean_text.is_empty() {
            return Err("Empty text provided for TTS synthesis.".into());
        }

        let has_tamil = clean_text.chars().any(|c| ('\u{0B80}'..='\u{0BFF}').contains(&c));
        let target_lang = if has_tamil {
            "ta"
        } else if let Some(ref l) = lang {
            let trimmed = l.trim();
            if trimmed == "ta" || trimmed == "ta-IN" {
                "ta"
            } else if trimmed.starts_with("en") {
                "en-IN"
            } else {
                trimmed
            }
        } else if let Some(ref v) = voice {
            if v.starts_with("ta-") {
                "ta"
            } else if v.starts_with("en-GB") {
                "en-GB"
            } else {
                "en-IN"
            }
        } else {
            "en-IN"
        };

        let cache_key = hash_tts_key(&clean_text, target_lang, "female");
        let cache_dir = get_voice_cache_dir();
        let cached_file = cache_dir.join(format!("{}.mp3", cache_key));

        let full_audio_bytes = if cached_file.exists() && std::fs::metadata(&cached_file).map(|m| m.len()).unwrap_or(0) > 100 {
            std::fs::read(&cached_file).unwrap_or_default()
        } else {
            let downloaded = fetch_tts_mp3_bytes(&clean_text, target_lang)?;
            let _ = std::fs::write(&cached_file, &downloaded);
            downloaded
        };

        let b64 = to_base64_string(&full_audio_bytes);
        Ok(format!("data:audio/mp3;base64,{}", b64))
    })
    .await
    .map_err(|e| format!("TTS task error: {e}"))?
}

#[tauri::command]
fn get_active_window_context() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let ps_script = r#"
            $sig = '[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count); [DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(IntPtr hWnd, out int processId);'
            Add-Type -MemberDefinition $sig -Name Win32Utils -Namespace Win32Focus -ErrorAction SilentlyContinue | Out-Null
            $hwnd = [Win32Focus.Win32Utils]::GetForegroundWindow()
            $sb = New-Object System.Text.StringBuilder 256
            [Win32Focus.Win32Utils]::GetWindowText($hwnd, $sb, 256) | Out-Null
            $title = $sb.ToString()
            $procId = 0
            [Win32Focus.Win32Utils]::GetWindowThreadProcessId($hwnd, [ref]$procId) | Out-Null
            $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
            $procName = if ($proc) { $proc.ProcessName } else { "Unknown" }
            $rawName = $procName.ToLower()
            $friendlyApp = switch -Wildcard ($rawName) {
                "*winword*" { "MS Word" }
                "*excel*" { "MS Excel" }
                "*powerpnt*" { "MS PowerPoint" }
                "*photoshop*" { "Adobe Photoshop" }
                "*coreldrw*" { "CorelDRAW" }
                "*illustrator*" { "Adobe Illustrator" }
                "*code*" { "VS Code" }
                "*devenv*" { "Visual Studio" }
                "*chrome*" { "Google Chrome" }
                "*msedge*" { "Microsoft Edge" }
                "*firefox*" { "Firefox" }
                "*notepad*" { "Notepad" }
                "*terminal*" { "Windows Terminal" }
                "*cmd*" { "Command Prompt" }
                "*powershell*" { "PowerShell" }
                "*project_angel*" { "Angel AI" }
                default { if ($proc) { $proc.ProcessName } else { "Active Application" } }
            }
            [PSCustomObject]@{
                app_name = $friendlyApp
                process_name = "$procName.exe"
                window_title = $title
                is_supported_copilot = ($friendlyApp -in @("MS Word", "Adobe Photoshop", "CorelDRAW", "VS Code", "Notepad", "Visual Studio"))
            } | ConvertTo-Json -Compress
        "#;

        let output = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", ps_script])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Failed to get active window context: {e}"))?;

        let res = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if res.is_empty() {
            Ok(r#"{"app_name":"Active Application","process_name":"desktop.exe","window_title":"Windows Desktop","is_supported_copilot":false}"#.to_string())
        } else {
            Ok(res)
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(r#"{"app_name":"Active Application","process_name":"desktop","window_title":"Active Workspace","is_supported_copilot":false}"#.to_string())
    }
}

#[tauri::command]
fn insert_text_at_active_cursor(text: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let temp_dir = std::env::temp_dir();
        let buf_path = temp_dir.join("angel_paste_buffer.txt");
        std::fs::write(&buf_path, text.as_bytes())
            .map_err(|e| format!("Failed to write paste buffer: {e}"))?;

        let escaped_path = buf_path.to_string_lossy().replace('\\', "\\\\");
        let ps_cmd = format!(
            r#"Add-Type -AssemblyName System.Windows.Forms; $txt = [System.IO.File]::ReadAllText('{}', [System.Text.Encoding]::UTF8); [System.Windows.Forms.Clipboard]::SetText($txt); Start-Sleep -Milliseconds 60; [System.Windows.Forms.SendKeys]::SendWait('^v')"#,
            escaped_path
        );

        let _ = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &ps_cmd])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Failed to send paste event: {e}"))?;

        Ok("Text pasted into active application cursor successfully.".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = text;
        Ok("Text pasted.".to_string())
    }
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct LearnedRecipe {
    pub id: String,
    pub name: String,
    pub triggers: Vec<String>,
    pub action_type: String, // "HTTP_GET_RSS" | "HTTP_REST" | "SKILL_ID" | "LOCAL_COMMAND"
    pub endpoint: String,
    pub description: String,
}

fn get_learned_recipes_file() -> std::path::PathBuf {
    let base = std::env::var("APPDATA")
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir());
    let dir = base.join("AngelAI");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("learned_recipes.json")
}

fn load_learned_recipes() -> Vec<LearnedRecipe> {
    let file = get_learned_recipes_file();
    if file.exists() {
        if let Ok(content) = std::fs::read_to_string(&file) {
            if let Ok(recipes) = serde_json::from_str::<Vec<LearnedRecipe>>(&content) {
                return recipes;
            }
        }
    }

    // Default built-in 0-token recipes
    let defaults = vec![
        LearnedRecipe {
            id: "recipe_news_tamil".into(),
            name: "Live Tamil Headlines".into(),
            triggers: vec![
                "news in tamil".into(),
                "tamil news".into(),
                "today news in tamil".into(),
                "செய்தி".into(),
                "செய்திகள்".into(),
                "இன்றைய செய்திகள்".into(),
                "daily news tamil".into(),
            ],
            action_type: "HTTP_GET_RSS".into(),
            endpoint: "https://news.google.com/rss?hl=ta&gl=IN&ceid=IN:ta".into(),
            description: "Fetches live Google News Tamil RSS headlines in <400ms with 0 LLM tokens.".into(),
        },
        LearnedRecipe {
            id: "recipe_news_english".into(),
            name: "Live English Headlines".into(),
            triggers: vec![
                "today news".into(),
                "news".into(),
                "headlines".into(),
                "latest news".into(),
                "breaking news".into(),
                "current news".into(),
                "tell me today news".into(),
            ],
            action_type: "HTTP_GET_RSS".into(),
            endpoint: "https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en".into(),
            description: "Fetches live Google News English RSS headlines in <400ms with 0 LLM tokens.".into(),
        },
    ];

    let _ = std::fs::write(&file, serde_json::to_string_pretty(&defaults).unwrap_or_default());
    defaults
}

#[tauri::command]
fn list_learned_recipes() -> Result<Vec<LearnedRecipe>, String> {
    Ok(load_learned_recipes())
}

#[tauri::command]
fn save_learned_recipe(recipe: LearnedRecipe) -> Result<String, String> {
    let file = get_learned_recipes_file();
    let mut recipes = load_learned_recipes();
    recipes.retain(|r| r.id != recipe.id);
    recipes.push(recipe);
    let json = serde_json::to_string_pretty(&recipes).map_err(|e| e.to_string())?;
    std::fs::write(file, json).map_err(|e| e.to_string())?;
    Ok("Learned recipe saved successfully.".to_string())
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct RecipeExecutionResult {
    pub matched: bool,
    pub recipe_id: String,
    pub recipe_name: String,
    pub result_text: String,
    pub execution_time_ms: u64,
}

#[tauri::command]
async fn execute_learned_recipe(user_prompt: String) -> Result<RecipeExecutionResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let start = std::time::Instant::now();
        let prompt_lower = user_prompt.trim().to_lowercase();
        let recipes = load_learned_recipes();

        for recipe in recipes {
            let matches = recipe.triggers.iter().any(|t| {
                let t_lower = t.trim().to_lowercase();
                !t_lower.is_empty() && (prompt_lower == t_lower || prompt_lower.contains(&t_lower))
            });

            if matches {
                if recipe.action_type == "HTTP_GET_RSS" {
                    let mut cmd = Command::new("curl.exe");
                    #[cfg(target_os = "windows")]
                    cmd.creation_flags(CREATE_NO_WINDOW);

                    cmd.arg("-s")
                        .arg("-m")
                        .arg("5")
                        .arg("--connect-timeout")
                        .arg("3")
                        .arg("-L")
                        .arg("-A")
                        .arg("Mozilla/5.0")
                        .arg(&recipe.endpoint);

                    if let Ok(output) = cmd.output() {
                        if output.status.success() {
                            let xml_str = String::from_utf8_lossy(&output.stdout);
                            let mut headlines = Vec::new();
                            for item in xml_str.split("<item>").skip(1).take(5) {
                                if let Some(title_start) = item.find("<title>") {
                                    if let Some(title_end) = item.find("</title>") {
                                        let raw_title = &item[title_start + 7..title_end];
                                        let clean_title = raw_title
                                            .replace("<![CDATA[", "")
                                            .replace("]]>", "")
                                            .replace("&amp;", "&")
                                            .replace("&quot;", "\"")
                                            .replace("&#39;", "'")
                                            .replace("&lt;", "<")
                                            .replace("&gt;", ">")
                                            .trim()
                                            .to_string();
                                        if !clean_title.is_empty() {
                                            headlines.push(clean_title);
                                        }
                                    }
                                }
                            }

                            if !headlines.is_empty() {
                                let is_tamil = recipe.endpoint.contains("hl=ta");
                                let header = if is_tamil {
                                    "இன்றைய முக்கிய நேரலை செய்திகள் (0 டோக்கன்கள் நேரடி தகவல்கள்):"
                                } else {
                                    "Today's Live Top Headlines (0 LLM Tokens • Live Feed):"
                                };

                                let mut formatted = format!("{}\n\n", header);
                                for (i, h) in headlines.iter().enumerate() {
                                    formatted.push_str(&format!("{}. {}\n", i + 1, h));
                                }

                                return Ok(RecipeExecutionResult {
                                    matched: true,
                                    recipe_id: recipe.id,
                                    recipe_name: recipe.name,
                                    result_text: formatted.trim().to_string(),
                                    execution_time_ms: start.elapsed().as_millis() as u64,
                                });
                            }
                        }
                    }
                }
            }
        }

        Ok(RecipeExecutionResult {
            matched: false,
            recipe_id: String::new(),
            recipe_name: String::new(),
            result_text: String::new(),
            execution_time_ms: start.elapsed().as_millis() as u64,
        })
    })
    .await
    .map_err(|e| format!("Recipe execution error: {e}"))?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.maximize();
            }

            // 1. Start 24/7 Aegis Folder Watcher
            aegis_av::start_realtime_watcher(app_handle.clone());

            // 2. Start Autonomous Background Scheduler & Watchdogs (60s ticker)
            scheduler::start_scheduler(app_handle.clone());

            // 3. Start Native Windows Alt + Space Global Hotkey Listener
            start_global_hotkey_listener(app_handle.clone());

            // 4. Background Pre-warm Voice Cache for Sub-10ms Instant Audio
            std::thread::spawn(|| {
                let cache_dir = get_voice_cache_dir();
                let phrases = [
                    ("வணக்கம் ராஜா", "ta"),
                    ("நான் ஏஞ்சல் ஏஐ", "ta"),
                    ("உங்களுக்கு என்ன உதவி வேண்டும்?", "ta"),
                    ("கட்டளை ஏற்றுக்கொள்ளப்பட்டது", "ta"),
                    ("செயல்பாடு வெற்றிகரமாக முடிந்தது", "ta"),
                    ("தயாராக உள்ளேன் ராஜா", "ta"),
                    ("Hello Raja", "en-IN"),
                    ("I am Angel AI", "en-IN"),
                    ("Task completed successfully", "en-IN"),
                    ("Standing by, Raja", "en-IN"),
                ];
                for (phrase, lang) in phrases {
                    let key = hash_tts_key(phrase, lang, "female");
                    let file = cache_dir.join(format!("{}.mp3", key));
                    if !file.exists() || std::fs::metadata(&file).map(|m| m.len()).unwrap_or(0) < 100 {
                        if let Ok(bytes) = fetch_tts_mp3_bytes(phrase, lang) {
                            let _ = std::fs::write(&file, &bytes);
                        }
                    }
                }
            });

            // 3. System Tray Menu & Persistence
            let show_item = MenuItem::with_id(app, "show", "Show Angel HUD", true, None::<&str>)?;
            let scan_item = MenuItem::with_id(app, "scan", "Run AI Antivirus Scan", true, None::<&str>)?;
            let lockdown_item = MenuItem::with_id(app, "lockdown", "Toggle Internet Lockdown", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Project Angel", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &scan_item, &lockdown_item, &quit_item])?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                        "scan" => {
                            let handle = app.clone();
                            std::thread::spawn(move || {
                                let scan = aegis_av::scan_target_folders();
                                if !scan.threats_found.is_empty() {
                                    use tauri::Emitter;
                                    let _ = handle.emit("aegis_threat_detected", &scan.threats_found[0]);
                                    let _ = handle.emit("aegis_security_alert", &scan.threats_found[0]);
                                }
                            });
                        }
                        "lockdown" => {
                            let is_locked = smart_firewall::check_lockdown_active();
                            let _ = smart_firewall::firewall_toggle_lockdown(!is_locked);
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let is_vis = window.is_visible().unwrap_or(false);
                            if is_vis {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }

            let _ = tray_builder.build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if window.label() == "main" {
                    // X button cleanly terminates and exits the entire Angel AI application
                    window.app_handle().exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_angel_ram_mb,
            minimize_to_tray,
            execute_os_reflex,
            open_system_target,
            open_security_suite,
            open_menu_window,
            set_auto_start,
            proxy_local_llm_request,
            voice_bridge::offline_speech_to_text,
            voice_bridge::speak_offline_tts,
            os_automation::control_system_volume,
            os_automation::set_system_volume,
            os_automation::set_screen_brightness,
            os_automation::control_media_playback,
            os_automation::media_control,
            os_automation::take_desktop_screenshot,
            os_automation::capture_screen_base64,
            os_automation::search_user_files,
            os_automation::capture_screen_to_pictures,
            os_automation::get_system_telemetry,
            scheduler::list_scheduled_tasks,
            scheduler::add_scheduled_task,
            scheduler::delete_scheduled_task,
            aegis_av::aegis_scan_system,
            aegis_av::run_aegis_quick_scan,
            aegis_av::run_aegis_deep_scan,
            aegis_av::scan_removable_drives,
            aegis_av::quarantine_file,
            aegis_av::aegis_quarantine_file,
            aegis_av::aegis_restore_file,
            aegis_av::restore_quarantined_file,
            aegis_av::aegis_list_quarantine,
            aegis_av::list_quarantined_files,
            aegis_av::delete_quarantined_file,
            smart_firewall::firewall_get_status,
            smart_firewall::get_network_status,
            smart_firewall::firewall_toggle_lockdown,
            smart_firewall::set_firewall_lockdown,
            smart_firewall::firewall_block_ip,
            smart_firewall::firewall_get_connections,
            smart_firewall::get_active_network_apps,
            smart_firewall::block_network_app,
            smart_firewall::block_app_internet,
            os_doctor::os_doctor_diagnose,
            os_doctor::scan_windows_errors,
            os_doctor::os_doctor_heal_audio,
            os_doctor::os_doctor_heal_network,
            os_doctor::os_doctor_clean_temp,
            os_doctor::heal_windows_services,
            os_doctor::os_doctor_create_restore_point,
            os_doctor::os_doctor_repair_system,
            os_doctor::run_deep_os_repair,
            os_doctor::start_ransomware_canary_guard,
            os_doctor::check_canary_status,
            os_doctor::quarantine_suspicious_process,
            os_doctor::scan_usb_and_network_anomalies,
            os_doctor::approve_security_baseline,
            os_doctor::audit_windows_hardening,
            os_doctor::apply_defensive_hardening,
            os_doctor::scan_active_ports_and_processes,
            os_doctor::inspect_file_forensics,
            os_doctor::update_threat_definitions,
            os_doctor::unlock_and_repair_path,
            plugin_forge::plugin_forge_list,
            plugin_forge::plugin_forge_save,
            plugin_forge::forge_new_skill,
            plugin_forge::plugin_forge_execute,
            plugin_forge::plugin_forge_delete,
            plugin_forge::update_forged_skill,
            plugin_forge::delete_forged_skill,
            plugin_forge::plugin_forge_match_and_run,
            plugin_forge::run_forged_skill,
            plugin_forge::list_forged_skills,
            plugin_forge::inspect_local_project_folder,
            plugin_forge::inspect_github_repo,
            plugin_forge::dry_run_plugin_security,
            export_workshop_stl_files,
            send_discord_webhook,
            synthesize_neural_tts,
            speak_tamil_native,
            stop_native_tts,
            prewarm_voice_cache,
            os_doctor::get_system_health_report,
            get_active_window_context,
            insert_text_at_active_cursor,
            list_learned_recipes,
            save_learned_recipe,
            execute_learned_recipe
        ])
        .run(tauri::generate_context!())
        .expect("error while running Project Angel");
}

#[cfg(test)]
mod tests {
    use super::is_http_url;

    #[test]
    fn accepts_http_urls_with_query_parameters() {
        assert!(is_http_url(
            "https://www.youtube.com/results?search_query=tamil+melody&feature=share"
        ));
        assert!(is_http_url("http://localhost:3000"));
    }

    #[test]
    fn rejects_non_http_urls_and_whitespace() {
        assert!(!is_http_url("file:///C:/Windows/notepad.exe"));
        assert!(!is_http_url("https://example.com & calc"));
        assert!(!is_http_url("https://example.com/\"notepad"));
        assert!(!is_http_url("https://"));
    }
}

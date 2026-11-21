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
use sysinfo::{Pid, System};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();

            // 1. Start 24/7 Aegis Folder Watcher
            aegis_av::start_realtime_watcher(app_handle.clone());

            // 2. Start Autonomous Background Scheduler & Watchdogs (60s ticker)
            scheduler::start_scheduler(app_handle.clone());

            // 3. Start Native Windows Alt + Space Global Hotkey Listener
            start_global_hotkey_listener(app_handle.clone());

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
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Minimize to System Tray instead of terminating the background sentinels
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_angel_ram_mb,
            execute_os_reflex,
            open_system_target,
            set_auto_start,
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
            aegis_av::quarantine_file,
            aegis_av::aegis_quarantine_file,
            aegis_av::aegis_restore_file,
            aegis_av::aegis_list_quarantine,
            smart_firewall::firewall_get_status,
            smart_firewall::firewall_toggle_lockdown,
            smart_firewall::firewall_block_ip,
            smart_firewall::firewall_get_connections,
            smart_firewall::get_active_network_apps,
            smart_firewall::block_network_app,
            smart_firewall::block_app_internet,
            os_doctor::os_doctor_diagnose,
            os_doctor::os_doctor_heal_audio,
            os_doctor::os_doctor_heal_network,
            os_doctor::os_doctor_clean_temp,
            os_doctor::os_doctor_create_restore_point,
            os_doctor::os_doctor_repair_system,
            plugin_forge::plugin_forge_list,
            plugin_forge::plugin_forge_save,
            plugin_forge::forge_new_skill,
            plugin_forge::plugin_forge_execute,
            plugin_forge::plugin_forge_delete,
            plugin_forge::plugin_forge_match_and_run
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

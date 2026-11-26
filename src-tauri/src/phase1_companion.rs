use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize)]
pub struct CursorGazePayload {
    pub x: i32,
    pub y: i32,
    pub norm_x: f32,
    pub norm_y: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct HydrationNudgePayload {
    pub active_minutes: u64,
    pub message_ta: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct PetFileDropPayload {
    pub paths: Vec<String>,
    pub prompt_ta: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkTimerStatus {
    pub active_seconds: u64,
    pub threshold_seconds: u64,
    pub nudge_triggered: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct DevTaskExecutionResult {
    pub ok: bool,
    pub branch: String,
    pub build_output: String,
}

static ACTIVE_WORK_SECONDS: AtomicU64 = AtomicU64::new(0);
static HYDRATION_NUDGE_SENT: AtomicBool = AtomicBool::new(false);
const WELLNESS_THRESHOLD_SECONDS: u64 = 45 * 60; // 45 minutes

#[cfg(target_os = "windows")]
#[repr(C)]
struct LASTINPUTINFO {
    cb_size: u32,
    dw_time: u32,
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct PET_POINT {
    x: i32,
    y: i32,
}

#[cfg(target_os = "windows")]
#[link(name = "user32")]
unsafe extern "system" {
    fn GetCursorPos(lpPoint: *mut PET_POINT) -> i32;
    fn GetSystemMetrics(nIndex: i32) -> i32;
    fn GetLastInputInfo(plii: *mut LASTINPUTINFO) -> i32;
}

#[cfg(target_os = "windows")]
#[link(name = "kernel32")]
unsafe extern "system" {
    fn GetTickCount() -> u32;
}

/// Initializes the `angel-pet` secondary transparent window pinned to the bottom-right corner,
/// starts the throttled OS cursor gaze tracker, and starts the 45-minute continuous work wellness timer.
pub fn init_phase1_companion(app_handle: tauri::AppHandle) {
    let pet_win_opt = if let Some(win) = app_handle.get_webview_window("angel-pet") {
        Some(win)
    } else {
        WebviewWindowBuilder::new(
            &app_handle,
            "angel-pet",
            WebviewUrl::App("/?mode=angel_pet".into()),
        )
        .title("Angel Companion")
        .inner_size(280.0, 360.0)
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        .build()
        .ok()
    };

    if let Some(pet_win) = pet_win_opt {
        let _ = pet_win.set_shadow(false);
        #[cfg(target_os = "windows")]
        unsafe {
            let screen_w = GetSystemMetrics(0); // SM_CXSCREEN
            let screen_h = GetSystemMetrics(1); // SM_CYSCREEN
            let pos_x = (screen_w - 300).max(20);
            let pos_y = (screen_h - 420).max(20);
            let _ = pet_win.set_position(tauri::PhysicalPosition::new(pos_x, pos_y));
        }
        let _ = pet_win.hide();
    }

    // 1. Throttled Global Cursor Eye/Head Tracking (~25fps, emits only on delta > 2px)
    #[cfg(target_os = "windows")]
    {
        let handle = app_handle.clone();
        std::thread::spawn(move || {
            let mut pt = PET_POINT { x: 0, y: 0 };
            let mut last_x = -9999;
            let mut last_y = -9999;
            let mut last_emit = Instant::now();

            loop {
                std::thread::sleep(Duration::from_millis(38));
                unsafe {
                    if GetCursorPos(&mut pt) != 0 {
                        if (pt.x - last_x).abs() > 2 || (pt.y - last_y).abs() > 2 {
                            if last_emit.elapsed() >= Duration::from_millis(38) {
                                last_x = pt.x;
                                last_y = pt.y;
                                last_emit = Instant::now();

                                let screen_w = GetSystemMetrics(0).max(1) as f32;
                                let screen_h = GetSystemMetrics(1).max(1) as f32;

                                // Default reference near bottom-right pet corner, or actual pet window center
                                let mut center_x = screen_w - 160.0;
                                let mut center_y = screen_h - 240.0;
                                if let Some(pet) = handle.get_webview_window("angel-pet") {
                                    if let Ok(pos) = pet.outer_position() {
                                        center_x = pos.x as f32 + 140.0;
                                        center_y = pos.y as f32 + 160.0;
                                    }
                                }

                                let norm_x = ((pt.x as f32 - center_x) / (screen_w * 0.5)).clamp(-1.0, 1.0);
                                let norm_y = ((pt.y as f32 - center_y) / (screen_h * 0.5)).clamp(-1.0, 1.0);

                                let _ = handle.emit_to(
                                    "angel-pet",
                                    "angel-cursor-gaze",
                                    CursorGazePayload {
                                        x: pt.x,
                                        y: pt.y,
                                        norm_x,
                                        norm_y,
                                    },
                                );
                            }
                        }
                    }
                }
            }
        });
    }

    // 2. Smart Wellness & Hydration Care (45-Minute Active Work Timer)
    #[cfg(target_os = "windows")]
    {
        let handle = app_handle.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_secs(5));
            unsafe {
                let mut lii = LASTINPUTINFO {
                    cb_size: std::mem::size_of::<LASTINPUTINFO>() as u32,
                    dw_time: 0,
                };
                if GetLastInputInfo(&mut lii) != 0 {
                    let tick = GetTickCount();
                    let idle_ms = tick.wrapping_sub(lii.dw_time);

                    if idle_ms < 60_000 {
                        // User is actively working
                        let secs = ACTIVE_WORK_SECONDS.fetch_add(5, Ordering::SeqCst) + 5;
                        if secs >= WELLNESS_THRESHOLD_SECONDS && !HYDRATION_NUDGE_SENT.load(Ordering::SeqCst) {
                            HYDRATION_NUDGE_SENT.store(true, Ordering::SeqCst);
                            let payload = HydrationNudgePayload {
                                active_minutes: secs / 60,
                                message_ta: "ராஜா, தொடர்ந்து 45 நிமிஷமா வேலை பார்த்துட்டு இருக்கீங்க. கொஞ்சம் தண்ணி குடிச்சிட்டு, கண்ணுக்கு ரெஸ்ட் குடுங்க. ஒரு 2 நிமிஷம் விடுகதை விளையாடுறீங்களா?".to_string(),
                            };
                            let _ = handle.emit("angel-hydration-nudge", payload);
                        }
                    } else if idle_ms >= 180_000 {
                        // User took >= 3 minute break, reset timer
                        ACTIVE_WORK_SECONDS.store(0, Ordering::SeqCst);
                        HYDRATION_NUDGE_SENT.store(false, Ordering::SeqCst);
                    }
                }
            }
        });
    }
}

#[tauri::command]
pub fn get_work_timer_status() -> WorkTimerStatus {
    WorkTimerStatus {
        active_seconds: ACTIVE_WORK_SECONDS.load(Ordering::SeqCst),
        threshold_seconds: WELLNESS_THRESHOLD_SECONDS,
        nudge_triggered: HYDRATION_NUDGE_SENT.load(Ordering::SeqCst),
    }
}

#[tauri::command]
pub fn reset_work_timer() -> Result<(), String> {
    ACTIVE_WORK_SECONDS.store(0, Ordering::SeqCst);
    HYDRATION_NUDGE_SENT.store(false, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn trigger_hydration_test(app: tauri::AppHandle) -> Result<(), String> {
    let payload = HydrationNudgePayload {
        active_minutes: 45,
        message_ta: "ராஜா, தொடர்ந்து 45 நிமிஷமா வேலை பார்த்துட்டு இருக்கீங்க. கொஞ்சம் தண்ணி குடிச்சிட்டு, கண்ணுக்கு ரெஸ்ட் குடுங்க. ஒரு 2 நிமிஷம் விடுகதை விளையாடுறீங்களா?".to_string(),
    };
    let _ = app.emit("angel-hydration-nudge", payload);
    Ok(())
}

#[tauri::command]
pub fn show_main_dashboard(app: tauri::AppHandle, initial_mode: Option<String>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    if let Some(mode) = initial_mode {
        let _ = app.emit("angel-pet-action", mode);
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_angel_pet(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("angel-pet") {
        if visible {
            let _ = win.show();
        } else {
            let _ = win.hide();
        }
    }
    Ok(())
}

/// Autonomous Self-Coding Queue Worker: creates safe `auto-update/<task>` branch and runs `npm run build` verification.
#[tauri::command]
pub async fn run_autonomous_dev_task(task_slug: String) -> Result<DevTaskExecutionResult, String> {
    let safe_slug: String = task_slug
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' { c.to_ascii_lowercase() } else { '-' })
        .collect();
    let branch = format!("auto-update/{}", safe_slug.trim_matches('-'));

    tauri::async_runtime::spawn_blocking(move || {
        let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
        // Ensure we run at repo root (parent if inside src-tauri)
        let repo_root = if cwd.ends_with("src-tauri") {
            cwd.parent().map(|p| p.to_path_buf()).unwrap_or(cwd)
        } else {
            cwd
        };

        let mut cmd_git = std::process::Command::new("git");
        cmd_git.args(["checkout", "-B", &branch]).current_dir(&repo_root);
        #[cfg(target_os = "windows")]
        cmd_git.creation_flags(CREATE_NO_WINDOW);
        let git_out = cmd_git.output().map_err(|e| format!("Git branch error: {e}"))?;
        if !git_out.status.success() {
            let err = String::from_utf8_lossy(&git_out.stderr).to_string();
            return Ok(DevTaskExecutionResult {
                ok: false,
                branch,
                build_output: format!("Failed to create branch: {err}"),
            });
        }

        let mut cmd_build = std::process::Command::new("cmd");
        cmd_build.args(["/C", "npm run build"]).current_dir(&repo_root);
        #[cfg(target_os = "windows")]
        cmd_build.creation_flags(CREATE_NO_WINDOW);
        let build_out = cmd_build.output().map_err(|e| format!("Build error: {e}"))?;
        let stdout = String::from_utf8_lossy(&build_out.stdout).to_string();
        let stderr = String::from_utf8_lossy(&build_out.stderr).to_string();

        Ok(DevTaskExecutionResult {
            ok: build_out.status.success(),
            branch,
            build_output: if build_out.status.success() { stdout } else { format!("{stdout}\n{stderr}") },
        })
    })
    .await
    .map_err(|e| format!("Task join error: {e}"))?
}

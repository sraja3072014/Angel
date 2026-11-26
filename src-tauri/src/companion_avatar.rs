use serde::Serialize;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, Clone, Serialize)]
pub struct CursorAndWindowRect {
    pub cursor_x: i32,
    pub cursor_y: i32,
    pub win_x: i32,
    pub win_y: i32,
    pub win_w: i32,
    pub win_h: i32,
    pub work_left: i32,
    pub work_top: i32,
    pub work_right: i32,
    pub work_bottom: i32,
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct COMP_POINT {
    x: i32,
    y: i32,
}

#[cfg(target_os = "windows")]
#[repr(C)]
struct COMP_RECT {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

#[cfg(target_os = "windows")]
#[link(name = "user32")]
unsafe extern "system" {
    fn GetCursorPos(lpPoint: *mut COMP_POINT) -> i32;
    fn GetSystemMetrics(nIndex: i32) -> i32;
    fn SystemParametersInfoW(
        uiAction: u32,
        uiParam: u32,
        pvParam: *mut std::ffi::c_void,
        fWinIni: u32,
    ) -> i32;
}

#[cfg(target_os = "windows")]
fn get_primary_work_area() -> (i32, i32, i32, i32) {
    unsafe {
        let mut rect = COMP_RECT {
            left: 0,
            top: 0,
            right: GetSystemMetrics(0).max(1280),
            bottom: GetSystemMetrics(1).max(720),
        };
        // SPI_GETWORKAREA = 0x0030
        let _ = SystemParametersInfoW(
            0x0030,
            0,
            &mut rect as *mut COMP_RECT as *mut std::ffi::c_void,
            0,
        );
        (rect.left, rect.top, rect.right, rect.bottom)
    }
}

#[cfg(not(target_os = "windows"))]
fn get_primary_work_area() -> (i32, i32, i32, i32) {
    (0, 0, 1920, 1040)
}

/// Initializes the transparent, always-on-top `companion_avatar` window (440x540)
/// positioned at the bottom-right corner of the primary monitor work area.
pub fn init_companion_avatar(app_handle: tauri::AppHandle) {
    let win_opt = if let Some(win) = app_handle.get_webview_window("companion_avatar") {
        Some(win)
    } else {
        WebviewWindowBuilder::new(
            &app_handle,
            "companion_avatar",
            WebviewUrl::App("/?mode=companion_avatar".into()),
        )
        .title("Angel 3D Desktop Companion")
        .inner_size(440.0, 540.0)
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

    if let Some(win) = win_opt {
        let _ = win.set_shadow(false);
        let (wl, wt, wr, wb) = get_primary_work_area();
        let start_x = (wr - 470).max(wl);
        let start_y = (wb - 550).max(wt);
        let _ = win.set_position(tauri::PhysicalPosition::new(start_x, start_y));
        let _ = win.hide();
    }
}

#[tauri::command]
pub fn set_companion_visible(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("companion_avatar") {
        if visible {
            let _ = win.show();
        } else {
            let _ = win.hide();
        }
    }
    Ok(())
}

#[tauri::command]
pub fn move_companion_window(app: tauri::AppHandle, x: i32, y: i32) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("companion_avatar") {
        let (wl, wt, wr, wb) = get_primary_work_area();
        let clamped_x = x.clamp(wl, (wr - 440).max(wl));
        let clamped_y = y.clamp(wt, (wb - 540).max(wt));
        let _ = win.set_position(tauri::PhysicalPosition::new(clamped_x, clamped_y));
    }
    Ok(())
}

#[tauri::command]
pub fn get_global_cursor_and_window_rect(app: tauri::AppHandle) -> Result<CursorAndWindowRect, String> {
    let (wl, wt, wr, wb) = get_primary_work_area();
    let mut cursor_x = wr / 2;
    let mut cursor_y = wb / 2;

    #[cfg(target_os = "windows")]
    unsafe {
        let mut pt = COMP_POINT { x: 0, y: 0 };
        if GetCursorPos(&mut pt) != 0 {
            cursor_x = pt.x;
            cursor_y = pt.y;
        }
    }

    let mut win_x = (wr - 470).max(wl);
    let mut win_y = (wb - 550).max(wt);
    let mut win_w = 440;
    let mut win_h = 540;

    if let Some(win) = app.get_webview_window("companion_avatar") {
        if let Ok(pos) = win.outer_position() {
            win_x = pos.x;
            win_y = pos.y;
        }
        if let Ok(sz) = win.outer_size() {
            win_w = sz.width as i32;
            win_h = sz.height as i32;
        }
    }

    Ok(CursorAndWindowRect {
        cursor_x,
        cursor_y,
        win_x,
        win_y,
        win_w,
        win_h,
        work_left: wl,
        work_top: wt,
        work_right: wr,
        work_bottom: wb,
    })
}

#[tauri::command]
pub fn toggle_main_dashboard_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        let is_vis = win.is_visible().unwrap_or(false);
        let is_min = win.is_minimized().unwrap_or(false);
        if is_vis && !is_min {
            let _ = win.hide();
        } else {
            let _ = win.show();
            let _ = win.unminimize();
            let _ = win.set_focus();
        }
    }
    Ok(())
}

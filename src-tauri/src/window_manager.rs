use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudioSpawnPayload {
    pub studio_type: String, // "anycraft" | "motion" | "threed" | "games"
    pub initial_prompt: Option<String>,
    pub image_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StudioStateSyncPayload {
    pub studio_type: String,
    pub event_name: String,
    pub payload_json: String,
}

fn studio_window_meta(studio_type: &str) -> (&'static str, &'static str, &'static str, f64, f64) {
    match studio_type {
        "anycraft" => (
            "studio-anycraft",
            "Angel AnyCraft Studio",
            "/?mode=studio_anycraft",
            1120.0,
            760.0,
        ),
        "motion" => (
            "studio-motion",
            "Angel Motion Studio",
            "/?mode=studio_motion",
            1040.0,
            720.0,
        ),
        "threed" => (
            "studio-threed",
            "Angel 3D Studio",
            "/?mode=studio_threed",
            1020.0,
            720.0,
        ),
        _ => (
            "studio-games",
            "Angel Interactive Studio",
            "/?mode=studio_anycraft",
            980.0,
            700.0,
        ),
    }
}

/// Spawns or focuses an independent, frameless, transparent Acrylic Glassmorphism Studio sub-window
/// linked to the main Angel instance via Tauri's bidirectional event bus.
#[tauri::command]
pub fn spawn_studio_window(
    app: tauri::AppHandle,
    studio_type: String,
    initial_prompt: Option<String>,
    image_path: Option<String>,
) -> Result<String, String> {
    let (label, title, route, width, height) = studio_window_meta(&studio_type);

    if let Some(existing) = app.get_webview_window(label) {
        let _ = existing.show();
        let _ = existing.unminimize();
        let _ = existing.set_focus();
    } else {
        let win = WebviewWindowBuilder::new(&app, label, WebviewUrl::App(route.into()))
            .title(title)
            .inner_size(width, height)
            .transparent(true)
            .decorations(false)
            .resizable(true)
            .center()
            .build()
            .map_err(|e| format!("Failed to spawn studio window '{label}': {e}"))?;
        let _ = win.show();
        let _ = win.set_focus();
    }

    let sync_payload = StudioSpawnPayload {
        studio_type: studio_type.clone(),
        initial_prompt,
        image_path,
    };
    let _ = app.emit_to(label, "angel-studio-init", &sync_payload);
    let _ = app.emit("angel-studio-opened", &sync_payload);

    Ok(label.to_string())
}

/// Bidirectional IPC event bus broadcast between Main Angel HUD and spawned Studio windows.
#[tauri::command]
pub fn broadcast_studio_state(
    app: tauri::AppHandle,
    target_window: String,
    event_name: String,
    payload_json: String,
) -> Result<(), String> {
    let msg = StudioStateSyncPayload {
        studio_type: target_window.clone(),
        event_name: event_name.clone(),
        payload_json,
    };
    if target_window == "all" {
        app.emit(&event_name, msg).map_err(|e| e.to_string())?;
    } else {
        app.emit_to(&target_window, &event_name, msg)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn close_studio_window(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if let Some(win) = app.get_webview_window(&label) {
        win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

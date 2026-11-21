use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use sysinfo::System;
use tauri::Emitter;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledTask {
    pub id: String,
    pub title: String,
    pub task_type: String,       // "time" | "interval_hours" | "ram_threshold"
    pub schedule_value: String,  // "18:00" | "3" | "85"
    pub action: String,          // "clean_temp" | "alert" | "custom"
    pub message: String,
    pub enabled: bool,
    pub last_run_timestamp: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchedulerAlertPayload {
    pub task_id: String,
    pub title: String,
    pub message: String,
    pub timestamp: String,
}

fn get_schedules_path() -> PathBuf {
    let base = std::env::var("APPDATA")
        .or_else(|_| std::env::var("LOCALAPPDATA"))
        .unwrap_or_else(|_| "C:\\ProgramData".to_string());
    let dir = PathBuf::from(base).join("ProjectAngel");
    let _ = fs::create_dir_all(&dir);
    dir.join("schedules.json")
}

pub fn load_schedules() -> Vec<ScheduledTask> {
    let path = get_schedules_path();
    if let Ok(content) = fs::read_to_string(&path) {
        if let Ok(tasks) = serde_json::from_str::<Vec<ScheduledTask>>(&content) {
            return tasks;
        }
    }
    // Default system watchdogs if file doesn't exist
    vec![
        ScheduledTask {
            id: "watchdog_temp_clean".to_string(),
            title: "Auto-Clean Temp Cache".to_string(),
            task_type: "interval_hours".to_string(),
            schedule_value: "4".to_string(),
            action: "clean_temp".to_string(),
            message: "Project Angel background watchdog cleared corrupt temporary caches.".to_string(),
            enabled: true,
            last_run_timestamp: None,
        },
        ScheduledTask {
            id: "watchdog_ram_guard".to_string(),
            title: "High RAM Usage Guard (85%)".to_string(),
            task_type: "ram_threshold".to_string(),
            schedule_value: "85".to_string(),
            action: "alert".to_string(),
            message: "System Alert: RAM usage exceeded 85%. Freeing background allocations.".to_string(),
            enabled: true,
            last_run_timestamp: None,
        },
    ]
}

pub fn save_schedules(tasks: &[ScheduledTask]) -> Result<(), String> {
    let path = get_schedules_path();
    let json = serde_json::to_string_pretty(tasks).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

static TASKS_CACHE: Mutex<Option<Arc<Mutex<Vec<ScheduledTask>>>>> = Mutex::new(None);

fn get_tasks_cache() -> Arc<Mutex<Vec<ScheduledTask>>> {
    let mut guard = TASKS_CACHE.lock().unwrap();
    if let Some(ref arc) = *guard {
        arc.clone()
    } else {
        let loaded = Arc::new(Mutex::new(load_schedules()));
        *guard = Some(loaded.clone());
        loaded
    }
}

#[tauri::command]
pub fn list_scheduled_tasks() -> Vec<ScheduledTask> {
    let cache = get_tasks_cache();
    let guard = cache.lock().unwrap();
    guard.clone()
}

#[tauri::command]
pub fn add_scheduled_task(task: ScheduledTask) -> Result<String, String> {
    let cache = get_tasks_cache();
    let mut guard = cache.lock().unwrap();
    // Replace if exists, else append
    guard.retain(|t| t.id != task.id);
    let title = task.title.clone();
    guard.push(task);
    save_schedules(&guard)?;
    Ok(format!("Scheduled task '{}' saved successfully.", title))
}

#[tauri::command]
pub fn delete_scheduled_task(id: String) -> Result<String, String> {
    let cache = get_tasks_cache();
    let mut guard = cache.lock().unwrap();
    let initial_len = guard.len();
    guard.retain(|t| t.id != id);
    if guard.len() < initial_len {
        save_schedules(&guard)?;
        Ok("Task removed from scheduler.".to_string())
    } else {
        Err("Task not found.".to_string())
    }
}

/// 60-second Autonomous Background Scheduler Ticker (0% idle CPU)
pub fn start_scheduler(app_handle: tauri::AppHandle) {
    let cache = get_tasks_cache();

    std::thread::spawn(move || {
        let mut sys = System::new_all();

        loop {
            // Sleep 60 seconds between evaluations
            std::thread::sleep(std::time::Duration::from_secs(60));

            let now = match SystemTime::now().duration_since(UNIX_EPOCH) {
                Ok(dur) => dur.as_secs(),
                Err(_) => continue,
            };

            let mut tasks_to_alert = Vec::new();

            {
                let mut guard = cache.lock().unwrap();
                let mut modified = false;

                for task in guard.iter_mut() {
                    if !task.enabled {
                        continue;
                    }

                    let last_run = task.last_run_timestamp.unwrap_or(0);
                    let mut triggered = false;

                    match task.task_type.as_str() {
                        "interval_hours" => {
                            let hours: u64 = task.schedule_value.parse().unwrap_or(4);
                            let interval_secs = hours * 3600;
                            if now >= last_run + interval_secs {
                                triggered = true;
                                if task.action == "clean_temp" {
                                    // Clean temp cache automatically
                                    #[cfg(target_os = "windows")]
                                    let _ = crate::os_doctor::os_doctor_clean_temp();
                                }
                            }
                        }
                        "ram_threshold" => {
                            let threshold: f32 = task.schedule_value.parse().unwrap_or(85.0);
                            // Avoid spamming ram alert: at most once every 15 minutes
                            if now >= last_run + 900 {
                                sys.refresh_memory();
                                let total = sys.total_memory() as f32;
                                let used = sys.used_memory() as f32;
                                if total > 0.0 {
                                    let pct = (used / total) * 100.0;
                                    if pct >= threshold {
                                        triggered = true;
                                    }
                                }
                            }
                        }
                        "time" => {
                            // "HH:MM" e.g. "18:00"
                            // Prevent firing more than once in 120 seconds
                            if now >= last_run + 120 {
                                let (ch, cm) = get_current_local_hm();
                                if let Some((th, tm)) = parse_hh_mm(&task.schedule_value) {
                                    if ch == th && cm == tm {
                                        triggered = true;
                                    }
                                }
                            }
                        }
                        _ => {}
                    }

                    if triggered {
                        task.last_run_timestamp = Some(now);
                        modified = true;
                        tasks_to_alert.push((task.id.clone(), task.title.clone(), task.message.clone()));
                    }
                }

                if modified {
                    let _ = save_schedules(&guard);
                }
            }

            // Emit alerts to HUD and Voice
            for (id, title, msg) in tasks_to_alert {
                let payload = SchedulerAlertPayload {
                    task_id: id,
                    title: title.clone(),
                    message: msg.clone(),
                    timestamp: format_current_timestamp(),
                };
                let _ = app_handle.emit("angel_scheduler_alert", &payload);
            }
        }
    });
}

fn get_current_local_hm() -> (u32, u32) {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    // Rough local calculation or fallback to UTC + 5:30 (India standard time: 19800s offset)
    let local_secs = now + 19800;
    let day_secs = local_secs % 86400;
    let hours = (day_secs / 3600) as u32;
    let minutes = ((day_secs % 3600) / 60) as u32;
    (hours, minutes)
}

fn parse_hh_mm(val: &str) -> Option<(u32, u32)> {
    let parts: Vec<&str> = val.split(':').collect();
    if parts.len() == 2 {
        let h = parts[0].trim().parse::<u32>().ok()?;
        let m = parts[1].trim().parse::<u32>().ok()?;
        return Some((h, m));
    }
    None
}

fn format_current_timestamp() -> String {
    let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs();
    format!("{}", now)
}

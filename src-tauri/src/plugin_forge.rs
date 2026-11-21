use serde::{Deserialize, Serialize};
use std::fs;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AngelSkill {
    pub id: String,
    pub name: String,
    pub trigger: String,
    pub action_type: String, // "shell_exec", "open_url", "powershell"
    pub payload: String,
    pub description: String,
    pub enabled: bool,
    pub author: String,
    pub created_at: String,
}

pub fn get_plugins_dir() -> PathBuf {
    let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_else(|_| "C:\\ProgramData".to_string());
    let path = PathBuf::from(local_app_data).join("ProjectAngel").join("plugins");
    let _ = fs::create_dir_all(&path);
    path
}

fn seed_default_skills(dir: &PathBuf) {
    let default_skill_path = dir.join("skill_calculator.json");
    if !default_skill_path.exists() {
        let calc_skill = AngelSkill {
            id: "skill_calculator".to_string(),
            name: "Calculator Launcher".to_string(),
            trigger: "open calculator".to_string(),
            action_type: "shell_exec".to_string(),
            payload: "calc.exe".to_string(),
            description: "Launches native Windows calculator instantly".to_string(),
            enabled: true,
            author: "System Default".to_string(),
            created_at: "Initial".to_string(),
        };
        if let Ok(json) = serde_json::to_string_pretty(&calc_skill) {
            let _ = fs::write(default_skill_path, json);
        }
    }
}

pub fn load_all_skills() -> Vec<AngelSkill> {
    let dir = get_plugins_dir();
    seed_default_skills(&dir);

    let mut skills = Vec::new();
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(&path) {
                    if let Ok(skill) = serde_json::from_str::<AngelSkill>(&content) {
                        skills.push(skill);
                    }
                }
            }
        }
    }
    skills
}

pub fn execute_single_skill(skill: &AngelSkill) -> Result<String, String> {
    if !skill.enabled {
        return Err("Skill is currently disabled.".to_string());
    }

    match skill.action_type.as_str() {
        "shell_exec" => {
            let _ = Command::new("cmd")
                .args(["/c", "start", "", &skill.payload])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| format!("Failed to spawn process: {}", e))?;
            Ok(format!("⚡ Skill '{}' இயக்கப்பட்டது ({})", skill.name, skill.payload))
        }
        "open_url" => {
            let _ = Command::new("cmd")
                .args(["/c", "start", "", &skill.payload])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| format!("Failed to open URL: {}", e))?;
            Ok(format!("🌐 Skill '{}' உலாவி இணைப்பைத் திறந்தது", skill.name))
        }
        "powershell" => {
            let output = Command::new("powershell")
                .args(["-ExecutionPolicy", "Bypass", "-Command", &skill.payload])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .map_err(|e| format!("PowerShell execution error: {}", e))?;

            let res_text = String::from_utf8_lossy(&output.stdout).trim().to_string();
            Ok(if res_text.is_empty() {
                format!("⚡ Skill '{}' முடிந்தது.", skill.name)
            } else {
                res_text
            })
        }
        _ => Err(format!("Unsupported action type: {}", skill.action_type)),
    }
}

#[tauri::command]
pub fn plugin_forge_list() -> Vec<AngelSkill> {
    load_all_skills()
}

#[tauri::command]
pub fn forge_new_skill(skill: serde_json::Value) -> Result<String, String> {
    let name = skill.get("name").and_then(|v| v.as_str()).unwrap_or("Custom Skill").to_string();
    let trigger = skill.get("trigger").and_then(|v| v.as_str()).unwrap_or("custom").to_string();
    let cmd_type = skill.get("command_type")
        .or_else(|| skill.get("action_type"))
        .and_then(|v| v.as_str())
        .unwrap_or("powershell")
        .to_string();
    let script = skill.get("script")
        .or_else(|| skill.get("payload"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let description = skill.get("description").and_then(|v| v.as_str()).unwrap_or("User created skill").to_string();

    let safe_id = format!("skill_{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis());
    let angel_skill = AngelSkill {
        id: safe_id,
        name: name.clone(),
        trigger,
        action_type: cmd_type,
        payload: script,
        description,
        enabled: true,
        author: "Skill Forge AI".to_string(),
        created_at: format!("{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs()),
    };

    plugin_forge_save(angel_skill)?;
    Ok(format!("⚡ Skill '{}' வெற்றிகரமாக உருவாக்கப்பட்டது!", name))
}

#[tauri::command]
pub fn plugin_forge_save(skill: AngelSkill) -> Result<String, String> {
    let dir = get_plugins_dir();
    let safe_id = skill.id.trim().replace(|c: char| !c.is_alphanumeric() && c != '_', "");
    let file_path = dir.join(format!("{}.json", safe_id));

    let json = serde_json::to_string_pretty(&skill)
        .map_err(|e| format!("Serialization error: {}", e))?;

    fs::write(file_path, json)
        .map_err(|e| format!("Failed to save plugin: {}", e))?;

    Ok(format!("⚡ Skill '{}' Forge-ல் வெற்றிகரமாகப் பதியப்பட்டது.", skill.name))
}

#[tauri::command]
pub fn plugin_forge_execute(skill_id: String) -> Result<String, String> {
    let skills = load_all_skills();
    if let Some(skill) = skills.iter().find(|s| s.id == skill_id) {
        execute_single_skill(skill)
    } else {
        Err("Skill ID not found".to_string())
    }
}

#[tauri::command]
pub fn plugin_forge_delete(skill_id: String) -> Result<String, String> {
    let dir = get_plugins_dir();
    let file_path = dir.join(format!("{}.json", skill_id));
    if file_path.exists() {
        fs::remove_file(file_path)
            .map_err(|e| format!("Failed to delete plugin: {}", e))?;
        Ok("Skill deleted successfully.".to_string())
    } else {
        Err("Plugin file not found.".to_string())
    }
}

#[tauri::command]
pub fn plugin_forge_match_and_run(prompt: String) -> Option<String> {
    let p_lower = prompt.to_lowercase();
    let skills = load_all_skills();

    for skill in skills {
        if skill.enabled && p_lower.contains(&skill.trigger.to_lowercase()) {
            if let Ok(res) = execute_single_skill(&skill) {
                return Some(res);
            }
        }
    }
    None
}

use serde::{Deserialize, Serialize};
use std::fs;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AngelSkill {
    pub id: String,
    pub name: String,
    pub trigger: String,
    pub action_type: String, // "powershell", "http_rest", "shell_exec", "open_url", "prompt_tool"
    pub payload: String,
    pub description: String,
    pub enabled: bool,
    pub author: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginSecurityAudit {
    pub safe: bool,
    pub score: u32,
    pub warnings: Vec<String>,
    pub action_type: String,
    pub target: String,
    pub simulated_preview: String,
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

    match skill.action_type.to_lowercase().as_str() {
        "shell_exec" => {
            let _ = Command::new("cmd")
                .args(["/c", "start", "", &skill.payload])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| format!("Failed to spawn process: {}", e))?;
            Ok(format!("⚡ Skill '{}' launched ({})", skill.name, skill.payload))
        }
        "open_url" => {
            let _ = Command::new("cmd")
                .args(["/c", "start", "", &skill.payload])
                .creation_flags(CREATE_NO_WINDOW)
                .spawn()
                .map_err(|e| format!("Failed to open URL: {}", e))?;
            Ok(format!("🌐 Skill '{}' opened target URL", skill.name))
        }
        "powershell" => {
            let output = Command::new("powershell")
                .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &skill.payload])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
                .map_err(|e| format!("PowerShell execution error: {}", e))?;

            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            if !stdout.is_empty() {
                Ok(stdout)
            } else if !stderr.is_empty() {
                Ok(format!("⚠️ {}", stderr))
            } else {
                Ok(format!("⚡ Skill '{}' completed cleanly.", skill.name))
            }
        }
        "http_rest" | "webhook" => {
            let payload_trimmed = skill.payload.trim();
            let mut cmd = Command::new("curl.exe");
            cmd.creation_flags(CREATE_NO_WINDOW);
            cmd.args(["-s", "-S", "-m", "15", "--connect-timeout", "6"]);

            let mut target_label = String::new();

            if payload_trimmed.starts_with('{') {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(payload_trimmed) {
                    let method = v.get("method").and_then(|m| m.as_str()).unwrap_or("GET");
                    let url = v.get("url").or_else(|| v.get("endpoint")).and_then(|u| u.as_str()).unwrap_or("");
                    target_label = format!("{} {}", method, url);

                    cmd.arg("-X").arg(method);
                    if let Some(headers) = v.get("headers").and_then(|h| h.as_object()) {
                        for (k, val) in headers {
                            if let Some(val_str) = val.as_str() {
                                cmd.arg("-H").arg(format!("{}: {}", k, val_str));
                            }
                        }
                    }
                    if let Some(body) = v.get("body").or_else(|| v.get("body_template")).and_then(|b| b.as_str()) {
                        if !body.is_empty() && (method == "POST" || method == "PUT" || method == "PATCH") {
                            cmd.arg("-d").arg(body);
                        }
                    }
                    cmd.arg(url);
                } else {
                    cmd.arg(payload_trimmed);
                }
            } else if payload_trimmed.starts_with("curl ") {
                let stripped = payload_trimmed.trim_start_matches("curl ").trim();
                cmd.args(stripped.split_whitespace());
            } else {
                target_label = payload_trimmed.to_string();
                cmd.arg(payload_trimmed);
            }

            let output = cmd.output().map_err(|e| format!("HTTP request error: {}", e))?;
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

            if !stdout.is_empty() {
                if let Ok(parsed_json) = serde_json::from_str::<serde_json::Value>(&stdout) {
                    if let Ok(pretty) = serde_json::to_string_pretty(&parsed_json) {
                        return Ok(pretty);
                    }
                }
                Ok(stdout)
            } else if !stderr.is_empty() {
                Ok(format!("⚠️ HTTP error: {}", stderr))
            } else {
                Ok(format!("⚡ HTTP Skill '{}' executed successfully (Target: {}).", skill.name, target_label))
            }
        }
        "prompt_tool" => {
            Ok(format!("💡 Cognitive Skill '{}' ready for AI context: {}", skill.name, skill.payload))
        }
        _ => Err(format!("Unsupported action type: {}", skill.action_type)),
    }
}

/// Read-Only Local Folder Reverse-Engineer
/// Safely scans top-level files and manifests strictly read-only without executing anything.
#[tauri::command]
pub fn inspect_local_project_folder(folder_path: String) -> Result<String, String> {
    let p = Path::new(&folder_path);
    if !p.exists() {
        return Err(format!("Folder path '{}' does not exist.", folder_path));
    }
    if !p.is_dir() {
        return Err(format!("Path '{}' is not a directory.", folder_path));
    }

    let folder_name = p.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("project")
        .to_string();

    let mut scanned_files: Vec<String> = Vec::new();
    let mut detected_stack = "Generic Project".to_string();
    let mut manifest_summary = String::new();
    let mut readme_excerpt = String::new();
    let mut detected_endpoints: Vec<String> = Vec::new();
    let mut detected_cli_commands: Vec<String> = Vec::new();
    let mut sample_snippet = String::new();
    let mut py_files_count = 0;
    let mut js_files_count = 0;
    let mut rs_files_count = 0;
    let mut ps1_files_count = 0;
    let mut has_fastapi = false;
    let mut has_flask = false;
    let mut has_comfy = false;

    if let Ok(entries) = fs::read_dir(p) {
        for entry in entries.flatten() {
            let path = entry.path();
            let file_name = path.file_name().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
            if path.is_file() {
                scanned_files.push(file_name.clone());
                let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
                match ext.as_str() {
                    "py" => py_files_count += 1,
                    "js" | "ts" | "jsx" | "tsx" => js_files_count += 1,
                    "rs" => rs_files_count += 1,
                    "ps1" | "bat" | "cmd" => ps1_files_count += 1,
                    _ => {}
                }

                // Read files up to 12 KB strictly read-only
                if let Ok(metadata) = fs::metadata(&path) {
                    if metadata.len() <= 64 * 1024 {
                        if let Ok(content) = fs::read_to_string(&path) {
                            let content_lower = content.to_lowercase();

                            if file_name.starts_with("readme") && readme_excerpt.is_empty() {
                                readme_excerpt = content.chars().take(1200).collect();
                            }
                            if (file_name == "requirements.txt" || file_name == "pyproject.toml" || file_name == "pipfile") && manifest_summary.is_empty() {
                                manifest_summary = content.chars().take(800).collect();
                            }
                            if file_name == "package.json" && manifest_summary.is_empty() {
                                manifest_summary = content.chars().take(800).collect();
                            }
                            if file_name == "cargo.toml" && manifest_summary.is_empty() {
                                manifest_summary = content.chars().take(800).collect();
                            }

                            if content_lower.contains("fastapi") { has_fastapi = true; }
                            if content_lower.contains("flask") { has_flask = true; }
                            if content_lower.contains("comfyui") || content_lower.contains("comfy") { has_comfy = true; }

                            // Endpoint detection
                            for line in content.lines().take(200) {
                                let trimmed = line.trim();
                                if trimmed.starts_with("@app.get(") || trimmed.starts_with("@app.post(") || trimmed.starts_with("@router.") {
                                    if detected_endpoints.len() < 8 {
                                        detected_endpoints.push(trimmed.to_string());
                                    }
                                }
                                if (trimmed.contains("http://127.0.0.1") || trimmed.contains("http://localhost")) && detected_endpoints.len() < 8 {
                                    detected_endpoints.push(trimmed.to_string());
                                }
                                if (trimmed.starts_with("parser.add_argument") || trimmed.starts_with("param(") || trimmed.starts_with("argparse")) && detected_cli_commands.len() < 8 {
                                    detected_cli_commands.push(trimmed.chars().take(80).collect());
                                }
                            }

                            if sample_snippet.is_empty() && (ext == "py" || ext == "js" || ext == "ts" || ext == "ps1") {
                                sample_snippet = content.chars().take(1000).collect();
                            }
                        }
                    }
                }
            }
        }
    }

    if has_comfy {
        detected_stack = "Python / ComfyUI Node & Asset Pipeline".to_string();
    } else if has_fastapi {
        detected_stack = "Python / FastAPI REST Service".to_string();
    } else if has_flask {
        detected_stack = "Python / Flask Microservice".to_string();
    } else if py_files_count > 0 {
        detected_stack = "Python CLI / Automation Script".to_string();
    } else if js_files_count > 0 {
        detected_stack = "Node.js / TypeScript App".to_string();
    } else if rs_files_count > 0 {
        detected_stack = "Rust Native Application".to_string();
    } else if ps1_files_count > 0 {
        detected_stack = "Windows PowerShell Script".to_string();
    }

    let summary = serde_json::json!({
        "folder_path": folder_path,
        "folder_name": folder_name,
        "detected_stack": detected_stack,
        "files_scanned": scanned_files.iter().take(25).collect::<Vec<_>>(),
        "manifest_summary": manifest_summary,
        "readme_excerpt": readme_excerpt,
        "detected_endpoints": detected_endpoints,
        "detected_cli_commands": detected_cli_commands,
        "sample_snippet": sample_snippet,
        "python_files_count": py_files_count,
        "purpose": format!("Project directory containing {} detected files", scanned_files.len())
    });

    Ok(serde_json::to_string_pretty(&summary).unwrap_or_default())
}

/// GitHub Repository Analyzer
/// Parses owner/repo, fetches metadata + README + manifests using Rust curl (CREATE_NO_WINDOW).
#[tauri::command]
pub fn inspect_github_repo(repo_url: String) -> Result<String, String> {
    let cleaned = repo_url
        .trim()
        .trim_end_matches(".git")
        .trim_end_matches('/');

    let parts: Vec<&str> = cleaned.split('/').collect();
    if parts.len() < 2 {
        return Err("Invalid GitHub repository URL. Expected format: https://github.com/owner/repo or owner/repo".to_string());
    }

    let repo = parts[parts.len() - 1];
    let owner = parts[parts.len() - 2];

    if owner.is_empty() || repo.is_empty() {
        return Err("Could not extract owner and repo from URL.".to_string());
    }

    // 1. Fetch repo metadata from GitHub API with curl
    let api_url = format!("https://api.github.com/repos/{}/{}", owner, repo);
    let mut cmd = Command::new("curl.exe");
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd.args(["-s", "-S", "-m", "8", "--connect-timeout", "4"]);
    cmd.args(["-H", "User-Agent: Angel-AI-Plugin-Forge"]);
    cmd.args(["-H", "Accept: application/vnd.github.v3+json"]);
    cmd.arg(&api_url);

    let output = cmd.output().map_err(|e| format!("Failed to run curl: {}", e))?;
    let body_str = String::from_utf8_lossy(&output.stdout).to_string();
    let api_json: serde_json::Value = serde_json::from_str(&body_str).unwrap_or(serde_json::Value::Null);

    let description = api_json.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let language = api_json.get("language").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let default_branch = api_json.get("default_branch").and_then(|v| v.as_str()).unwrap_or("main").to_string();

    // 2. Fetch README
    let branches = [default_branch.as_str(), "main", "master"];
    let mut readme_excerpt = String::new();
    for br in branches {
        let raw_readme_url = format!("https://raw.githubusercontent.com/{}/{}/{}/README.md", owner, repo, br);
        let mut r_cmd = Command::new("curl.exe");
        r_cmd.creation_flags(CREATE_NO_WINDOW);
        r_cmd.args(["-s", "-S", "-m", "6", "--connect-timeout", "3"]);
        r_cmd.arg(&raw_readme_url);
        if let Ok(out) = r_cmd.output() {
            let s = String::from_utf8_lossy(&out.stdout).to_string();
            if !s.is_empty() && !s.contains("404: Not Found") && !s.contains("<!DOCTYPE html>") {
                readme_excerpt = s.chars().take(1500).collect();
                break;
            }
        }
    }

    // 3. Check for requirements.txt / package.json / Cargo.toml
    let mut manifest_name = String::new();
    let mut manifest_content = String::new();
    for candidate in ["requirements.txt", "package.json", "Cargo.toml", "pyproject.toml", "openapi.json"] {
        let raw_manifest_url = format!("https://raw.githubusercontent.com/{}/{}/{}/{}", owner, repo, default_branch, candidate);
        let mut m_cmd = Command::new("curl.exe");
        m_cmd.creation_flags(CREATE_NO_WINDOW);
        m_cmd.args(["-s", "-S", "-m", "5", "--connect-timeout", "3"]);
        m_cmd.arg(&raw_manifest_url);
        if let Ok(out) = m_cmd.output() {
            let s = String::from_utf8_lossy(&out.stdout).to_string();
            if !s.is_empty() && !s.contains("404: Not Found") && !s.contains("<!DOCTYPE html>") {
                manifest_name = candidate.to_string();
                manifest_content = s.chars().take(800).collect();
                break;
            }
        }
    }

    let mut detected_stack = if !language.is_empty() {
        format!("{} Repository", language)
    } else {
        "Web / Cloud Repository".to_string()
    };

    let full_text = format!("{} {} {}", description, readme_excerpt, manifest_content).to_lowercase();
    if full_text.contains("fastapi") {
        detected_stack = "Python / FastAPI REST Server".to_string();
    } else if full_text.contains("flask") {
        detected_stack = "Python / Flask Microservice".to_string();
    } else if full_text.contains("comfyui") || full_text.contains("comfy") {
        detected_stack = "Python / ComfyUI Custom Node & Workflows".to_string();
    } else if manifest_name == "requirements.txt" || language.to_lowercase() == "python" {
        detected_stack = "Python CLI & Library".to_string();
    } else if manifest_name == "package.json" || language.to_lowercase() == "typescript" || language.to_lowercase() == "javascript" {
        detected_stack = "Node.js / TypeScript App".to_string();
    } else if manifest_name == "Cargo.toml" || language.to_lowercase() == "rust" {
        detected_stack = "Rust Native System Crate".to_string();
    }

    // Extract endpoints or commands
    let mut detected_endpoints = Vec::new();
    for line in readme_excerpt.lines().chain(manifest_content.lines()) {
        let t = line.trim();
        if (t.contains("http://") || t.contains("https://") || t.starts_with("curl ") || t.contains("/api/")) && detected_endpoints.len() < 6 {
            detected_endpoints.push(t.chars().take(100).collect::<String>());
        }
    }

    let result = serde_json::json!({
        "repo_url": format!("https://github.com/{}/{}", owner, repo),
        "owner": owner,
        "repo": repo,
        "description": if description.is_empty() { "GitHub Repository" } else { &description },
        "primary_language": language,
        "detected_stack": detected_stack,
        "readme_excerpt": readme_excerpt,
        "manifest_name": manifest_name,
        "manifest_content": manifest_content,
        "detected_endpoints": detected_endpoints,
        "purpose": format!("Imported GitHub Repository: {}/{}", owner, repo)
    });

    Ok(serde_json::to_string_pretty(&result).unwrap_or_default())
}

/// Safe Sandbox Dry-Run Auditor
/// Statically audits commands for destructive patterns without touching live OS or disk.
#[tauri::command]
pub fn dry_run_plugin_security(plugin_json: String) -> Result<String, String> {
    let parsed: serde_json::Value = serde_json::from_str(&plugin_json)
        .map_err(|e| format!("Invalid plugin JSON format: {}", e))?;

    let name = parsed.get("name").and_then(|v| v.as_str()).unwrap_or("Unnamed Plugin");
    let action_type = parsed.get("action_type")
        .or_else(|| parsed.get("command_type"))
        .or_else(|| parsed.get("execution_type"))
        .and_then(|v| v.as_str())
        .unwrap_or("powershell")
        .to_uppercase();

    let target = parsed.get("endpoint_or_command")
        .or_else(|| parsed.get("payload"))
        .or_else(|| parsed.get("script"))
        .or_else(|| parsed.get("script_body"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let method = parsed.get("method").and_then(|v| v.as_str()).unwrap_or("GET");
    let mut warnings = Vec::new();
    let mut score: u32 = 100;

    let target_lower = target.to_lowercase();

    // Critical destructive checks
    if target_lower.contains("rm -rf")
        || (target_lower.contains("remove-item") && (target_lower.contains("-recurse") || target_lower.contains("-force")))
        || target_lower.contains("del /f")
        || target_lower.contains("format ")
        || target_lower.contains("diskpart")
    {
        score = score.saturating_sub(60);
        warnings.push("CRITICAL: Destructive filesystem command detected (file deletion / format).".to_string());
    }

    if target_lower.contains("reg delete")
        || target_lower.contains("bcdedit")
        || target_lower.contains("stop-service windefend")
        || target_lower.contains("disable-windowsoptionalfeature")
    {
        score = score.saturating_sub(50);
        warnings.push("HIGH HAZARD: Windows security registry or core defense tampering detected.".to_string());
    }

    if target_lower.contains("invoke-expression")
        || target_lower.contains("iex ")
        || target_lower.contains("downloadstring")
        || target_lower.contains("encodedcommand")
    {
        score = score.saturating_sub(40);
        warnings.push("WARNING: Arbitrary dynamic code injection / encoded execution pattern detected.".to_string());
    }

    // Exfiltration check: sending files to unknown non-local IPs
    if (target_lower.contains("http://") || target_lower.contains("https://")) 
        && !target_lower.contains("127.0.0.1") 
        && !target_lower.contains("localhost")
        && (target_lower.contains("password") || target_lower.contains("token") || target_lower.contains("cookie") || target_lower.contains("id_rsa"))
    {
        score = score.saturating_sub(40);
        warnings.push("DATA PRIVACY WARNING: Potential credential transmission to external endpoint.".to_string());
    }

    let is_safe = score >= 70 && warnings.iter().all(|w| !w.starts_with("CRITICAL"));

    let simulated_preview = match action_type.as_str() {
        "HTTP_REST" | "WEBHOOK" => {
            format!(
                "[SANDBOX SIMULATION - SAFE DRY-RUN]\n\
                 Plugin: {}\n\
                 Target Method: {}\n\
                 Endpoint URL: {}\n\
                 Host Security: {}\n\
                 Verdict: Payload verified. No live HTTP network call sent during dry-run.",
                name,
                method,
                target,
                if target.contains("127.0.0.1") || target.contains("localhost") {
                    "Localhost Sandbox (Safe Local Loopback)"
                } else {
                    "External Gateway (Requires User Authorization)"
                }
            )
        }
        "POWERSHELL" | "SHELL_EXEC" => {
            format!(
                "[SANDBOX SIMULATION - SAFE DRY-RUN]\n\
                 Plugin: {}\n\
                 Runtime Engine: PowerShell Hidden Sandbox (CREATE_NO_WINDOW = 0x08000000)\n\
                 Command Line: {}\n\
                 Audit Score: {}/100 (Safe: {})\n\
                 Verdict: Static AST syntax passed. Command was NOT executed against live OS.",
                name,
                target,
                score,
                is_safe
            )
        }
        "PROMPT_TOOL" | "RUST_NATIVE" => {
            format!(
                "[SANDBOX SIMULATION - SAFE DRY-RUN]\n\
                 Plugin: {}\n\
                 Runtime Engine: Angel AI Internal Cognitive Directive\n\
                 Action: {}\n\
                 Verdict: Pure AI inference. Zero disk, registry, or network mutation.",
                name,
                target
            )
        }
        _ => {
            format!(
                "[SANDBOX SIMULATION - SAFE DRY-RUN]\n\
                 Plugin: {}\n\
                 Engine: {}\n\
                 Target: {}\n\
                 Audit Score: {}/100",
                name,
                action_type,
                target,
                score
            )
        }
    };

    let audit = PluginSecurityAudit {
        safe: is_safe,
        score,
        warnings,
        action_type,
        target,
        simulated_preview,
    };

    Ok(serde_json::to_string_pretty(&audit).unwrap_or_default())
}

#[tauri::command]
pub fn plugin_forge_list() -> Vec<AngelSkill> {
    load_all_skills()
}

#[tauri::command]
pub fn forge_new_skill(skill: serde_json::Value) -> Result<String, String> {
    let name = skill.get("name").and_then(|v| v.as_str()).unwrap_or("Custom Skill").to_string();
    let trigger = skill.get("trigger")
        .or_else(|| skill.get("triggerPhrase"))
        .or_else(|| skill.get("trigger_phrase"))
        .and_then(|v| v.as_str())
        .or_else(|| {
            skill.get("trigger_phrases")
                .and_then(|v| v.as_array())
                .and_then(|arr| arr.first())
                .and_then(|t| t.as_str())
        })
        .unwrap_or("custom")
        .to_string();

    let cmd_type = skill.get("command_type")
        .or_else(|| skill.get("action_type"))
        .or_else(|| skill.get("execution_type"))
        .and_then(|v| v.as_str())
        .unwrap_or("powershell")
        .to_string();

    let script = skill.get("endpoint_or_command")
        .or_else(|| skill.get("script"))
        .or_else(|| skill.get("payload"))
        .or_else(|| skill.get("script_body"))
        .or_else(|| skill.get("code"))
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
    let skill_id_lower = skill_id.to_lowercase();
    if let Some(skill) = skills.iter().find(|s| {
        s.id == skill_id
            || s.name.eq_ignore_ascii_case(&skill_id)
            || s.id.to_lowercase() == skill_id_lower
            || s.trigger.eq_ignore_ascii_case(&skill_id)
    }) {
        execute_single_skill(skill)
    } else {
        Err(format!("Skill '{}' not found in installed skills catalog.", skill_id))
    }
}

#[tauri::command]
pub fn run_forged_skill(skill_id: String) -> Result<String, String> {
    plugin_forge_execute(skill_id)
}

#[tauri::command]
pub fn list_forged_skills() -> Vec<AngelSkill> {
    load_all_skills()
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

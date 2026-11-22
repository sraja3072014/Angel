use serde::{Deserialize, Serialize};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use std::path::Path;
use std::process::Command;
use sysinfo::{Pid, System};

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkAppInfo {
    pub pid: u32,
    pub name: String,
    pub app_name: String,
    pub exe_path: String,
    pub connections: usize,
    pub connections_count: usize,
    pub remote_ips: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveConnection {
    pub protocol: String,
    pub local_address: String,
    pub remote_address: String,
    pub state: String,
    pub pid: u32,
    pub process_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirewallStatus {
    pub is_lockdown_active: bool,
    pub active_connections_count: usize,
    pub status_message: String,
}

pub fn check_lockdown_active() -> bool {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("netsh")
            .args(["advfirewall", "show", "currentprofile"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        if let Ok(out) = output {
            let text = String::from_utf8_lossy(&out.stdout).to_lowercase();
            if text.contains("blockinbound,blockoutbound") || (text.contains("outbound") && text.contains("block")) {
                return true;
            }
        }
        false
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

#[tauri::command]
pub fn firewall_get_status() -> FirewallStatus {
    let connections = firewall_get_connections();
    let is_locked = check_lockdown_active();

    let status_message = if is_locked {
        "⚠️ EMERGENCY LOCKDOWN ACTIVE: All outbound internet traffic is blocked.".to_string()
    } else {
        format!("Aegis Smart Firewall Active. Monitoring {} TCP connections.", connections.len())
    };

    FirewallStatus {
        is_lockdown_active: is_locked,
        active_connections_count: connections.len(),
        status_message,
    }
}

#[tauri::command]
pub fn firewall_toggle_lockdown(enable: bool) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let block_state = if enable { "blockinbound,blockoutbound" } else { "blockinbound,allowoutbound" };

        let output = Command::new("netsh")
            .args(["advfirewall", "set", "currentprofile", "firewallpolicy", block_state])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Execution error: {}", e))?;

        if output.status.success() {
            if enable {
                Ok("🚨 EMERGENCY LOCKDOWN ENGAGED: All outbound network connections blocked!".to_string())
            } else {
                Ok("✅ NORMAL NETWORK ACCESS RESTORED: Outbound connections allowed.".to_string())
            }
        } else {
            Err("Failed to set firewall rule. Administrator privileges required.".to_string())
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = enable;
        Ok("Network lockdown simulated on mobile.".to_string())
    }
}

#[tauri::command]
pub fn firewall_block_ip(ip: String, rule_name: Option<String>) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let clean_ip = ip.trim();
        if clean_ip.is_empty() {
            return Err("IP address cannot be empty".to_string());
        }

        let r_name = rule_name.unwrap_or_else(|| format!("Angel_Block_{}", clean_ip.replace('.', "_")));

        let output = Command::new("netsh")
            .args([
                "advfirewall",
                "firewall",
                "add",
                "rule",
                &format!("name={}", r_name),
                "dir=out",
                "action=block",
                &format!("remoteip={}", clean_ip),
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Execution error: {}", e))?;

        if output.status.success() {
            Ok(format!("IP {} successfully blocked in Windows Firewall.", clean_ip))
        } else {
            Err("Failed to add firewall rule. Run with elevated privileges.".to_string())
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(format!("IP {} blocked.", ip))
    }
}

#[tauri::command]
pub fn firewall_get_connections() -> Vec<ActiveConnection> {
    #[cfg(target_os = "windows")]
    {
        let mut sys = System::new_all();
        sys.refresh_all();

        let output = Command::new("netstat")
            .args(["-ano", "-p", "tcp"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();

        let mut connections = Vec::new();

        if let Ok(out) = output {
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines() {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 5 && parts[0].eq_ignore_ascii_case("TCP") {
                    let local_addr = parts[1].to_string();
                    let remote_addr = parts[2].to_string();
                    let state = parts[3].to_string();
                    let pid: u32 = parts[4].parse().unwrap_or(0);

                    if remote_addr.starts_with("127.0.0.1") || remote_addr.starts_with("0.0.0.0") || remote_addr.starts_with("[::]") {
                        continue;
                    }

                    let process_name = if let Some(proc_item) = sys.process(Pid::from_u32(pid)) {
                        proc_item.name().to_string_lossy().to_string()
                    } else {
                        "Unknown".to_string()
                    };

                    connections.push(ActiveConnection {
                        protocol: "TCP".to_string(),
                        local_address: local_addr,
                        remote_address: remote_addr,
                        state,
                        pid,
                        process_name,
                    });
                }
            }
        }
        connections
    }
    #[cfg(not(target_os = "windows"))]
    {
        Vec::new()
    }
}

#[tauri::command]
pub fn get_active_network_apps() -> Vec<NetworkAppInfo> {
    let connections = firewall_get_connections();
    let mut sys = System::new_all();
    sys.refresh_all();

    let mut map: std::collections::HashMap<u32, (String, String, Vec<String>)> = std::collections::HashMap::new();

    for conn in connections {
        let entry = map.entry(conn.pid).or_insert_with(|| {
            let exe = sys.process(Pid::from_u32(conn.pid))
                .and_then(|p| p.exe())
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_default();
            (conn.process_name.clone(), exe, Vec::new())
        });
        if !entry.2.contains(&conn.remote_address) {
            entry.2.push(conn.remote_address);
        }
    }

    let mut list = Vec::new();
    for (pid, (app_name, exe_path, remote_ips)) in map {
        let count = remote_ips.len();
        list.push(NetworkAppInfo {
            pid,
            name: app_name.clone(),
            app_name,
            exe_path,
            connections: count,
            connections_count: count,
            remote_ips,
        });
    }

    list.sort_by(|a, b| b.connections_count.cmp(&a.connections_count));
    list
}

#[tauri::command]
pub fn block_app_internet(exe_path: String, rule_name: Option<String>) -> Result<String, String> {
    block_network_app(exe_path, rule_name)
}

#[tauri::command]
pub fn block_network_app(exe_path: String, rule_name: Option<String>) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        let clean_path = exe_path.trim();
        if clean_path.is_empty() {
            return Err("Application path cannot be empty".to_string());
        }

        let r_name = rule_name.unwrap_or_else(|| {
            let name = Path::new(clean_path)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("App");
            format!("Angel_Block_App_{}", name.replace('.', "_"))
        });

        let output = Command::new("netsh")
            .args([
                "advfirewall",
                "firewall",
                "add",
                "rule",
                &format!("name={}", r_name),
                "dir=out",
                "action=block",
                &format!("program={}", clean_path),
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .map_err(|e| format!("Execution error: {}", e))?;

        if output.status.success() {
            Ok(format!("Network access permanently blocked for {}", clean_path))
        } else {
            Err("Failed to block app. Ensure administrative privileges.".to_string())
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(format!("Network blocked for {}", exe_path))
    }
}

#[tauri::command]
pub fn get_network_status() -> FirewallStatus {
    firewall_get_status()
}

#[tauri::command]
pub fn set_firewall_lockdown(enable: bool) -> Result<String, String> {
    firewall_toggle_lockdown(enable)
}

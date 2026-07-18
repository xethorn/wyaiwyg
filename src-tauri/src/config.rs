use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{Read, Write};
use std::path::Path;
use std::process::Command;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AppConfig {
    pub active_provider: String, // "agy" | "claude" | "gemini_api" | "mock"
    pub agy_path: String,
    pub claude_command: String,
    pub gemini_api_key: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DetectedTools {
    pub agy: bool,
    pub claude: bool,
}

// Automatically detect which CLI tools are installed on the user's machine
pub fn detect_tools() -> DetectedTools {
    let agy = Command::new("which")
        .arg("agy")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
        || Path::new("/Users/michaelortali/.local/bin/agy").exists();

    let claude = Command::new("which")
        .arg("claude")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    DetectedTools { agy, claude }
}

impl Default for AppConfig {
    fn default() -> Self {
        let tools = detect_tools();
        let default_provider = if tools.agy {
            "agy"
        } else if tools.claude {
            "claude"
        } else {
            "mock"
        };

        Self {
            active_provider: default_provider.to_string(),
            agy_path: "/Users/michaelortali/.local/bin/agy".to_string(),
            claude_command: "claude".to_string(),
            gemini_api_key: "".to_string(),
        }
    }
}

fn get_config_path() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/Users/michaelortali".to_string());
    let dir = Path::new(&home).join(".wysiwyg");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("config.json")
}

pub fn load() -> AppConfig {
    let path = get_config_path();
    if !path.exists() {
        return AppConfig::default();
    }

    let mut file = match File::open(&path) {
        Ok(f) => f,
        Err(_) => return AppConfig::default(),
    };

    let mut contents = String::new();
    if file.read_to_string(&mut contents).is_err() {
        return AppConfig::default();
    }

    serde_json::from_str(&contents).unwrap_or_else(|_| AppConfig::default())
}

pub fn save(config: &AppConfig) -> Result<(), String> {
    let path = get_config_path();
    let serialized = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    let mut file = File::create(&path)
        .map_err(|e| format!("Failed to create config file: {}", e))?;

    file.write_all(serialized.as_bytes())
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    Ok(())
}

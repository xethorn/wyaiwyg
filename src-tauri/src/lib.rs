mod github;
mod config;
mod agent;

use github::{Task, AgentLog};
use config::AppConfig;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn fetch_tasks() -> Result<Vec<Task>, String> {
    github::get_issues()
}

#[tauri::command]
fn create_task(title: String, description: String) -> Result<Task, String> {
    github::create_issue(&title, &description)
}

#[tauri::command]
fn execute_task(task_id: String) -> Result<Vec<AgentLog>, String> {
    agent::execute(&task_id)
}

#[tauri::command]
fn get_config() -> AppConfig {
    config::load()
}

#[tauri::command]
fn save_config(config: AppConfig) -> Result<(), String> {
    config::save(&config)
}

#[tauri::command]
fn detect_tools() -> config::DetectedTools {
    config::detect_tools()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet, 
            fetch_tasks, 
            create_task, 
            execute_task,
            get_config,
            save_config,
            detect_tools
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

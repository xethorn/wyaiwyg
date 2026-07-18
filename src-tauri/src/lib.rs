mod github;
mod config;
mod agent;
mod editor;

use std::sync::Mutex;
use github::{Task, AgentLog};
use config::AppConfig;

pub struct ProjectState {
    pub current_path: Mutex<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ProjectInfo {
    pub name: String,
    pub path: String,
    pub is_git: bool,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn fetch_tasks(state: tauri::State<ProjectState>) -> Result<Vec<Task>, String> {
    let path = state.current_path.lock().map_err(|e| e.to_string())?;
    github::get_issues(&path)
}

#[tauri::command]
fn create_task(state: tauri::State<ProjectState>, title: String, description: String) -> Result<Task, String> {
    let path = state.current_path.lock().map_err(|e| e.to_string())?;
    github::create_issue(&path, &title, &description)
}

#[tauri::command]
fn execute_task(state: tauri::State<ProjectState>, task_id: String) -> Result<Vec<AgentLog>, String> {
    let path = state.current_path.lock().map_err(|e| e.to_string())?;
    agent::execute(&path, &task_id)
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

#[tauri::command]
fn get_dir_entries(state: tauri::State<ProjectState>, dir_path: Option<String>) -> Result<Vec<editor::FileEntry>, String> {
    let project_path = state.current_path.lock().map_err(|e| e.to_string())?;
    let target_path = match dir_path {
        Some(p) => std::path::Path::new(&*project_path).join(p).to_string_lossy().to_string(),
        None => project_path.clone(),
    };
    editor::get_dir_entries(Some(target_path))
}

#[tauri::command]
fn get_file_content(file_path: String) -> Result<String, String> {
    editor::get_file_content(&file_path)
}

#[tauri::command]
fn save_file_content(file_path: String, content: String) -> Result<(), String> {
    editor::save_file_content(&file_path, &content)
}

#[tauri::command]
fn get_project_info(state: tauri::State<ProjectState>) -> Result<ProjectInfo, String> {
    let path_str = state.current_path.lock().map_err(|e| e.to_string())?;
    let canonical = std::path::Path::new(&*path_str).canonicalize()
        .map_err(|e| format!("Failed to resolve workspace path {}: {}", path_str, e))?;
    
    let name = canonical.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "wyaiwyg".to_string());
        
    let path = canonical.to_string_lossy().to_string();
    let is_git = canonical.join(".git").exists();
    
    Ok(ProjectInfo { name, path, is_git })
}

#[tauri::command]
fn select_project_folder(state: tauri::State<ProjectState>) -> Result<Option<ProjectInfo>, String> {
    let folder = rfd::FileDialog::new()
        .set_title("Select Project Folder")
        .pick_folder();
        
    if let Some(path_buf) = folder {
        let path_str = path_buf.to_string_lossy().to_string();
        {
            let mut current = state.current_path.lock().map_err(|e| e.to_string())?;
            *current = path_str;
        }
        let info = get_project_info(state)?;
        Ok(Some(info))
    } else {
        Ok(None)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let default_path = std::env::current_dir()
        .ok()
        .and_then(|cwd| cwd.parent().map(|p| p.to_string_lossy().to_string()))
        .unwrap_or_else(|| ".".to_string());

    tauri::Builder::default()
        .manage(ProjectState {
            current_path: Mutex::new(default_path),
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet, 
            fetch_tasks, 
            create_task, 
            execute_task,
            get_config,
            save_config,
            detect_tools,
            get_dir_entries,
            get_file_content,
            save_file_content,
            get_project_info,
            select_project_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

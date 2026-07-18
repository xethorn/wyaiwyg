mod github;
mod config;
mod agent;
mod editor;

use std::sync::Mutex;
use github::{Task, AgentLog};
use config::AppConfig;

pub struct ProjectState {
    pub current_path: Mutex<Option<String>>,
    pub all_projects: Mutex<Vec<String>>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct ProjectInfo {
    pub name: String,
    pub path: String,
    pub is_git: bool,
}

fn get_projects_path() -> std::path::PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/Users/michaelortali".to_string());
    let dir = std::path::Path::new(&home).join(".wysiwyg");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("projects.json")
}

fn load_projects() -> Vec<String> {
    let path = get_projects_path();
    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(path) {
            if let Ok(projects) = serde_json::from_str::<Vec<String>>(&content) {
                return projects;
            }
        }
    }
    vec![]
}

fn save_projects(projects: &[String]) -> Result<(), String> {
    let path = get_projects_path();
    let serialized = serde_json::to_string_pretty(projects)
        .map_err(|e| format!("Failed to serialize projects: {}", e))?;
    std::fs::write(path, serialized)
        .map_err(|e| format!("Failed to write projects list: {}", e))?;
    Ok(())
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn fetch_tasks(state: tauri::State<ProjectState>) -> Result<Vec<Task>, String> {
    let path_opt = state.current_path.lock().map_err(|e| e.to_string())?;
    if let Some(ref path) = *path_opt {
        github::get_issues(path)
    } else {
        Ok(vec![])
    }
}

#[tauri::command]
fn create_task(state: tauri::State<ProjectState>, title: String, description: String) -> Result<Task, String> {
    let path_opt = state.current_path.lock().map_err(|e| e.to_string())?;
    if let Some(ref path) = *path_opt {
        github::create_issue(path, &title, &description)
    } else {
        Err("No active project folder selected".to_string())
    }
}

#[tauri::command]
fn execute_task(state: tauri::State<ProjectState>, task_id: String) -> Result<Vec<AgentLog>, String> {
    let path_opt = state.current_path.lock().map_err(|e| e.to_string())?;
    if let Some(ref path) = *path_opt {
        agent::execute(path, &task_id)
    } else {
        Err("No active project folder selected".to_string())
    }
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
    let path_opt = state.current_path.lock().map_err(|e| e.to_string())?;
    if let Some(ref project_path) = *path_opt {
        let target_path = match dir_path {
            Some(p) => std::path::Path::new(project_path).join(p).to_string_lossy().to_string(),
            None => project_path.clone(),
        };
        editor::get_dir_entries(Some(target_path))
    } else {
        Err("No active project folder selected".to_string())
    }
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
fn get_project_info(state: tauri::State<ProjectState>) -> Result<Option<ProjectInfo>, String> {
    let path_opt = state.current_path.lock().map_err(|e| e.to_string())?;
    if let Some(ref path_str) = *path_opt {
        let canonical = std::path::Path::new(path_str).canonicalize()
            .map_err(|e| format!("Failed to resolve workspace path {}: {}", path_str, e))?;
        
        let name = canonical.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "wyaiwyg".to_string());
            
        let path = canonical.to_string_lossy().to_string();
        let is_git = canonical.join(".git").exists();
        
        Ok(Some(ProjectInfo { name, path, is_git }))
    } else {
        Ok(None)
    }
}

#[tauri::command]
fn fetch_projects(state: tauri::State<ProjectState>) -> Result<Vec<ProjectInfo>, String> {
    let paths = state.all_projects.lock().map_err(|e| e.to_string())?;
    let mut list = Vec::new();
    for path_str in &*paths {
        if let Ok(canonical) = std::path::Path::new(path_str).canonicalize() {
            let name = canonical.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "wyaiwyg".to_string());
            let is_git = canonical.join(".git").exists();
            list.push(ProjectInfo {
                name,
                path: canonical.to_string_lossy().to_string(),
                is_git,
            });
        }
    }
    Ok(list)
}

#[tauri::command]
fn select_project(state: tauri::State<ProjectState>, path: String) -> Result<ProjectInfo, String> {
    {
        let mut current = state.current_path.lock().map_err(|e| e.to_string())?;
        *current = Some(path.clone());
    }
    
    let canonical = std::path::Path::new(&path).canonicalize()
        .map_err(|e| format!("Failed to resolve path: {}", e))?;
    let name = canonical.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "wyaiwyg".to_string());
    let is_git = canonical.join(".git").exists();
    
    Ok(ProjectInfo {
        name,
        path: canonical.to_string_lossy().to_string(),
        is_git,
    })
}

#[tauri::command]
fn select_project_folder(state: tauri::State<ProjectState>) -> Result<Option<ProjectInfo>, String> {
    let folder = rfd::FileDialog::new()
        .set_title("Select Project Folder")
        .pick_folder();
        
    if let Some(path_buf) = folder {
        let path_str = path_buf.to_string_lossy().to_string();
        
        // Add to projects list if not already present
        {
            let mut projects = state.all_projects.lock().map_err(|e| e.to_string())?;
            if !projects.contains(&path_str) {
                projects.push(path_str.clone());
                save_projects(&projects)?;
            }
        }
        
        // Set as active
        {
            let mut current = state.current_path.lock().map_err(|e| e.to_string())?;
            *current = Some(path_str.clone());
        }
        
        let canonical = path_buf.canonicalize()
            .map_err(|e| format!("Failed to resolve path: {}", e))?;
        let name = canonical.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "wyaiwyg".to_string());
        let is_git = canonical.join(".git").exists();
        
        Ok(Some(ProjectInfo {
            name,
            path: canonical.to_string_lossy().to_string(),
            is_git,
        }))
    } else {
        Ok(None)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let projects = load_projects();
    let active = projects.first().cloned();

    tauri::Builder::default()
        .manage(ProjectState {
            current_path: Mutex::new(active),
            all_projects: Mutex::new(projects),
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
            select_project_folder,
            fetch_projects,
            select_project
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

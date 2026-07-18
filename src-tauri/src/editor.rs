use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

// Lists the contents of a directory (defaults to workspace root if no path is provided)
pub fn get_dir_entries(dir_path: Option<String>) -> Result<Vec<FileEntry>, String> {
    // Resolve target path. CWD is src-tauri, so the project root is ".."
    let base_path = PathBuf::from("..").canonicalize()
        .map_err(|e| format!("Failed to canonicalize workspace root: {}", e))?;

    let target_path = match dir_path {
        Some(ref p) if !p.trim().is_empty() => {
            let resolved = Path::new(p);
            // Safety check: ensure path is within the workspace
            if !resolved.starts_with(&base_path) {
                // If it's a relative path, try to resolve it against the workspace root
                let joined = base_path.join(resolved);
                if !joined.starts_with(&base_path) {
                    return Err("Access denied: path is outside the workspace root".to_string());
                }
                joined
            } else {
                resolved.to_path_buf()
            }
        }
        _ => base_path.clone(),
    };

    let entries = fs::read_dir(&target_path)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut file_entries = Vec::new();
    for entry in entries {
        if let Ok(entry) = entry {
            let path = entry.path();
            let name = entry.file_name().to_string_lossy().to_string();

            // Skip common build artifacts and hidden directories we don't want to clutter the tree with
            if name == "target" || name == "node_modules" || name == ".git" || name == ".DS_Store" {
                continue;
            }

            let is_dir = path.is_dir();
            let path_str = path.to_string_lossy().to_string();

            file_entries.push(FileEntry {
                name,
                path: path_str,
                is_dir,
            });
        }
    }

    // Sort: directories first, then files alphabetically
    file_entries.sort_by(|a, b| {
        if a.is_dir && !b.is_dir {
            std::cmp::Ordering::Less
        } else if !a.is_dir && b.is_dir {
            std::cmp::Ordering::Greater
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(file_entries)
}

// Reads file content from disk
pub fn get_file_content(file_path: &str) -> Result<String, String> {
    let base_path = PathBuf::from("..").canonicalize()
        .map_err(|e| format!("Failed to canonicalize workspace root: {}", e))?;
    
    let path = Path::new(file_path);
    if !path.starts_with(&base_path) {
        let joined = base_path.join(path);
        if !joined.starts_with(&base_path) {
            return Err("Access denied: path is outside the workspace root".to_string());
        }
    }

    fs::read_to_string(path)
        .map_err(|e| format!("Failed to read file: {}", e))
}

// Writes modified content back to disk
pub fn save_file_content(file_path: &str, content: &str) -> Result<(), String> {
    let base_path = PathBuf::from("..").canonicalize()
        .map_err(|e| format!("Failed to canonicalize workspace root: {}", e))?;
    
    let path = Path::new(file_path);
    if !path.starts_with(&base_path) {
        let joined = base_path.join(path);
        if !joined.starts_with(&base_path) {
            return Err("Access denied: path is outside the workspace root".to_string());
        }
    }

    fs::write(path, content)
        .map_err(|e| format!("Failed to write file: {}", e))
}

use crate::filesystem;
use crate::types::{FileContent, FileEntry, GitDiffStat, GitFileStatus};

#[tauri::command]
pub async fn list_directory_entries(path: String) -> Result<Vec<FileEntry>, String> {
    filesystem::explorer::list_directory_entries(&path)
}

#[tauri::command]
pub async fn read_file_content(path: String) -> Result<FileContent, String> {
    filesystem::reader::read_file_content(&path)
}

#[tauri::command]
pub async fn write_file_content(path: String, content: String) -> Result<(), String> {
    filesystem::reader::write_file_content(&path, &content)
}

#[tauri::command]
pub async fn get_git_status(workspace_path: String) -> Result<Vec<GitFileStatus>, String> {
    filesystem::git_status::get_git_status(&workspace_path)
}

#[tauri::command]
pub async fn get_git_diff_stats(workspace_path: String) -> Result<Vec<GitDiffStat>, String> {
    filesystem::git_diff_stats::get_git_diff_stats(&workspace_path)
}

#[tauri::command]
pub async fn get_git_file_content(
    workspace_path: String,
    file_path: String,
) -> Result<String, String> {
    filesystem::git_diff_stats::get_git_file_content(&workspace_path, &file_path)
}

#[tauri::command]
pub async fn start_fs_watcher(app: tauri::AppHandle, workspace_path: String) -> Result<(), String> {
    filesystem::watcher::start_fs_watcher(app, workspace_path)
}

#[tauri::command]
pub async fn stop_fs_watcher() -> Result<(), String> {
    filesystem::watcher::stop_fs_watcher()
}

#[tauri::command]
pub async fn read_file_as_base64(path: String) -> Result<String, String> {
    filesystem::reader::read_file_as_base64(&path)
}

#[tauri::command]
pub async fn is_binary_file(path: String) -> Result<bool, String> {
    filesystem::reader::is_binary_file(&path)
}

#[tauri::command]
pub async fn rename_entry(old_path: String, new_name: String) -> Result<(), String> {
    filesystem::operations::rename_entry(&old_path, &new_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn move_entry(source_path: String, destination_dir: String) -> Result<(), String> {
    filesystem::operations::move_entry(&source_path, &destination_dir).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_file(path: String) -> Result<(), String> {
    filesystem::operations::create_file(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_directory(path: String) -> Result<(), String> {
    filesystem::operations::create_directory(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_entry(path: String) -> Result<(), String> {
    filesystem::operations::delete_entry(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reveal_in_file_manager(path: String) -> Result<(), String> {
    filesystem::operations::reveal_in_file_manager(&path).map_err(|e| e.to_string())
}

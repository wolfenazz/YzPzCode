use crate::filesystem;
use crate::filesystem::history::FileBackupInfo;
use crate::filesystem::search::SearchResult;
use crate::types::{
    FileContent, FileEntry, GitBranchInfo, GitCommitInfo, GitDiffStat, GitFileDiff, GitFileStatus,
};

#[tauri::command]
pub async fn path_exists(path: String) -> Result<bool, String> {
    Ok(std::path::Path::new(&path).is_dir())
}

#[tauri::command]
pub async fn list_directory_entries(path: String) -> Result<Vec<FileEntry>, String> {
    filesystem::explorer::list_directory_entries(&path)
}

#[tauri::command]
pub async fn list_all_files(path: String) -> Result<Vec<FileEntry>, String> {
    filesystem::explorer::list_all_files_recursive(&path)
}

#[tauri::command]
pub async fn list_all_entries(path: String) -> Result<Vec<FileEntry>, String> {
    filesystem::explorer::list_all_entries_recursive(&path)
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
pub async fn write_file_bytes(path: String, base64_data: String) -> Result<(), String> {
    filesystem::reader::write_file_bytes(&path, &base64_data)
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
pub async fn get_file_size(path: String) -> Result<u64, String> {
    filesystem::reader::get_file_size(&path)
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

#[tauri::command]
pub async fn duplicate_entry(path: String) -> Result<String, String> {
    filesystem::operations::duplicate_entry(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn git_stage_file(workspace_path: String, file_path: String) -> Result<(), String> {
    filesystem::git_status::git_stage_file(&workspace_path, &file_path)
}

#[tauri::command]
pub async fn git_unstage_file(workspace_path: String, file_path: String) -> Result<(), String> {
    filesystem::git_status::git_unstage_file(&workspace_path, &file_path)
}

#[tauri::command]
pub async fn git_file_diff(
    workspace_path: String,
    file_path: String,
) -> Result<GitFileDiff, String> {
    filesystem::git_ops::git_file_diff(&workspace_path, &file_path)
}

#[tauri::command]
pub async fn git_commit(workspace_path: String, message: String) -> Result<(), String> {
    filesystem::git_ops::git_commit(&workspace_path, &message)
}

#[tauri::command]
pub async fn git_discard_file(workspace_path: String, file_path: String) -> Result<(), String> {
    filesystem::git_ops::git_discard_file(&workspace_path, &file_path)
}

#[tauri::command]
pub async fn git_log(workspace_path: String, limit: usize) -> Result<Vec<GitCommitInfo>, String> {
    filesystem::git_ops::git_log(&workspace_path, limit)
}

#[tauri::command]
pub async fn git_branches(workspace_path: String) -> Result<GitBranchInfo, String> {
    filesystem::git_ops::git_branches(&workspace_path)
}

#[tauri::command]
pub async fn create_file_backup(
    workspace_path: String,
    file_path: String,
) -> Result<String, String> {
    filesystem::history::create_file_backup(&workspace_path, &file_path)
}

#[tauri::command]
pub async fn list_file_backups(
    workspace_path: String,
    file_path: String,
) -> Result<Vec<FileBackupInfo>, String> {
    filesystem::history::list_file_backups(&workspace_path, &file_path)
}

#[tauri::command]
pub async fn restore_file_backup(
    workspace_path: String,
    file_path: String,
    backup_name: Option<String>,
) -> Result<String, String> {
    filesystem::history::restore_file_backup(&workspace_path, &file_path, backup_name)
}

#[tauri::command]
pub async fn restore_from_trash(
    workspace_path: String,
    original_path: String,
) -> Result<(), String> {
    filesystem::history::restore_from_trash(&workspace_path, &original_path)
}

#[tauri::command]
pub async fn search_files(
    dir_path: String,
    query: String,
    case_sensitive: bool,
    max_results: usize,
) -> Result<Vec<SearchResult>, String> {
    filesystem::search::search_files(&dir_path, &query, case_sensitive, max_results)
}

#[tauri::command]
pub async fn git_checkout(workspace_path: String, branch: String) -> Result<(), String> {
    filesystem::git_ops::git_checkout(&workspace_path, &branch)
}

#[tauri::command]
pub async fn import_files(
    source_paths: Vec<String>,
    destination_dir: String,
) -> Result<Vec<String>, String> {
    filesystem::operations::import_entries(&source_paths, &destination_dir)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn copy_entry(source_path: String, destination_dir: String) -> Result<String, String> {
    filesystem::operations::copy_entry(&source_path, &destination_dir).map_err(|e| e.to_string())
}

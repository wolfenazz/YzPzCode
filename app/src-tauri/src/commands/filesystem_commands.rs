use crate::filesystem;
use crate::filesystem::clipboard::ClipboardSnapshot;
use crate::filesystem::history::FileBackupInfo;
use crate::filesystem::operations::PasteOutcome;
use crate::filesystem::search::SearchResult;
use crate::types::{
    FileContent, FileEntry, GitBranchInfo, GitCommitInfo, GitDiffStat, GitFileDiff, GitFileStatus,
    GitRemoteInfo,
};

#[tauri::command]
pub async fn path_exists(path: String) -> Result<bool, String> {
    Ok(std::path::Path::new(&path).is_dir())
}

#[tauri::command]
pub async fn list_directory_entries(path: String) -> Result<Vec<FileEntry>, String> {
    run_blocking_operation(move || filesystem::explorer::list_directory_entries(&path)).await
}

#[tauri::command]
pub async fn list_all_files(path: String) -> Result<Vec<FileEntry>, String> {
    run_blocking_operation(move || filesystem::explorer::list_all_files_recursive(&path)).await
}

#[tauri::command]
pub async fn list_all_entries(path: String) -> Result<Vec<FileEntry>, String> {
    run_blocking_operation(move || filesystem::explorer::list_all_entries_recursive(&path)).await
}

#[tauri::command]
pub async fn read_file_content(path: String) -> Result<FileContent, String> {
    run_blocking_operation(move || filesystem::reader::read_file_content(&path)).await
}

#[tauri::command]
pub async fn write_file_content(path: String, content: String) -> Result<(), String> {
    run_blocking_operation(move || filesystem::reader::write_file_content(&path, &content)).await
}

#[tauri::command]
pub async fn write_file_bytes(path: String, base64_data: String) -> Result<(), String> {
    filesystem::reader::write_file_bytes(&path, &base64_data)
}

#[tauri::command]
pub async fn get_git_status(workspace_path: String) -> Result<Vec<GitFileStatus>, String> {
    run_blocking_operation(move || filesystem::git_status::get_git_status(&workspace_path)).await
}

#[tauri::command]
pub async fn get_git_diff_stats(workspace_path: String) -> Result<Vec<GitDiffStat>, String> {
    run_blocking_operation(move || filesystem::git_diff_stats::get_git_diff_stats(&workspace_path))
        .await
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
    run_blocking_operation(move || filesystem::watcher::start_fs_watcher(app, workspace_path)).await
}

#[tauri::command]
pub async fn stop_fs_watcher(workspace_path: String) -> Result<(), String> {
    run_blocking_operation(move || filesystem::watcher::stop_fs_watcher(&workspace_path)).await
}

#[tauri::command]
pub async fn read_file_as_base64(path: String) -> Result<String, String> {
    run_blocking_operation(move || filesystem::reader::read_file_as_base64(&path)).await
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
    run_blocking_operation(move || filesystem::git_ops::git_file_diff(&workspace_path, &file_path))
        .await
}

#[tauri::command]
pub async fn git_commit(
    workspace_path: String,
    message: String,
    expected_branch: String,
    files: Option<Vec<String>>,
) -> Result<(), String> {
    run_blocking_operation(move || {
        filesystem::git_ops::git_commit(
            &workspace_path,
            &message,
            &expected_branch,
            files.as_deref(),
        )
    })
    .await
}

#[tauri::command]
pub async fn git_discard_file(workspace_path: String, file_path: String) -> Result<(), String> {
    run_blocking_operation(move || {
        filesystem::git_ops::git_discard_file(&workspace_path, &file_path)
    })
    .await
}

#[tauri::command]
pub async fn git_log(workspace_path: String, limit: usize) -> Result<Vec<GitCommitInfo>, String> {
    run_blocking_operation(move || filesystem::git_ops::git_log(&workspace_path, limit)).await
}

#[tauri::command]
pub async fn git_branches(workspace_path: String) -> Result<GitBranchInfo, String> {
    run_blocking_operation(move || filesystem::git_ops::git_branches(&workspace_path)).await
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
pub async fn git_checkout(
    workspace_path: String,
    branch: String,
    expected_branch: String,
) -> Result<(), String> {
    run_blocking_operation(move || {
        filesystem::git_ops::git_checkout(&workspace_path, &branch, &expected_branch)
    })
    .await
}

#[tauri::command]
pub async fn git_remote_info(workspace_path: String) -> Result<Option<GitRemoteInfo>, String> {
    run_blocking_operation(move || filesystem::git_ops::git_remote_info(&workspace_path)).await
}

#[tauri::command]
pub async fn git_fetch(workspace_path: String) -> Result<(), String> {
    run_blocking_operation(move || filesystem::git_ops::git_fetch(&workspace_path)).await
}

#[tauri::command]
pub async fn git_push(
    workspace_path: String,
    expected_branch: String,
    expected_remote: String,
    expected_remote_branch: String,
) -> Result<(), String> {
    run_blocking_operation(move || {
        filesystem::git_ops::git_push(
            &workspace_path,
            &expected_branch,
            &expected_remote,
            &expected_remote_branch,
        )
    })
    .await
}

#[tauri::command]
pub async fn git_pull(
    workspace_path: String,
    expected_branch: String,
    expected_remote: String,
    expected_remote_branch: String,
) -> Result<(), String> {
    run_blocking_operation(move || {
        filesystem::git_ops::git_pull(
            &workspace_path,
            &expected_branch,
            &expected_remote,
            &expected_remote_branch,
        )
    })
    .await
}

async fn run_blocking_operation<T: Send + 'static>(
    operation: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(operation)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn import_files(
    source_paths: Vec<String>,
    destination_dir: String,
) -> Result<Vec<String>, String> {
    run_blocking_operation(move || {
        filesystem::operations::import_entries(&source_paths, &destination_dir)
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn copy_entry(source_path: String, destination_dir: String) -> Result<String, String> {
    run_blocking_operation(move || {
        filesystem::operations::copy_entry(&source_path, &destination_dir)
            .map_err(|e| e.to_string())
    })
    .await
}

/// Copies or moves (`operation == "cut"`) entries into a folder; one outcome per source.
#[tauri::command]
pub async fn paste_entries(
    source_paths: Vec<String>,
    destination_dir: String,
    operation: String,
) -> Result<Vec<PasteOutcome>, String> {
    run_blocking_operation(move || {
        filesystem::operations::paste_entries(&source_paths, &destination_dir, operation == "cut")
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn read_clipboard_files() -> Result<ClipboardSnapshot, String> {
    run_blocking_operation(|| filesystem::clipboard::read_clipboard().map_err(|e| e.to_string()))
        .await
}

/// Puts files on the OS clipboard so the system file manager can paste them;
/// an empty list clears the clipboard.
#[tauri::command]
pub async fn write_clipboard_files(paths: Vec<String>, operation: String) -> Result<(), String> {
    run_blocking_operation(move || {
        filesystem::clipboard::write_clipboard_files(&paths, operation == "cut")
            .map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn paste_clipboard_image(destination_dir: String) -> Result<String, String> {
    run_blocking_operation(move || {
        filesystem::clipboard::paste_clipboard_image(&destination_dir).map_err(|e| e.to_string())
    })
    .await
}

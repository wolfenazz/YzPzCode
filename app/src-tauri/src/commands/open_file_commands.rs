use tauri::State;

use crate::open_files::OpenFileManager;
use crate::types::FileEntry;

#[tauri::command]
pub fn take_pending_open_files(
    manager: State<'_, OpenFileManager>,
) -> Result<Vec<FileEntry>, String> {
    Ok(manager.take_pending())
}

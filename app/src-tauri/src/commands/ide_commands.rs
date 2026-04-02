use tauri::State;

use crate::ide::{launch_ide, IdeDetector};
use crate::types::{IdeInfo, IdeType};

#[tauri::command]
pub async fn detect_ide(detector: State<'_, IdeDetector>, ide: IdeType) -> Result<IdeInfo, String> {
    let mut det = detector.inner().clone();
    Ok(det.detect(ide))
}

#[tauri::command]
pub async fn detect_all_ides_cmd(
    detector: State<'_, IdeDetector>,
) -> Result<std::collections::HashMap<IdeType, IdeInfo>, String> {
    let mut det = detector.inner().clone();
    Ok(det.detect_all())
}

#[tauri::command]
pub async fn launch_ide_cmd(ide: IdeType, directory: String) -> Result<(), String> {
    launch_ide(ide, &directory)
}

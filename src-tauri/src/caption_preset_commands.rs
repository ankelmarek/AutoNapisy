use crate::caption_presets::{Catalog, Mutation, Store};
use tauri::Manager;
fn store(app: &tauri::AppHandle) -> Result<Store, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("caption-presets-v1");
    #[cfg(feature = "ui-tests")]
    let root = std::env::var_os("ROLVIXA_TEST_CAPTION_PRESETS")
        .map(std::path::PathBuf::from)
        .unwrap_or(root);
    Ok(Store::new(root))
}
#[tauri::command]
pub async fn caption_presets(app: tauri::AppHandle) -> Result<Catalog, String> {
    let s = store(&app)?;
    tauri::async_runtime::spawn_blocking(move || s.list())
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn mutate_caption_preset(
    app: tauri::AppHandle,
    revision: u64,
    operation: Mutation,
) -> Result<Catalog, String> {
    let s = store(&app)?;
    tauri::async_runtime::spawn_blocking(move || s.mutate(revision, operation))
        .await
        .map_err(|e| e.to_string())?
}

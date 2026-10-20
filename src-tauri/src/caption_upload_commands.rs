//! A binary upload token can address only a backend-created, still-owned stream.
#[tauri::command]
pub async fn upload_caption_rgba(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("Wymagany binarny pakiet RGBA".into());
    };
    let (id, index) = crate::caption_stream::packet(bytes)?;
    let stream = crate::caption_stream::lookup(id)?;
    let rgba = bytes[16..].to_vec();
    tauri::async_runtime::spawn_blocking(move || stream.push(index, rgba))
        .await
        .map_err(|e| e.to_string())?
}

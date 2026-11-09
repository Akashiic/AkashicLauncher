//! Atualização do próprio launcher (tauri-plugin-updater), assinada.
//!
//! Lê o `latest.json` que a Action de release publica no GitHub, confere a
//! assinatura com a chave pública embutida no build e instala por cima
//! (no Windows, instalador NSIS em modo "passive", sem perguntas).
//! Builds sem chave (desenvolvimento) simplesmente não encontram atualização.

use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct PendingUpdate(Mutex<Option<Update>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    version: String,
    current: String,
    notes: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UpdateProgress {
    downloaded: u64,
    total: Option<u64>,
}

/// Procura uma versão nova do launcher. `None` = já está na mais nova
/// (ou este build não tem chave de atualização).
#[tauri::command]
pub async fn launcher_check_update(app: AppHandle, pending: State<'_, PendingUpdate>) -> Result<Option<UpdateInfo>, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(update)) => {
            let info = UpdateInfo { version: update.version.clone(), current: update.current_version.clone(), notes: update.body.clone() };
            *pending.0.lock().unwrap() = Some(update);
            Ok(Some(info))
        }
        Ok(None) => Ok(None),
        // sem chave/sem release/sem internet: não é erro para o jogador
        Err(e) => {
            eprintln!("[atualizador] {e}");
            Ok(None)
        }
    }
}

/// Baixa, confere a assinatura, instala e reinicia o launcher.
#[tauri::command]
pub async fn launcher_install_update(app: AppHandle, pending: State<'_, PendingUpdate>) -> Result<(), String> {
    if app.state::<crate::game::GameState>().running.load(std::sync::atomic::Ordering::Relaxed) {
        return Err("Feche o jogo antes de atualizar o launcher.".into());
    }
    let update = pending.0.lock().unwrap().take().ok_or("Nenhuma atualização pendente.")?;
    let progress_app = app.clone();
    let mut downloaded = 0u64;
    update
        .download_and_install(
            move |chunk, total| {
                downloaded += chunk as u64;
                let _ = progress_app.emit("launcher:update-progress", UpdateProgress { downloaded, total });
            },
            || {},
        )
        .await
        .map_err(|e| format!("não foi possível atualizar o launcher: {e}"))?;
    app.restart();
}

//! Forbidden Series Launcher — processo nativo (Tauri 2 + Rust).
//!
//! A interface (React + cena 3D) roda no WebView do sistema; aqui ficam só as
//! partes nativas: bandeja, configurações em disco e abertura de pastas/links.
//! É também o lugar da lógica pesada que vem depois (download, extração, Java).

mod game;
mod updater;

use std::{fs, path::PathBuf};

use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State, Wry,
};
use tauri_plugin_opener::OpenerExt;

/// Itens da bandeja que mudam com o estado do jogo.
struct Tray {
    icon: TrayIcon<Wry>,
    stop_game: MenuItem<Wry>,
}

/// Mostra e foca o launcher (bandeja, segunda instância ou fim do jogo).
fn show_launcher(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn settings_file(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("settings.json"))
}

// ---------------------------------------------------------------------------
// Configurações (JSON local na pasta de dados do app)
// ---------------------------------------------------------------------------

#[tauri::command]
fn settings_load(app: AppHandle) -> Option<serde_json::Value> {
    let raw = fs::read_to_string(settings_file(&app).ok()?).ok()?;
    serde_json::from_str(&raw).ok()
}

#[tauri::command]
fn settings_save(app: AppHandle, data: serde_json::Value) -> Result<String, String> {
    let file = settings_file(&app)?;
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_vec_pretty(&data).map_err(|e| e.to_string())?;
    // escrita atômica: grava ao lado e troca (rename substitui o arquivo antigo)
    let tmp = file.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &file).map_err(|e| e.to_string())?;
    Ok(file.display().to_string())
}

#[tauri::command]
fn settings_path(app: AppHandle) -> Result<String, String> {
    Ok(settings_file(&app)?.display().to_string())
}

// ---------------------------------------------------------------------------
// Pastas e links
// ---------------------------------------------------------------------------

#[tauri::command]
fn open_game_dir(app: AppHandle) -> Result<String, String> {
    let dir = game::paths(&app).map_err(|e| e.to_string())?.instance;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.display().to_string();
    app.opener()
        .open_path(path.clone(), None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(path)
}

/// Links externos: só HTTPS do GitHub (página de releases do modpack).
#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    let u = url::Url::parse(&url).map_err(|e| e.to_string())?;
    let host = u.host_str().unwrap_or_default();
    let allowed = u.scheme() == "https" && (host == "github.com" || host.ends_with(".github.com"));
    if !allowed {
        return Err("link não permitido".into());
    }
    app.opener()
        .open_url(u.as_str(), None::<&str>)
        .map_err(|e| e.to_string())
}

// ---------------------------------------------------------------------------
// Bandeja
// ---------------------------------------------------------------------------

/// A interface avisa quando o jogo abre/fecha: atualiza o menu e a dica da bandeja.
#[tauri::command]
fn set_game_running(tray: State<'_, Option<Tray>>, running: bool) {
    if let Some(tray) = tray.inner() {
        let _ = tray.stop_game.set_enabled(running);
        let tip = if running { "Forbidden Series · jogo em execução" } else { "Forbidden Series" };
        let _ = tray.icon.set_tooltip(Some(tip));
    }
}

fn create_tray(app: &AppHandle) -> tauri::Result<Tray> {
    let open = MenuItem::with_id(app, "open", "Abrir launcher", true, None::<&str>)?;
    let stop_game = MenuItem::with_id(app, "stop-game", "Fechar o jogo", false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &stop_game, &PredefinedMenuItem::separator(app)?, &quit])?;

    let icon = TrayIconBuilder::with_id("main")
        .icon(Image::from_bytes(include_bytes!("../icons/tray@2x.png"))?)
        .tooltip("Forbidden Series")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_launcher(app),
            "stop-game" => {
                // fecha o processo do jogo direto (a interface recebe `game:exit`)
                let state = app.state::<game::GameState>();
                let tx = state.kill.lock().unwrap().take();
                match tx {
                    Some(tx) => {
                        let _ = tx.send(());
                    }
                    None => {
                        let _ = app.emit("tray:stop-game", ());
                    }
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_launcher(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(Tray { icon, stop_game })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // abrir o launcher de novo só traz a janela existente para frente
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_launcher(app)))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(updater::PendingUpdate::default())
        .manage(game::GameState::default())
        .setup(|app| {
            let tray = match create_tray(app.handle()) {
                Ok(t) => Some(t),
                Err(e) => {
                    eprintln!("[bandeja] indisponível neste sistema: {e}");
                    None
                }
            };
            app.manage(tray);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            settings_load,
            settings_save,
            settings_path,
            open_game_dir,
            open_external,
            set_game_running,
            game::game_play,
            game::game_cancel,
            game::game_stop,
            game::game_installed,
            game::game_verify,
            game::game_update_plan,
            updater::launcher_check_update,
            updater::launcher_install_update
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o launcher");
}

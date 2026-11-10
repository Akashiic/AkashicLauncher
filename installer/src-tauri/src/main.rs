//! Instalador do Forbidden Series Launcher.
//!
//! Uma janela com a identidade do launcher que, por baixo, roda em modo silencioso
//! o instalador oficial (NSIS) embutido neste executável. Assim a pasta, o
//! desinstalador em "Aplicativos instalados" e a atualização automática continuam
//! exatamente iguais aos do instalador padrão.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Instalador oficial do launcher, embutido no build (veja build.rs).
#[cfg_attr(not(windows), allow(dead_code))]
static PAYLOAD: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/payload.bin"));

const PRODUCT: &str = "Forbidden Series";

fn launcher_version() -> &'static str {
    option_env!("FORBIDDEN_LAUNCHER_VERSION").unwrap_or(env!("CARGO_PKG_VERSION"))
}

/// Pasta de instalação por usuário do NSIS do Tauri: %LOCALAPPDATA%\Forbidden Series
fn install_dir() -> PathBuf {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(std::env::temp_dir)
        .join(PRODUCT)
}

/// O executável do launcher já instalado (qualquer .exe da pasta que não seja o desinstalador).
fn installed_exe() -> Option<PathBuf> {
    std::fs::read_dir(install_dir())
        .ok()?
        .flatten()
        .map(|e| e.path())
        .find(|p| {
            p.extension().is_some_and(|x| x.eq_ignore_ascii_case("exe"))
                && !p.file_name().is_some_and(|n| n.to_string_lossy().to_lowercase().starts_with("uninstall"))
        })
}

/// Versão instalada, lida do registro que o NSIS grava (melhor esforço).
#[cfg(windows)]
fn installed_version() -> Option<String> {
    use std::os::windows::process::CommandExt;
    let key = format!(r"HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\{PRODUCT}");
    let out = std::process::Command::new("reg")
        .args(["query", &key, "/v", "DisplayVersion"])
        .creation_flags(0x0800_0000)
        .output()
        .ok()?;
    String::from_utf8_lossy(&out.stdout)
        .lines()
        .find(|l| l.contains("DisplayVersion"))
        .and_then(|l| l.split_whitespace().last())
        .map(str::to_string)
}

#[cfg(not(windows))]
fn installed_version() -> Option<String> {
    None
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SetupInfo {
    version: String,
    installed: bool,
    same_version: bool,
    install_dir: String,
}

#[tauri::command]
fn setup_info() -> SetupInfo {
    let installed = installed_exe().is_some();
    SetupInfo {
        version: launcher_version().to_string(),
        installed,
        same_version: installed && installed_version().as_deref() == Some(launcher_version()),
        install_dir: install_dir().display().to_string(),
    }
}

#[derive(Serialize, Clone)]
struct Progress {
    pct: f64,
    label: &'static str,
}

fn progress(app: &AppHandle, pct: f64, label: &'static str) {
    let _ = app.emit("setup:progress", Progress { pct, label });
}

/// Instala e devolve o caminho do executável do launcher.
#[tauri::command]
async fn install(app: AppHandle, desktop_shortcut: bool) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || run_install(&app, desktop_shortcut))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(windows)]
fn run_install(app: &AppHandle, desktop_shortcut: bool) -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    const NO_WINDOW: u32 = 0x0800_0000;

    if PAYLOAD.is_empty() {
        return Err("Este instalador foi gerado sem o launcher embutido.".into());
    }
    progress(app, 6.0, "Preparando os arquivos");
    let tmp = std::env::temp_dir().join(format!("forbidden-series-{}-setup.exe", launcher_version()));
    std::fs::write(&tmp, PAYLOAD).map_err(|e| format!("Não deu para preparar a instalação: {e}"))?;

    // instalador oficial em modo silencioso; a barra avança enquanto ele trabalha
    progress(app, 15.0, "Instalando o launcher");
    let mut child = std::process::Command::new(&tmp)
        .arg("/S")
        .creation_flags(NO_WINDOW)
        .spawn()
        .map_err(|e| format!("Não deu para iniciar a instalação: {e}"))?;
    let mut pct = 15.0;
    let status = loop {
        if let Some(s) = child.try_wait().map_err(|e| e.to_string())? {
            break s;
        }
        pct += (88.0 - pct) * 0.08;
        progress(app, pct, "Instalando o launcher");
        std::thread::sleep(Duration::from_millis(120));
    };
    let _ = std::fs::remove_file(&tmp);
    if !status.success() {
        return Err(format!(
            "A instalação terminou com erro (código {}). Feche o launcher, se estiver aberto, e tente de novo.",
            status.code().map(|c| c.to_string()).unwrap_or_else(|| "?".into())
        ));
    }

    progress(app, 92.0, "Criando atalhos");
    let exe = installed_exe().ok_or("O launcher não foi encontrado depois da instalação.")?;
    // atalho na área de trabalho conforme a escolha (a pasta real pode estar no OneDrive)
    let lnk = format!("{PRODUCT}.lnk");
    // aspas simples no PowerShell: um apóstrofo no caminho vira ''
    let ps = |p: &std::path::Path| p.display().to_string().replace('\'', "''");
    let script = if desktop_shortcut {
        format!(
            "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d '{lnk}')); \
             $s.TargetPath='{exe}'; $s.WorkingDirectory='{dir}'; $s.IconLocation='{exe},0'; $s.Save()",
            exe = ps(&exe),
            dir = ps(&install_dir())
        )
    } else {
        format!("$d=[Environment]::GetFolderPath('Desktop'); Remove-Item -LiteralPath (Join-Path $d '{lnk}') -ErrorAction SilentlyContinue")
    };
    let _ = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &script])
        .creation_flags(NO_WINDOW)
        .status();

    progress(app, 100.0, "Tudo pronto");
    Ok(exe.display().to_string())
}

/// Fora do Windows: simula, para desenvolver a interface.
#[cfg(not(windows))]
fn run_install(app: &AppHandle, _desktop_shortcut: bool) -> Result<String, String> {
    for (i, label) in [(0, "Preparando os arquivos"), (1, "Instalando o launcher"), (2, "Criando atalhos")] {
        for k in 0..10 {
            progress(app, (i * 30 + k * 3) as f64 + 6.0, label);
            std::thread::sleep(Duration::from_millis(60));
        }
    }
    progress(app, 100.0, "Tudo pronto");
    Ok(install_dir().join("forbidden-launcher").display().to_string())
}

#[tauri::command]
fn launch(path: Option<String>) -> Result<(), String> {
    let exe = path.map(PathBuf::from).or_else(installed_exe).ok_or("Launcher não encontrado.")?;
    std::process::Command::new(&exe)
        .current_dir(exe.parent().unwrap_or(&install_dir()))
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Não deu para abrir o launcher: {e}"))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![setup_info, install, launch])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o instalador");
}

//! Forbidden Series — instalador e "porta de entrada" do launcher.
//!
//! O mesmo `ForbiddenSeries-Setup.exe` serve para tudo, como no Technic:
//! - sem launcher instalado: mostra a tela de instalação;
//! - instalado e em dia: abre o launcher na hora, sem mostrar nada;
//! - instalado, porém mais antigo: atualiza sozinho (com progresso) e abre;
//! - segurando Shift (ou com `--setup`): mostra o instalador, para reinstalar.
//!
//! Por baixo roda em modo silencioso o instalador oficial (NSIS) embutido neste
//! executável, apontado para %APPDATA%\.forbiddenseries\launcher. Assim o
//! desinstalador em "Aplicativos instalados" e a atualização automática continuam
//! iguais aos do instalador padrão.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

/// Instalador oficial do launcher, embutido no build (veja build.rs).
#[cfg_attr(not(windows), allow(dead_code))]
static PAYLOAD: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/payload.bin"));

const PRODUCT: &str = "Forbidden Series";

fn launcher_version() -> &'static str {
    option_env!("FORBIDDEN_LAUNCHER_VERSION").unwrap_or(env!("CARGO_PKG_VERSION"))
}

/// Pasta do Forbidden Series: %APPDATA%\.forbiddenseries (como o .minecraft e o .technic).
fn root_dir() -> PathBuf {
    std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(PathBuf::from))
        .unwrap_or_else(std::env::temp_dir)
        .join(".forbiddenseries")
}

/// Onde o programa do launcher fica.
fn install_dir() -> PathBuf {
    root_dir().join("launcher")
}

/// Pasta padrão das primeiras versões de teste (%LOCALAPPDATA%\Forbidden Series).
fn legacy_dir() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA").map(|d| PathBuf::from(d).join(PRODUCT))
}

fn exe_in(dir: &std::path::Path) -> Option<PathBuf> {
    std::fs::read_dir(dir).ok()?.flatten().map(|e| e.path()).find(|p| {
        p.extension().is_some_and(|x| x.eq_ignore_ascii_case("exe"))
            && !p.file_name().is_some_and(|n| n.to_string_lossy().to_lowercase().starts_with("uninstall"))
    })
}

/// O executável do launcher já instalado (qualquer .exe da pasta que não seja o desinstalador).
fn installed_exe() -> Option<PathBuf> {
    exe_in(&install_dir()).or_else(|| legacy_dir().and_then(|d| exe_in(&d)))
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

/// "0.10.2" → [0, 10, 2], para comparar versões numericamente.
fn parts(v: &str) -> Vec<u64> {
    v.split(['.', '-', '+']).map_while(|p| p.parse().ok()).collect()
}

/// Shift pressionado ao abrir: força a tela do instalador.
#[cfg(windows)]
fn shift_held() -> bool {
    #[link(name = "user32")]
    extern "system" {
        fn GetAsyncKeyState(key: i32) -> i16;
    }
    // SAFETY: chamada simples da API do Windows, sem ponteiros.
    unsafe { GetAsyncKeyState(0x10) < 0 }
}

#[cfg(not(windows))]
fn shift_held() -> bool {
    false
}

/// O que fazer ao abrir.
#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
enum Mode {
    /// nada instalado: tela de boas-vindas
    Install,
    /// instalado e mais antigo: atualiza sozinho e abre
    Update,
    /// Shift/--setup com algo instalado: tela do instalador para reinstalar
    Reinstall,
    /// instalado e em dia: só abre o launcher
    Launch,
}

static MODE: OnceLock<Mode> = OnceLock::new();

fn decide() -> Mode {
    let forced = shift_held() || std::env::args().any(|a| a == "--setup");
    if installed_exe().is_none() {
        return Mode::Install;
    }
    if forced {
        return Mode::Reinstall;
    }
    match installed_version() {
        // registro mais antigo que o launcher embutido: atualiza
        Some(v) if parts(&v) < parts(launcher_version()) => Mode::Update,
        // em dia (ou versão desconhecida: o próprio launcher se atualiza)
        _ => Mode::Launch,
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SetupInfo {
    version: String,
    mode: Mode,
    installed_version: Option<String>,
    install_dir: String,
}

#[tauri::command]
fn setup_info() -> SetupInfo {
    SetupInfo {
        version: launcher_version().to_string(),
        mode: *MODE.get().unwrap_or(&Mode::Install),
        installed_version: installed_version(),
        install_dir: root_dir().display().to_string(),
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

/// Instala (ou atualiza) e devolve o caminho do executável do launcher.
/// `desktop_shortcut`: `None` = não mexe no atalho (atualização automática).
#[tauri::command]
async fn install(app: AppHandle, desktop_shortcut: Option<bool>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || run_install(&app, desktop_shortcut))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(windows)]
fn run_install(app: &AppHandle, desktop_shortcut: Option<bool>) -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    const NO_WINDOW: u32 = 0x0800_0000;

    if PAYLOAD.is_empty() {
        return Err("Este instalador foi gerado sem o launcher embutido.".into());
    }
    progress(app, 6.0, "Preparando os arquivos");
    let tmp = std::env::temp_dir().join(format!("forbidden-series-{}-setup.exe", launcher_version()));
    std::fs::write(&tmp, PAYLOAD).map_err(|e| format!("Não deu para preparar a instalação: {e}"))?;
    let _ = std::fs::create_dir_all(install_dir());

    // instalador oficial em modo silencioso, na pasta .forbiddenseries\launcher
    // (o /D= precisa ser o último argumento e vai sem aspas, regra do NSIS)
    progress(app, 15.0, "Instalando o launcher");
    let mut child = std::process::Command::new(&tmp)
        .arg("/S")
        .raw_arg(format!("/D={}", install_dir().display()))
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

    let exe = installed_exe().ok_or("O launcher não foi encontrado depois da instalação.")?;
    if let Some(desktop) = desktop_shortcut {
        progress(app, 92.0, "Criando atalhos");
        // atalho na área de trabalho conforme a escolha (a pasta real pode estar no OneDrive)
        let lnk = format!("{PRODUCT}.lnk");
        // aspas simples no PowerShell: um apóstrofo no caminho vira ''
        let ps = |p: &std::path::Path| p.display().to_string().replace('\'', "''");
        let workdir = exe.parent().map(ps).unwrap_or_default();
        let script = if desktop {
            format!(
                "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d '{lnk}')); \
                 $s.TargetPath='{exe}'; $s.WorkingDirectory='{workdir}'; $s.IconLocation='{exe},0'; $s.Save()",
                exe = ps(&exe),
            )
        } else {
            format!("$d=[Environment]::GetFolderPath('Desktop'); Remove-Item -LiteralPath (Join-Path $d '{lnk}') -ErrorAction SilentlyContinue")
        };
        let _ = std::process::Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", &script])
            .creation_flags(NO_WINDOW)
            .status();
    }

    progress(app, 100.0, "Tudo pronto");
    Ok(exe.display().to_string())
}

/// Fora do Windows: simula, para desenvolver a interface.
#[cfg(not(windows))]
fn run_install(app: &AppHandle, _desktop_shortcut: Option<bool>) -> Result<String, String> {
    for (i, label) in [(0, "Preparando os arquivos"), (1, "Instalando o launcher"), (2, "Criando atalhos")] {
        for k in 0..10 {
            progress(app, (i * 30 + k * 3) as f64 + 6.0, label);
            std::thread::sleep(Duration::from_millis(60));
        }
    }
    progress(app, 100.0, "Tudo pronto");
    Ok(install_dir().join("forbidden-launcher").display().to_string())
}

fn spawn_launcher(exe: &std::path::Path) -> Result<(), String> {
    std::process::Command::new(exe)
        .current_dir(exe.parent().map(PathBuf::from).unwrap_or_else(install_dir))
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Não deu para abrir o launcher: {e}"))
}

#[tauri::command]
fn launch(path: Option<String>) -> Result<(), String> {
    let exe = path.map(PathBuf::from).or_else(installed_exe).ok_or("Launcher não encontrado.")?;
    spawn_launcher(&exe)
}

fn main() {
    let mode = decide();
    let _ = MODE.set(mode);

    // em dia: abre o launcher e sai, sem nem criar a janela
    if mode == Mode::Launch {
        if let Some(exe) = installed_exe() {
            if spawn_launcher(&exe).is_ok() {
                return;
            }
        }
    }

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![setup_info, install, launch])
        .setup(|app| {
            // a janela nasce oculta (sem piscar) e aparece aqui, já com o fundo do tema
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o instalador");
}

#[cfg(test)]
mod tests {
    use super::parts;

    #[test]
    fn compara_versoes_numericamente() {
        assert!(parts("0.9.0") < parts("0.10.0"));
        assert!(parts("0.1.0") < parts("0.1.1"));
        assert!(parts("1.0.0") == parts("1.0.0"));
        assert!(parts("0.2.0-beta") > parts("0.1.9"));
    }
}

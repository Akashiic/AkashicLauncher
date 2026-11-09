//! Núcleo do launcher: do clique em JOGAR até a janela do Minecraft 1.7.10 abrir.
//!
//! Etapas: Java (Zulu 8u512) → Minecraft 1.7.10 → modpack TEOF- (instala/atualiza)
//! → Forge e bibliotecas → nativos → processo do jogo. O progresso vai para a
//! interface pelo evento `launch:progress`; os logs, por `launch:logs`.

pub mod forge;
pub mod java;
pub mod launch;
pub mod minecraft;
pub mod modpack;
pub mod net;
pub mod progress;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::oneshot;

use net::Net;
use progress::{Progress, Ticker};

#[derive(Default)]
pub struct GameState {
    busy: AtomicBool,
    pub running: AtomicBool,
    cancel: Arc<AtomicBool>,
    pub kill: Mutex<Option<oneshot::Sender<()>>>,
}

/// Pastas do launcher (Windows: %APPDATA%\com.forbiddenseries.launcher\...).
pub struct Paths {
    /// bibliotecas, assets e versões do Minecraft (compartilhados)
    pub mc: PathBuf,
    /// pasta do jogo: mods, config, saves...
    pub instance: PathBuf,
    pub runtime: PathBuf,
    pub cache: PathBuf,
    /// runtime Java empacotado no instalador (opcional)
    pub bundled: Option<PathBuf>,
}

pub fn paths(app: &AppHandle) -> Result<Paths> {
    let data = app.path().app_data_dir()?;
    Ok(Paths {
        mc: data.join("minecraft"),
        instance: data.join("instances").join("forbidden"),
        runtime: data.join("runtime"),
        cache: data.join("cache"),
        bundled: app.path().resource_dir().ok().map(|r| r.join("runtime")),
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayRequest {
    account: launch::Account,
    memory_gb: u32,
    #[serde(default)]
    jvm_args: Vec<String>,
    java_path: Option<String>,
    pack: Option<modpack::PackInfo>,
}

fn log(app: &AppHandle, s: impl AsRef<str>) {
    let _ = app.emit("launch:logs", vec![format!("[Launcher] {}", s.as_ref())]);
}

struct Busy<'a>(&'a AtomicBool);
impl Drop for Busy<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Relaxed);
    }
}

fn begin<'a>(state: &'a GameState) -> Result<Busy<'a>, String> {
    if state.running.load(Ordering::Relaxed) {
        return Err("O jogo já está aberto.".into());
    }
    if state.busy.swap(true, Ordering::Relaxed) {
        return Err("Já existe uma operação em andamento.".into());
    }
    state.cancel.store(false, Ordering::Relaxed);
    Ok(Busy(&state.busy))
}

fn report(app: &AppHandle, e: anyhow::Error) -> String {
    if net::is_cancelled(&e) {
        return "cancelado".into();
    }
    let msg = format!("{e:#}");
    log(app, format!("ERRO: {msg}"));
    msg
}

/// JOGAR: prepara tudo e inicia o jogo. Retorna quando o processo do Java começou;
/// a abertura da janela e o fechamento chegam pelos eventos `game:window` e `game:exit`.
#[tauri::command]
pub async fn game_play(app: AppHandle, state: State<'_, GameState>, req: PlayRequest) -> Result<(), String> {
    let _busy = begin(&state)?;
    let progress = Arc::new(Progress::default());
    let ticker = Ticker::start(app.clone(), progress.clone());
    play(&app, &state, req, progress, ticker).await.map_err(|e| report(&app, e))
}

async fn play(app: &AppHandle, state: &GameState, req: PlayRequest, prog: Arc<Progress>, ticker: Ticker) -> Result<()> {
    let p = paths(app)?;
    let net = Net::new(state.cancel.clone())?;

    // 1) Java
    prog.stage("verifying", "Java 8 (Zulu 8u512)");
    let java = match req.java_path.as_deref().map(str::trim).filter(|s| !s.is_empty()) {
        Some(custom) => {
            let pb = PathBuf::from(custom);
            if !pb.is_file() {
                bail!("o Java personalizado não foi encontrado: {custom}");
            }
            pb
        }
        None => java::ensure(&net, &prog, &p.runtime, &p.cache, p.bundled.as_deref()).await?,
    };
    log(app, format!("Java: {}", java.display()));

    // 2) Minecraft 1.7.10
    prog.stage("verifying", "Minecraft 1.7.10");
    let vanilla = minecraft::plan(&net, &prog, &p.mc).await?;
    let n = net.ensure_all(vanilla.jobs.clone(), &prog, false, 16).await?;
    log(app, if n > 0 { format!("Minecraft 1.7.10: {n} arquivos baixados.") } else { "Minecraft 1.7.10 verificado.".into() });

    // 3) Modpack
    let current = modpack::installed(&p.instance);
    let mut phase = "verifying";
    let installed_tag = current.as_ref().map(|c| c.tag.as_str());
    match &req.pack {
        Some(pack) if installed_tag != Some(pack.tag.as_str()) => {
            phase = "downloading";
            prog.stage(phase, &format!("Modpack {}", pack.tag));
            log(app, match installed_tag {
                Some(old) => format!("Atualizando o modpack: {old} → {}", pack.tag),
                None => format!("Instalando o modpack {}", pack.tag),
            });
            modpack::install(&net, &prog, &p.instance, &p.cache, pack).await?;
            let _ = app.emit("launch:pack-installed", &pack.tag);
            log(app, format!("Modpack {} instalado.", pack.tag));
        }
        _ => match installed_tag {
            Some(tag) => {
                log(app, format!("Modpack {tag} já instalado."));
                let _ = app.emit("launch:pack-installed", tag);
            }
            None => bail!("o modpack ainda não foi instalado e não deu para consultar as versões no GitHub; verifique sua conexão"),
        },
    }

    // 4) Forge e bibliotecas
    prog.stage(phase, "Forge 1.7.10");
    let forge = forge::plan(&net, &prog, &p.mc, &p.instance).await?;
    let n = net.ensure_all(forge.jobs.clone(), &prog, false, 8).await?;
    log(app, format!("Forge: {} ({}){}", forge.id, if forge.from_pack { "do modpack" } else { "oficial" }, if n > 0 { format!(", {n} bibliotecas baixadas") } else { String::new() }));

    // 5) Nativos e processo
    prog.stage("launching", "Abrindo o Minecraft");
    net.check()?;
    let natives = p.instance.join(".forbidden").join("natives");
    let (list, dir) = (vanilla.natives.clone(), natives.clone());
    tokio::task::spawn_blocking(move || launch::extract_natives(&list, &dir)).await??;
    std::fs::create_dir_all(&p.instance)?;
    let cmd = launch::command_line(&launch::Spec {
        java: &java,
        instance: &p.instance,
        mc_root: &p.mc,
        natives: &natives,
        vanilla: &vanilla,
        forge: &forge,
        account: &req.account,
        memory_gb: req.memory_gb,
        jvm_args: &req.jvm_args,
    });
    log(app, format!("Perfil: {} ({})", req.account.username, req.account.kind));
    log(app, launch::redact(&cmd));
    state.running.store(true, Ordering::Relaxed);
    if let Err(e) = launch::spawn(app, cmd, p.instance.clone(), prog.clone(), ticker).await {
        state.running.store(false, Ordering::Relaxed);
        return Err(e);
    }
    Ok(())
}

#[tauri::command]
pub fn game_cancel(state: State<'_, GameState>) {
    state.cancel.store(true, Ordering::Relaxed);
}

/// Fecha o jogo (menu da bandeja / botão na interface).
#[tauri::command]
pub fn game_stop(state: State<'_, GameState>) -> bool {
    match state.kill.lock().unwrap().take() {
        Some(tx) => tx.send(()).is_ok(),
        None => false,
    }
}

/// Versão do modpack instalada de fato na pasta do jogo (ex.: "TEOF-5.3").
#[tauri::command]
pub fn game_installed(app: AppHandle) -> Option<String> {
    let p = paths(&app).ok()?;
    modpack::installed(&p.instance).map(|i| i.tag)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyResult {
    checked: usize,
    repaired: usize,
}

/// Confere o SHA-1 de todos os arquivos do Minecraft e do Forge e baixa de novo os corrompidos.
#[tauri::command]
pub async fn game_verify(app: AppHandle, state: State<'_, GameState>) -> Result<VerifyResult, String> {
    let _busy = begin(&state)?;
    let progress = Arc::new(Progress::default());
    let _ticker = Ticker::start(app.clone(), progress.clone());
    async {
        let p = paths(&app)?;
        let net = Net::new(state.cancel.clone())?;
        progress.stage("verifying", "Minecraft 1.7.10");
        let vanilla = minecraft::plan(&net, &progress, &p.mc).await?;
        let mut jobs = vanilla.jobs;
        let forge = forge::plan(&net, &progress, &p.mc, &p.instance).await?;
        jobs.extend(forge.jobs);
        let checked = jobs.len();
        let repaired = net.ensure_all(jobs, &progress, true, 8).await?;
        log(&app, format!("Integridade: {checked} arquivos conferidos, {repaired} corrigidos."));
        Ok(VerifyResult { checked, repaired })
    }
    .await
    .map_err(|e| report(&app, e))
}

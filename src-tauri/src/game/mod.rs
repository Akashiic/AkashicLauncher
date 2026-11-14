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
pub mod zipremote;

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
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

/// Pastas do launcher (Windows: %APPDATA%\.forbiddenseries\...).
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

/// Pasta do Forbidden Series: %APPDATA%\.forbiddenseries no Windows
/// (como o .minecraft e o .technic); ~/.local/share/.forbiddenseries no Linux.
pub fn data_root<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf> {
    Ok(app.path().data_dir()?.join(".forbiddenseries"))
}

/// Primeira abertura depois da mudança de pasta: move os dados da pasta antiga
/// (com o nome do identificador do app) para a .forbiddenseries.
pub fn migrate_data<R: Runtime>(app: &AppHandle<R>) {
    let (Ok(old), Ok(new)) = (app.path().app_data_dir(), data_root(app)) else { return };
    if old == new || !old.exists() {
        return;
    }
    let _ = std::fs::create_dir_all(&new);
    for name in ["settings.json", "minecraft", "instances", "runtime", "cache"] {
        let (from, to) = (old.join(name), new.join(name));
        if from.exists() && !to.exists() {
            if let Err(e) = std::fs::rename(&from, &to) {
                eprintln!("[migração] não deu para mover {name}: {e}");
            }
        }
    }
}

pub fn paths<R: Runtime>(app: &AppHandle<R>) -> Result<Paths> {
    let data = data_root(app)?;
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

fn log<R: Runtime>(app: &AppHandle<R>, s: impl AsRef<str>) {
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

fn report<R: Runtime>(app: &AppHandle<R>, e: anyhow::Error) -> String {
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

/// Versão e build do launcher, para o log ("Launcher v0.1.0 · build 0a8e022").
pub fn build_label() -> String {
    format!("Forbidden Series Launcher v{} · build {}", env!("CARGO_PKG_VERSION"), env!("FORBIDDEN_BUILD"))
}

async fn play<R: Runtime>(app: &AppHandle<R>, state: &GameState, req: PlayRequest, prog: Arc<Progress>, ticker: Ticker) -> Result<()> {
    let p = paths(app)?;
    let net = Net::new(state.cancel.clone())?;
    log(app, build_label());

    // conta original: token do Minecraft do cofre (renovado se preciso) antes de baixar qualquer coisa
    let access_token = if req.account.kind == "microsoft" {
        prog.stage("verifying", "Conta Microsoft");
        Some(crate::auth::launch_token(app, &req.account.uuid).await?)
    } else {
        None
    };

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

    // 3) Modpack: instala na 1ª vez, atualiza só o que mudou, repara o que sumiu
    let mut phase = "verifying";
    match &req.pack {
        Some(pack) => {
            prog.stage("verifying", &format!("Modpack {}", pack.tag));
            let result: Result<()> = async {
                let plan = modpack::plan(&net, &p.instance, pack, false).await?;
                match plan.mode {
                    modpack::Mode::None => log(app, format!("Modpack {} em dia.", pack.tag)),
                    modpack::Mode::Full => {
                        prog.stage("downloading", &format!("Baixando {}", pack.tag));
                        log(app, match &plan.summary.from {
                            Some(old) => format!("Atualizando o modpack: {old} → {} (download completo)", pack.tag),
                            None => format!("Instalando o modpack {} (versão mais nova)", pack.tag),
                        });
                    }
                    modpack::Mode::Delta => {
                        let s = &plan.summary;
                        log(app, format!(
                            "Atualizando o modpack: {} → {} · {} novo(s), {} alterado(s), {} removido(s) · {:.1} MB",
                            s.from.as_deref().unwrap_or("?"), pack.tag, s.added, s.changed, s.removed, s.download_bytes as f64 / 1048576.0
                        ));
                    }
                    modpack::Mode::Repair => log(app, format!("Restaurando {} arquivo(s) do modpack que estavam faltando ou corrompidos.", plan.summary.repaired)),
                }
                if plan.mode != modpack::Mode::None {
                    phase = "downloading";
                }
                let summary = modpack::apply(&net, &prog, &p.instance, &p.cache, pack, plan).await?;
                if summary.mode != modpack::Mode::None {
                    log(app, format!("Modpack {} pronto.", pack.tag));
                    let _ = app.emit("launch:pack-updated", &summary);
                }
                let _ = app.emit("launch:pack-installed", &pack.tag);
                Ok(())
            }
            .await;
            if let Err(e) = result {
                // queda de rede com uma versão já instalada: avisa e joga com ela
                let offline = !net::is_cancelled(&e) && e.chain().any(|c| c.is::<reqwest::Error>());
                match modpack::installed(&p.instance).filter(|_| offline) {
                    Some(state) => {
                        log(app, format!("Não foi possível atualizar agora ({e:#}). Jogando com {}.", state.tag));
                        let _ = app.emit("launch:notice", serde_json::json!({
                            "kind": "warning",
                            "title": "Atualização adiada",
                            "body": format!("Sem conexão estável com o GitHub. Abrindo com {}; a atualização tenta de novo no próximo JOGAR.", state.tag),
                        }));
                        let _ = app.emit("launch:pack-installed", &state.tag);
                    }
                    None => return Err(e),
                }
            }
        }
        None => match modpack::installed(&p.instance) {
            // sem conexão com o GitHub: joga com o que está instalado
            Some(state) => {
                modpack::recover(&p.instance);
                let broken = modpack::damaged(&p.instance, &state, false);
                if !broken.is_empty() {
                    log(app, format!("Atenção: {} arquivo(s) do modpack faltando; conecte-se para restaurar.", broken.len()));
                }
                log(app, format!("Sem conexão com o GitHub: usando o modpack instalado ({}).", state.tag));
                let _ = app.emit("launch:pack-installed", &state.tag);
            }
            None => bail!("o modpack ainda não foi instalado e não deu para consultar as versões no GitHub; verifique sua conexão"),
        },
    }

    // resumo para o log: um pack sem mods nunca passa em silêncio
    let (mod_count, pack_forge) = modpack::layout_report(&p.instance);
    log(app, format!(
        "Modpack: {mod_count} mod(s) em mods/ · Forge {}",
        if pack_forge { "do modpack (bin/modpack.jar)" } else { "oficial 10.13.4.1614 (o pack não trouxe bin/modpack.jar)" }
    ));
    if mod_count == 0 {
        let _ = app.emit("launch:notice", serde_json::json!({
            "kind": "warning",
            "title": "Nenhum mod encontrado",
            "body": "A pasta mods/ do jogo está vazia. Use \"Verificar arquivos\" nas configurações ou avise a equipe: o .zip do release pode estar num formato diferente.",
        }));
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
        access_token: access_token.as_deref(),
        memory_gb: req.memory_gb,
        jvm_args: &req.jvm_args,
    });
    log(app, format!("Perfil: {} ({})", req.account.username, req.account.kind));
    log(app, launch::redact(&cmd));
    state.running.store(true, Ordering::Relaxed);
    let header = vec![
        format!("[Launcher] {}", build_label()),
        format!("[Launcher] Modpack {} · {mod_count} mod(s) em mods/ · Forge {}", modpack::installed(&p.instance).map(|i| i.tag).unwrap_or_default(), if pack_forge { "do modpack" } else { "oficial" }),
    ];
    if let Err(e) = launch::spawn(app, cmd, p.instance.clone(), prog.clone(), ticker, header).await {
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

/// Calcula o que uma atualização vai baixar (só lê o índice do .zip remoto).
/// A interface mostra o tamanho exato antes do jogador clicar em ATUALIZAR.
#[tauri::command]
pub async fn game_update_plan(app: AppHandle, pack: modpack::PackInfo) -> Result<modpack::Summary, String> {
    let p = paths(&app).map_err(|e| e.to_string())?;
    let net = Net::new(Arc::new(AtomicBool::new(false))).map_err(|e| e.to_string())?;
    modpack::plan(&net, &p.instance, &pack, false).await.map(|plan| plan.summary).map_err(|e| format!("{e:#}"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyResult {
    checked: usize,
    repaired: usize,
}

/// Confere o SHA-1 de todos os arquivos do Minecraft e do Forge e baixa de novo os corrompidos.
#[tauri::command]
pub async fn game_verify(app: AppHandle, state: State<'_, GameState>, pack: Option<modpack::PackInfo>) -> Result<VerifyResult, String> {
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
        let mut checked = jobs.len();
        let mut repaired = net.ensure_all(jobs, &progress, true, 8).await?;
        // arquivos do modpack: CRC-32 de cada um (exceto configs, que o jogador pode editar)
        if let (Some(pack), Some(installed)) = (&pack, modpack::installed(&p.instance)) {
            if installed.tag == pack.tag {
                progress.stage("verifying", &format!("Modpack {}", pack.tag));
                checked += installed.entries.len();
                let plan = modpack::plan(&net, &p.instance, pack, true).await?;
                if plan.mode == modpack::Mode::Repair {
                    repaired += plan.summary.repaired;
                    modpack::apply(&net, &progress, &p.instance, &p.cache, pack, plan).await?;
                }
            }
        }
        log(&app, format!("Integridade: {checked} arquivos conferidos, {repaired} corrigidos."));
        Ok(VerifyResult { checked, repaired })
    }
    .await
    .map_err(|e| report(&app, e))
}

/// Teste de ponta a ponta: o mesmo fluxo do botão JOGAR, com o release TEOF real.
/// Roda no workflow "Teste completo" (rede + tela virtual), não no `cargo test` comum.
#[cfg(test)]
mod e2e {
    use super::*;
    use std::time::{Duration, Instant};

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    #[ignore = "baixa ~1 GB e abre o Minecraft: roda no workflow 'Teste completo'"]
    async fn jogar_instala_o_pack_e_o_forge_encontra_os_mods() {
        let app = tauri::test::mock_builder()
            .manage(GameState::default())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .expect("app de teste");
        let handle = app.handle().clone();
        let (pack, _) = modpack::latest_published_pack().await;
        println!("{}", build_label());
        println!("Pack: {} ({:?} bytes)", pack.tag, pack.size);

        let req = PlayRequest {
            account: launch::Account { username: "CI_Tester".into(), uuid: "6c6f6361-6c00-3000-8000-000000000001".into(), kind: "offline".into() },
            memory_gb: 4,
            jvm_args: Vec::new(),
            java_path: None,
            pack: Some(pack.clone()),
        };
        let state = handle.state::<GameState>();
        let progress = Arc::new(Progress::default());
        let ticker = Ticker::start(handle.clone(), progress.clone());
        let started = Instant::now();
        play(&handle, &state, req, progress, ticker).await.expect("o JOGAR falhou");
        println!("Java + Minecraft + modpack prontos e jogo iniciado em {:?}", started.elapsed());

        // arquivos no lugar certo
        let p = paths(&handle).unwrap();
        let (mods, pack_forge) = modpack::layout_report(&p.instance);
        println!("Na pasta do jogo: {mods} mod(s) em mods/ · Forge do pack: {pack_forge}");
        assert!(mods >= 50, "poucos mods em mods/: {mods}");
        assert!(pack_forge, "o bin/modpack.jar do pack não está na pasta do jogo");

        // o Forge precisa identificar os mods do pack (o Forge puro mostra só 3)
        let log = p.instance.join("logs").join("launcher-latest.log");
        let deadline = Instant::now() + Duration::from_secs(600);
        let mut identified: Option<usize> = None;
        while Instant::now() < deadline && identified.is_none() {
            tokio::time::sleep(Duration::from_secs(3)).await;
            let text = std::fs::read_to_string(&log).unwrap_or_default();
            identified = text.lines().find_map(|l| {
                let i = l.find("has identified ")?;
                l[i + 15..].split_whitespace().next()?.parse().ok()
            });
            if !state.running.load(Ordering::Relaxed) {
                break;
            }
        }
        let text = std::fs::read_to_string(&log).unwrap_or_default();
        println!("---- início do launcher-latest.log ----");
        for l in text.lines().take(12) {
            println!("{l}");
        }
        println!("---- fim do launcher-latest.log ----");
        for l in text.lines().rev().take(25).collect::<Vec<_>>().into_iter().rev() {
            println!("{l}");
        }
        if let Some(tx) = state.kill.lock().unwrap().take() {
            let _ = tx.send(());
        }
        let identified = identified.expect("o Forge não chegou a identificar os mods (veja o log acima)");
        println!("Forge identificou {identified} mods (pasta mods/ tem {mods} arquivos)");
        assert!(identified > 3 + mods / 2, "o Forge identificou só {identified} mods: o pack não foi carregado");
        assert!(text.contains(&build_label()), "o log não mostra a build do launcher");
    }
}

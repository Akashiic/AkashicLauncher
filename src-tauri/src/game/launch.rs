//! Monta a linha de comando do Minecraft 1.7.10 + Forge e acompanha o processo:
//! logs em lotes para a interface, aviso quando a janela do jogo abre e quando fecha.

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, Instant, SystemTime};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{mpsc, oneshot};

use super::forge::Forge;
use super::minecraft::Vanilla;
use super::progress::{Progress, Ticker};
use super::GameState;

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub username: String,
    pub uuid: String,
    /// "offline" | "microsoft"
    #[serde(rename = "type")]
    pub kind: String,
}

pub struct Spec<'a> {
    pub java: &'a Path,
    pub instance: &'a Path,
    pub mc_root: &'a Path,
    pub natives: &'a Path,
    pub vanilla: &'a Vanilla,
    pub forge: &'a Forge,
    pub account: &'a Account,
    pub memory_gb: u32,
    pub jvm_args: &'a [String],
}

/// Extrai os nativos (LWJGL, OpenAL, JInput) para a pasta da instância.
pub fn extract_natives(natives: &[(PathBuf, Vec<String>)], dir: &Path) -> Result<()> {
    use std::io::Read;
    let _ = std::fs::remove_dir_all(dir);
    std::fs::create_dir_all(dir)?;
    for (jar, exclude) in natives {
        let mut zip = zip::ZipArchive::new(std::fs::File::open(jar).with_context(|| format!("abrindo {}", jar.display()))?)?;
        for i in 0..zip.len() {
            let mut e = zip.by_index(i)?;
            let name = e.name().to_string();
            if !e.is_file() || exclude.iter().any(|x| name.starts_with(x.as_str())) || name.contains("..") {
                continue;
            }
            let target = dir.join(&name);
            if let Some(p) = target.parent() {
                std::fs::create_dir_all(p)?;
            }
            let mut buf = Vec::with_capacity(e.size() as usize);
            e.read_to_end(&mut buf)?;
            std::fs::write(&target, buf)?;
        }
    }
    Ok(())
}

fn has_flag(args: &[String], prefix: &str) -> bool {
    args.iter().any(|a| a.starts_with(prefix))
}

/// Linha de comando completa (executável + argumentos).
pub fn command_line(s: &Spec) -> Vec<String> {
    let sep = if cfg!(windows) { ";" } else { ":" };
    // classpath: Forge e as bibliotecas dele primeiro (vencem duplicadas, ex.: guava 17 > 15)
    let mut seen = std::collections::HashSet::new();
    let mut cp: Vec<String> = vec![s.forge.jar.to_string_lossy().into_owned()];
    for (key, path) in s.forge.classpath.iter().chain(s.vanilla.classpath.iter()) {
        if seen.insert(key.clone()) {
            cp.push(path.to_string_lossy().into_owned());
        }
    }
    cp.push(s.vanilla.jar.to_string_lossy().into_owned());

    let mut args: Vec<String> = Vec::new();
    if !has_flag(s.jvm_args, "-Xms") {
        args.push("-Xms1G".into());
    }
    if !has_flag(s.jvm_args, "-Xmx") {
        args.push(format!("-Xmx{}G", s.memory_gb.max(1)));
    }
    args.extend(s.jvm_args.iter().cloned());
    if cfg!(windows) {
        // truque do launcher oficial: drivers Intel antigos tratam o processo como "minecraft.exe"
        args.push("-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump".into());
    }
    if cfg!(target_os = "macos") {
        args.push("-XstartOnFirstThread".into());
    }
    args.push(format!("-Djava.library.path={}", s.natives.to_string_lossy()));
    args.push("-Dfml.ignoreInvalidMinecraftCertificates=true".into());
    args.push("-Dfml.ignorePatchDiscrepancies=true".into());
    args.push("-Dlog4j2.formatMsgNoLookups=true".into());
    if let Some(l) = &s.vanilla.logging_arg {
        args.push(l.clone());
    }
    args.push("-Dminecraft.launcher.brand=forbidden-launcher".into());
    args.push(format!("-Dminecraft.launcher.version={}", env!("CARGO_PKG_VERSION")));
    args.push("-cp".into());
    args.push(cp.join(sep));
    args.push(s.forge.main_class.clone());

    let uuid = s.account.uuid.replace('-', "");
    // contas offline: token aleatório (o 1.7.10 não valida no singleplayer/servidores offline)
    let token: String = {
        use rand::Rng;
        let mut r = rand::thread_rng();
        (0..32).map(|_| format!("{:x}", r.gen_range(0..16))).collect()
    };
    let assets = s.mc_root.join("assets");
    for a in s.forge.minecraft_arguments.split_whitespace() {
        let v = match a {
            "${auth_player_name}" => s.account.username.clone(),
            "${version_name}" => s.forge.id.clone(),
            "${game_directory}" => s.instance.to_string_lossy().into_owned(),
            "${assets_root}" | "${game_assets}" => assets.to_string_lossy().into_owned(),
            "${assets_index_name}" => s.vanilla.asset_index.clone(),
            "${auth_uuid}" => uuid.clone(),
            "${auth_access_token}" | "${auth_session}" => token.clone(),
            "${user_properties}" => "{}".into(),
            "${user_type}" => "legacy".into(),
            other => other.to_string(),
        };
        args.push(v);
    }
    let mut out = vec![s.java.to_string_lossy().into_owned()];
    out.extend(args);
    out
}

/// Linha de comando para o log: sem o token e com o classpath resumido.
pub fn redact(cmd: &[String]) -> String {
    let mut out = Vec::with_capacity(cmd.len());
    let mut prev = "";
    for a in cmd {
        out.push(match prev {
            "-cp" => format!("<classpath: {} arquivos>", a.split(if cfg!(windows) { ';' } else { ':' }).count()),
            "--accessToken" => "••••".to_string(),
            _ => a.clone(),
        });
        prev = a;
    }
    out.join(" ")
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExitInfo {
    code: Option<i32>,
    crash_report: Option<String>,
}

fn newest_crash_report(instance: &Path, since: SystemTime) -> Option<String> {
    let dir = instance.join("crash-reports");
    let mut best: Option<(SystemTime, PathBuf)> = None;
    for e in std::fs::read_dir(dir).ok()?.flatten() {
        let m = e.metadata().ok()?.modified().ok()?;
        if m >= since && best.as_ref().is_none_or(|(t, _)| m > *t) {
            best = Some((m, e.path()));
        }
    }
    best.map(|(_, p)| p.to_string_lossy().into_owned())
}

/// A configuração de log da Mojang (que corrige o Log4Shell) escreve no console em
/// XML. Converte cada evento numa linha legível: `[thread/LEVEL] [logger]: mensagem`.
#[derive(Default)]
struct XmlLog {
    head: Option<String>,
    body: Vec<String>,
    cdata: Option<String>,
}

fn attr<'a>(line: &'a str, name: &str) -> &'a str {
    let key = format!("{name}=\"");
    line.find(&key)
        .and_then(|i| {
            let rest = &line[i + key.len()..];
            rest.find('"').map(|j| &rest[..j])
        })
        .unwrap_or("")
}

impl XmlLog {
    fn feed(&mut self, line: &str) -> Vec<String> {
        let mut out = Vec::new();
        let t = line.trim();
        // dentro de um bloco CDATA (mensagem ou stack trace com várias linhas)
        if let Some(buf) = self.cdata.as_mut() {
            if let Some(end) = line.find("]]>") {
                buf.push_str(&line[..end]);
                let text = self.cdata.take().unwrap();
                self.body.extend(text.lines().map(str::to_string));
            } else {
                buf.push_str(line);
                buf.push('\n');
            }
            return out;
        }
        if t.starts_with("<log4j:Event") {
            self.head = Some(format!("[{}/{}] [{}]:", attr(t, "thread"), attr(t, "level"), attr(t, "logger")));
            self.body.clear();
            return out;
        }
        if t.starts_with("</log4j:Event>") {
            if let Some(head) = self.head.take() {
                let mut lines = std::mem::take(&mut self.body).into_iter();
                out.push(format!("{head} {}", lines.next().unwrap_or_default()));
                out.extend(lines);
            }
            return out;
        }
        if self.head.is_some() {
            if let Some(i) = t.find("<![CDATA[") {
                let rest = &t[i + 9..];
                match rest.find("]]>") {
                    Some(end) => self.body.push(rest[..end].to_string()),
                    None => self.cdata = Some(format!("{rest}\n")),
                }
            }
            return out;
        }
        out.push(line.to_string());
        out
    }
}

/// Marcos do log do Forge → progresso da fase "abrindo o portal".
fn milestone(line: &str) -> Option<f64> {
    let marks: [(&str, f64); 6] = [
        ("Loading tweak class name cpw.mods.fml.common.launcher.FMLTweaker", 0.15),
        ("Forge Mod Loader version", 0.25),
        ("Loading tweak class name cpw.mods.fml.common.launcher.FMLDeobfTweaker", 0.4),
        ("Launching wrapped minecraft", 0.6),
        ("Setting user:", 0.8),
        ("LWJGL Version", 1.0),
    ];
    marks.iter().find(|(m, _)| line.contains(m)).map(|(_, f)| *f)
}

/// Inicia o jogo e acompanha até ele fechar (em segundo plano).
pub async fn spawn(app: &AppHandle, cmd: Vec<String>, instance: PathBuf, progress: std::sync::Arc<Progress>, ticker: Ticker) -> Result<()> {
    let mut c = tokio::process::Command::new(&cmd[0]);
    c.args(&cmd[1..]).current_dir(&instance).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        // javaw sem janela de console
        c.creation_flags(0x0800_0000);
    }
    let mut child = c.spawn().context("não foi possível iniciar o Java")?;
    let started_at = SystemTime::now();

    let (tx, mut rx) = mpsc::unbounded_channel::<String>();
    for pipe in [child.stdout.take().map(|p| Box::new(p) as Box<dyn tokio::io::AsyncRead + Unpin + Send>), child.stderr.take().map(|p| Box::new(p) as Box<dyn tokio::io::AsyncRead + Unpin + Send>)]
        .into_iter()
        .flatten()
    {
        let tx = tx.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(pipe).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                if tx.send(l).is_err() {
                    break;
                }
            }
        });
    }
    drop(tx);

    // logs: lotes a cada 150 ms + cópia completa em logs/launcher-latest.log
    let log_app = app.clone();
    let log_path = instance.join("logs").join("launcher-latest.log");
    let window_app = app.clone();
    tokio::spawn(async move {
        let _ = tokio::fs::create_dir_all(log_path.parent().unwrap()).await;
        let mut file = tokio::fs::File::create(&log_path).await.ok();
        let mut batch: Vec<String> = Vec::new();
        let mut last = Instant::now();
        let mut window_open = false;
        // o progresso segue sendo emitido até a janela do jogo abrir
        let mut ticker = Some(ticker);
        let deadline = Instant::now() + Duration::from_secs(90);
        let mut xml = XmlLog::default();
        loop {
            let next = tokio::time::timeout(Duration::from_millis(150), rx.recv()).await;
            match next {
                Ok(Some(raw)) => for line in xml.feed(&raw) {
                    if let Some(f) = file.as_mut() {
                        let _ = f.write_all(line.as_bytes()).await;
                        let _ = f.write_all(b"\n").await;
                    }
                    if !window_open {
                        if let Some(p) = milestone(&line) {
                            progress.set_fraction(p);
                            progress.set_current(line.chars().take(120).collect::<String>());
                            if p >= 1.0 {
                                window_open = true;
                                ticker.take();
                                let _ = window_app.emit("game:window", ());
                            }
                        }
                    }
                    batch.push(line);
                },
                Ok(None) => break,
                Err(_) => {}
            }
            if !window_open && Instant::now() > deadline {
                window_open = true;
                ticker.take();
                let _ = window_app.emit("game:window", ());
            }
            if !batch.is_empty() && (last.elapsed() >= Duration::from_millis(150) || batch.len() > 200) {
                let _ = log_app.emit("launch:logs", std::mem::take(&mut batch));
                last = Instant::now();
            }
        }
        if !batch.is_empty() {
            let _ = log_app.emit("launch:logs", batch);
        }
        if let Some(mut f) = file {
            let _ = f.flush().await;
        }
    });

    // espera o processo (ou o pedido de fechar)
    let (kill_tx, kill_rx) = oneshot::channel::<()>();
    *app.state::<GameState>().kill.lock().unwrap() = Some(kill_tx);
    let exit_app = app.clone();
    tokio::spawn(async move {
        let status = tokio::select! {
            s = child.wait() => s.ok(),
            _ = kill_rx => {
                let _ = child.kill().await;
                child.wait().await.ok()
            }
        };
        let state = exit_app.state::<GameState>();
        state.kill.lock().unwrap().take();
        state.running.store(false, std::sync::atomic::Ordering::Relaxed);
        let code = status.and_then(|s| s.code());
        let crash_report = if code.is_some_and(|c| c != 0) { newest_crash_report(&instance, started_at) } else { None };
        let _ = exit_app.emit("game:exit", ExitInfo { code, crash_report });
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn xml_log_vira_linhas_legiveis() {
        let mut x = XmlLog::default();
        let input = [
            r#"<log4j:Event logger="FML" timestamp="1794226660915" level="INFO" thread="main">"#,
            r#"  <log4j:Message><![CDATA[Forge Mod Loader version 7.99.40.1614 for Minecraft 1.7.10 loading]]></log4j:Message>"#,
            r#"</log4j:Event>"#,
            r#"<log4j:Event logger="net.minecraft.client.Minecraft" timestamp="1" level="ERROR" thread="Client thread">"#,
            r#"  <log4j:Message><![CDATA[Falhou]]></log4j:Message>"#,
            r#"  <log4j:Throwable><![CDATA[java.lang.RuntimeException: x"#,
            r#"	at a.b(c.java:1)"#,
            r#"]]></log4j:Throwable>"#,
            r#"</log4j:Event>"#,
            "linha comum",
        ];
        let out: Vec<String> = input.iter().flat_map(|l| x.feed(l)).collect();
        assert_eq!(out[0], "[main/INFO] [FML]: Forge Mod Loader version 7.99.40.1614 for Minecraft 1.7.10 loading");
        assert_eq!(out[1], "[Client thread/ERROR] [net.minecraft.client.Minecraft]: Falhou");
        assert_eq!(out[2], "java.lang.RuntimeException: x");
        assert_eq!(out[3], "\tat a.b(c.java:1)");
        assert_eq!(out[4], "linha comum");
        assert!(milestone(&out[0]).is_some());
    }

    #[test]
    fn token_e_classpath_nao_aparecem_no_log() {
        let cmd: Vec<String> = ["java", "-cp", "a.jar:b.jar", "Main", "--accessToken", "segredo"].iter().map(|s| s.to_string()).collect();
        let r = redact(&cmd);
        assert!(!r.contains("segredo"));
        assert!(r.contains("<classpath"));
    }
}

//! Downloads verificados: arquivo temporário `.part`, SHA-1/SHA-256, novas
//! tentativas, URLs alternativas, retomada (arquivos grandes) e cancelamento.

use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};

use anyhow::{anyhow, bail, Context, Result};
use futures_util::{stream, StreamExt};
use sha1::Sha1;
use sha2::{Digest, Sha256};
use tokio::{fs, io::AsyncWriteExt};

use super::progress::Progress;

pub const USER_AGENT: &str = concat!("ForbiddenLauncher/", env!("CARGO_PKG_VERSION"));

/// Erro usado quando o usuário cancela (a interface não mostra como falha).
#[derive(Debug)]
pub struct Cancelled;
impl std::fmt::Display for Cancelled {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("operação cancelada")
    }
}
impl std::error::Error for Cancelled {}

pub fn is_cancelled(e: &anyhow::Error) -> bool {
    e.chain().any(|c| c.is::<Cancelled>())
}

/// Um arquivo a garantir no disco.
#[derive(Clone, Debug)]
pub struct Job {
    /// URLs em ordem de preferência (a primeira que funcionar vence).
    pub urls: Vec<String>,
    pub path: PathBuf,
    /// SHA-1 aceitos (vazio = sem verificação de hash).
    pub sha1: Vec<String>,
    pub size: Option<u64>,
}

#[derive(Clone)]
pub struct Net {
    client: reqwest::Client,
    cancel: Arc<AtomicBool>,
}

fn part_path(p: &Path) -> PathBuf {
    let mut s = p.as_os_str().to_owned();
    s.push(".part");
    PathBuf::from(s)
}

pub async fn sha1_file(path: &Path) -> Result<String> {
    let path = path.to_owned();
    tokio::task::spawn_blocking(move || -> Result<String> {
        use std::io::Read;
        let mut f = std::fs::File::open(&path)?;
        let mut h = Sha1::new();
        let mut buf = vec![0u8; 256 * 1024];
        loop {
            let n = f.read(&mut buf)?;
            if n == 0 {
                break;
            }
            h.update(&buf[..n]);
        }
        Ok(hex::encode(h.finalize()))
    })
    .await?
}

pub async fn sha256_file(path: &Path) -> Result<String> {
    let path = path.to_owned();
    tokio::task::spawn_blocking(move || -> Result<String> {
        use std::io::Read;
        let mut f = std::fs::File::open(&path)?;
        let mut h = Sha256::new();
        let mut buf = vec![0u8; 1024 * 1024];
        loop {
            let n = f.read(&mut buf)?;
            if n == 0 {
                break;
            }
            h.update(&buf[..n]);
        }
        Ok(hex::encode(h.finalize()))
    })
    .await?
}

impl Net {
    pub fn new(cancel: Arc<AtomicBool>) -> Result<Self> {
        let client = reqwest::Client::builder()
            .user_agent(USER_AGENT)
            .connect_timeout(Duration::from_secs(15))
            .read_timeout(Duration::from_secs(60))
            .pool_max_idle_per_host(16)
            .build()?;
        Ok(Self { client, cancel })
    }

    pub fn client(&self) -> &reqwest::Client {
        &self.client
    }

    pub fn check(&self) -> Result<()> {
        if self.cancel.load(Ordering::Relaxed) {
            return Err(Cancelled.into());
        }
        Ok(())
    }

    /// O arquivo já está certo? Rápido: confere tamanho. Completo: confere o SHA-1.
    pub async fn is_ok(job: &Job, deep: bool) -> bool {
        let Ok(meta) = fs::metadata(&job.path).await else { return false };
        if !meta.is_file() {
            return false;
        }
        if let Some(size) = job.size {
            if meta.len() != size {
                return false;
            }
        }
        if deep && !job.sha1.is_empty() {
            return match sha1_file(&job.path).await {
                Ok(h) => job.sha1.iter().any(|x| x.eq_ignore_ascii_case(&h)),
                Err(_) => false,
            };
        }
        true
    }

    async fn try_fetch(&self, url: &str, job: &Job, prog: &Progress) -> Result<()> {
        if let Some(dir) = job.path.parent() {
            fs::create_dir_all(dir).await?;
        }
        let part = part_path(&job.path);
        let resp = self.client.get(url).send().await?.error_for_status()?;
        let mut file = fs::File::create(&part).await?;
        let mut hasher = Sha1::new();
        let mut written = 0u64;
        let mut body = resp.bytes_stream();
        let res: Result<()> = async {
            while let Some(chunk) = body.next().await {
                self.check()?;
                let chunk = chunk?;
                hasher.update(&chunk);
                file.write_all(&chunk).await?;
                written += chunk.len() as u64;
                prog.add_bytes(chunk.len() as u64);
            }
            file.flush().await?;
            Ok(())
        }
        .await;
        drop(file);
        let res = res.and_then(|_| {
            if let Some(size) = job.size {
                if written != size {
                    bail!("tamanho inesperado ({written} de {size} bytes)");
                }
            }
            if !job.sha1.is_empty() {
                let h = hex::encode(hasher.finalize());
                if !job.sha1.iter().any(|x| x.eq_ignore_ascii_case(&h)) {
                    bail!("SHA-1 não confere");
                }
            }
            Ok(())
        });
        if let Err(e) = res {
            prog.sub_bytes(written);
            let _ = fs::remove_file(&part).await;
            return Err(e);
        }
        fs::rename(&part, &job.path).await?;
        Ok(())
    }

    /// Baixa um arquivo, tentando cada URL até 3 vezes.
    pub async fn fetch(&self, job: &Job, prog: &Progress) -> Result<()> {
        let mut last: Option<anyhow::Error> = None;
        for url in &job.urls {
            for attempt in 0..3u64 {
                self.check()?;
                match self.try_fetch(url, job, prog).await {
                    Ok(()) => return Ok(()),
                    Err(e) if is_cancelled(&e) => return Err(e),
                    Err(e) => {
                        last = Some(e.context(url.clone()));
                        // 404/403: não adianta repetir a mesma URL
                        let fatal = last
                            .as_ref()
                            .and_then(|e| e.chain().find_map(|c| c.downcast_ref::<reqwest::Error>()))
                            .and_then(|e| e.status())
                            .is_some_and(|s| s.is_client_error());
                        if fatal {
                            break;
                        }
                        tokio::time::sleep(Duration::from_millis(400 * (attempt + 1))).await;
                    }
                }
            }
        }
        let name = job.path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        Err(last.unwrap_or_else(|| anyhow!("sem endereço de download")).context(format!("falha ao baixar {name}")))
    }

    /// Garante uma lista de arquivos: confere os existentes e baixa só o que falta,
    /// vários ao mesmo tempo. Retorna quantos foram baixados.
    pub async fn ensure_all(&self, jobs: Vec<Job>, prog: &Progress, deep: bool, parallel: usize) -> Result<usize> {
        prog.set_totals(jobs.len() as u64, 0);
        // 1) conferência (rápida: só metadados; completa: SHA-1)
        let checks: Vec<(Job, bool)> = stream::iter(jobs)
            .map(|job| async move {
                let ok = Net::is_ok(&job, deep).await;
                (job, ok)
            })
            .buffer_unordered(if deep { 8 } else { 64 })
            .collect()
            .await;
        let mut missing = Vec::new();
        for (job, ok) in checks {
            if ok {
                prog.file_done();
            } else {
                prog.add_bytes_total(job.size.unwrap_or(0));
                missing.push(job);
            }
        }
        self.check()?;
        let count = missing.len();
        // 2) downloads em paralelo
        let results: Vec<Result<()>> = stream::iter(missing)
            .map(|job| async move {
                if let Some(name) = job.path.file_name() {
                    prog.set_current(name.to_string_lossy());
                }
                let r = self.fetch(&job, prog).await;
                if r.is_ok() {
                    prog.file_done();
                }
                r
            })
            .buffer_unordered(parallel)
            .collect()
            .await;
        for r in results {
            r?;
        }
        Ok(count)
    }

    /// Download grande com retomada (Range) e SHA-256 opcional — o .zip do modpack.
    pub async fn fetch_resumable(&self, url: &str, path: &Path, size: Option<u64>, sha256: Option<&str>, prog: &Progress) -> Result<()> {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir).await?;
        }
        let part = part_path(path);
        prog.set_totals(1, size.unwrap_or(0));
        let mut attempt = 0u64;
        loop {
            self.check()?;
            let have = fs::metadata(&part).await.map(|m| m.len()).unwrap_or(0);
            prog.sub_bytes(u64::MAX);
            prog.add_bytes(have);
            let res: Result<()> = async {
                let mut req = self.client.get(url);
                if have > 0 {
                    req = req.header(reqwest::header::RANGE, format!("bytes={have}-"));
                }
                let resp = req.send().await?.error_for_status()?;
                let resumed = resp.status() == reqwest::StatusCode::PARTIAL_CONTENT;
                if size.is_none() {
                    if let Some(len) = resp.content_length() {
                        prog.set_totals(1, len + if resumed { have } else { 0 });
                    }
                }
                let mut file = if resumed {
                    fs::OpenOptions::new().append(true).open(&part).await?
                } else {
                    prog.sub_bytes(u64::MAX);
                    fs::File::create(&part).await?
                };
                let mut body = resp.bytes_stream();
                while let Some(chunk) = body.next().await {
                    self.check()?;
                    let chunk = chunk?;
                    file.write_all(&chunk).await?;
                    prog.add_bytes(chunk.len() as u64);
                }
                file.flush().await?;
                Ok(())
            }
            .await;
            match res {
                Ok(()) => break,
                Err(e) if is_cancelled(&e) => return Err(e),
                Err(e) if attempt >= 5 => return Err(e),
                Err(_) => {
                    attempt += 1;
                    tokio::time::sleep(Duration::from_secs(attempt.min(5))).await;
                }
            }
        }
        let len = fs::metadata(&part).await?.len();
        if let Some(size) = size {
            if len != size {
                let _ = fs::remove_file(&part).await;
                bail!("o arquivo baixado tem {len} bytes, esperado {size}");
            }
        }
        if let Some(expected) = sha256 {
            prog.set_current("Conferindo SHA-256");
            let h = sha256_file(&part).await?;
            if !h.eq_ignore_ascii_case(expected) {
                let _ = fs::remove_file(&part).await;
                bail!("o SHA-256 do arquivo baixado não confere com o oficial");
            }
        }
        fs::rename(&part, path).await.context("salvando o download")?;
        prog.file_done();
        Ok(())
    }
}

//! Instalação do modpack (release TEOF- do GitHub): baixa o .zip com retomada,
//! confere tamanho/SHA-256, remove os arquivos da versão anterior que saíram do
//! pack e extrai o novo. Arquivos do jogador (opções, mundos, servidores) ficam.

use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};

use super::net::Net;
use super::progress::Progress;

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PackInfo {
    pub tag: String,
    pub url: String,
    pub size: Option<u64>,
    pub sha256: Option<String>,
}

#[derive(Serialize, Deserialize, Default)]
pub struct InstalledPack {
    pub tag: String,
    pub files: Vec<String>,
}

/// Arquivos do jogador: o pack nunca sobrescreve se já existirem.
const KEEP_IF_EXISTS: &[&str] = &["options.txt", "optionsof.txt", "optionsnf.txt", "optionsshaders.txt", "servers.dat"];
const KEEP_DIRS: &[&str] = &["saves/", "screenshots/", "logs/", "crash-reports/", "journeymap/data/"];

fn state_file(instance: &Path) -> PathBuf {
    instance.join(".forbidden").join("pack.json")
}

pub fn installed(instance: &Path) -> Option<InstalledPack> {
    let raw = std::fs::read(state_file(instance)).ok()?;
    serde_json::from_slice(&raw).ok()
}

/// Caminho relativo seguro (sem `..`, sem raiz) com `/`.
fn safe_rel(name: &str) -> Option<String> {
    let p = Path::new(name);
    let mut parts = Vec::new();
    for c in p.components() {
        match c {
            Component::Normal(s) => parts.push(s.to_string_lossy().into_owned()),
            Component::CurDir => {}
            _ => return None,
        }
    }
    (!parts.is_empty()).then(|| parts.join("/"))
}

/// Se tudo estiver dentro de uma única pasta (ex.: "TEOF-5.3/mods/..."), remove essa pasta.
fn common_prefix(names: &[String]) -> Option<String> {
    let known = ["mods/", "config/", "bin/", "scripts/", "resources/", "resourcepacks/"];
    if names.iter().any(|n| known.iter().any(|k| n.starts_with(k))) {
        return None;
    }
    let first = names.first()?.split('/').next()?.to_string();
    let prefix = format!("{first}/");
    names.iter().all(|n| n.starts_with(&prefix)).then_some(prefix)
}

pub async fn install(net: &Net, prog: &Arc<Progress>, instance: &Path, cache: &Path, pack: &PackInfo) -> Result<()> {
    let zip_path = cache.join(format!("{}.zip", pack.tag));
    prog.set_current(format!("{}.zip", pack.tag));
    net.fetch_resumable(&pack.url, &zip_path, pack.size, pack.sha256.as_deref(), prog)
        .await
        .with_context(|| format!("baixando o modpack {}", pack.tag))?;
    net.check()?;

    prog.stage("downloading", &format!("Extraindo {}", pack.tag));
    let instance = instance.to_owned();
    let tag = pack.tag.clone();
    let cancel_net = net.clone();
    let zip_for_task = zip_path.clone();
    let prog_task = prog.clone();
    tokio::task::spawn_blocking(move || extract(&cancel_net, &prog_task, &zip_for_task, &instance, &tag))
        .await?
        .context("extraindo o modpack")?;
    let _ = tokio::fs::remove_file(&zip_path).await;
    Ok(())
}

fn extract(net: &Net, prog: &Progress, zip_path: &Path, instance: &Path, tag: &str) -> Result<()> {
    use std::io::{Read, Write};
    let mut zip = zip::ZipArchive::new(std::fs::File::open(zip_path)?).context("o arquivo do modpack não é um .zip válido")?;
    let names: Vec<String> = (0..zip.len())
        .filter_map(|i| zip.by_index_raw(i).ok().filter(|e| e.is_file()).and_then(|e| safe_rel(e.name())))
        .collect();
    if names.is_empty() {
        bail!("o .zip do modpack está vazio");
    }
    let prefix = common_prefix(&names);
    let strip = |n: &str| -> Option<String> {
        let n = match &prefix {
            Some(p) => n.strip_prefix(p.as_str())?.to_string(),
            None => n.to_string(),
        };
        (!n.is_empty()).then_some(n)
    };
    let new_files: HashSet<String> = names.iter().filter_map(|n| strip(n)).collect();

    // remove o que a versão anterior instalou e saiu do pack (ex.: mods antigos)
    std::fs::create_dir_all(instance)?;
    if let Some(old) = installed(instance) {
        for f in old.files.iter().filter(|f| !new_files.contains(*f)) {
            if KEEP_DIRS.iter().any(|d| f.starts_with(d)) || KEEP_IF_EXISTS.contains(&f.as_str()) {
                continue;
            }
            if let Some(rel) = safe_rel(f) {
                let _ = std::fs::remove_file(instance.join(rel));
            }
        }
    }

    prog.set_totals(new_files.len() as u64, 0);
    let mut buf = vec![0u8; 256 * 1024];
    for i in 0..zip.len() {
        net.check()?;
        let mut entry = zip.by_index(i)?;
        if !entry.is_file() {
            continue;
        }
        let Some(rel) = safe_rel(entry.name()).and_then(|n| strip(&n)) else { continue };
        let target = instance.join(&rel);
        let keep = KEEP_IF_EXISTS.contains(&rel.as_str()) || KEEP_DIRS.iter().any(|d| rel.starts_with(d));
        if keep && target.exists() {
            prog.file_done();
            continue;
        }
        if let Some(dir) = target.parent() {
            std::fs::create_dir_all(dir)?;
        }
        prog.set_current(rel.clone());
        let tmp = target.with_extension("forbidden-tmp");
        {
            let mut out = std::fs::File::create(&tmp)?;
            loop {
                let n = entry.read(&mut buf)?;
                if n == 0 {
                    break;
                }
                out.write_all(&buf[..n])?;
            }
        }
        std::fs::rename(&tmp, &target).with_context(|| format!("gravando {rel}"))?;
        prog.file_done();
    }

    let state = InstalledPack { tag: tag.to_string(), files: new_files.into_iter().collect() };
    let file = state_file(instance);
    std::fs::create_dir_all(file.parent().unwrap())?;
    std::fs::write(&file, serde_json::to_vec_pretty(&state)?)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn caminhos_perigosos_sao_recusados() {
        assert_eq!(safe_rel("mods/a.jar").as_deref(), Some("mods/a.jar"));
        assert_eq!(safe_rel("./config/x.cfg").as_deref(), Some("config/x.cfg"));
        assert_eq!(safe_rel("../fora.txt"), None);
        assert_eq!(safe_rel("/etc/passwd"), None);
    }

    #[test]
    fn pasta_raiz_unica_e_removida() {
        let n = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(common_prefix(&n(&["TEOF-5.3/mods/a.jar", "TEOF-5.3/bin/modpack.jar"])).as_deref(), Some("TEOF-5.3/"));
        assert_eq!(common_prefix(&n(&["mods/a.jar", "bin/modpack.jar"])), None);
        assert_eq!(common_prefix(&n(&["a/x", "b/y"])), None);
    }
}

//! Modpack (releases TEOF- do GitHub): instalação e atualizador.
//!
//! - **1ª vez**: baixa o .zip inteiro (com retomada) e extrai. O launcher não traz
//!   pack nenhum: tudo começa no primeiro JOGAR, sempre na versão mais nova.
//! - **Atualização incremental**: lê só o índice do .zip novo (HTTP Range), compara
//!   o CRC-32 de cada arquivo com o instalado e baixa apenas o que mudou. Se não
//!   compensar (ou o servidor não aceitar pedaços), volta ao download completo.
//! - **Segura**: os arquivos novos vão para uma área separada e são conferidos; a
//!   troca é registrada num diário e, se algo falhar no meio, a versão anterior é
//!   restaurada (inclusive na próxima abertura, se o PC desligar durante a troca).
//! - **Respeita o jogador**: configs editadas só são trocadas se o pack mudou aquele
//!   arquivo; opções, servidores, mundos e mapas nunca são tocados.
//! - **Autorreparo**: a cada JOGAR, arquivos do pack apagados ou corrompidos são
//!   baixados de novo, só eles.

use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};

use super::net::Net;
use super::progress::Progress;
use super::zipremote::{self, Entry, RangeUnsupported};

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PackInfo {
    pub tag: String,
    pub url: String,
    pub size: Option<u64>,
    pub sha256: Option<String>,
}

/// Um arquivo instalado pelo pack (CRC-32 e tamanho como estão no .zip).
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FileRec {
    pub path: String,
    pub crc: u32,
    pub size: u64,
}

/// Estado do pack instalado (`instances/forbidden/.forbidden/pack.json`).
#[derive(Serialize, Deserialize, Default)]
pub struct InstalledPack {
    pub tag: String,
    #[serde(default)]
    pub entries: Vec<FileRec>,
    /// formato antigo (só caminhos), lido para remover arquivos numa atualização
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub files: Vec<String>,
}

impl InstalledPack {
    fn paths(&self) -> Vec<String> {
        if self.entries.is_empty() {
            self.files.clone()
        } else {
            self.entries.iter().map(|e| e.path.clone()).collect()
        }
    }
}

/// Arquivos do jogador: o pack nunca sobrescreve se já existirem, nem remove.
const KEEP_IF_EXISTS: &[&str] = &["options.txt", "optionsof.txt", "optionsnf.txt", "optionsshaders.txt", "servers.dat"];
const KEEP_DIRS: &[&str] = &["saves/", "screenshots/", "logs/", "crash-reports/", "journeymap/data/"];

fn is_keep(rel: &str) -> bool {
    KEEP_IF_EXISTS.contains(&rel) || KEEP_DIRS.iter().any(|d| rel.starts_with(d))
}

/// Configs: o jogador pode editar. Só são trocadas quando o pack muda o arquivo.
fn is_config(rel: &str) -> bool {
    rel.starts_with("config/") || rel.ends_with(".cfg") || rel.ends_with(".txt") || rel.ends_with(".json") || rel.ends_with(".properties")
}

fn meta_dir(instance: &Path) -> PathBuf {
    instance.join(".forbidden")
}

fn state_file(instance: &Path) -> PathBuf {
    meta_dir(instance).join("pack.json")
}

pub fn installed(instance: &Path) -> Option<InstalledPack> {
    let raw = std::fs::read(state_file(instance)).ok()?;
    serde_json::from_slice(&raw).ok()
}

fn write_state(instance: &Path, state: &InstalledPack) -> Result<()> {
    let file = state_file(instance);
    std::fs::create_dir_all(file.parent().unwrap())?;
    let tmp = file.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(state)?)?;
    std::fs::rename(&tmp, &file)?;
    Ok(())
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

/// Mapeia as entradas do .zip para caminhos dentro da pasta do jogo.
fn map_entries(entries: Vec<Entry>) -> Vec<(String, Entry)> {
    let files: Vec<Entry> = entries.into_iter().filter(|e| !e.is_dir).collect();
    let names: Vec<String> = files.iter().filter_map(|e| safe_rel(&e.name)).collect();
    let prefix = common_prefix(&names);
    files
        .into_iter()
        .filter_map(|e| {
            let rel = safe_rel(&e.name)?;
            let rel = match &prefix {
                Some(p) => rel.strip_prefix(p.as_str())?.to_string(),
                None => rel,
            };
            (!rel.is_empty()).then_some((rel, e))
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Plano de atualização
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    /// nada a fazer
    None,
    /// download completo do .zip
    Full,
    /// só os arquivos que mudaram entre as versões
    Delta,
    /// mesma versão, restaurando arquivos apagados/corrompidos
    Repair,
}

pub struct Plan {
    pub mode: Mode,
    pub summary: Summary,
    total: u64,
    remote: Vec<(String, Entry)>,
    fetch: Vec<(String, Entry)>,
    remove: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub mode: Mode,
    pub from: Option<String>,
    pub to: String,
    pub download_bytes: u64,
    pub added: usize,
    pub changed: usize,
    pub removed: usize,
    pub repaired: usize,
}

fn full_plan(pack: &PackInfo, from: Option<String>) -> Plan {
    Plan {
        mode: Mode::Full,
        summary: Summary { mode: Mode::Full, from, to: pack.tag.clone(), download_bytes: pack.size.unwrap_or(0), added: 0, changed: 0, removed: 0, repaired: 0 },
        total: 0,
        remote: Vec::new(),
        fetch: Vec::new(),
        remove: Vec::new(),
    }
}

/// Arquivos do pack que sumiram ou mudaram de tamanho no disco (sem rede).
/// Configs só contam se sumiram (o jogador pode tê-las editado). Com `deep`,
/// confere também o CRC-32 dos arquivos que não são config.
pub fn damaged(instance: &Path, state: &InstalledPack, deep: bool) -> Vec<String> {
    state
        .entries
        .iter()
        .filter(|r| !is_keep(&r.path))
        .filter(|r| {
            let target = instance.join(&r.path);
            let Ok(meta) = std::fs::metadata(&target) else { return true };
            if is_config(&r.path) {
                return false;
            }
            if meta.len() != r.size {
                return true;
            }
            deep && zipremote::crc32_file(&target).map(|c| c != r.crc).unwrap_or(true)
        })
        .map(|r| r.path.clone())
        .collect()
}

/// Decide como chegar à versão `pack` (sem baixar nada além do índice do .zip).
pub async fn plan(net: &Net, instance: &Path, pack: &PackInfo, deep: bool) -> Result<Plan> {
    recover(instance);
    let state = installed(instance);
    let from = state.as_ref().map(|s| s.tag.clone());
    let same = from.as_deref() == Some(pack.tag.as_str());
    let Some(state) = state.filter(|s| !s.entries.is_empty()) else {
        return Ok(full_plan(pack, from));
    };
    let broken: HashSet<String> = damaged(instance, &state, deep).into_iter().collect();
    if same && broken.is_empty() {
        return Ok(Plan {
            mode: Mode::None,
            summary: Summary { mode: Mode::None, from, to: pack.tag.clone(), download_bytes: 0, added: 0, changed: 0, removed: 0, repaired: 0 },
            total: 0,
            remote: Vec::new(),
            fetch: Vec::new(),
            remove: Vec::new(),
        });
    }

    let index = match zipremote::read_index(net, &pack.url).await {
        Ok(i) => i,
        Err(e) if super::net::is_cancelled(&e) => return Err(e),
        // servidor sem Range ou .zip estranho: download completo resolve tudo
        Err(e) if e.is::<RangeUnsupported>() || !same => return Ok(full_plan(pack, from)),
        Err(e) => return Err(e.context("lendo o índice do modpack para reparar arquivos")),
    };
    let remote = map_entries(index.entries);
    let old: HashMap<&str, &FileRec> = state.entries.iter().map(|r| (r.path.as_str(), r)).collect();
    let mut fetch = Vec::new();
    let (mut added, mut changed, mut repaired) = (0, 0, 0);
    for (rel, e) in &remote {
        let exists = instance.join(rel).exists();
        if is_keep(rel) && exists {
            continue;
        }
        match old.get(rel.as_str()) {
            Some(r) if r.crc == e.crc32 && r.size == e.size => {
                if !exists || broken.contains(rel) {
                    repaired += 1;
                    fetch.push((rel.clone(), e.clone()));
                }
            }
            Some(_) => {
                changed += 1;
                fetch.push((rel.clone(), e.clone()));
            }
            None => {
                added += 1;
                fetch.push((rel.clone(), e.clone()));
            }
        }
    }
    let remote_set: HashSet<&str> = remote.iter().map(|(r, _)| r.as_str()).collect();
    let remove: Vec<String> = state.paths().into_iter().filter(|p| !remote_set.contains(p.as_str()) && !is_keep(p)).collect();
    let refs: Vec<&Entry> = fetch.iter().map(|(_, e)| e).collect();
    let download_bytes = zipremote::transfer_size(&refs);

    // se for baixar quase tudo, um download único e contínuo é mais rápido
    if !same && download_bytes as f64 > index.total as f64 * 0.7 {
        return Ok(full_plan(pack, from));
    }
    let mode = if same { Mode::Repair } else { Mode::Delta };
    Ok(Plan {
        mode,
        summary: Summary { mode, from, to: pack.tag.clone(), download_bytes, added, changed, removed: remove.len(), repaired },
        total: index.total,
        remote,
        fetch,
        remove,
    })
}

// ---------------------------------------------------------------------------
// Aplicar
// ---------------------------------------------------------------------------

/// Executa o plano. Retorna o resumo do que foi feito.
pub async fn apply(net: &Net, prog: &Arc<Progress>, instance: &Path, cache: &Path, pack: &PackInfo, plan: Plan) -> Result<Summary> {
    match plan.mode {
        Mode::None => Ok(plan.summary),
        Mode::Full => {
            install_full(net, prog, instance, cache, pack).await?;
            Ok(plan.summary)
        }
        Mode::Delta | Mode::Repair => {
            let summary = plan.summary.clone();
            apply_incremental(net, prog, instance, pack, plan).await?;
            Ok(summary)
        }
    }
}

#[derive(Serialize, Deserialize)]
struct Journal {
    tag: String,
    /// arquivos novos/alterados (o anterior, se havia, está em backup/)
    placed: Vec<String>,
    removed: Vec<String>,
}

fn journal_file(instance: &Path) -> PathBuf {
    meta_dir(instance).join("update.json")
}

/// Desfaz uma troca interrompida (PC desligou, erro no meio) e limpa as sobras.
pub fn recover(instance: &Path) {
    let meta = meta_dir(instance);
    if let Ok(raw) = std::fs::read(journal_file(instance)) {
        if let Ok(j) = serde_json::from_slice::<Journal>(&raw) {
            rollback(instance, &j);
        }
        let _ = std::fs::remove_file(journal_file(instance));
    }
    let _ = std::fs::remove_dir_all(meta.join("staging"));
    let _ = std::fs::remove_dir_all(meta.join("backup"));
}

fn rollback(instance: &Path, j: &Journal) {
    let backup = meta_dir(instance).join("backup");
    for rel in j.placed.iter().chain(j.removed.iter()) {
        let target = instance.join(rel);
        let saved = backup.join(rel);
        if saved.exists() {
            if let Some(d) = target.parent() {
                let _ = std::fs::create_dir_all(d);
            }
            let _ = std::fs::rename(&saved, &target);
        } else if j.placed.contains(rel) {
            // arquivo que não existia antes da atualização
            let _ = std::fs::remove_file(&target);
        }
    }
}

fn move_into(from: &Path, to: &Path) -> Result<()> {
    if let Some(d) = to.parent() {
        std::fs::create_dir_all(d)?;
    }
    std::fs::rename(from, to).with_context(|| format!("movendo {}", from.display()))
}

async fn apply_incremental(net: &Net, prog: &Arc<Progress>, instance: &Path, pack: &PackInfo, plan: Plan) -> Result<()> {
    let meta = meta_dir(instance);
    let staging = meta.join("staging");
    let _ = std::fs::remove_dir_all(&staging);
    std::fs::create_dir_all(&staging)?;

    // 1) baixa só o que mudou, já conferindo o CRC-32 de cada arquivo
    let label = match plan.mode {
        Mode::Repair => format!("Restaurando {} arquivo(s)", plan.fetch.len()),
        _ => format!("Atualizando para {} · só o que mudou", pack.tag),
    };
    prog.stage("downloading", &label);
    prog.set_totals(plan.fetch.len() as u64, plan.summary.download_bytes);
    let by_name: HashMap<String, String> = plan.fetch.iter().map(|(rel, e)| (e.name.clone(), rel.clone())).collect();
    let entries: Vec<Entry> = plan.fetch.iter().map(|(_, e)| e.clone()).collect();
    zipremote::fetch_entries(net, &pack.url, plan.total, entries, prog, |e, data| {
        let rel = by_name.get(&e.name).context("entrada inesperada")?;
        let path = staging.join(rel);
        if let Some(d) = path.parent() {
            std::fs::create_dir_all(d)?;
        }
        std::fs::write(&path, data)?;
        Ok(())
    })
    .await?;
    net.check()?;

    // 2) troca registrada em diário: tudo ou nada
    prog.stage("downloading", "Aplicando a atualização");
    let journal = Journal { tag: pack.tag.clone(), placed: plan.fetch.iter().map(|(r, _)| r.clone()).collect(), removed: plan.remove.clone() };
    std::fs::write(journal_file(instance), serde_json::to_vec(&journal)?)?;
    let backup = meta.join("backup");
    let result = (|| -> Result<()> {
        for rel in &journal.removed {
            let target = instance.join(rel);
            if target.exists() {
                move_into(&target, &backup.join(rel))?;
            }
        }
        for rel in &journal.placed {
            let target = instance.join(rel);
            if target.exists() {
                move_into(&target, &backup.join(rel))?;
            }
            move_into(&staging.join(rel), &target)?;
        }
        let entries = plan.remote.iter().map(|(rel, e)| FileRec { path: rel.clone(), crc: e.crc32, size: e.size }).collect();
        write_state(instance, &InstalledPack { tag: pack.tag.clone(), entries, files: Vec::new() })
    })();
    if let Err(e) = result {
        rollback(instance, &journal);
        let _ = std::fs::remove_file(journal_file(instance));
        let _ = std::fs::remove_dir_all(&staging);
        let _ = std::fs::remove_dir_all(&backup);
        return Err(e.context("a atualização foi desfeita; a versão anterior continua instalada"));
    }
    let _ = std::fs::remove_file(journal_file(instance));
    let _ = std::fs::remove_dir_all(&staging);
    let _ = std::fs::remove_dir_all(&backup);
    Ok(())
}

async fn install_full(net: &Net, prog: &Arc<Progress>, instance: &Path, cache: &Path, pack: &PackInfo) -> Result<()> {
    let zip_path = cache.join(format!("{}.zip", pack.tag));
    prog.set_current(format!("{}.zip", pack.tag));
    net.fetch_resumable(&pack.url, &zip_path, pack.size, pack.sha256.as_deref(), prog)
        .await
        .with_context(|| format!("baixando o modpack {}", pack.tag))?;
    net.check()?;

    prog.stage("downloading", &format!("Instalando {}", pack.tag));
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

    // remove o que a versão anterior instalou e saiu do pack (ex.: mods antigos);
    // sem estado durante a extração: se for interrompida, a próxima vez reinstala
    std::fs::create_dir_all(instance)?;
    if let Some(old) = installed(instance) {
        for f in old.paths().iter().filter(|f| !new_files.contains(*f) && !is_keep(f)) {
            if let Some(rel) = safe_rel(f) {
                let _ = std::fs::remove_file(instance.join(rel));
            }
        }
    }
    let _ = std::fs::remove_file(state_file(instance));

    prog.set_totals(new_files.len() as u64, 0);
    let mut records = Vec::with_capacity(new_files.len());
    let mut buf = vec![0u8; 256 * 1024];
    for i in 0..zip.len() {
        net.check()?;
        let mut entry = zip.by_index(i)?;
        if !entry.is_file() {
            continue;
        }
        let Some(rel) = safe_rel(entry.name()).and_then(|n| strip(&n)) else { continue };
        records.push(FileRec { path: rel.clone(), crc: entry.crc32(), size: entry.size() });
        let target = instance.join(&rel);
        if is_keep(&rel) && target.exists() {
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
    write_state(instance, &InstalledPack { tag: tag.to_string(), entries: records, files: Vec::new() })
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
    fn arquivos_do_jogador_e_configs() {
        assert!(is_keep("options.txt"));
        assert!(is_keep("saves/Mundo/level.dat"));
        assert!(is_keep("journeymap/data/sp/Mundo/waypoints/a.json"));
        assert!(!is_keep("mods/a.jar"));
        assert!(is_config("config/forge.cfg"));
        assert!(!is_config("mods/a.jar"));
    }

    #[test]
    fn diario_desfaz_troca_interrompida() {
        let dir = std::env::temp_dir().join(format!("forbidden-test-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let backup = meta_dir(&dir).join("backup");
        std::fs::create_dir_all(dir.join("mods")).unwrap();
        std::fs::create_dir_all(backup.join("mods")).unwrap();
        // estado no meio da troca: a.jar novo no lugar (antigo no backup), b.jar novo (não existia),
        // c.jar removido (está no backup)
        std::fs::write(dir.join("mods/a.jar"), b"novo").unwrap();
        std::fs::write(backup.join("mods/a.jar"), b"antigo").unwrap();
        std::fs::write(dir.join("mods/b.jar"), b"novo").unwrap();
        std::fs::write(backup.join("mods/c.jar"), b"removido").unwrap();
        let j = Journal { tag: "TEOF-9.9".into(), placed: vec!["mods/a.jar".into(), "mods/b.jar".into()], removed: vec!["mods/c.jar".into()] };
        std::fs::write(journal_file(&dir), serde_json::to_vec(&j).unwrap()).unwrap();
        recover(&dir);
        assert_eq!(std::fs::read(dir.join("mods/a.jar")).unwrap(), b"antigo");
        assert!(!dir.join("mods/b.jar").exists());
        assert_eq!(std::fs::read(dir.join("mods/c.jar")).unwrap(), b"removido");
        assert!(!journal_file(&dir).exists());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn pasta_raiz_unica_e_removida() {
        let n = |v: &[&str]| v.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(common_prefix(&n(&["TEOF-5.3/mods/a.jar", "TEOF-5.3/bin/modpack.jar"])).as_deref(), Some("TEOF-5.3/"));
        assert_eq!(common_prefix(&n(&["mods/a.jar", "bin/modpack.jar"])), None);
        assert_eq!(common_prefix(&n(&["a/x", "b/y"])), None);
    }
}

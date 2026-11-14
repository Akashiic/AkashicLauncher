//! Minecraft 1.7.10 "vanilla": JSON da versão (fixado por SHA-1), client.jar,
//! bibliotecas, nativos (LWJGL 2.9.1), índice de assets, assets e a configuração
//! de log da Mojang que corrige o Log4Shell.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::Deserialize;

use super::net::{Job, Net};
use super::progress::Progress;

pub const VERSION: &str = "1.7.10";
const VERSION_URL: &str = "https://piston-meta.mojang.com/v1/packages/ed5d8789ed29872ea2ef1c348302b0c55e3f3468/1.7.10.json";
const VERSION_SHA1: &str = "ed5d8789ed29872ea2ef1c348302b0c55e3f3468";
const RESOURCES: &str = "https://resources.download.minecraft.net/";

#[derive(Deserialize)]
struct VersionJson {
    #[serde(rename = "assetIndex")]
    asset_index: AssetIndexRef,
    downloads: Downloads,
    libraries: Vec<Library>,
    logging: Option<Logging>,
}

#[derive(Deserialize)]
struct AssetIndexRef {
    id: String,
    sha1: String,
    size: u64,
    url: String,
}

#[derive(Deserialize)]
struct Downloads {
    client: Artifact,
}

#[derive(Deserialize, Clone)]
struct Artifact {
    path: Option<String>,
    sha1: String,
    size: u64,
    url: String,
}

#[derive(Deserialize)]
struct Library {
    name: String,
    downloads: Option<LibDownloads>,
    natives: Option<HashMap<String, String>>,
    extract: Option<Extract>,
    rules: Option<Vec<Rule>>,
}

#[derive(Deserialize)]
struct LibDownloads {
    artifact: Option<Artifact>,
    classifiers: Option<HashMap<String, Artifact>>,
}

#[derive(Deserialize)]
struct Extract {
    #[serde(default)]
    exclude: Vec<String>,
}

#[derive(Deserialize)]
pub struct Rule {
    action: String,
    os: Option<OsRule>,
}

#[derive(Deserialize)]
pub struct OsRule {
    name: Option<String>,
    arch: Option<String>,
    version: Option<String>,
}

#[derive(Deserialize)]
struct Logging {
    client: Option<LoggingClient>,
}

#[derive(Deserialize)]
struct LoggingClient {
    argument: String,
    file: LoggingFile,
}

#[derive(Deserialize)]
struct LoggingFile {
    id: String,
    sha1: String,
    size: u64,
    url: String,
}

#[derive(Deserialize)]
struct AssetIndex {
    objects: HashMap<String, AssetObject>,
}

#[derive(Deserialize)]
struct AssetObject {
    hash: String,
    size: u64,
}

/// Nome do sistema no formato dos JSONs da Mojang.
pub fn os_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "windows"
    } else if cfg!(target_os = "macos") {
        "osx"
    } else {
        "linux"
    }
}

fn os_matches(os: &Option<OsRule>) -> bool {
    let Some(o) = os else { return true };
    if let Some(name) = &o.name {
        if name != os_name() {
            return false;
        }
    }
    // regras por arquitetura x86 e por versões antigas do sistema não se aplicam aqui
    o.arch.as_deref() != Some("x86") && o.version.is_none()
}

pub fn rules_allow(rules: &Option<Vec<Rule>>) -> bool {
    let Some(rules) = rules else { return true };
    let mut allowed = false;
    for r in rules {
        if os_matches(&r.os) {
            allowed = r.action == "allow";
        }
    }
    allowed
}

/// "grupo:artefato:versão[:classificador]" → caminho Maven.
pub fn maven_path(name: &str) -> Option<String> {
    let mut parts = name.split(':');
    let (group, artifact, version) = (parts.next()?, parts.next()?, parts.next()?);
    let classifier = parts.next().map(|c| format!("-{c}")).unwrap_or_default();
    Some(format!("{}/{artifact}/{version}/{artifact}-{version}{classifier}.jar", group.replace('.', "/")))
}

/// Chave para remover duplicadas no classpath (grupo:artefato).
pub fn lib_key(name: &str) -> String {
    name.split(':').take(2).collect::<Vec<_>>().join(":")
}

pub struct Vanilla {
    pub jar: PathBuf,
    /// (grupo:artefato, caminho)
    pub classpath: Vec<(String, PathBuf)>,
    /// (jar de nativos, prefixos a não extrair)
    pub natives: Vec<(PathBuf, Vec<String>)>,
    pub asset_index: String,
    /// argumento da JVM já com o caminho do XML de log
    pub logging_arg: Option<String>,
    pub jobs: Vec<Job>,
}

async fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T> {
    let bytes = tokio::fs::read(path).await?;
    Ok(serde_json::from_slice(&bytes)?)
}

/// Monta a lista de arquivos do 1.7.10. Baixa na hora só os dois JSONs pequenos
/// que dizem o que mais é preciso (versão e índice de assets).
pub async fn plan(net: &Net, prog: &Progress, root: &Path) -> Result<Vanilla> {
    let vdir = root.join("versions").join(VERSION);
    let vjson = Job {
        urls: vec![VERSION_URL.into()],
        path: vdir.join(format!("{VERSION}.json")),
        sha1: vec![VERSION_SHA1.into()],
        size: None,
    };
    if !Net::is_ok(&vjson, true).await {
        net.fetch(&vjson, prog).await?;
    }
    let v: VersionJson = read_json(&vjson.path).await.context("lendo o JSON do Minecraft 1.7.10")?;

    let mut jobs = Vec::new();
    let jar = vdir.join(format!("{VERSION}.jar"));
    jobs.push(Job { urls: vec![v.downloads.client.url.clone()], path: jar.clone(), sha1: vec![v.downloads.client.sha1.clone()], size: Some(v.downloads.client.size) });

    let libdir = root.join("libraries");
    let mut classpath = Vec::new();
    let mut natives = Vec::new();
    for lib in &v.libraries {
        if !rules_allow(&lib.rules) {
            continue;
        }
        let Some(dl) = &lib.downloads else { continue };
        if let Some(map) = &lib.natives {
            let Some(classifier) = map.get(os_name()) else { continue };
            let classifier = classifier.replace("${arch}", "64");
            let Some(a) = dl.classifiers.as_ref().and_then(|c| c.get(&classifier)) else { continue };
            let path = libdir.join(a.path.clone().unwrap_or_else(|| maven_path(&format!("{}:{classifier}", lib.name)).unwrap_or_default()));
            jobs.push(Job { urls: vec![a.url.clone()], path: path.clone(), sha1: vec![a.sha1.clone()], size: Some(a.size) });
            natives.push((path, lib.extract.as_ref().map(|e| e.exclude.clone()).unwrap_or_default()));
        } else if let Some(a) = &dl.artifact {
            let path = libdir.join(a.path.clone().unwrap_or_else(|| maven_path(&lib.name).unwrap_or_default()));
            jobs.push(Job { urls: vec![a.url.clone()], path: path.clone(), sha1: vec![a.sha1.clone()], size: Some(a.size) });
            classpath.push((lib_key(&lib.name), path));
        }
    }

    // índice de assets (pequeno): baixa agora para saber quais assets faltam
    let assets = root.join("assets");
    let index = Job {
        urls: vec![v.asset_index.url.clone()],
        path: assets.join("indexes").join(format!("{}.json", v.asset_index.id)),
        sha1: vec![v.asset_index.sha1.clone()],
        size: Some(v.asset_index.size),
    };
    if !Net::is_ok(&index, true).await {
        net.fetch(&index, prog).await?;
    }
    let idx: AssetIndex = read_json(&index.path).await.context("lendo o índice de assets")?;
    let mut seen = std::collections::HashSet::new();
    for obj in idx.objects.values() {
        if !seen.insert(obj.hash.clone()) {
            continue;
        }
        let sub = &obj.hash[..2];
        jobs.push(Job {
            urls: vec![format!("{RESOURCES}{sub}/{}", obj.hash)],
            path: assets.join("objects").join(sub).join(&obj.hash),
            sha1: vec![obj.hash.clone()],
            size: Some(obj.size),
        });
    }

    let mut logging_arg = None;
    if let Some(lc) = v.logging.and_then(|l| l.client) {
        let path = assets.join("log_configs").join(&lc.file.id);
        jobs.push(Job { urls: vec![lc.file.url.clone()], path: path.clone(), sha1: vec![lc.file.sha1.clone()], size: Some(lc.file.size) });
        logging_arg = Some(lc.argument.replace("${path}", &path.to_string_lossy()));
    }

    Ok(Vanilla { jar, classpath, natives, asset_index: v.asset_index.id, logging_arg, jobs })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn caminho_maven() {
        assert_eq!(maven_path("net.minecraft:launchwrapper:1.12").unwrap(), "net/minecraft/launchwrapper/1.12/launchwrapper-1.12.jar");
        assert_eq!(maven_path("org.lwjgl.lwjgl:lwjgl-platform:2.9.1:natives-windows").unwrap(), "org/lwjgl/lwjgl/lwjgl-platform/2.9.1/lwjgl-platform-2.9.1-natives-windows.jar");
        assert_eq!(lib_key("com.google.guava:guava:17.0"), "com.google.guava:guava");
    }

    #[test]
    fn regras_de_sistema() {
        let r: Option<Vec<Rule>> = serde_json::from_str(r#"[{"action":"allow"},{"action":"disallow","os":{"name":"linux"}}]"#).unwrap();
        assert_eq!(rules_allow(&r), os_name() != "linux");
        let only_win: Option<Vec<Rule>> = serde_json::from_str(r#"[{"action":"allow","os":{"name":"windows"}}]"#).unwrap();
        assert_eq!(rules_allow(&only_win), os_name() == "windows");
        assert!(rules_allow(&None));
    }
}

//! Forge 1.7.10. Num pack no formato Technic o Forge vem dentro do próprio modpack
//! (`bin/modpack.jar`, que traz um `version.json`); sem ele, usamos o Forge
//! 10.13.4.1614 oficial. As bibliotecas do Forge (Scala, LaunchWrapper...) vêm
//! dos repositórios do Forge/Mojang, com o Maven Central como reserva.

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::Deserialize;

use super::minecraft::{lib_key, maven_path};
use super::net::{Job, Net};
use super::progress::Progress;

const FORGE_NAME: &str = "net.minecraftforge:forge:1.7.10-10.13.4.1614-1.7.10";
const FORGE_UNIVERSAL_URL: &str =
    "https://maven.minecraftforge.net/net/minecraftforge/forge/1.7.10-10.13.4.1614-1.7.10/forge-1.7.10-10.13.4.1614-1.7.10-universal.jar";
const FORGE_UNIVERSAL_SHA1: &str = "25fd97f72beca728112256938e03e8105b1b78cc";

const FORGE_MAVEN: &str = "https://maven.minecraftforge.net/";
const MOJANG_LIBS: &str = "https://libraries.minecraft.net/";
const MAVEN_CENTRAL: &str = "https://repo1.maven.org/maven2/";

/// Checksums antigos do Forge que não batem com nenhum repositório atual;
/// aceitamos o SHA-1 oficial publicado no Maven Central para estes arquivos.
const EXTRA_SHA1: &[(&str, &str)] = &[
    ("org.scala-lang.plugins:scala-continuations-library_2.11", "0e517c53a7e9acd6b1668c5a35eccbaa3bab9aac"),
    ("org.scala-lang.plugins:scala-continuations-plugin_2.11.1", "f361a3283452c57fa30c1ee69448995de23c60f7"),
];

#[derive(Deserialize)]
struct ForgeJson {
    id: String,
    #[serde(rename = "mainClass")]
    main_class: String,
    #[serde(rename = "minecraftArguments")]
    minecraft_arguments: String,
    libraries: Vec<ForgeLib>,
}

#[derive(Deserialize)]
struct ForgeLib {
    name: String,
    url: Option<String>,
    checksums: Option<Vec<String>>,
}

pub struct Forge {
    pub id: String,
    pub main_class: String,
    pub minecraft_arguments: String,
    pub jar: PathBuf,
    pub classpath: Vec<(String, PathBuf)>,
    pub jobs: Vec<Job>,
    pub from_pack: bool,
}

fn normalize_repo(url: &str) -> String {
    let mut u = url.trim().replace("http://", "https://");
    u = u.replace("files.minecraftforge.net/maven", "maven.minecraftforge.net");
    if !u.ends_with('/') {
        u.push('/');
    }
    u
}

fn read_version_json_from_jar(jar: &Path) -> Result<Vec<u8>> {
    use std::io::Read;
    let mut zip = zip::ZipArchive::new(std::fs::File::open(jar)?)?;
    let mut entry = zip.by_name("version.json").context("o Forge não tem version.json")?;
    let mut buf = Vec::new();
    entry.read_to_end(&mut buf)?;
    Ok(buf)
}

pub async fn plan(net: &Net, prog: &Progress, mc_root: &Path, instance: &Path) -> Result<Forge> {
    let libdir = mc_root.join("libraries");
    let pack_jar = instance.join("bin").join("modpack.jar");
    let from_pack = tokio::fs::metadata(&pack_jar).await.is_ok_and(|m| m.is_file());
    let jar = if from_pack {
        pack_jar
    } else {
        let job = Job {
            urls: vec![FORGE_UNIVERSAL_URL.into()],
            path: libdir.join(maven_path(FORGE_NAME).unwrap_or_default()),
            sha1: vec![FORGE_UNIVERSAL_SHA1.into()],
            size: None,
        };
        if !Net::is_ok(&job, false).await {
            prog.set_current("Forge 10.13.4.1614");
            net.fetch(&job, prog).await?;
        }
        job.path
    };

    // version.json: o do pack (bin/version.json) tem prioridade sobre o de dentro do jar
    let override_json = instance.join("bin").join("version.json");
    let raw = match tokio::fs::read(&override_json).await {
        Ok(b) if from_pack => b,
        _ => {
            let j = jar.clone();
            tokio::task::spawn_blocking(move || read_version_json_from_jar(&j)).await??
        }
    };
    let fj: ForgeJson = serde_json::from_slice(&raw).context("lendo o version.json do Forge")?;

    let mut classpath = Vec::new();
    let mut jobs = Vec::new();
    for lib in &fj.libraries {
        let key = lib_key(&lib.name);
        // o próprio Forge já é o `jar` acima
        if key == "net.minecraftforge:forge" || key == "net.minecraftforge:minecraftforge" {
            continue;
        }
        let Some(rel) = maven_path(&lib.name) else { continue };
        let path = libdir.join(&rel);
        let mut repos = Vec::new();
        if let Some(u) = &lib.url {
            repos.push(normalize_repo(u));
        }
        for r in [MOJANG_LIBS, FORGE_MAVEN, MAVEN_CENTRAL] {
            if !repos.iter().any(|x| x == r) {
                repos.push(r.to_string());
            }
        }
        let mut sha1 = lib.checksums.clone().unwrap_or_default();
        if !sha1.is_empty() {
            if let Some((_, extra)) = EXTRA_SHA1.iter().find(|(k, _)| *k == key) {
                sha1.push((*extra).to_string());
            }
        }
        jobs.push(Job { urls: repos.into_iter().map(|r| format!("{r}{rel}")).collect(), path: path.clone(), sha1, size: None });
        classpath.push((key, path));
    }

    Ok(Forge { id: fj.id, main_class: fj.main_class, minecraft_arguments: fj.minecraft_arguments, jar, classpath, jobs, from_pack })
}

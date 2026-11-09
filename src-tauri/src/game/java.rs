//! Java 8 (Azul Zulu 8u512): usa o runtime empacotado com o launcher, se houver;
//! senão baixa da Azul no primeiro uso, confere o SHA-256 fixado aqui e extrai.

use std::path::{Path, PathBuf};

use anyhow::{bail, Context, Result};
use tokio::fs;

use super::net::Net;
use super::progress::Progress;

pub const RUNTIME_DIR: &str = "zulu-8u512";

struct Package {
    url: &'static str,
    sha256: &'static str,
    zip: bool,
}

/// Pacotes JRE oficiais (metadados da Azul, hashes fixados).
/// LWJGL 2.9.1 (Minecraft 1.7.10) só tem nativos x86/x64: no Mac com Apple
/// Silicon usamos o Java x64 via Rosetta, como o launcher oficial fazia.
fn package() -> Option<Package> {
    if cfg!(target_os = "windows") {
        Some(Package {
            url: "https://cdn.azul.com/zulu/bin/zulu8.98.0.111-ca-jre8.0.512-win_x64.zip",
            sha256: "a07b4d154aebe5ea610fa6caa5bcaa2a858b3ae5c5b13d9162aa0f98675b26b1",
            zip: true,
        })
    } else if cfg!(target_os = "macos") {
        Some(Package {
            url: "https://cdn.azul.com/zulu/bin/zulu8.98.0.111-ca-jre8.0.512-macosx_x64.tar.gz",
            sha256: "a420fa51f4a1ba464369c8e5e7e44576a7e5f91887b725649d5bf1b99a566567",
            zip: false,
        })
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        Some(Package {
            url: "https://cdn.azul.com/zulu/bin/zulu8.98.0.111-ca-jre8.0.512-linux_x64.tar.gz",
            sha256: "3844c96fd5305b96d0866551997d9a1b9cdabb8750a8c1ae844318caa36f5156",
            zip: false,
        })
    } else {
        None
    }
}

fn exe_name() -> &'static str {
    if cfg!(windows) {
        "javaw.exe"
    } else {
        "java"
    }
}

/// Procura `bin/java(w.exe)` dentro de um runtime extraído (o layout muda por sistema).
pub fn find_java(root: &Path) -> Option<PathBuf> {
    fn walk(dir: &Path, depth: usize, out: &mut Vec<PathBuf>) {
        if depth > 5 {
            return;
        }
        let Ok(rd) = std::fs::read_dir(dir) else { return };
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                if p.file_name().is_some_and(|n| n == "bin") {
                    let exe = p.join(exe_name());
                    if exe.is_file() {
                        out.push(exe);
                    }
                }
                walk(&p, depth + 1, out);
            }
        }
    }
    let mut found = Vec::new();
    walk(root, 0, &mut found);
    // no macOS prefere o binário dentro de Contents/Home
    found.sort_by_key(|p| (!p.to_string_lossy().contains("Contents/Home"), p.components().count()));
    found.into_iter().next()
}

/// Garante o Java e devolve o caminho do executável.
pub async fn ensure(net: &Net, prog: &Progress, runtime_root: &Path, cache: &Path, bundled: Option<&Path>) -> Result<PathBuf> {
    // 1) runtime que veio no instalador
    if let Some(b) = bundled {
        if let Some(exe) = find_java(&b.join(RUNTIME_DIR)) {
            return Ok(exe);
        }
    }
    let Some(pkg) = package() else {
        bail!("este sistema não tem um Java 8 compatível com o Minecraft 1.7.10; escolha um Java nas configurações");
    };
    let dest = runtime_root.join(RUNTIME_DIR);
    let marker = dest.join(".forbidden-ok");
    // 2) já baixado antes
    if fs::read_to_string(&marker).await.is_ok_and(|s| s.trim() == pkg.url) {
        if let Some(exe) = find_java(&dest) {
            return Ok(exe);
        }
    }
    // 3) baixa, confere e extrai
    let name = pkg.url.rsplit('/').next().unwrap_or("jre");
    let archive = cache.join(name);
    prog.set_current(name);
    // o tamanho da Azul é aproximado: a garantia é o SHA-256
    net.fetch_resumable(pkg.url, &archive, None, Some(pkg.sha256), prog)
        .await
        .context("baixando o Java (Azul Zulu 8u512)")?;
    prog.set_current("Extraindo o Java");
    let tmp = runtime_root.join(".extract-java");
    let _ = fs::remove_dir_all(&tmp).await;
    fs::create_dir_all(&tmp).await?;
    let (a, t, zip) = (archive.clone(), tmp.clone(), pkg.zip);
    tokio::task::spawn_blocking(move || -> Result<()> {
        let f = std::fs::File::open(&a)?;
        if zip {
            zip::ZipArchive::new(f)?.extract(&t)?;
        } else {
            tar::Archive::new(flate2::read::GzDecoder::new(f)).unpack(&t)?;
        }
        Ok(())
    })
    .await?
    .context("extraindo o Java")?;
    // o pacote vem com uma pasta raiz (zulu8...-win_x64): ela vira runtime/zulu-8u512
    let mut entries = std::fs::read_dir(&tmp)?.flatten().map(|e| e.path()).collect::<Vec<_>>();
    let inner = if entries.len() == 1 && entries[0].is_dir() { entries.remove(0) } else { tmp.clone() };
    let _ = fs::remove_dir_all(&dest).await;
    fs::rename(&inner, &dest).await.context("instalando o Java")?;
    let _ = fs::remove_dir_all(&tmp).await;
    let _ = fs::remove_file(&archive).await;
    let exe = find_java(&dest).context("executável do Java não encontrado no pacote")?;
    fs::write(&marker, pkg.url).await?;
    Ok(exe)
}

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

// ---- Intel HD 2000/3000 (driver de 2011-2016) no Windows 10 ----
//
// O driver antigo da Intel não entrega OpenGL acelerado a programas que se
// declaram compatíveis com o Windows 10 (ou 8.1) no manifesto do .exe: o
// Minecraft quebra com "Pixel format not accelerated" já no Display.create
// vanilla. O Java passou a declarar isso no 8u60 (por isso essas placas só
// rodavam com Java 8u51). Aqui fazemos uma cópia do javaw.exe com essas duas
// linhas do manifesto viradas comentário XML do MESMO tamanho: nada muda na
// estrutura do .exe, só o que o Windows (e o driver) enxergam.

const WIN81: &str = "<supportedOS Id=\"{1f676c76-80e1-4239-95bb-83d0f6d0da78}\"></supportedOS>";
const WIN10: &str = "<supportedOS Id=\"{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}\"></supportedOS>";

/// A mesma linha virada comentário XML, com o mesmo número de bytes.
fn commented(line: &str) -> Vec<u8> {
    let mut out = b"<!--".to_vec();
    out.extend(std::iter::repeat_n(b' ', line.len() - 7));
    out.extend_from_slice(b"-->");
    out
}

fn find_all(hay: &[u8], needle: &[u8]) -> Vec<usize> {
    hay.windows(needle.len()).enumerate().filter(|(_, w)| *w == needle).map(|(i, _)| i).collect()
}

/// Bytes do .exe sem as declarações de Windows 8.1/10 (None se não havia a do Windows 10).
pub fn without_win10_manifest(exe: &[u8]) -> Option<Vec<u8>> {
    let mut out = exe.to_vec();
    let w10 = find_all(&out, WIN10.as_bytes());
    if w10.len() != 1 {
        return None;
    }
    for line in [WIN10, WIN81] {
        let at = find_all(&out, line.as_bytes());
        if at.len() > 1 {
            return None;
        }
        if let Some(&i) = at.first() {
            out[i..i + line.len()].copy_from_slice(&commented(line));
        }
    }
    Some(out)
}

/// Cópia do java(w).exe para placas Intel antigas, ao lado do original (o Java acha
/// as próprias bibliotecas pela pasta). Devolve o original se não há o que mudar.
pub fn legacy_gl_java(java: &Path) -> Result<PathBuf> {
    let bytes = std::fs::read(java).with_context(|| format!("lendo {}", java.display()))?;
    let Some(patched) = without_win10_manifest(&bytes) else { return Ok(java.to_path_buf()) };
    let stem = java.file_stem().and_then(|s| s.to_str()).unwrap_or("javaw");
    let ext = java.extension().and_then(|s| s.to_str()).map(|e| format!(".{e}")).unwrap_or_default();
    let target = java.with_file_name(format!("{stem}-intelhd{ext}"));
    if std::fs::read(&target).ok().as_deref() != Some(&patched[..]) {
        let tmp = target.with_extension("tmp");
        std::fs::write(&tmp, &patched)?;
        std::fs::rename(&tmp, &target)?;
    }
    Ok(target)
}

#[cfg(test)]
mod intelhd_tests {
    use super::*;

    fn exe(manifest_lines: &[&str]) -> Vec<u8> {
        let mut b = b"MZ\x90\x00 header ... <assembly><compatibility><application>".to_vec();
        for l in manifest_lines {
            b.extend_from_slice(l.as_bytes());
        }
        b.extend_from_slice(b"</application></compatibility></assembly> resto do PE");
        b
    }

    #[test]
    fn tira_windows_10_e_81_sem_mudar_o_tamanho() {
        let w7 = "<supportedOS Id=\"{35138b9a-5d96-4fbd-8e2d-a2440225f93a}\"></supportedOS>";
        let original = exe(&[w7, WIN81, WIN10]);
        let out = without_win10_manifest(&original).unwrap();
        assert_eq!(out.len(), original.len());
        let text = String::from_utf8_lossy(&out);
        assert!(text.contains(w7), "Windows 7 continua");
        assert!(!text.contains("8e0f7a12") && !text.contains("1f676c76"));
        assert_eq!(text.matches("<!--").count(), 2);
        assert!(text.contains("<!--") && text.contains("-->"));
        // sem a declaração do Windows 10: nada a fazer
        assert!(without_win10_manifest(&exe(&[w7])).is_none());
    }

    /// No Windows de verdade (job da CI): a cópia do java.exe do runner ainda roda.
    #[cfg(windows)]
    #[test]
    fn copia_roda_no_windows() {
        let Ok(home) = std::env::var("JAVA_HOME_8_X64") else { return };
        let java = std::path::Path::new(&home).join("bin").join("java.exe");
        let copy = legacy_gl_java(&java).unwrap();
        assert_ne!(copy, java, "o Java 8 do runner declara Windows 10: precisava de cópia");
        let out = std::process::Command::new(&copy).arg("-version").output().unwrap();
        assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
        println!("{} -version: {}", copy.display(), String::from_utf8_lossy(&out.stderr).lines().next().unwrap_or(""));
        let _ = std::fs::remove_file(copy);
    }

    /// Com o javaw.exe real (FORBIDDEN_TEST_JAVAW): só o manifesto muda.
    #[test]
    fn javaw_real() {
        let Ok(path) = std::env::var("FORBIDDEN_TEST_JAVAW") else { return };
        let original = std::fs::read(&path).unwrap();
        let out = without_win10_manifest(&original).expect("javaw.exe sem a declaração do Windows 10");
        let diff = original.iter().zip(&out).filter(|(a, b)| a != b).count();
        assert!(diff > 0 && diff <= WIN10.len() + WIN81.len(), "{diff} bytes diferentes");
        println!("javaw real: {diff} bytes do manifesto viraram comentário");
    }
}

// Identifica a build (commit) para aparecer no log: "Launcher v0.1.0 · build 0a8e022".
fn main() {
    let sha = std::process::Command::new("git")
        .args(["rev-parse", "--short=7", "HEAD"])
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .or_else(|| std::env::var("GITHUB_SHA").ok().map(|s| s.chars().take(7).collect()))
        .unwrap_or_else(|| "dev".into());
    println!("cargo:rustc-env=FORBIDDEN_BUILD={sha}");
    println!("cargo:rerun-if-changed=../.git/HEAD");
    println!("cargo:rerun-if-env-changed=GITHUB_SHA");
    // ID do app da Microsoft (login de contas originais), lido com option_env!
    println!("cargo:rerun-if-env-changed=FORBIDDEN_MS_CLIENT_ID");
    tauri_build::try_build(attributes()).expect("falha no tauri-build");
}

/// No Windows (MSVC) o manifesto do app (controles comuns v6) vai pelo linker
/// para TODOS os executáveis, inclusive os de teste. Pelo recurso padrão do
/// tauri-build só o app recebia, e os testes no Windows nem abriam
/// (STATUS_ENTRYPOINT_NOT_FOUND). É o mesmo jeito que o próprio Tauri usa nos
/// testes dele. O Release confere se o .exe final saiu com o manifesto.
fn attributes() -> tauri_build::Attributes {
    let attrs = tauri_build::Attributes::new();
    let target = |k: &str| std::env::var(k).unwrap_or_default();
    if target("CARGO_CFG_TARGET_OS") != "windows" || target("CARGO_CFG_TARGET_ENV") != "msvc" {
        return attrs;
    }
    let manifest = std::path::Path::new(&target("CARGO_MANIFEST_DIR")).join("windows-app-manifest.xml");
    println!("cargo:rerun-if-changed={}", manifest.display());
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    attrs.windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest())
}

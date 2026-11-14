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
    tauri_build::build()
}

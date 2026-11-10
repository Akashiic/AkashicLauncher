// Embute o instalador oficial (NSIS) do launcher dentro deste executável.
// No CI: FORBIDDEN_LAUNCHER_INSTALLER aponta para o "...-setup.exe" recém-gerado.
// Sem a variável (desenvolvimento), embute um arquivo vazio e o instalador simula.
use std::{env, fs, path::PathBuf};

fn main() {
    println!("cargo:rerun-if-env-changed=FORBIDDEN_LAUNCHER_INSTALLER");
    println!("cargo:rerun-if-env-changed=FORBIDDEN_LAUNCHER_VERSION");
    let out = PathBuf::from(env::var("OUT_DIR").unwrap()).join("payload.bin");
    match env::var("FORBIDDEN_LAUNCHER_INSTALLER") {
        Ok(src) if !src.is_empty() => {
            println!("cargo:rerun-if-changed={src}");
            fs::copy(&src, &out).unwrap_or_else(|e| panic!("não deu para ler {src}: {e}"));
        }
        _ => fs::write(&out, b"").unwrap(),
    }
    tauri_build::build()
}

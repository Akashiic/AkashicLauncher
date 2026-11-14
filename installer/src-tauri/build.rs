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
    // identidade da build pelo CONTEÚDO do launcher embutido (FNV-1a 64): duas builds
    // com o mesmo número de versão ainda são diferentes para o Setup
    let bytes = fs::read(&out).unwrap();
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in &bytes {
        h ^= u64::from(*b);
        h = h.wrapping_mul(0x0100_0000_01b3);
    }
    let id = if bytes.is_empty() { String::new() } else { format!("{h:016x}") };
    println!("cargo:rustc-env=FORBIDDEN_PAYLOAD_ID={id}");
    tauri_build::build()
}

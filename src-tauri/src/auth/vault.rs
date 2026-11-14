//! Cofre das sessões Microsoft: refresh token e token do Minecraft de cada conta.
//!
//! Fica em `.forbiddenseries/launcher/accounts.dat`, nunca no settings.json.
//! No Windows o conteúdo é cifrado com o DPAPI (CryptProtectData), preso à conta
//! do Windows de quem usa o PC: copiar o arquivo para outra máquina ou outro
//! usuário não revela nada. O Gerenciador de Credenciais não serve aqui porque
//! limita cada segredo a 2,5 KB e os tokens da Microsoft podem passar disso.
//! Fora do Windows (desenvolvimento e CI) o arquivo fica legível só pelo dono.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

/// Sessão de uma conta, indexada pelo UUID do Minecraft sem hífens.
#[derive(Serialize, Deserialize, Clone, PartialEq, Eq)]
pub struct Session {
    /// refresh token da Microsoft (a Microsoft troca a cada uso)
    pub refresh_token: String,
    /// token do Minecraft (vale ~24 h)
    pub mc_token: String,
    /// validade do token do Minecraft, em segundos Unix
    pub mc_expires_at: u64,
    pub username: String,
}

// nunca imprime tokens, nem por engano num log
impl std::fmt::Debug for Session {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Session").field("username", &self.username).field("mc_expires_at", &self.mc_expires_at).finish_non_exhaustive()
    }
}

#[derive(Serialize, Deserialize, Default)]
struct Data {
    version: u32,
    accounts: HashMap<String, Session>,
}

pub struct Vault {
    file: PathBuf,
}

/// Chave do cofre: UUID sem hífens e em minúsculas.
pub fn key(uuid: &str) -> String {
    uuid.replace('-', "").to_ascii_lowercase()
}

impl Vault {
    pub fn at(dir: &Path) -> Self {
        Self { file: dir.join("accounts.dat") }
    }

    fn load(&self) -> Data {
        let Ok(raw) = std::fs::read(&self.file) else { return Data::default() };
        match unprotect(&raw).and_then(|plain| Ok(serde_json::from_slice::<Data>(&plain)?)) {
            Ok(d) => d,
            Err(e) => {
                // arquivo de outro usuário do Windows ou corrompido: começa do zero (pede login de novo)
                eprintln!("[contas] cofre ilegível, ignorado: {e:#}");
                Data::default()
            }
        }
    }

    fn save(&self, data: &Data) -> Result<()> {
        if let Some(dir) = self.file.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let sealed = protect(&serde_json::to_vec(data)?)?;
        let tmp = self.file.with_extension("dat.tmp");
        write_private(&tmp, &sealed)?;
        std::fs::rename(&tmp, &self.file).with_context(|| format!("salvando {}", self.file.display()))
    }

    pub fn get(&self, uuid: &str) -> Option<Session> {
        self.load().accounts.get(&key(uuid)).cloned()
    }

    pub fn put(&self, uuid: &str, session: Session) -> Result<()> {
        let mut d = self.load();
        d.version = 1;
        d.accounts.insert(key(uuid), session);
        self.save(&d)
    }

    pub fn remove(&self, uuid: &str) -> Result<()> {
        let mut d = self.load();
        if d.accounts.remove(&key(uuid)).is_some() {
            self.save(&d)?;
        }
        Ok(())
    }
}

#[cfg(unix)]
fn write_private(path: &Path, bytes: &[u8]) -> Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    let mut f = std::fs::OpenOptions::new().write(true).create(true).truncate(true).mode(0o600).open(path)?;
    f.write_all(bytes)?;
    Ok(())
}

#[cfg(not(unix))]
fn write_private(path: &Path, bytes: &[u8]) -> Result<()> {
    Ok(std::fs::write(path, bytes)?)
}

#[cfg(windows)]
use dpapi::{protect, unprotect};

#[cfg(not(windows))]
fn protect(plain: &[u8]) -> Result<Vec<u8>> {
    Ok(plain.to_vec())
}

#[cfg(not(windows))]
fn unprotect(sealed: &[u8]) -> Result<Vec<u8>> {
    Ok(sealed.to_vec())
}

#[cfg(windows)]
mod dpapi {
    use std::ffi::c_void;
    use std::ptr::{null, null_mut};

    use anyhow::{bail, Result};

    #[repr(C)]
    struct Blob {
        len: u32,
        data: *mut u8,
    }

    #[link(name = "crypt32")]
    extern "system" {
        fn CryptProtectData(input: *const Blob, description: *const u16, entropy: *const Blob, reserved: *mut c_void, prompt: *mut c_void, flags: u32, output: *mut Blob) -> i32;
        fn CryptUnprotectData(input: *const Blob, description: *mut *mut u16, entropy: *const Blob, reserved: *mut c_void, prompt: *mut c_void, flags: u32, output: *mut Blob) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn LocalFree(mem: *mut c_void) -> *mut c_void;
        fn GetLastError() -> u32;
    }

    const CRYPTPROTECT_UI_FORBIDDEN: u32 = 0x1;
    /// separa os segredos do launcher dos de outros apps do mesmo usuário
    const ENTROPY: &[u8] = b"forbidden-series-launcher/contas/v1";

    fn run(input: &[u8], seal: bool) -> Result<Vec<u8>> {
        let inp = Blob { len: input.len() as u32, data: input.as_ptr() as *mut u8 };
        let ent = Blob { len: ENTROPY.len() as u32, data: ENTROPY.as_ptr() as *mut u8 };
        let mut out = Blob { len: 0, data: null_mut() };
        // SAFETY: os blobs apontam para buffers vivos durante a chamada; a saída é
        // alocada pelo Windows e liberada logo abaixo com LocalFree.
        let ok = unsafe {
            if seal {
                CryptProtectData(&inp, null(), &ent, null_mut(), null_mut(), CRYPTPROTECT_UI_FORBIDDEN, &mut out)
            } else {
                CryptUnprotectData(&inp, null_mut(), &ent, null_mut(), null_mut(), CRYPTPROTECT_UI_FORBIDDEN, &mut out)
            }
        };
        if ok == 0 {
            // SAFETY: sem argumentos
            let code = unsafe { GetLastError() };
            bail!("DPAPI recusou ({}): erro {code:#x}", if seal { "cifrar" } else { "decifrar" });
        }
        // SAFETY: o Windows devolveu `len` bytes válidos em `data`
        let bytes = unsafe { std::slice::from_raw_parts(out.data, out.len as usize) }.to_vec();
        // SAFETY: memória alocada pelo próprio CryptProtectData/CryptUnprotectData
        unsafe { LocalFree(out.data.cast()) };
        Ok(bytes)
    }

    pub fn protect(plain: &[u8]) -> Result<Vec<u8>> {
        run(plain, true)
    }

    pub fn unprotect(sealed: &[u8]) -> Result<Vec<u8>> {
        run(sealed, false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn session(name: &str) -> Session {
        Session { refresh_token: "M.R3_BAY.".to_string() + &"x".repeat(1800), mc_token: "eyJ".to_string() + &"y".repeat(900), mc_expires_at: 1_900_000_000, username: name.into() }
    }

    #[test]
    fn guarda_le_e_remove_sessoes() {
        let dir = std::env::temp_dir().join(format!("forbidden-cofre-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let v = Vault::at(&dir);
        assert!(v.get("abc").is_none());
        let uuid = "069A79F4-44E9-4726-A5BE-FCA90E38AAF5";
        v.put(uuid, session("Notch")).unwrap();
        v.put("11111111-2222-3333-4444-555555555555", session("Outro")).unwrap();
        // o mesmo UUID com ou sem hífens, maiúsculas ou minúsculas
        assert_eq!(v.get("069a79f444e94726a5befca90e38aaf5"), Some(session("Notch")));
        // os tokens não aparecem em claro no arquivo (no Windows, o DPAPI cifra)
        let raw = std::fs::read(dir.join("accounts.dat")).unwrap();
        assert_eq!(cfg!(windows), !raw.windows(9).any(|w| w == b"M.R3_BAY."));
        v.remove(uuid).unwrap();
        assert!(v.get(uuid).is_none());
        assert_eq!(v.get("11111111222233334444555555555555").unwrap().username, "Outro");
        // a depuração nunca mostra tokens
        assert!(!format!("{:?}", session("x")).contains("M.R3"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn cofre_corrompido_vira_vazio() {
        let dir = std::env::temp_dir().join(format!("forbidden-cofre-ruim-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("accounts.dat"), b"lixo que nao e json nem dpapi").unwrap();
        let v = Vault::at(&dir);
        assert!(v.get("abc").is_none());
        v.put("abc", session("Novo")).unwrap();
        assert_eq!(v.get("abc").unwrap().username, "Novo");
        let _ = std::fs::remove_dir_all(&dir);
    }
}

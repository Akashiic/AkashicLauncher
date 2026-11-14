//! Contas originais (Microsoft) para o Minecraft.
//!
//! Login: navegador (página oficial da Microsoft, PKCE) → Xbox Live → XSTS →
//! Minecraft → perfil (nick, UUID e skin). Os tokens ficam no cofre
//! (`vault.rs`, DPAPI no Windows) e nunca passam pela interface: no JOGAR o Rust
//! pega o token do Minecraft direto do cofre, renovando quando falta pouco.
//!
//! Requisitos do lado da Microsoft/Mojang (feitos pelo dono do launcher):
//! - app registrado no Microsoft Entra (contas pessoais, "Mobile e desktop" com
//!   redirect `http://localhost`, fluxos de cliente público ligados);
//! - o ID desse app liberado pela Mojang para a API do Minecraft
//!   (https://aka.ms/mce-reviewappid);
//! - o ID na variável `FORBIDDEN_MS_CLIENT_ID` na hora da build (variável
//!   `MS_CLIENT_ID` do repositório no GitHub Actions).

pub mod oauth;
pub mod vault;
pub mod xbox;

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::Engine;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_opener::OpenerExt;
use tokio::sync::oneshot;

use vault::{Session, Vault};

/// Endereços dos serviços (trocados por um servidor simulado nos testes).
pub struct Endpoints {
    pub ms_authorize: String,
    pub ms_token: String,
    pub xbl: String,
    pub xsts: String,
    pub mc_login: String,
    pub mc_profile: String,
}

impl Endpoints {
    pub fn live() -> Self {
        Self {
            ms_authorize: "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize".into(),
            ms_token: "https://login.microsoftonline.com/consumers/oauth2/v2.0/token".into(),
            xbl: "https://user.auth.xboxlive.com/user/authenticate".into(),
            xsts: "https://xsts.auth.xboxlive.com/xsts/authorize".into(),
            mc_login: "https://api.minecraftservices.com/authentication/login_with_xbox".into(),
            mc_profile: "https://api.minecraftservices.com/minecraft/profile".into(),
        }
    }
}

/// Erro de conta com um código que a interface entende e uma mensagem pronta.
/// Códigos: not_configured, busy, cancelled, timeout, network, xbox, no_xbox,
/// child, region, not_approved, no_minecraft, relogin, other.
#[derive(Serialize, Debug, Clone, PartialEq, Eq)]
pub struct Failure {
    pub code: String,
    pub message: String,
}

impl Failure {
    pub fn new(code: &str, message: impl Into<String>) -> Self {
        Self { code: code.into(), message: message.into() }
    }
    pub fn other(message: impl Into<String>) -> Self {
        Self::new("other", message)
    }
    pub fn network(e: reqwest::Error) -> Self {
        let why = if e.is_timeout() { "demorou demais para responder" } else { "não respondeu" };
        Self::new("network", format!("O servidor de login {why}. Verifique sua internet e tente de novo."))
    }
    pub fn relogin() -> Self {
        Self::new("relogin", "Sua sessão Microsoft expirou. Entre de novo na conta.")
    }
    pub fn not_configured() -> Self {
        Self::new("not_configured", "O login com Microsoft ainda não foi ativado nesta versão do launcher.")
    }
}

impl std::fmt::Display for Failure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for Failure {}

/// ID do app no Microsoft Entra: definido na build (ou no ambiente, para testes locais).
pub fn client_id() -> Option<String> {
    std::env::var("FORBIDDEN_MS_CLIENT_ID")
        .ok()
        .or_else(|| option_env!("FORBIDDEN_MS_CLIENT_ID").map(str::to_string))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[derive(Default)]
pub struct AuthState {
    /// uma operação de conta por vez (login ou renovação)
    lock: tokio::sync::Mutex<()>,
    cancel: std::sync::Mutex<Option<oneshot::Sender<()>>>,
}

/// Perfil devolvido para a interface (sem tokens).
#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MsProfile {
    pub username: String,
    /// UUID com hífens
    pub uuid: String,
    /// skin ativa em data URL (PNG), se deu para baixar
    pub skin: Option<String>,
}

fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// UUID sem hífens → com hífens (8-4-4-4-12).
pub fn hyphenate(id: &str) -> String {
    let h = vault::key(id);
    if h.len() != 32 {
        return h;
    }
    format!("{}-{}-{}-{}-{}", &h[..8], &h[8..12], &h[12..16], &h[16..20], &h[20..])
}

fn http() -> Result<reqwest::Client, Failure> {
    reqwest::Client::builder()
        .user_agent(crate::game::net::USER_AGENT)
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| Failure::other(e.to_string()))
}

fn vault_of<R: Runtime>(app: &AppHandle<R>) -> Result<Vault, Failure> {
    crate::game::data_root(app).map(|d| Vault::at(&d)).map_err(|e| Failure::other(e.to_string()))
}

/// Tokens da Microsoft → Xbox Live → XSTS → Minecraft → perfil. `step` avisa cada etapa (1..=4).
async fn chain(client: &reqwest::Client, ep: &Endpoints, tokens: oauth::Tokens, step: &(dyn Fn(u8) + Sync)) -> Result<(Session, xbox::Profile), Failure> {
    step(1);
    let xbl = xbox::xbox_live(client, ep, &tokens.access_token).await?;
    step(2);
    let xsts = xbox::xsts(client, ep, &xbl.token).await?;
    step(3);
    let (mc_token, ttl) = xbox::minecraft(client, ep, &xsts).await?;
    step(4);
    let profile = xbox::profile(client, ep, &mc_token).await?;
    let session = Session { refresh_token: tokens.refresh_token, mc_token, mc_expires_at: now() + ttl, username: profile.name.clone() };
    Ok((session, profile))
}

/// Sessão com token do Minecraft válido por pelo menos 10 minutos. Renova pela
/// Microsoft quando precisa e devolve o perfil atualizado nesse caso.
async fn ensure(client: &reqwest::Client, ep: &Endpoints, vault: &Vault, client_id: &str, uuid: &str) -> Result<(Session, Option<xbox::Profile>), Failure> {
    let saved = vault.get(uuid).ok_or_else(Failure::relogin)?;
    if saved.mc_expires_at > now() + 600 {
        return Ok((saved, None));
    }
    let tokens = oauth::refresh(client, ep, client_id, &saved.refresh_token).await?;
    let (fresh, profile) = chain(client, ep, tokens, &|_| {}).await?;
    if vault::key(&profile.id) != vault::key(uuid) {
        // a conta da Microsoft agora aponta para outro perfil: melhor entrar de novo
        return Err(Failure::relogin());
    }
    vault.put(uuid, fresh.clone()).map_err(|e| Failure::other(format!("não deu para salvar a sessão: {e:#}")))?;
    Ok((fresh, Some(profile)))
}

async fn skin_data_url(client: &reqwest::Client, profile: &xbox::Profile) -> Option<String> {
    let png = xbox::skin_png(client, profile.active_skin()?).await?;
    Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png)))
}

fn bring_to_front<R: Runtime>(app: &AppHandle<R>) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
pub fn auth_configured() -> bool {
    client_id().is_some()
}

/// Entrar com Microsoft: abre a página oficial no navegador e conclui a cadeia.
/// Eventos: `auth:step` (0 navegador … 5 pronto) e `auth:browser` (link aberto).
#[tauri::command]
pub async fn auth_login(app: AppHandle, state: State<'_, AuthState>) -> Result<MsProfile, Failure> {
    let client_id = client_id().ok_or_else(Failure::not_configured)?;
    let _one = state.lock.try_lock().map_err(|_| Failure::new("busy", "Já existe um login em andamento."))?;
    let (tx, cancelled) = oneshot::channel();
    *state.cancel.lock().unwrap() = Some(tx);

    let ep = Endpoints::live();
    let client = http()?;
    let step = |i: u8| {
        let _ = app.emit("auth:step", i);
    };
    step(0);
    let lb = oauth::Loopback::bind().await?;
    let pkce = oauth::pkce();
    let st = oauth::random_state();
    let redirect = lb.redirect_uri();
    let url = oauth::authorize_url(&ep, &client_id, &redirect, &pkce, &st);
    let _ = app.emit("auth:browser", &url);
    if let Err(e) = app.opener().open_url(&url, None::<&str>) {
        // a interface mostra o link para abrir/copiar à mão
        eprintln!("[contas] não deu para abrir o navegador: {e}");
    }
    let code = tokio::select! {
        r = lb.wait(&st, Duration::from_secs(10 * 60)) => r?,
        _ = cancelled => return Err(Failure::new("cancelled", "Login cancelado.")),
    };
    drop(lb);
    bring_to_front(&app);

    let tokens = oauth::exchange_code(&client, &ep, &client_id, &code, &redirect, &pkce.verifier).await?;
    let (session, profile) = chain(&client, &ep, tokens, &step).await?;
    let skin = skin_data_url(&client, &profile).await;
    vault_of(&app)?.put(&profile.id, session).map_err(|e| Failure::other(format!("não deu para salvar a sessão: {e:#}")))?;
    step(5);
    Ok(MsProfile { username: profile.name, uuid: hyphenate(&profile.id), skin })
}

#[tauri::command]
pub fn auth_cancel(state: State<'_, AuthState>) {
    if let Some(tx) = state.cancel.lock().unwrap().take() {
        let _ = tx.send(());
    }
}

/// Confere a sessão antes de jogar: renova o token se precisar e devolve o perfil
/// atual (o nick pode ter mudado em minecraft.net).
#[tauri::command]
pub async fn auth_refresh(app: AppHandle, state: State<'_, AuthState>, uuid: String) -> Result<MsProfile, Failure> {
    let client_id = client_id().ok_or_else(Failure::not_configured)?;
    let _one = state.lock.lock().await;
    let client = http()?;
    let (session, profile) = ensure(&client, &Endpoints::live(), &vault_of(&app)?, &client_id, &uuid).await?;
    let skin = match &profile {
        Some(p) => skin_data_url(&client, p).await,
        None => None,
    };
    Ok(MsProfile { username: session.username, uuid: hyphenate(&uuid), skin })
}

/// Sair da conta: apaga a sessão do cofre.
#[tauri::command]
pub fn auth_forget(app: AppHandle, uuid: String) -> Result<(), String> {
    vault_of(&app).map_err(|e| e.message)?.remove(&uuid).map_err(|e| e.to_string())
}

/// Token do Minecraft para abrir o jogo (do cofre; renova se precisar).
pub async fn launch_token<R: Runtime>(app: &AppHandle<R>, uuid: &str) -> Result<String, Failure> {
    let client_id = client_id().ok_or_else(Failure::not_configured)?;
    let state = app.try_state::<AuthState>();
    let _one = match &state {
        Some(s) => Some(s.lock.lock().await),
        None => None,
    };
    let (session, _) = ensure(&http()?, &Endpoints::live(), &vault_of(app)?, &client_id, uuid).await?;
    Ok(session.mc_token)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpListener;

    type Route = (&'static str, u16, &'static str, Vec<u8>);

    /// Servidor HTTP mínimo que responde por caminho e registra cada pedido.
    struct Mock {
        base: String,
        seen: Arc<Mutex<Vec<(String, String)>>>,
        routes: Arc<Mutex<Vec<Route>>>,
    }

    impl Mock {
        async fn start(routes: Vec<Route>) -> Self {
            let l = TcpListener::bind("127.0.0.1:0").await.unwrap();
            let base = format!("http://{}", l.local_addr().unwrap());
            let seen = Arc::new(Mutex::new(Vec::new()));
            let routes = Arc::new(Mutex::new(routes));
            let (log, table) = (seen.clone(), routes.clone());
            tokio::spawn(async move {
                while let Ok((mut sock, _)) = l.accept().await {
                    let (log, routes) = (log.clone(), table.clone());
                    tokio::spawn(async move {
                        let mut buf = Vec::new();
                        let mut tmp = [0u8; 8192];
                        let (head_end, len) = loop {
                            let n = sock.read(&mut tmp).await.unwrap_or(0);
                            if n == 0 {
                                return;
                            }
                            buf.extend_from_slice(&tmp[..n]);
                            if let Some(p) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                                let head = String::from_utf8_lossy(&buf[..p]).to_lowercase();
                                let len = head.lines().find_map(|l| l.strip_prefix("content-length:")).and_then(|v| v.trim().parse().ok()).unwrap_or(0usize);
                                break (p + 4, len);
                            }
                        };
                        while buf.len() < head_end + len {
                            let n = sock.read(&mut tmp).await.unwrap_or(0);
                            if n == 0 {
                                break;
                            }
                            buf.extend_from_slice(&tmp[..n]);
                        }
                        let head = String::from_utf8_lossy(&buf[..head_end]).to_string();
                        let path = head.split_whitespace().nth(1).unwrap_or("").to_string();
                        let body = String::from_utf8_lossy(&buf[head_end..(head_end + len).min(buf.len())]).to_string();
                        log.lock().unwrap().push((path.clone(), body));
                        let found = routes.lock().unwrap().iter().find(|r| r.0 == path).map(|r| (r.1, r.2, r.3.clone()));
                        let (status, ctype, payload) = found.unwrap_or((404, "text/plain", b"nao".to_vec()));
                        let head = format!("HTTP/1.1 {status} X\r\nContent-Type: {ctype}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", payload.len());
                        let _ = sock.write_all(head.as_bytes()).await;
                        let _ = sock.write_all(&payload).await;
                        let _ = sock.shutdown().await;
                    });
                }
            });
            Self { base, seen, routes }
        }

        fn set(&self, routes: Vec<Route>) {
            *self.routes.lock().unwrap() = routes;
        }

        fn endpoints(&self) -> Endpoints {
            let b = &self.base;
            Endpoints {
                ms_authorize: format!("{b}/ms/authorize"),
                ms_token: format!("{b}/ms/token"),
                xbl: format!("{b}/xbl"),
                xsts: format!("{b}/xsts"),
                mc_login: format!("{b}/mc/login"),
                mc_profile: format!("{b}/mc/profile"),
            }
        }

        fn body_of(&self, path: &str) -> String {
            self.seen.lock().unwrap().iter().find(|(p, _)| p == path).map(|(_, b)| b.clone()).unwrap_or_default()
        }

        fn hits(&self, path: &str) -> usize {
            self.seen.lock().unwrap().iter().filter(|(p, _)| p == path).count()
        }
    }

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\nfake-skin";

    fn json(path: &'static str, status: u16, body: &str) -> Route {
        (path, status, "application/json", body.as_bytes().to_vec())
    }

    fn happy(skin_url: &str, refresh: &str) -> Vec<Route> {
        vec![
            json("/ms/token", 200, &format!(r#"{{"token_type":"Bearer","scope":"XboxLive.signin","expires_in":3600,"access_token":"MS_ACCESS","refresh_token":"{refresh}"}}"#)),
            json("/xbl", 200, r#"{"IssueInstant":"x","Token":"XBL_TOKEN","DisplayClaims":{"xui":[{"uhs":"UHS123"}]}}"#),
            json("/xsts", 200, r#"{"Token":"XSTS_TOKEN","DisplayClaims":{"xui":[{"uhs":"UHS123"}]}}"#),
            json("/mc/login", 200, r#"{"username":"abc","roles":[],"access_token":"MC_TOKEN","token_type":"Bearer","expires_in":86400}"#),
            json(
                "/mc/profile",
                200,
                &format!(r#"{{"id":"069a79f444e94726a5befca90e38aaf5","name":"Notch","skins":[{{"id":"s","state":"ACTIVE","url":"{skin_url}","variant":"CLASSIC"}}],"capes":[]}}"#),
            ),
            ("/skin.png", 200, "image/png", PNG.to_vec()),
        ]
    }

    fn temp_vault(tag: &str) -> (Vault, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!("forbidden-auth-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        (Vault::at(&dir), dir)
    }

    #[tokio::test]
    async fn cadeia_completa_do_codigo_ao_perfil() {
        let m = Mock::start(vec![]).await;
        m.set(happy(&format!("{}/skin.png", m.base), "R1"));
        let ep = m.endpoints();
        let client = http().unwrap();
        let tokens = oauth::exchange_code(&client, &ep, "APP", "CODE", "http://localhost:1234", "VERIFIER").await.unwrap();
        let steps = Mutex::new(Vec::new());
        let (session, profile) = chain(&client, &ep, tokens, &|i| steps.lock().unwrap().push(i)).await.unwrap();

        assert_eq!(*steps.lock().unwrap(), vec![1, 2, 3, 4]);
        assert_eq!(profile.name, "Notch");
        assert_eq!(hyphenate(&profile.id), "069a79f4-44e9-4726-a5be-fca90e38aaf5");
        assert_eq!(session.refresh_token, "R1");
        assert_eq!(session.mc_token, "MC_TOKEN");
        assert!(session.mc_expires_at > now() + 86000);

        // o que cada serviço recebeu
        let token_req = m.body_of("/ms/token");
        for part in ["grant_type=authorization_code", "code=CODE", "code_verifier=VERIFIER", "client_id=APP", "redirect_uri=http%3A%2F%2Flocalhost%3A1234"] {
            assert!(token_req.contains(part), "faltou {part} em {token_req}");
        }
        assert!(m.body_of("/xbl").contains(r#""RpsTicket":"d=MS_ACCESS""#));
        assert!(m.body_of("/xsts").contains(r#""UserTokens":["XBL_TOKEN"]"#));
        assert!(m.body_of("/xsts").contains("rp://api.minecraftservices.com/"));
        assert!(m.body_of("/mc/login").contains(r#""identityToken":"XBL3.0 x=UHS123;XSTS_TOKEN""#));

        let data_url = skin_data_url(&client, &profile).await.unwrap();
        assert_eq!(data_url, format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(PNG)));
    }

    #[tokio::test]
    async fn renova_so_quando_o_token_esta_vencendo() {
        let m = Mock::start(happy("http://127.0.0.1:9/nada.png", "R2")).await;
        let (vault, dir) = temp_vault("renova");
        let uuid = "069a79f4-44e9-4726-a5be-fca90e38aaf5";
        vault.put(uuid, Session { refresh_token: "R1".into(), mc_token: "VELHO".into(), mc_expires_at: now() + 60, username: "NomeAntigo".into() }).unwrap();
        let client = http().unwrap();

        let (s, profile) = ensure(&client, &m.endpoints(), &vault, "APP", uuid).await.unwrap();
        assert_eq!(s.mc_token, "MC_TOKEN");
        assert_eq!(s.username, "Notch", "o nick novo vem do perfil");
        assert!(profile.is_some());
        assert!(m.body_of("/ms/token").contains("refresh_token=R1"));
        // a Microsoft trocou o refresh token: o novo fica guardado
        assert_eq!(vault.get(uuid).unwrap().refresh_token, "R2");

        // agora o token vale 24 h: não chama a Microsoft de novo
        let (s2, p2) = ensure(&client, &m.endpoints(), &vault, "APP", uuid).await.unwrap();
        assert_eq!(s2.mc_token, "MC_TOKEN");
        assert!(p2.is_none());
        assert_eq!(m.hits("/ms/token"), 1);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn sessao_revogada_pede_login_de_novo() {
        let m = Mock::start(vec![json("/ms/token", 400, r#"{"error":"invalid_grant","error_description":"AADSTS70000: expired"}"#)]).await;
        let (vault, dir) = temp_vault("revogada");
        vault.put("abc", Session { refresh_token: "R".into(), mc_token: "T".into(), mc_expires_at: 0, username: "x".into() }).unwrap();
        let err = ensure(&http().unwrap(), &m.endpoints(), &vault, "APP", "abc").await.unwrap_err();
        assert_eq!(err.code, "relogin");
        // conta que nunca entrou também pede login
        assert_eq!(ensure(&http().unwrap(), &m.endpoints(), &vault, "APP", "outra").await.unwrap_err().code, "relogin");
        let _ = std::fs::remove_dir_all(dir);
    }

    async fn chain_error(routes: Vec<Route>) -> Failure {
        let m = Mock::start(routes).await;
        let tokens = oauth::Tokens { access_token: "A".into(), refresh_token: "R".into() };
        chain(&http().unwrap(), &m.endpoints(), tokens, &|_| {}).await.unwrap_err()
    }

    #[tokio::test]
    async fn erros_de_cada_etapa() {
        let base = happy("http://x/skin.png", "R");
        let without = |path: &str| base.iter().filter(|r| r.0 != path).cloned().collect::<Vec<_>>();

        let mut r = without("/xsts");
        r.push(json("/xsts", 401, r#"{"Identity":"0","XErr":2148916238,"Message":"","Redirect":"https://start.ui.xboxlive.com/AddChildToFamily"}"#));
        assert_eq!(chain_error(r).await.code, "child");

        let mut r = without("/mc/login");
        r.push(json("/mc/login", 403, r#"{"path":"/authentication/login_with_xbox","errorMessage":"Invalid app registration, see https://aka.ms/AppRegInfo for more information"}"#));
        assert_eq!(chain_error(r).await.code, "not_approved");

        let mut r = without("/mc/profile");
        r.push(json("/mc/profile", 404, r#"{"path":"/minecraft/profile","errorType":"NOT_FOUND","error":"NOT_FOUND"}"#));
        assert_eq!(chain_error(r).await.code, "no_minecraft");

        let mut r = without("/xbl");
        r.push(json("/xbl", 400, ""));
        assert_eq!(chain_error(r).await.code, "xbox");
    }

    #[test]
    fn uuid_com_hifens() {
        assert_eq!(hyphenate("069A79F444E94726A5BEFCA90E38AAF5"), "069a79f4-44e9-4726-a5be-fca90e38aaf5");
        assert_eq!(hyphenate("069a79f4-44e9-4726-a5be-fca90e38aaf5"), "069a79f4-44e9-4726-a5be-fca90e38aaf5");
    }
}

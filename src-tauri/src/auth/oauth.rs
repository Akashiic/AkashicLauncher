//! Login da Microsoft no navegador do jogador (OAuth 2.0 com PKCE, RFC 8252).
//!
//! O launcher abre a página oficial da Microsoft e espera a volta num servidorzinho
//! em `http://localhost:<porta>`. A senha é digitada só no site da Microsoft; o
//! launcher recebe um código de uso único, que troca por tokens junto com o
//! segredo PKCE que só ele conhece.

use std::time::Duration;

use base64::Engine;
use rand::Rng;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

use super::{Endpoints, Failure};

pub const SCOPE: &str = "XboxLive.signin offline_access";

pub struct Pkce {
    pub verifier: String,
    pub challenge: String,
}

const UNRESERVED: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

fn random_text(len: usize) -> String {
    let mut r = rand::thread_rng();
    (0..len).map(|_| UNRESERVED[r.gen_range(0..UNRESERVED.len())] as char).collect()
}

pub fn pkce() -> Pkce {
    let verifier = random_text(64);
    let challenge = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
    Pkce { verifier, challenge }
}

pub fn random_state() -> String {
    random_text(32)
}

pub fn authorize_url(ep: &Endpoints, client_id: &str, redirect: &str, pkce: &Pkce, state: &str) -> String {
    let mut url = url::Url::parse(&ep.ms_authorize).expect("URL de autorização válida");
    url.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("response_type", "code")
        .append_pair("redirect_uri", redirect)
        .append_pair("response_mode", "query")
        .append_pair("scope", SCOPE)
        .append_pair("code_challenge", &pkce.challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("state", state)
        // deixa escolher outra conta ao adicionar um segundo perfil
        .append_pair("prompt", "select_account");
    url.into()
}

/// Servidor de volta do login: escuta em 127.0.0.1 (e ::1, se der) numa porta livre.
pub struct Loopback {
    v4: TcpListener,
    v6: Option<TcpListener>,
    pub port: u16,
}

impl Loopback {
    pub async fn bind() -> Result<Self, Failure> {
        let v4 = TcpListener::bind(("127.0.0.1", 0)).await.map_err(|e| Failure::other(format!("não deu para abrir a porta local do login: {e}")))?;
        let port = v4.local_addr().map_err(|e| Failure::other(e.to_string()))?.port();
        // navegadores que resolvem "localhost" para ::1 também chegam
        let v6 = TcpListener::bind(("::1", port)).await.ok();
        Ok(Self { v4, v6, port })
    }

    pub fn redirect_uri(&self) -> String {
        format!("http://localhost:{}", self.port)
    }

    async fn accept(&self) -> std::io::Result<TcpStream> {
        match &self.v6 {
            Some(v6) => tokio::select! {
                r = self.v4.accept() => r.map(|(s, _)| s),
                r = v6.accept() => r.map(|(s, _)| s),
            },
            None => self.v4.accept().await.map(|(s, _)| s),
        }
    }

    /// Espera o navegador voltar com `?code=...&state=...` e devolve o código.
    pub async fn wait(&self, state: &str, timeout: Duration) -> Result<String, Failure> {
        let deadline = tokio::time::Instant::now() + timeout;
        loop {
            let mut sock = tokio::time::timeout_at(deadline, self.accept())
                .await
                .map_err(|_| Failure::new("timeout", "O login no navegador demorou demais. Tente de novo."))?
                .map_err(|e| Failure::other(e.to_string()))?;
            let Some(target) = read_target(&mut sock).await else { continue };
            match parse_callback(&target, state) {
                Callback::Ignore => {
                    let _ = respond(&mut sock, "404 Not Found", "").await;
                }
                Callback::Code(code) => {
                    let _ = respond(&mut sock, "200 OK", &page(true, "Conta conectada", "Pode fechar esta aba e voltar ao launcher.")).await;
                    return Ok(code);
                }
                Callback::Failed(f) => {
                    let _ = respond(&mut sock, "200 OK", &page(false, "Login não concluído", &f.message)).await;
                    return Err(f);
                }
            }
        }
    }
}

/// Lê a primeira linha do pedido HTTP ("GET /?code=... HTTP/1.1") e devolve o caminho.
async fn read_target(sock: &mut TcpStream) -> Option<String> {
    let mut buf = vec![0u8; 8192];
    let mut len = 0;
    while len < buf.len() {
        let n = tokio::time::timeout(Duration::from_secs(10), sock.read(&mut buf[len..])).await.ok()?.ok()?;
        if n == 0 {
            break;
        }
        len += n;
        if buf[..len].windows(4).any(|w| w == b"\r\n\r\n") {
            break;
        }
    }
    let head = String::from_utf8_lossy(&buf[..len]);
    let mut parts = head.lines().next()?.split_whitespace();
    (parts.next()? == "GET").then(|| parts.next().map(str::to_string))?
}

#[derive(Debug, PartialEq)]
pub enum Callback {
    /// outra requisição do navegador (favicon etc.)
    Ignore,
    Code(String),
    Failed(Failure),
}

pub fn parse_callback(target: &str, expected_state: &str) -> Callback {
    let Ok(url) = url::Url::parse(&format!("http://localhost{target}")) else { return Callback::Ignore };
    if url.path() != "/" {
        return Callback::Ignore;
    }
    let get = |k: &str| url.query_pairs().find(|(key, _)| key == k).map(|(_, v)| v.into_owned());
    if let Some(err) = get("error") {
        return Callback::Failed(match err.as_str() {
            "access_denied" => Failure::new("cancelled", "Login cancelado na página da Microsoft."),
            _ => Failure::other(format!("A Microsoft recusou o login: {}", get("error_description").unwrap_or(err))),
        });
    }
    match (get("code"), get("state")) {
        (Some(_), s) if s.as_deref() != Some(expected_state) => Callback::Failed(Failure::other("Resposta de login inválida (state diferente). Tente de novo.")),
        (Some(code), _) if !code.is_empty() => Callback::Code(code),
        _ => Callback::Ignore,
    }
}

async fn respond(sock: &mut TcpStream, status: &str, body: &str) -> std::io::Result<()> {
    let head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        body.len()
    );
    sock.write_all(head.as_bytes()).await?;
    sock.write_all(body.as_bytes()).await?;
    sock.shutdown().await
}

/// Página mostrada no navegador ao voltar do login (visual da marca).
fn page(ok: bool, title: &str, text: &str) -> String {
    let esc = |s: &str| s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
    let (accent, mark) = if ok { ("#2fd27a", "✓") } else { ("#e5484d", "!") };
    format!(
        r#"<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Forbidden Series</title>
<style>html,body{{height:100%;margin:0}}body{{display:grid;place-items:center;background:radial-gradient(circle at 50% 30%,#3a0000,#0d0d0d 60%);color:#f2f2f2;font:16px/1.5 system-ui,Segoe UI,sans-serif}}
main{{text-align:center;padding:40px 48px;border:1px solid #ffffff1a;border-radius:20px;background:#121212cc;box-shadow:0 0 60px -20px #c00}}
.m{{width:56px;height:56px;margin:0 auto 16px;border-radius:50%;display:grid;place-items:center;font-size:28px;font-weight:700;color:{accent};border:2px solid {accent}}}
h1{{margin:0 0 6px;font-size:26px;letter-spacing:.5px;text-transform:uppercase}}p{{margin:0;color:#b3b3b3}}small{{display:block;margin-top:18px;color:#666;letter-spacing:2px;text-transform:uppercase}}</style></head>
<body><main><div class="m">{mark}</div><h1>{}</h1><p>{}</p><small>Forbidden Series Launcher</small></main></body></html>"#,
        esc(title),
        esc(text)
    )
}

#[derive(Deserialize)]
pub struct Tokens {
    pub access_token: String,
    pub refresh_token: String,
}

#[derive(Deserialize)]
struct TokenError {
    error: String,
    #[serde(default)]
    error_description: String,
}

async fn token_request(client: &reqwest::Client, ep: &Endpoints, form: &[(&str, &str)]) -> Result<Tokens, Failure> {
    let res = client.post(&ep.ms_token).form(form).send().await.map_err(Failure::network)?;
    let status = res.status();
    let body = res.text().await.map_err(Failure::network)?;
    if status.is_success() {
        return serde_json::from_str(&body).map_err(|e| Failure::other(format!("resposta inesperada da Microsoft: {e}")));
    }
    let err: Option<TokenError> = serde_json::from_str(&body).ok();
    Err(match err {
        // refresh token vencido, revogado ou senha trocada: precisa entrar de novo
        Some(e) if e.error == "invalid_grant" || e.error == "interaction_required" => Failure::relogin(),
        Some(e) if e.error == "unauthorized_client" || e.error == "invalid_client" => Failure::new(
            "not_configured",
            "O app do launcher não está configurado corretamente na Microsoft (verifique o ID do app e se 'Permitir fluxos de cliente público' está ativo).",
        ),
        Some(e) => Failure::other(format!("A Microsoft recusou o login: {} {}", e.error, e.error_description.lines().next().unwrap_or(""))),
        None => Failure::other(format!("A Microsoft respondeu {status}.")),
    })
}

pub async fn exchange_code(client: &reqwest::Client, ep: &Endpoints, client_id: &str, code: &str, redirect: &str, verifier: &str) -> Result<Tokens, Failure> {
    token_request(client, ep, &[
        ("client_id", client_id),
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect),
        ("code_verifier", verifier),
        ("scope", SCOPE),
    ])
    .await
}

pub async fn refresh(client: &reqwest::Client, ep: &Endpoints, client_id: &str, refresh_token: &str) -> Result<Tokens, Failure> {
    token_request(client, ep, &[("client_id", client_id), ("grant_type", "refresh_token"), ("refresh_token", refresh_token), ("scope", SCOPE)]).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_segue_a_rfc_7636() {
        let p = pkce();
        assert_eq!(p.verifier.len(), 64);
        assert!(p.verifier.bytes().all(|b| UNRESERVED.contains(&b)));
        // exemplo do apêndice B da RFC 7636
        let c = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(Sha256::digest(b"dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"));
        assert_eq!(c, "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
        assert_ne!(pkce().verifier, p.verifier);
    }

    #[test]
    fn url_de_login_tem_tudo() {
        let ep = Endpoints::live();
        let p = Pkce { verifier: "v".into(), challenge: "C".into() };
        let u = url::Url::parse(&authorize_url(&ep, "app-id", "http://localhost:5555", &p, "S")).unwrap();
        assert_eq!(u.host_str(), Some("login.microsoftonline.com"));
        assert!(u.path().starts_with("/consumers/"));
        let q: std::collections::HashMap<_, _> = u.query_pairs().into_owned().collect();
        assert_eq!(q["client_id"], "app-id");
        assert_eq!(q["redirect_uri"], "http://localhost:5555");
        assert_eq!(q["scope"], "XboxLive.signin offline_access");
        assert_eq!(q["code_challenge_method"], "S256");
        assert_eq!(q["state"], "S");
    }

    #[test]
    fn volta_do_navegador() {
        assert_eq!(parse_callback("/?code=M.abc&state=S", "S"), Callback::Code("M.abc".into()));
        assert_eq!(parse_callback("/favicon.ico", "S"), Callback::Ignore);
        assert_eq!(parse_callback("/", "S"), Callback::Ignore);
        assert!(matches!(parse_callback("/?code=M.abc&state=OUTRO", "S"), Callback::Failed(_)));
        match parse_callback("/?error=access_denied&error_description=The+user+has+denied&state=S", "S") {
            Callback::Failed(f) => assert_eq!(f.code, "cancelled"),
            other => panic!("{other:?}"),
        }
    }

    #[tokio::test]
    async fn servidor_local_recebe_o_codigo() {
        let lb = Loopback::bind().await.unwrap();
        let url = format!("{}/?code=CODIGO&state=XYZ", lb.redirect_uri().replace("localhost", "127.0.0.1"));
        let browser = tokio::spawn(async move {
            // o navegador costuma pedir o favicon também
            let c = reqwest::Client::new();
            let _ = c.get(url.replace("/?code=CODIGO&state=XYZ", "/favicon.ico")).send().await;
            c.get(url).send().await.unwrap().text().await.unwrap()
        });
        let code = lb.wait("XYZ", Duration::from_secs(10)).await.unwrap();
        assert_eq!(code, "CODIGO");
        let html = browser.await.unwrap();
        assert!(html.contains("Conta conectada"));
    }

    #[tokio::test]
    async fn servidor_local_desiste_no_tempo() {
        let lb = Loopback::bind().await.unwrap();
        let err = lb.wait("XYZ", Duration::from_millis(200)).await.unwrap_err();
        assert_eq!(err.code, "timeout");
    }
}

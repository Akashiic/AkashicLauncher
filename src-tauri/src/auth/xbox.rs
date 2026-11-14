//! Da conta Microsoft ao perfil do Minecraft: Xbox Live → XSTS → Minecraft → perfil.

use serde::Deserialize;
use serde_json::json;

use super::{Endpoints, Failure};

#[derive(Deserialize)]
struct XblResponse {
    #[serde(rename = "Token")]
    token: String,
    #[serde(rename = "DisplayClaims")]
    claims: XblClaims,
}

#[derive(Deserialize)]
struct XblClaims {
    xui: Vec<Xui>,
}

#[derive(Deserialize)]
struct Xui {
    uhs: String,
}

#[derive(Deserialize)]
struct XstsError {
    #[serde(rename = "XErr")]
    xerr: u64,
}

/// Token do Xbox Live + "user hash".
pub struct Xbl {
    pub token: String,
    pub uhs: String,
}

async fn post_xbox(client: &reqwest::Client, url: &str, body: serde_json::Value) -> Result<(reqwest::StatusCode, String), Failure> {
    let res = client
        .post(url)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .body(body.to_string())
        .send()
        .await
        .map_err(Failure::network)?;
    let status = res.status();
    Ok((status, res.text().await.map_err(Failure::network)?))
}

fn parse_xbl(body: &str) -> Result<Xbl, Failure> {
    let r: XblResponse = serde_json::from_str(body).map_err(|e| Failure::other(format!("resposta inesperada do Xbox Live: {e}")))?;
    let uhs = r.claims.xui.into_iter().next().map(|x| x.uhs).ok_or_else(|| Failure::other("o Xbox Live não devolveu o user hash"))?;
    Ok(Xbl { token: r.token, uhs })
}

pub async fn xbox_live(client: &reqwest::Client, ep: &Endpoints, ms_access: &str) -> Result<Xbl, Failure> {
    let (status, body) = post_xbox(client, &ep.xbl, json!({
        "Properties": { "AuthMethod": "RPS", "SiteName": "user.auth.xboxlive.com", "RpsTicket": format!("d={ms_access}") },
        "RelyingParty": "http://auth.xboxlive.com",
        "TokenType": "JWT",
    }))
    .await?;
    if !status.is_success() {
        return Err(Failure::new("xbox", format!("O Xbox Live recusou a conta ({status}). Tente de novo em instantes.")));
    }
    parse_xbl(&body)
}

pub async fn xsts(client: &reqwest::Client, ep: &Endpoints, xbl_token: &str) -> Result<Xbl, Failure> {
    let (status, body) = post_xbox(client, &ep.xsts, json!({
        "Properties": { "SandboxId": "RETAIL", "UserTokens": [xbl_token] },
        "RelyingParty": "rp://api.minecraftservices.com/",
        "TokenType": "JWT",
    }))
    .await?;
    if status.is_success() {
        return parse_xbl(&body);
    }
    let xerr = serde_json::from_str::<XstsError>(&body).map(|e| e.xerr).unwrap_or(0);
    Err(xsts_failure(xerr, status))
}

/// Códigos XErr do XSTS em mensagens que o jogador entende.
pub fn xsts_failure(xerr: u64, status: reqwest::StatusCode) -> Failure {
    match xerr {
        2148916233 => Failure::new("no_xbox", "Essa conta Microsoft ainda não tem perfil do Xbox. Entre uma vez em xbox.com para criar e tente de novo."),
        2148916235 => Failure::new("region", "O Xbox Live não está disponível no país desta conta."),
        2148916236 | 2148916237 => Failure::new("region", "Essa conta precisa de verificação de idade no site do Xbox antes de jogar."),
        2148916238 => Failure::new("child", "Conta de menor de idade: um adulto precisa adicioná-la a uma Família Microsoft para liberar o Minecraft."),
        _ => Failure::new("xbox", format!("A autorização do Xbox falhou ({status}{}).", if xerr > 0 { format!(", XErr {xerr}") } else { String::new() })),
    }
}

#[derive(Deserialize)]
struct McLogin {
    access_token: String,
    expires_in: u64,
}

/// Token do Minecraft (vale ~24 h) e a validade em segundos.
pub async fn minecraft(client: &reqwest::Client, ep: &Endpoints, xsts: &Xbl) -> Result<(String, u64), Failure> {
    let (status, body) = post_xbox(client, &ep.mc_login, json!({ "identityToken": format!("XBL3.0 x={};{}", xsts.uhs, xsts.token) })).await?;
    if status == reqwest::StatusCode::FORBIDDEN {
        // apps novos precisam ser liberados pela Mojang (https://aka.ms/mce-reviewappid)
        return Err(Failure::new(
            "not_approved",
            "A Mojang ainda não liberou este launcher para contas Microsoft (o pedido está em análise). Por enquanto, jogue no modo offline.",
        ));
    }
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err(Failure::new("network", "Muitas tentativas seguidas. Espere um minuto e tente de novo."));
    }
    if !status.is_success() {
        return Err(Failure::new("network", format!("Os servidores do Minecraft responderam {status}. Tente de novo em instantes.")));
    }
    let r: McLogin = serde_json::from_str(&body).map_err(|e| Failure::other(format!("resposta inesperada do Minecraft: {e}")))?;
    Ok((r.access_token, r.expires_in))
}

#[derive(Deserialize, Debug, Clone)]
pub struct Profile {
    /// UUID sem hífens
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub skins: Vec<Skin>,
}

#[derive(Deserialize, Debug, Clone)]
pub struct Skin {
    pub state: String,
    pub url: String,
}

impl Profile {
    pub fn active_skin(&self) -> Option<&str> {
        self.skins.iter().find(|s| s.state.eq_ignore_ascii_case("ACTIVE")).map(|s| s.url.as_str())
    }
}

pub async fn profile(client: &reqwest::Client, ep: &Endpoints, mc_token: &str) -> Result<Profile, Failure> {
    let res = client.get(&ep.mc_profile).bearer_auth(mc_token).send().await.map_err(Failure::network)?;
    let status = res.status();
    if status == reqwest::StatusCode::NOT_FOUND {
        return Err(Failure::new(
            "no_minecraft",
            "Essa conta não tem o Minecraft: Java Edition (ou ainda não escolheu um nome de jogador em minecraft.net).",
        ));
    }
    if !status.is_success() {
        return Err(Failure::new("network", format!("Não deu para ler o perfil do Minecraft ({status}).")));
    }
    let body = res.text().await.map_err(Failure::network)?;
    serde_json::from_str(&body).map_err(|e| Failure::other(format!("perfil do Minecraft inesperado: {e}")))
}

/// PNG da skin ativa (textures.minecraft.net), para mostrar a cabeça do jogador.
pub async fn skin_png(client: &reqwest::Client, url: &str) -> Option<Vec<u8>> {
    // a API devolve http://; o servidor de texturas aceita https
    let url = url.strip_prefix("http://textures.minecraft.net/").map(|rest| format!("https://textures.minecraft.net/{rest}")).unwrap_or_else(|| url.to_string());
    let res = client.get(url).send().await.ok()?;
    if !res.status().is_success() {
        return None;
    }
    let bytes = res.bytes().await.ok()?;
    // só aceita PNG de tamanho razoável
    (bytes.len() < 512 * 1024 && bytes.starts_with(b"\x89PNG")).then(|| bytes.to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn erros_do_xsts_viram_mensagens_claras() {
        let s = reqwest::StatusCode::UNAUTHORIZED;
        assert_eq!(xsts_failure(2148916233, s).code, "no_xbox");
        assert_eq!(xsts_failure(2148916238, s).code, "child");
        assert_eq!(xsts_failure(2148916235, s).code, "region");
        let f = xsts_failure(42, s);
        assert_eq!(f.code, "xbox");
        assert!(f.message.contains("XErr 42"));
    }

    #[test]
    fn skin_ativa() {
        let p: Profile = serde_json::from_str(
            r#"{"id":"069a79f444e94726a5befca90e38aaf5","name":"Notch","skins":[{"id":"1","state":"INACTIVE","url":"http://a"},{"id":"2","state":"ACTIVE","url":"http://textures.minecraft.net/texture/abc","variant":"CLASSIC"}],"capes":[]}"#,
        )
        .unwrap();
        assert_eq!(p.active_skin(), Some("http://textures.minecraft.net/texture/abc"));
        assert_eq!(p.name, "Notch");
    }
}

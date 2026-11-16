//! Placas de vídeo do PC: lista, classifica (integrada × dedicada), recomenda qual
//! usar no Forbidden e aplica a escolha do jogador.
//!
//! A escolha vai para a configuração de gráficos do próprio Windows
//! (HKCU\Software\Microsoft\DirectX\UserGpuPreferences), só para o Java do jogo:
//! é o mesmo que Configurações → Sistema → Tela → Gráficos.

use serde::{Deserialize, Serialize};

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Gpu {
    pub name: String,
    /// integrated | dedicated | basic (sem driver) | unknown
    pub kind: String,
    /// memória de vídeo em MB (o Windows informa no máximo 4096)
    pub vram_mb: Option<u64>,
    pub driver_version: Option<String>,
    /// AAAA-MM-DD
    pub driver_date: Option<String>,
    /// força relativa para o modpack (0 = não roda)
    pub score: u32,
    /// tem OpenGL 3.3 (o Angelica exige)
    pub opengl33: bool,
    /// fabricante: nvidia | amd | intel
    pub vendor: Option<String>,
    /// placa antiga sem suporte: já está no último driver e não tem OpenGL 3.3
    pub legacy: bool,
    pub note: Option<String>,
}

/// Intel de 2011 ou antes (Sandy Bridge, Ironlake...): o Windows às vezes mostra só
/// "Intel(R) HD Graphics", sem número, mas o driver entrega a geração. Os drivers
/// 8.x e 9.17.x foram os últimos dessas placas, que param no OpenGL 3.1.
pub fn intel_legacy(name: &str, driver: Option<&str>) -> bool {
    let n = name.to_ascii_lowercase();
    if !n.contains("intel") {
        return false;
    }
    if n.contains("hd graphics 2000") || n.contains("hd graphics 3000") || n.contains("gma") || n.contains("express chipset") {
        return true;
    }
    driver.is_some_and(|d| d.starts_with("9.17.") || d.starts_with("8."))
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Report {
    pub gpus: Vec<Gpu>,
    /// índice da placa recomendada
    pub recommended: Option<usize>,
    /// preferência sugerida: integrated | dedicated | auto
    pub suggestion: String,
    pub reason: String,
    /// duas placas (notebook/híbrido): a escolha faz diferença
    pub hybrid: bool,
}

fn has(n: &str, any: &[&str]) -> bool {
    any.iter().any(|k| n.contains(k))
}

/// Número depois de um prefixo ("uhd graphics 620" → 620).
fn model_after(n: &str, prefix: &str) -> Option<u32> {
    let rest = &n[n.find(prefix)? + prefix.len()..];
    let digits: String = rest.trim_start().chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse().ok()
}

/// Classifica pelo nome: (tipo, fabricante, força, OpenGL 3.3).
pub fn classify(name: &str) -> (&'static str, Option<&'static str>, u32, bool) {
    let n = name.to_ascii_lowercase();
    if has(&n, &["basic display", "vídeo básico", "video básico", "basic render", "remote display", "meta virtual", "parsec"]) {
        return ("basic", None, 0, false);
    }
    if has(&n, &["nvidia", "geforce", "quadro"]) {
        let s = if has(&n, &["rtx"]) {
            100
        } else if has(&n, &["gtx 16", "gtx 10"]) {
            80
        } else if has(&n, &["gtx 9", "gtx 7"]) {
            60
        } else if has(&n, &["mx5", "mx4", "mx3"]) {
            45
        } else if has(&n, &["mx"]) {
            35
        } else if has(&n, &["gt "]) {
            30
        } else {
            55
        };
        return ("dedicated", Some("nvidia"), s, true);
    }
    if has(&n, &["amd", "radeon", "ati "]) {
        // "AMD Radeon(TM) Graphics" / "Vega 8" = integrada dos Ryzen
        let integrated = has(&n, &["radeon(tm) graphics", "radeon graphics", "vega"]) && !has(&n, &["rx "]);
        let s = if integrated {
            40
        } else if has(&n, &["rx 7", "rx 6"]) {
            95
        } else if has(&n, &["rx "]) {
            75
        } else {
            50
        };
        return (if integrated { "integrated" } else { "dedicated" }, Some("amd"), s, true);
    }
    if has(&n, &["intel"]) {
        if has(&n, &["arc"]) {
            return ("dedicated", Some("intel"), 75, true);
        }
        let (s, gl) = if has(&n, &["iris xe"]) {
            (50, true)
        } else if has(&n, &["iris"]) {
            (35, true)
        } else if let Some(m) = model_after(&n, "uhd graphics") {
            (if m >= 700 { 42 } else { 30 }, true)
        } else if has(&n, &["uhd graphics"]) {
            (30, true)
        } else if let Some(m) = model_after(&n, "hd graphics") {
            // HD 4000/4600 (2012-2013) têm OpenGL 4; HD 2000/3000 (2011) não chegam no 3.3
            if m == 2000 || m == 3000 {
                (0, false)
            } else if (500..1000).contains(&m) {
                (25, true)
            } else {
                (15, true)
            }
        } else {
            (15, true)
        };
        return ("integrated", Some("intel"), s, gl);
    }
    ("unknown", None, 20, true)
}

#[derive(Deserialize)]
#[serde(rename_all = "PascalCase")]
struct Wmi {
    name: Option<String>,
    #[serde(rename = "AdapterRAM")]
    adapter_ram: Option<u64>,
    driver_version: Option<String>,
    driver_date: Option<String>,
}

/// Monta o relatório a partir do JSON do PowerShell (objeto ou lista).
pub fn report_from_json(json: &str) -> Report {
    let list: Vec<Wmi> = serde_json::from_str::<Vec<Wmi>>(json).or_else(|_| serde_json::from_str::<Wmi>(json).map(|w| vec![w])).unwrap_or_default();
    let gpus = list
        .into_iter()
        .filter_map(|w| {
            let name = w.name?.trim().to_string();
            let (kind, vendor, mut score, mut opengl33) = classify(&name);
            let legacy = intel_legacy(&name, w.driver_version.as_deref());
            if legacy {
                (score, opengl33) = (0, false);
            }
            Some(Gpu {
                legacy,
                note: legacy.then(|| "Intel HD de 2011 ou anterior: vai no máximo até o OpenGL 3.1 e este já é o último driver que a Intel lançou para ela.".to_string()),
                kind: kind.into(),
                vendor: vendor.map(Into::into),
                vram_mb: w.adapter_ram.filter(|&b| b > 0).map(|b| b / 1_048_576),
                driver_version: w.driver_version.filter(|s| !s.is_empty()),
                driver_date: w.driver_date.filter(|s| s.len() >= 10).map(|s| s[..10].to_string()),
                score,
                opengl33,
                name,
            })
        })
        .collect();
    recommend(gpus)
}

pub fn recommend(gpus: Vec<Gpu>) -> Report {
    let real: Vec<usize> = (0..gpus.len()).filter(|&i| gpus[i].kind != "basic").collect();
    let hybrid = real.iter().any(|&i| gpus[i].kind == "integrated") && real.iter().any(|&i| gpus[i].kind == "dedicated");
    let best = real.iter().copied().filter(|&i| gpus[i].opengl33).max_by_key(|&i| gpus[i].score);
    let (suggestion, reason) = match best {
        None if gpus.iter().any(|g| g.kind == "basic") && real.is_empty() => (
            "auto",
            "O Windows está usando o adaptador básico: a placa de vídeo está sem driver. Instale o driver do fabricante para o modpack abrir.".to_string(),
        ),
        None => (
            "auto",
            "A placa de vídeo deste PC não tem OpenGL 3.3, que o modpack (Angelica) exige, e nenhum driver resolve. Para jogar o Forbidden é preciso uma placa de vídeo dedicada (em PC de mesa, um modelo de entrada como GT 1030, GTX 1050 ou RX 550 já serve).".to_string(),
        ),
        Some(i) if !hybrid => ("auto", format!("{} é a placa deste PC. Mantenha o driver em dia para o melhor desempenho.", gpus[i].name)),
        Some(i) => {
            let g = &gpus[i];
            let other = real.iter().copied().filter(|&j| j != i).max_by_key(|&j| gpus[j].score).map(|j| &gpus[j]);
            match other {
                // diferença pequena: as duas servem; a integrada esquenta menos e gasta menos bateria
                Some(o) if g.score.abs_diff(o.score) <= 10 => (
                    if g.kind == "integrated" || o.kind == "integrated" { "integrated" } else { "auto" },
                    format!("{} e {} têm desempenho parecido no Forbidden. A integrada costuma ser mais estável com o Angelica, esquenta menos e economiza bateria; teste as duas e fique com a que der mais FPS.", g.name, o.name),
                ),
                _ => (
                    if g.kind == "dedicated" { "dedicated" } else { "integrated" },
                    format!("{} é bem mais forte para o Forbidden. Use-a para ter mais FPS (no notebook, jogue na tomada).", g.name),
                ),
            }
        }
    };
    // o selo "Recomendada" segue a sugestão (com placas parecidas, a integrada)
    let recommended = match suggestion {
        "integrated" => real.iter().copied().filter(|&i| gpus[i].kind == "integrated" && gpus[i].opengl33).max_by_key(|&i| gpus[i].score).or(best),
        _ => best,
    };
    Report { recommended, suggestion: suggestion.into(), reason, hybrid, gpus }
}

#[cfg(windows)]
fn hidden(cmd: &mut std::process::Command) -> &mut std::process::Command {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0000) // CREATE_NO_WINDOW
}

/// Placas do PC (Windows: Win32_VideoController).
pub fn detect() -> Report {
    #[cfg(windows)]
    {
        let script = "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion,@{n='DriverDate';e={if($_.DriverDate){$_.DriverDate.ToString('yyyy-MM-dd')}}} | ConvertTo-Json -Compress";
        let out = hidden(std::process::Command::new("powershell").args(["-NoProfile", "-NonInteractive", "-Command", script])).output();
        if let Ok(o) = out {
            return report_from_json(&String::from_utf8_lossy(&o.stdout));
        }
    }
    // fora do Windows não há o que consultar
    report_from_json("[]")
}

const GPU_PREFS: &str = r"HKCU\Software\Microsoft\DirectX\UserGpuPreferences";

/// Aplica a placa escolhida ao Java do jogo: integrated | dedicated | auto (Windows decide).
pub fn apply_preference(java: &std::path::Path, pref: &str) -> Option<&'static str> {
    #[cfg(windows)]
    {
        let exe = java.to_string_lossy().into_owned();
        let mut cmd = std::process::Command::new("reg");
        let label = match pref {
            "integrated" => {
                cmd.args(["add", GPU_PREFS, "/v", &exe, "/t", "REG_SZ", "/d", "GpuPreference=1;", "/f"]);
                "integrada (economia de energia)"
            }
            "dedicated" => {
                cmd.args(["add", GPU_PREFS, "/v", &exe, "/t", "REG_SZ", "/d", "GpuPreference=2;", "/f"]);
                "dedicada (alto desempenho)"
            }
            _ => {
                cmd.args(["delete", GPU_PREFS, "/v", &exe, "/f"]);
                "automática (o Windows decide)"
            }
        };
        let _ = hidden(&mut cmd).output();
        Some(label)
    }
    #[cfg(not(windows))]
    {
        let _ = (java, pref, GPU_PREFS);
        None
    }
}

#[tauri::command]
pub async fn gpu_info() -> Report {
    tokio::task::spawn_blocking(detect).await.unwrap_or_else(|_| recommend(Vec::new()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifica_placas_comuns() {
        assert_eq!(classify("Intel(R) UHD Graphics 620").0, "integrated");
        assert_eq!(classify("NVIDIA GeForce MX150").0, "dedicated");
        assert_eq!(classify("AMD Radeon(TM) Graphics").0, "integrated");
        assert_eq!(classify("AMD Radeon RX 580 Series").0, "dedicated");
        assert_eq!(classify("Microsoft Basic Display Adapter").0, "basic");
        assert!(!classify("Intel(R) HD Graphics 3000").3, "HD 3000 não tem OpenGL 3.3");
        assert!(classify("Intel(R) HD Graphics 4600").3);
        assert!(classify("NVIDIA GeForce RTX 3060").2 > classify("Intel(R) Iris(R) Xe Graphics").2);
    }

    #[test]
    fn notebook_com_placa_bem_mais_forte() {
        let r = report_from_json(r#"[{"Name":"Intel(R) UHD Graphics 630","AdapterRAM":1073741824,"DriverVersion":"31.0.101.2111","DriverDate":"2023-02-10"},{"Name":"NVIDIA GeForce GTX 1650","AdapterRAM":4293918720,"DriverVersion":"31.0.15.5222","DriverDate":"2024-03-01"}]"#);
        assert!(r.hybrid);
        assert_eq!(r.suggestion, "dedicated");
        assert_eq!(r.gpus[r.recommended.unwrap()].name, "NVIDIA GeForce GTX 1650");
        assert_eq!(r.gpus[0].vram_mb, Some(1024));
        assert_eq!(r.gpus[1].driver_date.as_deref(), Some("2024-03-01"));
    }

    #[test]
    fn notebook_com_placas_parecidas_sugere_a_integrada() {
        let r = report_from_json(r#"[{"Name":"Intel(R) Iris(R) Xe Graphics"},{"Name":"NVIDIA GeForce MX450"}]"#);
        assert!(r.hybrid);
        assert_eq!(r.suggestion, "integrated");
        assert!(r.reason.contains("teste as duas"));
        assert_eq!(r.gpus[r.recommended.unwrap()].kind, "integrated", "o selo segue a sugestão");
    }

    #[test]
    fn intel_hd_de_2011_e_incompativel() {
        // i5-2400: o Windows mostra só "Intel(R) HD Graphics" com o driver final de 2016
        let r = report_from_json(r#"{"Name":"Intel(R) HD Graphics","AdapterRAM":2147483648,"DriverVersion":"9.17.10.4459","DriverDate":"2016-05-18"}"#);
        let g = &r.gpus[0];
        assert!(g.legacy && !g.opengl33);
        assert_eq!(r.recommended, None);
        assert!(r.reason.contains("placa de vídeo dedicada"));
        // a mesma placa com driver de uma geração nova (Haswell) continua aceita
        assert!(!intel_legacy("Intel(R) HD Graphics", Some("20.19.15.5107")));
    }

    #[test]
    fn pc_com_uma_placa_e_sem_driver() {
        let one = report_from_json(r#"{"Name":"AMD Radeon RX 6600"}"#);
        assert!(!one.hybrid);
        assert_eq!(one.suggestion, "auto");
        let basic = report_from_json(r#"{"Name":"Microsoft Basic Display Adapter"}"#);
        assert_eq!(basic.recommended, None);
        assert!(basic.reason.contains("sem driver"));
        assert!(report_from_json("").gpus.is_empty());
    }
}

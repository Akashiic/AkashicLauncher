//! Diagnóstico de crashes: lê o relatório de erro do Minecraft (ou o log) e
//! reconhece problemas comuns que o jogador consegue resolver sozinho, com o
//! passo a passo e, no caso da placa de vídeo, o site certo para baixar o driver.

use serde::Serialize;

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct Link {
    pub label: String,
    pub url: String,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Diagnosis {
    /// gpu_driver | memory | duplicate_mods | missing_mods
    pub kind: String,
    pub title: String,
    pub body: String,
    pub steps: Vec<String>,
    /// placas de vídeo encontradas no PC (só no caso de vídeo)
    pub gpus: Vec<String>,
    pub links: Vec<Link>,
    /// trecho do relatório que mostra o erro
    pub evidence: String,
}

fn link(label: &str, url: &str) -> Link {
    Link { label: label.into(), url: url.into() }
}

const NVIDIA: (&str, &str) = ("Driver NVIDIA", "https://www.nvidia.com/pt-br/drivers/");
const AMD: (&str, &str) = ("Driver AMD Radeon", "https://www.amd.com/pt/support/download/drivers.html");
const INTEL: (&str, &str) = ("Driver Intel", "https://www.intel.com.br/content/www/br/pt/support/detect.html");

/// Fabricante pelo nome da placa (como o Windows mostra).
fn vendor(gpu: &str) -> Option<(&'static str, &'static str)> {
    let g = gpu.to_ascii_lowercase();
    if g.contains("nvidia") || g.contains("geforce") || g.contains("quadro") || g.contains("rtx") || g.contains("gtx") {
        Some(NVIDIA)
    } else if g.contains("amd") || g.contains("radeon") || g.contains("ati ") {
        Some(AMD)
    } else if g.contains("intel") || g.contains("iris") || g.contains("uhd graphics") || g.contains("hd graphics") {
        Some(INTEL)
    } else {
        None
    }
}

/// Placa sem driver: o Windows usa o adaptador genérico.
fn generic(gpu: &str) -> bool {
    let g = gpu.to_ascii_lowercase();
    g.contains("basic display") || g.contains("vídeo básico") || g.contains("video básico") || g.contains("basic render")
}

/// Primeira linha do texto que contém um dos padrões (para mostrar ao jogador).
fn evidence(text: &str, patterns: &[&str]) -> Option<String> {
    text.lines().map(str::trim).find(|l| patterns.iter().any(|p| l.contains(p))).map(|l| l.chars().take(300).collect())
}

/// Reconhece o problema no relatório de crash / log. `gpus` só é usado no caso de vídeo.
pub fn diagnose(text: &str, gpus: impl FnOnce() -> Vec<String>) -> Option<Diagnosis> {
    const GPU: &[&str] = &[
        "Pixel format not accelerated",
        "OpenGL 3.3 core profile",
        "No OpenGL context found in the current thread",
        "Could not create context",
        "Unable to create OpenGL context",
        "WGL_ARB_create_context",
    ];
    if let Some(ev) = evidence(text, GPU) {
        return Some(gpu_driver(ev, gpus()));
    }
    if let Some(ev) = evidence(text, &["java.lang.OutOfMemoryError", "GC overhead limit exceeded"]) {
        return Some(Diagnosis {
            kind: "memory".into(),
            title: "O jogo ficou sem memória".into(),
            body: "O Minecraft usou toda a RAM reservada para ele e fechou. Modpacks grandes como o Forbidden precisam de pelo menos 6 GB.".into(),
            steps: vec![
                "Abra Configurações → Desempenho no launcher.".into(),
                "Aumente a memória para 6 a 8 GB (deixe pelo menos 4 GB livres para o Windows).".into(),
                "Feche o navegador e outros programas pesados antes de jogar.".into(),
            ],
            gpus: vec![],
            links: vec![],
            evidence: ev,
        });
    }
    if let Some(ev) = evidence(text, &["DuplicateModsFoundException", "Found a duplicate mod"]) {
        return Some(Diagnosis {
            kind: "duplicate_mods".into(),
            title: "Há um mod duplicado".into(),
            body: "Existem duas cópias do mesmo mod na pasta mods/ (geralmente de versões diferentes), e o Forge não abre assim.".into(),
            steps: vec![
                "Se você colocou algum mod à mão, tire-o da pasta mods/.".into(),
                "Use Configurações → Verificar arquivos para o launcher restaurar o modpack original.".into(),
            ],
            gpus: vec![],
            links: vec![],
            evidence: ev,
        });
    }
    if let Some(ev) = evidence(text, &["MissingModsException", "Missing Mods:", "requires mods"]) {
        return Some(Diagnosis {
            kind: "missing_mods".into(),
            title: "Está faltando um mod".into(),
            body: "Um mod precisa de outro que não está instalado. Normalmente é um arquivo do modpack que sumiu ou foi apagado.".into(),
            steps: vec!["Use Configurações → Verificar arquivos para o launcher restaurar o que falta.".into(), "Se continuar, avise a equipe com o relatório de erro.".into()],
            gpus: vec![],
            links: vec![],
            evidence: ev,
        });
    }
    None
}

fn gpu_driver(evidence: String, gpus: Vec<String>) -> Diagnosis {
    let real: Vec<&String> = gpus.iter().filter(|g| !generic(g)).collect();
    let only_generic = !gpus.is_empty() && real.is_empty();
    // sites dos fabricantes encontrados; sem nada reconhecível, mostra os três
    let mut links: Vec<Link> = Vec::new();
    for (label, url) in real.iter().filter_map(|g| vendor(g)) {
        if !links.iter().any(|l| l.url == url) {
            links.push(link(label, url));
        }
    }
    if links.is_empty() {
        links = vec![link(NVIDIA.0, NVIDIA.1), link(AMD.0, AMD.1), link(INTEL.0, INTEL.1)];
    }
    let body = if only_generic {
        "O Windows está usando o \"Adaptador de Vídeo Básico da Microsoft\", ou seja, a placa de vídeo está sem driver. O modpack precisa de OpenGL 3.3, que só funciona com o driver do fabricante instalado.".to_string()
    } else if let Some(g) = real.first() {
        format!("A placa de vídeo ({g}) não conseguiu abrir o modo gráfico OpenGL 3.3 que o modpack exige. Quase sempre é o driver desatualizado ou corrompido.")
    } else {
        "A placa de vídeo não conseguiu abrir o modo gráfico OpenGL 3.3 que o modpack exige. Quase sempre é falta de driver ou driver desatualizado.".to_string()
    };
    let mut steps = vec![
        "Baixe e instale o driver mais novo no site do fabricante (botão abaixo).".to_string(),
        "Reinicie o PC e clique em JOGAR de novo.".to_string(),
    ];
    if real.len() > 1 {
        steps.push("Notebook com duas placas: instale o driver das duas (a integrada e a dedicada).".into());
    }
    steps.push("Não abra o jogo pela Área de Trabalho Remota: ela desliga a aceleração de vídeo.".into());
    steps.push("Placas muito antigas (ex.: Intel HD 2000/3000) não têm OpenGL 3.3 e não rodam o modpack.".into());
    Diagnosis {
        kind: "gpu_driver".into(),
        title: if only_generic { "Placa de vídeo sem driver".into() } else { "Atualize o driver da placa de vídeo".into() },
        body,
        steps,
        gpus,
        links,
        evidence,
    }
}

/// Nomes das placas de vídeo do PC.
pub fn detect_gpus() -> Vec<String> {
    super::gpu::detect().gpus.into_iter().map(|g| g.name).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const ANGELICA: &str = "java.lang.RuntimeException: Angelica requires an OpenGL 3.3 core profile context and could not create one. Last error: Pixel format not accelerated. Update or install the GPU driver.\n\tat net.minecraftforge.client.ForgeHooksClient.createDisplay\nCaused by: org.lwjgl.LWJGLException: Pixel format not accelerated";

    #[test]
    fn placa_sem_driver() {
        let d = diagnose(ANGELICA, || vec!["Microsoft Basic Display Adapter".into()]).unwrap();
        assert_eq!(d.kind, "gpu_driver");
        assert_eq!(d.title, "Placa de vídeo sem driver");
        assert_eq!(d.links.len(), 3, "sem fabricante conhecido mostra os três sites");
        assert!(d.evidence.contains("OpenGL 3.3"));
    }

    #[test]
    fn notebook_intel_e_nvidia() {
        let d = diagnose(ANGELICA, || vec!["Intel(R) UHD Graphics 620".into(), "NVIDIA GeForce MX150".into()]).unwrap();
        let urls: Vec<_> = d.links.iter().map(|l| l.url.as_str()).collect();
        assert_eq!(urls, vec![INTEL.1, NVIDIA.1]);
        assert!(d.body.contains("Intel(R) UHD Graphics 620"));
        assert!(d.steps.iter().any(|s| s.contains("duas placas")));
    }

    #[test]
    fn radeon() {
        let d = diagnose(ANGELICA, || vec!["AMD Radeon RX 580 Series".into()]).unwrap();
        assert_eq!(d.links, vec![link(AMD.0, AMD.1)]);
    }

    #[test]
    fn outros_crashes() {
        let never = || -> Vec<String> { panic!("só consulta a placa no caso de vídeo") };
        assert_eq!(diagnose("java.lang.OutOfMemoryError: Java heap space", never).unwrap().kind, "memory");
        assert_eq!(diagnose("cpw.mods.fml.common.DuplicateModsFoundException", never).unwrap().kind, "duplicate_mods");
        assert_eq!(diagnose("cpw.mods.fml.common.MissingModsException: Mod x requires y", never).unwrap().kind, "missing_mods");
        assert!(diagnose("java.lang.NullPointerException at foo", never).is_none());
    }
}

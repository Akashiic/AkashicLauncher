//! Leitura de um .zip remoto por pedaços (HTTP Range), sem baixá-lo inteiro.
//!
//! Base da atualização incremental do modpack: lê só o índice do .zip (central
//! directory, algumas dezenas de KB), compara o CRC-32 de cada arquivo com o que
//! está instalado e busca apenas os arquivos que mudaram. Suporta Zip64.

use std::path::Path;

use anyhow::{anyhow, bail, Context, Result};
use futures_util::{stream, StreamExt};
use reqwest::{header, StatusCode};

use super::net::Net;
use super::progress::Progress;

#[derive(Clone, Debug)]
pub struct Entry {
    pub name: String,
    pub crc32: u32,
    pub comp_size: u64,
    pub size: u64,
    pub method: u16,
    pub local_offset: u64,
    pub is_dir: bool,
}

/// O servidor não aceita pedaços (Range): quem chama usa o download completo.
#[derive(Debug)]
pub struct RangeUnsupported;
impl std::fmt::Display for RangeUnsupported {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("o servidor não aceita downloads parciais")
    }
}
impl std::error::Error for RangeUnsupported {}

fn u16le(b: &[u8], i: usize) -> u16 {
    u16::from_le_bytes([b[i], b[i + 1]])
}
fn u32le(b: &[u8], i: usize) -> u32 {
    u32::from_le_bytes([b[i], b[i + 1], b[i + 2], b[i + 3]])
}
fn u64le(b: &[u8], i: usize) -> u64 {
    u64::from_le_bytes(b[i..i + 8].try_into().unwrap())
}

/// Busca `[start, end)` do arquivo remoto. Exige resposta 206 (parcial).
async fn range(net: &Net, url: &str, start: u64, end: u64, prog: Option<&Progress>) -> Result<Vec<u8>> {
    net.check()?;
    let resp = net
        .client()
        .get(url)
        .header(header::RANGE, format!("bytes={start}-{}", end - 1))
        .send()
        .await?
        .error_for_status()?;
    if resp.status() != StatusCode::PARTIAL_CONTENT {
        return Err(RangeUnsupported.into());
    }
    let mut out = Vec::with_capacity((end - start) as usize);
    let mut body = resp.bytes_stream();
    while let Some(chunk) = body.next().await {
        net.check()?;
        let chunk = chunk?;
        if let Some(p) = prog {
            p.add_bytes(chunk.len() as u64);
        }
        out.extend_from_slice(&chunk);
    }
    if out.len() as u64 != end - start {
        bail!("resposta parcial com tamanho inesperado");
    }
    Ok(out)
}

async fn range_retry(net: &Net, url: &str, start: u64, end: u64, prog: Option<&Progress>) -> Result<Vec<u8>> {
    let mut last = None;
    for attempt in 0..4u64 {
        match range(net, url, start, end, prog).await {
            Ok(v) => return Ok(v),
            Err(e) if super::net::is_cancelled(&e) || e.is::<RangeUnsupported>() => return Err(e),
            Err(e) => {
                last = Some(e);
                tokio::time::sleep(std::time::Duration::from_millis(500 * (attempt + 1))).await;
            }
        }
    }
    Err(last.unwrap())
}

/// Últimos `len` bytes do arquivo + tamanho total (do cabeçalho Content-Range).
async fn tail(net: &Net, url: &str, len: u64) -> Result<(Vec<u8>, u64)> {
    let resp = net.client().get(url).header(header::RANGE, format!("bytes=-{len}")).send().await?.error_for_status()?;
    if resp.status() != StatusCode::PARTIAL_CONTENT {
        return Err(RangeUnsupported.into());
    }
    let total = resp
        .headers()
        .get(header::CONTENT_RANGE)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.rsplit('/').next())
        .and_then(|t| t.trim().parse::<u64>().ok())
        .ok_or(RangeUnsupported)?;
    Ok((resp.bytes().await?.to_vec(), total))
}

/// Índice de um .zip remoto: entradas e tamanho total do arquivo.
pub struct RemoteZip {
    pub entries: Vec<Entry>,
    pub total: u64,
}

/// Lê o índice (central directory) do .zip remoto.
pub async fn read_index(net: &Net, url: &str) -> Result<RemoteZip> {
    net.check()?;
    // EOCD fica nos últimos 22 bytes + até 64 KB de comentário
    let (tail, total) = tail(net, url, 66_000).await?;
    let tail_start = total - tail.len() as u64;
    let eocd = (0..tail.len().saturating_sub(21))
        .rev()
        .find(|&i| u32le(&tail, i) == 0x0605_4b50)
        .ok_or_else(|| anyhow!("fim do .zip não encontrado"))?;
    let mut count = u16le(&tail, eocd + 10) as u64;
    let mut cd_size = u32le(&tail, eocd + 12) as u64;
    let mut cd_offset = u32le(&tail, eocd + 16) as u64;

    // Zip64: o localizador fica 20 bytes antes do EOCD
    if (count == 0xFFFF || cd_size == 0xFFFF_FFFF || cd_offset == 0xFFFF_FFFF) && eocd >= 20 && u32le(&tail, eocd - 20) == 0x0706_4b50 {
        let rec_off = u64le(&tail, eocd - 20 + 8);
        let rec = if rec_off >= tail_start {
            tail[(rec_off - tail_start) as usize..].to_vec()
        } else {
            range_retry(net, url, rec_off, rec_off + 56, None).await?
        };
        if u32le(&rec, 0) != 0x0606_4b50 {
            bail!("registro Zip64 inválido");
        }
        count = u64le(&rec, 32);
        cd_size = u64le(&rec, 40);
        cd_offset = u64le(&rec, 48);
    }

    let cd = if cd_offset >= tail_start {
        let s = (cd_offset - tail_start) as usize;
        tail[s..s + cd_size as usize].to_vec()
    } else {
        range_retry(net, url, cd_offset, cd_offset + cd_size, None).await?
    };
    Ok(RemoteZip { entries: parse_index(&cd, count as usize)?, total })
}

fn parse_index(cd: &[u8], count: usize) -> Result<Vec<Entry>> {
    let mut out = Vec::with_capacity(count);
    let mut i = 0usize;
    while i + 46 <= cd.len() && u32le(cd, i) == 0x0201_4b50 {
        let method = u16le(cd, i + 10);
        let crc32 = u32le(cd, i + 16);
        let mut comp_size = u32le(cd, i + 20) as u64;
        let mut size = u32le(cd, i + 24) as u64;
        let name_len = u16le(cd, i + 28) as usize;
        let extra_len = u16le(cd, i + 30) as usize;
        let comment_len = u16le(cd, i + 32) as usize;
        let mut local_offset = u32le(cd, i + 42) as u64;
        let name_bytes = cd.get(i + 46..i + 46 + name_len).context("índice do .zip truncado")?;
        let name = String::from_utf8_lossy(name_bytes).replace('\\', "/");
        // campo extra Zip64 (id 0x0001): só traz os valores que estouraram 32 bits
        let mut e = i + 46 + name_len;
        let extra_end = e + extra_len;
        while e + 4 <= extra_end.min(cd.len()) {
            let id = u16le(cd, e);
            let len = u16le(cd, e + 2) as usize;
            if id == 0x0001 {
                let mut p = e + 4;
                if size == 0xFFFF_FFFF {
                    size = u64le(cd, p);
                    p += 8;
                }
                if comp_size == 0xFFFF_FFFF {
                    comp_size = u64le(cd, p);
                    p += 8;
                }
                if local_offset == 0xFFFF_FFFF {
                    local_offset = u64le(cd, p);
                }
            }
            e += 4 + len;
        }
        out.push(Entry { is_dir: name.ends_with('/'), name, crc32, comp_size, size, method, local_offset });
        i = extra_end + comment_len;
    }
    if out.len() != count && count != 0xFFFF {
        bail!("índice do .zip incompleto ({} de {count} entradas)", out.len());
    }
    Ok(out)
}

/// Descompacta os bytes de uma entrada (a partir do cabeçalho local) e confere o CRC.
fn decode(entry: &Entry, buf: &[u8]) -> Result<Vec<u8>> {
    if buf.len() < 30 || u32le(buf, 0) != 0x0403_4b50 {
        bail!("cabeçalho local inválido em {}", entry.name);
    }
    let start = 30 + u16le(buf, 26) as usize + u16le(buf, 28) as usize;
    let data = buf.get(start..start + entry.comp_size as usize).with_context(|| format!("dados truncados em {}", entry.name))?;
    let out = match entry.method {
        0 => data.to_vec(),
        8 => {
            use std::io::Read;
            let mut v = Vec::with_capacity(entry.size as usize);
            flate2::read::DeflateDecoder::new(data).read_to_end(&mut v)?;
            v
        }
        m => bail!("compressão {m} não suportada em {}", entry.name),
    };
    if out.len() as u64 != entry.size || crc32fast::hash(&out) != entry.crc32 {
        bail!("CRC-32 não confere em {}", entry.name);
    }
    Ok(out)
}

/// Bytes que a busca das entradas vai transferir (aproximado: inclui cabeçalhos).
pub fn transfer_size(entries: &[&Entry]) -> u64 {
    entries.iter().map(|e| e.comp_size + 30 + e.name.len() as u64 + 64).sum()
}

/// Baixa só as entradas pedidas, agrupando as vizinhas em poucas requisições,
/// e entrega cada arquivo já descompactado e conferido para `save`.
pub async fn fetch_entries<F>(net: &Net, url: &str, total: u64, entries: Vec<Entry>, prog: &Progress, save: F) -> Result<()>
where
    F: Fn(&Entry, Vec<u8>) -> Result<()> + Sync,
{
    // cabeçalho local = 30 bytes + nome + extra (o extra local pode diferir do índice)
    const SLACK: u64 = 30 + 1024;
    const GAP: u64 = 256 * 1024;
    const GROUP_MAX: u64 = 24 * 1024 * 1024;
    let mut sorted = entries;
    sorted.sort_by_key(|e| e.local_offset);
    let mut groups: Vec<Vec<Entry>> = Vec::new();
    for e in sorted {
        let end = e.local_offset + e.comp_size + SLACK + e.name.len() as u64;
        if let Some(g) = groups.last_mut() {
            let g_start = g[0].local_offset;
            let g_end = g.iter().map(|x| x.local_offset + x.comp_size + SLACK + x.name.len() as u64).max().unwrap();
            if e.local_offset <= g_end + GAP && end - g_start <= GROUP_MAX {
                g.push(e);
                continue;
            }
        }
        groups.push(vec![e]);
    }
    let save = &save;
    let results: Vec<Result<()>> = stream::iter(groups)
        .map(|g| async move {
            let start = g[0].local_offset;
            // a folga do cabeçalho pode passar do fim do arquivo: pede só o que existe
            let end = g.iter().map(|x| x.local_offset + x.comp_size + SLACK + x.name.len() as u64).max().unwrap().min(total);
            prog.set_current(g[0].name.rsplit('/').next().unwrap_or_default().to_string());
            let bytes = range_retry(net, url, start, end, Some(prog)).await?;
            for e in &g {
                let off = (e.local_offset - start) as usize;
                let data = decode(e, &bytes[off..])?;
                save(e, data)?;
                prog.file_done();
            }
            Ok(())
        })
        .buffer_unordered(4)
        .collect()
        .await;
    for r in results {
        r?;
    }
    Ok(())
}

/// CRC-32 de um arquivo no disco (mesmo algoritmo do .zip).
pub fn crc32_file(path: &Path) -> Result<u32> {
    use std::io::Read;
    let mut f = std::fs::File::open(path)?;
    let mut h = crc32fast::Hasher::new();
    let mut buf = vec![0u8; 256 * 1024];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    Ok(h.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn indice_e_entradas_de_um_zip_real() {
        let mut buf = std::io::Cursor::new(Vec::new());
        {
            let mut z = zip::ZipWriter::new(&mut buf);
            let deflate = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
            let stored = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
            z.add_directory("mods/", stored).unwrap();
            z.start_file("mods/a.jar", deflate).unwrap();
            z.write_all(&b"conteudo do mod a ".repeat(500)).unwrap();
            z.start_file("config/b.cfg", stored).unwrap();
            z.write_all(b"B:enabled=true").unwrap();
            z.finish().unwrap();
        }
        let bytes = buf.into_inner();
        let n = bytes.len();
        let eocd = (0..n - 21).rev().find(|&i| u32le(&bytes, i) == 0x0605_4b50).unwrap();
        let count = u16le(&bytes, eocd + 10) as usize;
        let cd_size = u32le(&bytes, eocd + 12) as usize;
        let cd_off = u32le(&bytes, eocd + 16) as usize;
        let idx = parse_index(&bytes[cd_off..cd_off + cd_size], count).unwrap();
        assert_eq!(idx.len(), 3);
        assert!(idx[0].is_dir);
        for e in idx.iter().filter(|e| !e.is_dir) {
            let data = decode(e, &bytes[e.local_offset as usize..]).unwrap();
            assert_eq!(crc32fast::hash(&data), e.crc32);
        }
        let a = idx.iter().find(|e| e.name == "mods/a.jar").unwrap();
        assert_eq!(a.size, 18 * 500);
        assert!(a.comp_size < a.size, "deflate deveria comprimir");
    }
}

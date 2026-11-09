/**
 * Versões do modpack publicadas como releases no GitHub com o prefixo "TEOF-"
 * (ex.: TEOF-5.3). Mesma regra do launcher de celular: busca os releases, fica só
 * com as tags TEOF-, ordena pela versão e compara com a instalada.
 *
 * Usa a API pública do GitHub (sem login: 60 consultas/hora por IP), com cache
 * por ETag — respostas "304 Not Modified" não gastam o limite.
 */
export const MODPACK_SOURCE = {
  owner: 'Akashiic',
  repo: 'Technic-Forbidden',
  prefix: 'TEOF-',
} as const

/**
 * Lista de releases no formato da API do GitHub. `VITE_MODPACK_RELEASES_URL` (no build)
 * troca a fonte — útil para um canal de testes ou para testar com um pack local.
 */
export const RELEASES_URL =
  import.meta.env.VITE_MODPACK_RELEASES_URL || `https://api.github.com/repos/${MODPACK_SOURCE.owner}/${MODPACK_SOURCE.repo}/releases?per_page=100`
export const RELEASES_PAGE = `https://github.com/${MODPACK_SOURCE.owner}/${MODPACK_SOURCE.repo}/releases`

export interface ModpackAsset {
  name: string
  size: number // bytes
  url: string
  /** SHA-256 que o GitHub publica para o arquivo (campo `digest`), quando disponível. */
  sha256?: string
}

export interface ModpackRelease {
  tag: string // "TEOF-5.3"
  version: string // "5.3"
  parts: number[] // [5, 3]
  title: string
  notes: string
  publishedAt: string
  htmlUrl: string
  prerelease: boolean
  asset: ModpackAsset | null
}

interface GhAsset {
  name: string
  size: number
  browser_download_url: string
  digest?: string | null // "sha256:..."
}
interface GhRelease {
  tag_name: string
  name: string | null
  body: string | null
  draft: boolean
  prerelease: boolean
  published_at: string | null
  html_url: string
  assets: GhAsset[]
}

/** "TEOF-5.3" → { version: "5.3", parts: [5, 3] }; null se não for uma tag do modpack. */
export function parseTag(tag: string) {
  if (!tag.toUpperCase().startsWith(MODPACK_SOURCE.prefix)) return null
  const version = tag.slice(MODPACK_SOURCE.prefix.length).trim().replace(/^v/i, '')
  if (!/^\d+(\.\d+)*$/.test(version)) return null
  return { version, parts: version.split('.').map(Number) }
}

/** Compara versões numericamente por partes (5.10 > 5.9; 5.3 == 5.3.0). */
export function compareVersions(a: number[] | string, b: number[] | string) {
  const pa = typeof a === 'string' ? a.split('.').map(Number) : a
  const pb = typeof b === 'string' ? b.split('.').map(Number) : b
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d > 0 ? 1 : -1
  }
  return 0
}

/** Arquivo do modpack no release: o .zip (o maior, se houver mais de um). */
export function pickAsset(assets: GhAsset[]): ModpackAsset | null {
  const zips = assets.filter((a) => a.name.toLowerCase().endsWith('.zip'))
  const best = zips.sort((x, y) => y.size - x.size)[0]
  if (!best) return null
  const sha256 = best.digest?.startsWith('sha256:') ? best.digest.slice(7) : undefined
  return { name: best.name, size: best.size, url: best.browser_download_url, ...(sha256 ? { sha256 } : {}) }
}

/** Converte a resposta da API em versões TEOF-, da mais nova para a mais antiga. */
export function toModpackReleases(data: GhRelease[], includePrerelease = false): ModpackRelease[] {
  return data
    .filter((r) => !r.draft && (includePrerelease || !r.prerelease))
    .map((r) => {
      const v = parseTag(r.tag_name)
      if (!v) return null
      return {
        tag: r.tag_name,
        version: v.version,
        parts: v.parts,
        title: r.name?.trim() || r.tag_name,
        notes: (r.body ?? '').replace(/\r/g, '').trim(),
        publishedAt: r.published_at ?? '',
        htmlUrl: r.html_url,
        prerelease: r.prerelease,
        asset: pickAsset(r.assets ?? []),
      } satisfies ModpackRelease
    })
    .filter((r): r is ModpackRelease => r !== null)
    .sort((a, b) => compareVersions(b.parts, a.parts))
}

const CACHE_KEY = 'akashic.modpack.releases.v1'
interface Cache {
  etag: string | null
  fetchedAt: number
  data: GhRelease[]
}

function readCache(): Cache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as Cache) : null
  } catch {
    return null
  }
}
function writeCache(c: Cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c))
  } catch {
    /* sem armazenamento: segue sem cache */
  }
}

export interface FetchResult {
  releases: ModpackRelease[]
  fromCache: boolean
  fetchedAt: number
}

/** Busca as versões no GitHub; sem conexão, devolve o cache (se houver). */
export async function fetchModpackReleases(signal?: AbortSignal): Promise<FetchResult> {
  const cache = readCache()
  try {
    const res = await fetch(RELEASES_URL, {
      signal,
      // o cache HTTP do WebView poderia esconder uma versão nova: quem decide é o ETag abaixo
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(cache?.etag ? { 'If-None-Match': cache.etag } : {}),
      },
    })
    if (res.status === 304 && cache) {
      writeCache({ ...cache, fetchedAt: Date.now() })
      return { releases: toModpackReleases(cache.data), fromCache: false, fetchedAt: Date.now() }
    }
    if (!res.ok) throw new Error(res.status === 403 ? 'Limite de consultas ao GitHub atingido. Tente em alguns minutos.' : `GitHub respondeu ${res.status}.`)
    const data = (await res.json()) as GhRelease[]
    writeCache({ etag: res.headers.get('ETag'), fetchedAt: Date.now(), data })
    return { releases: toModpackReleases(data), fromCache: false, fetchedAt: Date.now() }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    if (cache) return { releases: toModpackReleases(cache.data), fromCache: true, fetchedAt: cache.fetchedAt }
    throw e instanceof Error ? e : new Error('Falha ao consultar o GitHub.')
  }
}

export const formatMB = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(bytes > 1024 ** 3 ? 0 : 1)} MB`

/** Dados do release que o núcleo em Rust precisa para instalar/atualizar. */
export function packRef(r: ModpackRelease | null | undefined) {
  if (!r?.asset) return null
  return { tag: r.tag, url: r.asset.url, size: r.asset.size, ...(r.asset.sha256 ? { sha256: r.asset.sha256 } : {}) }
}

/** "2 arquivos novos, 3 atualizados, 1 removido" a partir de um resumo de atualização. */
export function describeUpdate(s: { added: number; changed: number; removed: number; repaired: number }) {
  const parts: string[] = []
  const n = (v: number, one: string, many: string) => `${v} ${v === 1 ? one : many}`
  if (s.added) parts.push(n(s.added, 'arquivo novo', 'arquivos novos'))
  if (s.changed) parts.push(n(s.changed, 'atualizado', 'atualizados'))
  if (s.removed) parts.push(n(s.removed, 'removido', 'removidos'))
  if (s.repaired) parts.push(n(s.repaired, 'restaurado', 'restaurados'))
  return parts.join(', ')
}

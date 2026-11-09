/**
 * Flags da JVM para Java 8 + Forge 1.7.10. Fonte única dos presets e das explicações.
 * O campo de flags é livre (sem restrição): o launcher só avisa, nunca bloqueia.
 */
export type JvmPresetKey = 'fps' | 'default' | 'low'

/** Flags que o FML 1.7.10 recomenda para modpacks (evitam avisos e checagens desnecessárias). */
const FML = '-Dfml.ignorePatchDiscrepancies=true -Dfml.ignoreInvalidMinecraftCertificates=true'

/** Uma flag por linha no campo de edição (o comando final junta tudo com espaços). */
const lines = (s: string) => s.split(/\s+/).filter(Boolean).join('\n')

/** Flags em linha única, como vão para o comando do Java. */
export const normalizeFlags = (args: string) => args.split(/\s+/).filter(Boolean).join(' ')

const RAW_PRESETS: Record<JvmPresetKey, { label: string; hint: string; args: string }> = {
  fps: {
    label: 'Otimizado (recomendado)',
    hint: 'G1 ajustado para modpacks: menos travadas e coletas mais curtas.',
    args: `-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=16M -XX:+ParallelRefProcEnabled -XX:+DisableExplicitGC -XX:+UseStringDeduplication ${FML}`,
  },
  default: {
    label: 'Vanilla (Mojang)',
    hint: 'As mesmas flags do launcher oficial para Java 8.',
    args: '-XX:+UnlockExperimentalVMOptions -XX:+UseG1GC -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=50 -XX:G1HeapRegionSize=32M',
  },
  low: {
    label: 'PC fraco',
    hint: 'G1 leve, com menos threads. Use junto com 3–4 GB de RAM.',
    args: `-XX:+UseG1GC -XX:MaxGCPauseMillis=100 -XX:G1HeapRegionSize=8M -XX:+DisableExplicitGC -XX:ParallelGCThreads=2 -XX:ConcGCThreads=1 ${FML}`,
  },
}

export const JVM_PRESETS = Object.fromEntries(Object.entries(RAW_PRESETS).map(([k, p]) => [k, { ...p, args: lines(p.args) }])) as typeof RAW_PRESETS

export const RECOMMENDED_PRESET: JvmPresetKey = 'fps'

/** O que cada flag faz (para a lista "O que cada flag faz"). Chave = nome sem valor. */
const DOCS: Record<string, string> = {
  '-XX:+UseG1GC': 'Usa o coletor de lixo G1: pausas curtas e previsíveis, o melhor para o Minecraft no Java 8.',
  '-XX:+UnlockExperimentalVMOptions': 'Libera as opções experimentais usadas logo depois (G1NewSizePercent).',
  '-XX:G1NewSizePercent': 'Reserva uma fatia maior da memória para objetos novos — o Minecraft cria muitos, por pouco tempo.',
  '-XX:G1ReservePercent': 'Deixa memória de reserva para evitar coletas de emergência (as travadas longas).',
  '-XX:MaxGCPauseMillis': 'Meta de duração máxima de cada pausa do coletor, em milissegundos.',
  '-XX:G1HeapRegionSize': 'Tamanho de cada bloco de memória do G1. Blocos maiores lidam melhor com objetos grandes (chunks, texturas).',
  '-XX:+ParallelRefProcEnabled': 'Processa referências em paralelo, encurtando as pausas em modpacks com muitos mods.',
  '-XX:+DisableExplicitGC': 'Ignora mods que forçam coleta de lixo com System.gc() — causa comum de travadas na 1.7.10.',
  '-XX:+UseStringDeduplication': 'Junta textos repetidos na memória (nomes de blocos, itens, receitas), economizando RAM.',
  '-XX:ParallelGCThreads': 'Quantos núcleos o coletor usa nas pausas. Menos núcleos = mais folga para o jogo em PCs fracos.',
  '-XX:ConcGCThreads': 'Quantos núcleos o coletor usa em segundo plano.',
  '-XX:+AlwaysPreTouch': 'Reserva toda a RAM ao abrir: menos travadas depois, mas o jogo demora mais para iniciar.',
  '-XX:+UseConcMarkSweepGC': 'Coletor CMS (antigo). Obsoleto no Java 8 — prefira o G1.',
  '-Dfml.ignorePatchDiscrepancies': 'O Forge não reclama de diferenças nos patches (comum em modpacks).',
  '-Dfml.ignoreInvalidMinecraftCertificates': 'O Forge não bloqueia por certificados do Minecraft modificados.',
  '-Xmx': 'Memória máxima. Já é definida pelo controle de RAM — escrever aqui sobrescreve o controle.',
  '-Xms': 'Memória inicial. O launcher já define.',
  '-Xmn': 'Tamanho fixo da área de objetos novos. Com G1, atrapalha o ajuste automático — evite.',
}

export interface FlagInfo {
  flag: string
  doc: string | null
}

/** Separa as flags e associa a explicação (null = flag personalizada sem explicação). */
export function describeFlags(args: string): FlagInfo[] {
  return args
    .split(/\s+/)
    .filter(Boolean)
    .map((flag) => {
      const key = flag.startsWith('-Xmx') ? '-Xmx' : flag.startsWith('-Xms') ? '-Xms' : flag.startsWith('-Xmn') ? '-Xmn' : flag.split('=')[0]
      return { flag, doc: DOCS[key] ?? null }
    })
}

/** Avisos (nunca bloqueiam): coisas que costumam dar problema. */
export function flagWarnings(args: string): string[] {
  const w: string[] = []
  if (/(^|\s)-Xmx/.test(args)) w.push('Tem -Xmx nas flags: ele sobrescreve o controle de RAM acima.')
  if (/UseG1GC/.test(args) && /UseConcMarkSweepGC|UseParallelGC|UseSerialGC/.test(args)) w.push('Mais de um coletor de lixo ao mesmo tempo: a JVM pode não iniciar.')
  if (/G1NewSizePercent/.test(args) && !/UnlockExperimentalVMOptions/.test(args)) w.push('G1NewSizePercent precisa de -XX:+UnlockExperimentalVMOptions antes.')
  return w
}

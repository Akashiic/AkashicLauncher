// Conteúdo mock de notícias/changelog. Troque por um fetch do seu CMS/API depois.
import type { Tone } from '@/theme'
export interface NewsItem {
  id: string
  tag: 'Atualização' | 'Evento' | 'Correção' | 'Anúncio'
  title: string
  excerpt: string
  date: string
  version?: string
  accent: Tone // tom do tema usado no brilho/selo do card
  changes?: { type: 'add' | 'fix' | 'change' | 'remove'; text: string }[]
}

export const NEWS: NewsItem[] = [
  {
    id: 'v3-4',
    tag: 'Atualização',
    title: 'Patch 3.4 — Ecos do Vazio',
    excerpt: 'Nova dimensão customizada, rebalanceamento do Thaumcraft e +12 mods de magia.',
    date: '05 Nov 2026',
    version: '3.4.0',
    accent: 'accent',
    changes: [
      { type: 'add', text: 'Dimensão "Vazio Akáshico" com bioma flutuante e boss final.' },
      { type: 'add', text: 'Mods: Blood Magic 1.3.3, Witchery 0.24.1, Ars Magica 2 (1.4.0.009).' },
      { type: 'change', text: 'Thaumcraft: custo de pesquisa de Infusão reduzido em 15%.' },
      { type: 'fix', text: 'Corrigido crash ao abrir NEI com AE2 terminal aberto.' },
      { type: 'remove', text: 'Removido Mo\' Creatures por impacto de TPS.' },
    ],
  },
  {
    id: 'evt-halloween',
    tag: 'Evento',
    title: 'Noite das Brasas — Evento PvE',
    excerpt: 'Hordas noturnas, drops exclusivos e ranking semanal com recompensas cosméticas.',
    date: '01 Nov 2026',
    accent: 'warning',
  },
  {
    id: 'v3-3-2',
    tag: 'Correção',
    title: 'Hotfix 3.3.2 — Estabilidade',
    excerpt: 'Memory leak do Railcraft resolvido, chunks carregando 30% mais rápido.',
    date: '24 Out 2026',
    version: '3.3.2',
    accent: 'success',
    changes: [
      { type: 'fix', text: 'Memory leak em túneis de Railcraft com carrinhos parados.' },
      { type: 'fix', text: 'Dessincronização de inventário com Inventory Tweaks.' },
      { type: 'change', text: 'Pregeneração do mundo principal ampliada para 12k blocos.' },
    ],
  },
  {
    id: 'v3-3',
    tag: 'Atualização',
    title: 'Patch 3.3 — Engrenagens de Ferro',
    excerpt: 'Linha tech expandida: GregTech-lite, Mekanism 9 e novas quests no HQM.',
    date: '10 Out 2026',
    version: '3.3.0',
    accent: 'accent',
    changes: [
      { type: 'add', text: 'Mekanism 9.1.1 + Mekanism Generators.' },
      { type: 'add', text: '64 novas quests de progressão tecnológica.' },
      { type: 'change', text: 'Spawn reformulado com portais para todas as dimensões.' },
    ],
  },
  {
    id: 'ann-season',
    tag: 'Anúncio',
    title: 'Temporada 4 começa em Dezembro',
    excerpt: 'Reset parcial do mundo de recursos, mapa novo e pass de temporada gratuito.',
    date: '02 Out 2026',
    accent: 'muted',
  },
]

export const CORE_MODS = [
  ['Applied Energistics 2', 'rv3-beta-6', 'Tech'],
  ['Thaumcraft', '4.2.3.5', 'Magia'],
  ['Botania', 'r1.8-249', 'Magia'],
  ['Tinkers\' Construct', '1.8.8', 'Ferramentas'],
  ['IndustrialCraft 2', '2.2.827', 'Tech'],
  ['BuildCraft', '7.1.23', 'Tech'],
  ['Mekanism', '9.1.1', 'Tech'],
  ['Ender IO', '2.3.0.429', 'Tech'],
  ['Railcraft', '9.12.2.0', 'Transporte'],
  ['Witchery', '0.24.1', 'Magia'],
  ['Blood Magic', '1.3.3-17', 'Magia'],
  ['Biomes O\' Plenty', '2.1.0', 'Mundo'],
  ['Extra Utilities', '1.2.12', 'Utilidade'],
  ['Thermal Expansion', '4.1.5', 'Tech'],
  ['Not Enough Items', '1.0.5.120', 'Utilidade'],
  ['Hardcore Questing Mode', '4.4.4', 'Progressão'],
  ['Chisel 2', '2.9.5.11', 'Decoração'],
  ['Carpenter\'s Blocks', '3.3.8', 'Decoração'],
  ['Ars Magica 2', '1.4.0.009', 'Magia'],
  ['Forestry', '4.2.16.64', 'Mundo'],
] as const

# Forbidden Series Launcher

> **Entre no Proibido.**

Launcher desktop (UI/UX + áudio + estado) para o servidor **Minecraft 1.7.10 Modded**.
Download de arquivos e execução do Java são **simulados** — toda a experiência é testável.

**Stack:** Electron (frameless) · React 18 + TypeScript · Vite · Tailwind CSS · Framer Motion · Zustand · Web Audio API.

## Rodando

```bash
npm install
npm run dev:electron   # app desktop (Vite + Electron)
npm run dev            # só no navegador: http://localhost:5173
npm run build          # typecheck + build de produção (dist/)
npm start              # Electron carregando o build de dist/
```

## Estrutura

```
electron/main.cjs        janela frameless, IPC de janela, settings.json em userData
electron/preload.cjs     ponte segura (window.akashic)
src/audio/AudioManager   barramentos BGM / SFX / SBFX, síntese + suporte a arquivos
src/store/               settings (persistente), launch (máquina de estados mock), server, ui, toasts
src/components/fx        partículas em canvas + fundo em camadas com parallax
src/components/home      status do servidor, cards, Action Bar e botão JOGAR
src/components/settings  abas: Desempenho & Java, Jogo & Vídeo, Mods Opcionais, Áudio & Estética
src/pages/               Início, Modpack, Changelog, Configurações
```

## Tema (Forbidden Series)

Todas as cores, fontes, raios e sombras ficam em **um único arquivo: `src/theme/tokens.css`**.

- `tailwind.config.js` só expõe classes que apontam para esses tokens (`bg-brand`, `text-muted`, `border-line`...). A paleta padrão do Tailwind está desativada, então não dá para usar cores fora do tema.
- `src/theme/index.ts` lê os mesmos tokens para Canvas/SVG (partículas, avatar).
- Fontes empacotadas offline via `@fontsource`: **League Gothic** (títulos e botão JOGAR, sempre em caixa alta) e **Oswald** 400/600/700 (texto, menus).
- Logo: coloque `public/brand/logo.png` (veja `public/brand/README.md`).
- Única exceção: `backgroundColor` em `electron/main.cjs` (cor da janela antes do React carregar) espelha `--bg-base`.

## Layout: "B · Coluna de Comando"

Janela fixa de **1000×620** (no navegador, o app aparece numa moldura do mesmo tamanho).

- `src/components/command/`: a coluna à esquerda (marca, menu, card da novidade, perfil + servidor, JOGAR com progresso dentro do botão e barra do jogador com volume/música e configurações).
- `src/components/layout/HomeHero.tsx`: slogan sobre a cena.
- `src/components/layout/Panel.tsx`: Notícias, Modpack e Configurações abrem como painéis de vidro sobre a cena (Esc ou X fecham).
- `src/components/layout/WindowControls.tsx`: faixa arrastável com minimizar/fechar.

## Cena 3D: "O Portal Proibido"

O fundo do launcher é uma cena WebGL em tempo real (Three.js), toda procedural:
ilha flutuante de blocos, portal com shader de energia em pixel-art, coluna de luz,
névoa, brasas, blocos flutuantes, ilhas distantes e pós-processamento (bloom,
aberração cromática, vinheta e granulado).

- Código em `src/scene/` (`PortalScene.ts`, `voxels.ts`, `shaders.ts`); cores em `--scene-*` no `tokens.css`.
- Carregada sob demanda (chunk separado), aparece com fade quando o primeiro quadro fica pronto.
- Pausa com a janela oculta/minimizada e enquanto o jogo está rodando.
- Modo Economia ou "reduzir movimento" do sistema: um quadro estático da própria cena.
- Sem WebGL: cai para o fundo simples (vinheta + brasas 2D).
- Em dev, `window.__portal` expõe a cena (`renderAt(t)`, `setMouse(x, y)`) para gravar vídeos quadro a quadro.

## Persistência

- **Electron:** `<userData>/settings.json` (escrita atômica, debounce de 350 ms).
- **Navegador:** `localStorage["akashic.settings.v1"]`.

Arquivos antigos ou corrompidos são mesclados com os padrões, sem quebrar o app.

## Simuladores (para testar)

- **JOGAR:** Verificando → (Baixando, sempre na 1ª vez) → Iniciando → Em execução. Clique durante a verificação/download para cancelar; em execução, clique para fechar o jogo.
- **Status do servidor:** clique na pílula "Online" para alternar entre Online / Manutenção / Offline (bloqueia o botão JOGAR).
- **Logs:** botão de terminal na Action Bar ou em Configurações → Jogo & Vídeo.

## Onde plugar a lógica real

- `src/store/launch.ts` → troque `verify` / `download` / `launch` por chamadas IPC reais.
- `src/store/server.ts` → troque `tick()` por um Server List Ping de verdade.
- `src/lib/content.ts` → notícias e changelog vindos da sua API.

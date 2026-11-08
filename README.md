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

- `src/components/command/`: a coluna à esquerda (marca, menu, card da novidade, JOGAR com progresso dentro do botão e barra do jogador com volume/música e configurações).
- `src/components/layout/HomeHero.tsx`: slogan sobre a cena.
- `src/components/layout/Panel.tsx`: Notícias, Modpack e Configurações abrem como painéis de vidro sobre a cena (Esc ou X fecham).
- `src/components/layout/WindowControls.tsx`: faixa arrastável com minimizar/fechar.

## Movimento (Fase 3)

- **Abertura** (`Intro.tsx`, ~2,7s): logo, nome e a cena acendendo a partir do portal. Clique/tecla pula; sem abertura no Modo Economia ou com "reduzir movimento".
- **JOGAR ↔ portal** (`store/fx.ts`): hover acende o portal, o clique pulsa, o progresso carrega a energia e, ao abrir o jogo, a câmera mergulha no portal (`setDive`), com clarão (`LaunchFlash.tsx`) e recuo antes de pausar.
- Slogan revelado letra por letra; JOGAR magnético; Enter joga a partir do Início.

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

## Java (Azul Zulu 8u512, incluso)

O launcher usa o próprio Java: **Azul Zulu · Java 8 (1.8.0_512), 64-bit**. Tudo sobre o runtime fica em `src/lib/java.ts` (fonte única).

- Padrão: `javaMode: 'bundled'`. Configurações antigas com `'auto'` migram automaticamente para o Zulu.
- "Usar outro Java (avançado)" (`'custom'`) aceita um caminho próprio; sem caminho, o Zulu continua sendo usado.
- **Para a implementação real:** empacotar o JRE do Zulu 8u512 de cada sistema em `runtime/zulu-8u512/` (via `extraResources` do electron-builder) ou baixá-lo do site da Azul no primeiro uso, sempre conferindo o checksum (SHA-256) antes de extrair. No Windows, usar `bin/javaw.exe` (sem console); no Linux/macOS, `bin/java`.

## Skin

Clique no jogador (rodapé da coluna) para abrir o painel **Skin**: boneco 3D (arraste para girar, andar/parado), envio de `.png` por clique ou arrastando, e aplicação.

- Formato da 1.7.10: modelo clássico 64×32. Skins 64×64 são aceitas, mas o preview mostra como o jogo exibe (sem a segunda camada, lado esquerdo espelhado). Sem braço fino (Alex).
- Visualizador próprio em `src/scene/SkinModel.ts` (usa o Three.js do launcher); validação e skin padrão "Forbidden" em `src/lib/skin.ts`.
- A skin fica salva nas configurações (`skinDataUrl`) e o rosto aparece no avatar da coluna.
- **Para a implementação real**, o "Aplicar" deve enviar a skin conforme o tipo de conta do servidor:
  - contas originais (Microsoft): `POST https://api.minecraftservices.com/minecraft/profile/skins` com o token da conta;
  - servidor não-original: para um servidor de skins próprio, lido no jogo por um mod (ex.: CustomSkinLoader) ou plugin (ex.: SkinsRestorer).

## Onde plugar a lógica real

- `src/store/launch.ts` → troque `verify` / `download` / `launch` por chamadas IPC reais (o executável Java vem de `src/lib/java.ts`).
- `src/store/server.ts` → troque `tick()` por um Server List Ping de verdade.
- `src/lib/content.ts` → notícias e changelog vindos da sua API.

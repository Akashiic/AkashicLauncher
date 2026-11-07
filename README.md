# Akashic Launcher

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

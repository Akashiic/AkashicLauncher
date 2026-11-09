# Forbidden Series Launcher

> **Entre no Proibido.**

Launcher desktop do servidor **Minecraft 1.7.10 Modded**. No app desktop o JOGAR é **real**: baixa o Java, o Minecraft 1.7.10, o modpack TEOF- do GitHub e o Forge, e abre o jogo (núcleo em Rust, `src-tauri/src/game`). No navegador o mesmo fluxo é simulado, para testar a interface.

**Stack:** Tauri 2 + Rust (processo nativo) · React 18 + TypeScript · Vite · Tailwind CSS · Framer Motion · Three.js · Zustand · Web Audio API.

### Por que Tauri (Rust)

A interface é a mesma (React, cena 3D, animações); só a "casca" nativa trocou de Electron para Tauri.
O Tauri usa o WebView do sistema em vez de levar um Chromium junto. No Windows esse WebView é o **WebView2, baseado em Chromium**, então a renderização e as animações são as mesmas do Electron.

| | Electron 33 | Tauri 2 |
|---|---|---|
| Executável | ~263 MB (runtime) | **7,4 MB** |
| Janela visível ao abrir* | ~0,4–0,55 s | ~0,35–0,55 s |
| Memória (soma dos processos)* | ~780 MB | ~680 MB |

\* Medido num ambiente sem GPU (renderização por software), que infla a memória dos dois. Em máquinas com placa de vídeo os números absolutos são bem menores; a proporção de tamanho é a mesma.

**Fluidez na abertura:** a cena 3D monta em etapas curtas e pré-compila todos os shaders antes do primeiro quadro (`PortalScene.warmup()`, com `KHR_parallel_shader_compile` quando disponível — Chrome/Edge/WebView2), para a abertura não engasgar. A janela nasce oculta, com o fundo do tema, e aparece quando a interface monta (sem piscar em branco).


## Rodando

```bash
npm install
npm run dev:desktop    # app desktop (Vite + Tauri); compila o Rust na primeira vez
npm run dev            # só no navegador: http://localhost:5173
npm run build          # typecheck + build da interface (dist/)
npm run build:desktop  # instaladores (Windows: NSIS/MSI) em src-tauri/target/release/bundle/
```

Requisitos para o app desktop: [Rust](https://rustup.rs) e, no Windows, o WebView2 (já vem no Windows 10/11 atualizado; o instalador baixa se faltar). No Linux: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`.

## Releases do launcher (GitHub Actions)

Duas Actions em `.github/workflows/`:

- **CI** (`ci.yml`), a cada push e pull request: TypeScript + build da interface, `cargo clippy` sem avisos e testes do Rust.
- **Release** (`release.yml`), ao enviar uma tag `vX.Y.Z`: compila o instalador do Windows (NSIS) e cria um **rascunho** em Releases com o instalador e o `latest.json` da atualização automática.

### Publicar uma versão

```bash
npm run release 0.2.0
```
```bash
git commit -am "Launcher v0.2.0"
```
```bash
git tag v0.2.0
```
```bash
git push --follow-tags
```

O script atualiza a versão em `package.json`, `tauri.conf.json` e `Cargo.toml`; a Action recusa a tag se a versão não bater. Quando o rascunho aparecer em Releases, revise e clique em **Publish release**: a partir daí os launchers instalados mostram "Launcher 0.2.0 disponível · atualizar" no topo (nunca com o jogo aberto) e se atualizam com um clique, conferindo a assinatura.

### Configuração única da atualização automática

1. Gere o par de chaves no seu PC e guarde a chave privada num lugar seguro (sem ela não dá para publicar atualizações):
   ```bash
   npx tauri signer generate -w ~/.tauri/forbidden-launcher.key
   ```
2. No GitHub, em **Settings → Secrets and variables → Actions**:
   - aba *Secrets*: `TAURI_SIGNING_PRIVATE_KEY` = conteúdo do arquivo `forbidden-launcher.key`, e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = a senha escolhida;
   - aba *Variables*: `TAURI_UPDATER_PUBKEY` = conteúdo do arquivo `forbidden-launcher.key.pub`.
3. **Repositório público (ou Releases num repositório público):** os jogadores baixam o instalador e as atualizações sem login, então os Releases precisam ser públicos. O endereço lido pelo launcher fica em `plugins.updater.endpoints` no `tauri.conf.json`.

Sem as chaves, a Action gera o instalador normalmente, só sem atualização automática (aparece um aviso no log da Action).

## Estrutura

```
src-tauri/src/lib.rs     processo nativo em Rust: bandeja, settings.json, pastas/links, instância única
src-tauri/src/game/      JOGAR real: Java, Minecraft 1.7.10, modpack, Forge, processo do jogo (+ testes)
src-tauri/tauri.conf.json janela 1000×620 sem moldura, ícones, instaladores
src-tauri/capabilities/  permissões da janela (só o necessário)
src/lib/bridge.ts        ponte interface ↔ Rust (invoke/eventos), com fallback para o navegador
src/lib/desktop.ts       arrastar a janela pelas áreas .drag e mostrar a janela ao montar
src-tauri/src/updater.rs atualização automática do launcher (assinada)
.github/workflows/       CI e release (instalador do Windows + latest.json)
scripts/release.mjs      npm run release X.Y.Z (versão nos três arquivos)
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
- Marca oficial em `public/brand/` (símbolo, nome em linha e logo completo) e ícones em `src-tauri/icons/` — veja `public/brand/README.md`.
- Única exceção: `backgroundColor` em `src-tauri/tauri.conf.json` (cor da janela antes do React carregar) espelha `--bg-base`.

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

- **App desktop:** `settings.json` na pasta de dados do app (Windows: `%APPDATA%\com.forbiddenseries.launcher\`), escrita atômica em Rust, debounce de 350 ms.
- **Navegador:** `localStorage["akashic.settings.v1"]`.

Arquivos antigos ou corrompidos são mesclados com os padrões, sem quebrar o app.

## JOGAR: do clique ao Minecraft aberto (Rust)

Tudo em `src-tauri/src/game/`; a interface só recebe eventos (`launch:progress` a cada 120 ms, `launch:logs` em lotes, `game:window`, `game:exit`).

| Etapa | O que acontece | Arquivo |
|---|---|---|
| 1. Java | Zulu 8u512 da Azul no 1º uso, **SHA-256 fixado** no código; extraído em `runtime/zulu-8u512` | `java.rs` |
| 2. Minecraft 1.7.10 | JSON da versão (SHA-1 fixado), client.jar, bibliotecas, nativos LWJGL 2.9.1, assets (16 downloads paralelos, cada arquivo conferido pelo SHA-1) e o XML de log da Mojang que corrige o **Log4Shell** | `minecraft.rs` |
| 3. Modpack | 1ª vez: baixa o `.zip` do release mais novo inteiro (com **retomada**, tamanho e SHA-256 do GitHub conferidos) e extrai. Depois: **atualizador incremental** (veja abaixo). **Mantém** `options.txt`, `optionsnf.txt`, `servers.dat`, `saves/` e os mapas do JourneyMap. Aceita o .zip com ou sem uma pasta raiz | `modpack.rs`, `zipremote.rs` |
| 4. Forge | formato Technic: usa o `bin/modpack.jar` do pack (e o `version.json` dele); sem ele, o Forge 10.13.4.1614 oficial (SHA-1 fixado). Bibliotecas (Scala, LaunchWrapper...) dos repositórios Forge/Mojang, com o Maven Central de reserva | `forge.rs` |
| 5. Jogo | extrai os nativos, monta o classpath (Forge vence duplicadas), inicia `javaw` sem console, converte o log XML em linhas legíveis, detecta a janela do jogo (vai para a bandeja) e o fechamento (o launcher volta e procura atualizações) | `launch.rs` |

### Atualizador do modpack

O launcher **não vem com modpack nenhum**: o primeiro JOGAR instala a versão mais nova publicada nos **Releases** do GitHub (só os releases contam — não branches, tags soltas ou o código do repositório). Depois disso:

- **Só baixa o que mudou.** O launcher lê apenas o índice do `.zip` do release novo (HTTP Range, ~200 KB mesmo num .zip de 450 MB), compara o CRC-32 de cada arquivo com o instalado e busca só os arquivos alterados, em poucos pedaços do próprio .zip. Se a mudança for grande (>70% do pack) ou o servidor não aceitar pedaços, faz o download completo.
- **Tamanho exato antes de clicar:** "TEOF-5.3 → TEOF-5.4 · 12 MB", e um aviso único quando sai versão nova (ao abrir, a cada 30 min e quando o jogo fecha).
- **Seguro:** os arquivos novos vão para uma área separada e são conferidos; a troca é registrada num diário e, se algo falhar (ou o PC desligar no meio), a versão anterior é restaurada.
- **Respeita o jogador:** configs editadas só são trocadas se o pack mudou aquele arquivo; opções, servidores, mundos e mapas nunca são tocados.
- **Autorreparo:** a cada JOGAR, mods apagados ou corrompidos voltam sozinhos (só eles). **Verificar arquivos** confere o CRC-32 de tudo.
- **Sem internet:** joga com a versão instalada e avisa; atualiza no próximo JOGAR com conexão.
- Testado com um pack de 451 MB: 1ª instalação 451 MB; atualização com 1 mod removido, 1 config alterada e 1 arquivo novo = **211 KB** baixados; um mod apagado restaurado com 291 KB.

- **2ª vez em diante:** só confere tamanhos (rápido). **Verificar arquivos** (Configurações → Desempenho → Java) confere o SHA-1 de tudo e baixa de novo o que estiver corrompido.
- **Pastas** (Windows: `%APPDATA%\com.forbiddenseries.launcher\`): `minecraft/` (bibliotecas, assets), `instances/forbidden/` (a pasta do jogo: mods, config, saves), `runtime/` (Java).
- **Logs do jogo:** janela de logs do launcher e `instances/forbidden/logs/launcher-latest.log`. Se o jogo fechar com erro, o aviso mostra o crash report.
- **Contas offline** entram com UUID offline e token aleatório. O login Microsoft ainda é simulado (veja Perfis).
- **Validado com o conteúdo do repositório do pack** (branch `main`, commit "Evoltion 0.0": 169 mods, `bin/modpack.jar` = Forge 10.13.4.1614 oficial, SHA-1 idêntico). Atenção: as tags `TEOF-*` do repositório apontam todas para esse mesmo commit, então **não** representam o conteúdo de cada versão; o pack de cada versão é o `.zip` anexado ao release, que é o que o launcher baixa. Resultado: instalação do .zip de 451 MB e janela do jogo em ~30 s; o Forge carregou 237 mods e chegou ao menu principal. Nesse conteúdo, no ambiente de teste (sem placa de vídeo, driver Mesa por software), o **DraconicMinus 1.3** crasha dentro do **Angelica 2.1.33** (`AttribSnapshot.snapshot`); sem ele, abre normalmente.
- **Testar com um pack local:** gere o build com `VITE_MODPACK_RELEASES_URL=http://localhost:8765/releases.json` (lista no formato da API do GitHub). Assim foi validado: Java baixado, 1.7.10 + Forge até o menu principal, atualização 9.0 → 9.1 (mod removido, `options.txt` do jogador mantido), fechar o jogo pelo launcher e verificação com arquivo corrompido.

## Simuladores (só no navegador)

- **JOGAR:** Verificando → (Baixando, sempre na 1ª vez) → Iniciando → Em execução. Clique durante a verificação/download para cancelar; em execução, clique para fechar o jogo.
- **Status do servidor:** clique na pílula "Online" para alternar entre Online / Manutenção / Offline (bloqueia o botão JOGAR).
- **Logs:** botão de terminal na Action Bar ou em Configurações → Jogo & Vídeo.

## Java (Azul Zulu 8u512)

O launcher usa o próprio Java: **Azul Zulu · Java 8 (1.8.0_512), 64-bit**. Tudo sobre o runtime fica em `src/lib/java.ts` (fonte única).

- Padrão: `javaMode: 'bundled'`. Configurações antigas com `'auto'` migram automaticamente para o Zulu.
- "Usar outro Java (avançado)" (`'custom'`) aceita um caminho próprio; sem caminho, o Zulu continua sendo usado.
- O Rust baixa o pacote oficial da Azul no primeiro JOGAR (~40 MB) e confere o SHA-256 fixado em `src-tauri/src/game/java.rs` (Windows x64, Linux x64, macOS x64 — no Mac com Apple Silicon roda via Rosetta, porque o LWJGL 2.9.1 não tem nativos ARM). Para mandar o Java dentro do instalador, coloque-o em `runtime/zulu-8u512/` via `bundle.resources`: o launcher usa esse primeiro.

## Modpack: versões TEOF- do GitHub

As versões vêm **de verdade** dos releases de [Akashiic/Technic-Forbidden](https://github.com/Akashiic/Technic-Forbidden/releases), como no launcher de celular:

1. busca os releases pela API pública do GitHub (ao abrir o launcher, a cada 30 min e em "Procurar atualizações");
2. fica só com as tags `TEOF-<versão>` (ignora rascunhos, pré-releases e tags como `1.0`, `Genesis`, `Update`);
3. ordena numericamente (5.10 > 5.9) e compara com a versão instalada (`modpackVersion`);
4. o arquivo do modpack é o `.zip` anexado ao release (o maior, se houver mais de um).

- **Quando procura:** sempre ao abrir o launcher, a cada 30 min, quando o jogo fecha (o launcher volta da bandeja) e quando a janela reaparece depois de mais de 2 min.
- O JOGAR vira **INSTALAR** (nada instalado) ou **ATUALIZAR** (versão nova), com "TEOF-5.3 → TEOF-5.4 · tamanho" embaixo.
- Cache com ETag: consultas repetidas recebem `304` e não gastam o limite de 60/hora da API sem login. Sem conexão, usa a última lista salva e joga com a versão instalada.
- Código: `src/lib/modpack.ts` (busca/ordenação), `src/store/modpack.ts` (estado), `src/components/modpack/ModpackVersions.tsx` (painel).
- **Instalação real** no app desktop (veja "JOGAR: do clique ao Minecraft aberto"). A versão instalada de verdade fica em `instances/forbidden/.forbidden/pack.json` e manda sobre a salva nas configurações.

## Bandeja do sistema

Ao abrir o jogo (comportamento padrão "Minimizar para a bandeja"), o launcher se esconde na bandeja e volta sozinho quando o jogo fecha. Menu do ícone: **Abrir launcher**, **Fechar o jogo** e **Sair**. Ícone em `src-tauri/icons/tray@2x.png` (olho com moldura pixelada da marca). Abrir o launcher de novo com ele na bandeja só traz a janela para frente (instância única). "Fechar o jogo" encerra o processo do Java direto no Rust.

## Flags da JVM

Campo livre, sem restrição (uma flag por linha). O launcher só **avisa** (ex.: `-Xmx` sobrescrevendo o controle de RAM, dois coletores ao mesmo tempo), nunca bloqueia. Presets em `src/lib/jvm.ts`, com explicação de cada flag:

- **Otimizado (recomendado, padrão):** base oficial da Mojang para Java 8 + `ParallelRefProcEnabled`, `DisableExplicitGC`, `UseStringDeduplication` e as flags do FML.
- **Vanilla (Mojang):** as flags do launcher oficial para Java 8.
- **PC fraco:** G1 leve com menos threads (substitui o CMS, obsoleto no Java 8).

Presets não editados acompanham as flags atuais automaticamente; flags personalizadas nunca são alteradas.

## Perfis (obrigatório)

O login é um **painel dentro da coluna de comando** (`src/components/account/AccountPanel.tsx`), não um modal: a cena e o slogan continuam visíveis à direita.

- **Sem perfil:** depois da abertura a coluna vira **Entrar** (sem "Voltar"): botão *Entrar com Microsoft* e, no rodapé, *Mudar para modo offline*, que troca o painel para o campo do nick.
- **Com perfil:** no menu do jogador (rodapé da coluna), *Adicionar perfil* desliza a coluna para o login, com **Voltar** (ou Esc) e a lista **Perfis salvos** para trocar com um clique. O mesmo menu troca de perfil, troca a skin ou remove o perfil; removendo o último, o login obrigatório volta.

- **Offline:** nick de 3–16 caracteres (`A-Z a-z 0-9 _`). UUID igual ao do Minecraft: `UUID.nameUUIDFromBytes("OfflinePlayer:" + nick)` (`src/lib/offlineUuid.ts`, conferido contra o MD5 do Node).
- **Microsoft:** login **simulado** nesta versão (`src/lib/auth.ts`), mostrando as etapas reais. Para a implementação real (em Rust, como comandos do Tauri):
  1. OAuth da Microsoft (MSAL, tenant `consumers`) numa BrowserWindow;
  2. Xbox Live (`user.auth.xboxlive.com`) → XSTS (`xsts.auth.xboxlive.com`);
  3. `api.minecraftservices.com/authentication/login_with_xbox` → licença (`/entitlements/mcstore`) → perfil (`/minecraft/profile`).
  - **Requisitos:** app registrado no Azure **e aprovação da Mojang** para acessar a API do Minecraft (apps novos precisam pedir liberação).
  - Tokens no cofre do sistema (crate `keyring`: Credential Manager no Windows) — nunca no `settings.json` (lá ficam só nick, UUID, tipo e skin).
- Cada perfil tem a própria skin; o perfil ativo aparece nos logs ao jogar.

## Skin

Clique no jogador (rodapé da coluna) para abrir o painel **Skin**: boneco 3D (arraste para girar, andar/parado), envio de `.png` por clique ou arrastando, e aplicação.

- Formato da 1.7.10: modelo clássico 64×32. Skins 64×64 são aceitas, mas o preview mostra como o jogo exibe (sem a segunda camada, lado esquerdo espelhado). Sem braço fino (Alex).
- Visualizador próprio em `src/scene/SkinModel.ts` (usa o Three.js do launcher); validação e skin padrão "Forbidden" em `src/lib/skin.ts`.
- A skin fica salva no perfil ativo e o rosto aparece no avatar da coluna.
- **Para a implementação real**, o "Aplicar" deve enviar a skin conforme o tipo de conta do servidor:
  - contas originais (Microsoft): `POST https://api.minecraftservices.com/minecraft/profile/skins` com o token da conta;
  - servidor não-original: para um servidor de skins próprio, lido no jogo por um mod (ex.: CustomSkinLoader) ou plugin (ex.: SkinsRestorer).

## Onde plugar a lógica real

- ~~`src/store/launch.ts`~~ → feito: JOGAR real em Rust (`src-tauri/src/game`).
- Login Microsoft real (veja Perfis) — hoje as contas Microsoft entram como offline.
- `src/store/server.ts` → troque `tick()` por um Server List Ping de verdade.
- `src/lib/content.ts` → notícias e changelog vindos da sua API.

# Contas originais (login com Microsoft)

O launcher já tem o login completo (`src-tauri/src/auth`). Para ele funcionar, a
Microsoft e a Mojang precisam conhecer o app. Isso é feito uma vez, pelo dono do
launcher, e leva três partes:

1. registrar o app na Microsoft (5 minutos);
2. pedir a liberação da Mojang (a análise leva de alguns dias a algumas semanas);
3. colocar o ID do app numa variável do repositório.

Enquanto a Mojang não libera, o login vai até o Xbox e para com a mensagem
"A Mojang ainda não liberou este launcher…". O modo offline funciona normalmente.

## 1. Registrar o app na Microsoft

1. Conta Microsoft pessoal (Outlook/Hotmail/Xbox) não tem diretório próprio, e o
   portal recusa com "AADSTS16000 … não existe no locatário 'Microsoft Services'".
   Antes, crie a conta gratuita do Azure em <https://azure.microsoft.com/free>
   com essa mesma conta (pede telefone e cartão só para verificação; registrar um
   app não cobra nada). Isso cria o seu diretório ("Diretório Padrão").
   Depois entre em <https://portal.azure.com> e abra **Microsoft Entra ID**. Se
   aparecer outro diretório, troque em **Configurações → Diretórios** para o seu.
2. **Aplicativos → Registros de aplicativo → Novo registro**:
   - **Nome:** `Forbidden Series Launcher`
   - **Tipos de conta compatíveis:** *Somente contas pessoais da Microsoft*
   - **URI de redirecionamento:** plataforma *Cliente público/nativo (celular e
     desktop)*, valor `http://localhost`
3. Clique em **Registrar** e copie o **ID do aplicativo (cliente)**, no formato
   `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`.
4. Em **Autenticação**, ative **Permitir fluxos de clientes públicos** e salve.

Não crie segredo (client secret): o launcher é um app de desktop e usa PKCE.
O ID do app não é segredo.

## 2. Pedir a liberação da Mojang

Apps novos só acessam a API do Minecraft depois de aprovados. Preencha o
formulário em <https://aka.ms/mce-reviewappid> com:

- o **ID do aplicativo** do passo 1;
- nome e descrição do launcher (por exemplo: "Launcher do servidor Forbidden
  Series, Minecraft 1.7.10 com mods");
- o link do repositório: <https://github.com/Akashiic/AkashicLauncher>;
- um e-mail de contato.

A resposta chega por e-mail. Não precisa esperar por ela para fazer o passo 3.

## 3. Colocar o ID no repositório

No GitHub: **Settings → Secrets and variables → Actions → aba Variables → New
repository variable**:

- **Name:** `MS_CLIENT_ID`
- **Value:** o ID do aplicativo

A próxima build (qualquer push, ou **Actions → Release → Run workflow**) já sai com
o login ativado. Sem a variável, a build avisa "Sem a variável MS_CLIENT_ID" e o
botão mostra "Login Microsoft em breve".

Para testar uma build local: `FORBIDDEN_MS_CLIENT_ID=<id> npm run tauri dev`.

## Como funciona

1. **Entrar com Microsoft** abre a página oficial no navegador (OAuth 2.0 com PKCE).
   A senha é digitada só no site da Microsoft.
2. A Microsoft volta para `http://localhost:<porta>`, onde o launcher espera
   (a página mostra "Conta conectada").
3. Xbox Live → XSTS → Minecraft → perfil (nick, UUID e skin).
4. O refresh token e o token do Minecraft vão para o cofre
   `%APPDATA%\.forbiddenseries\accounts.dat`, cifrado com o DPAPI do Windows
   (preso à conta do Windows; copiado para outro PC, não abre). No
   `settings.json` ficam só nick, UUID, tipo e skin.
5. No JOGAR, o launcher confere a sessão. O token do Minecraft vale 24 h; quando
   está para vencer, o launcher renova sozinho pela Microsoft e atualiza nick e
   skin se mudaram. O jogo abre com `--userType msa` e o token de verdade, então
   entra em servidores originais.
6. **Remover perfil** apaga a sessão do cofre.

Erros que aparecem para o jogador: conta sem Minecraft, conta sem perfil do Xbox,
conta de menor sem Família Microsoft, sessão expirada (pede para entrar de novo),
app ainda não liberado pela Mojang. Sem internet até a Microsoft, o jogo abre sem
validar a conta (singleplayer e servidores offline continuam funcionando).

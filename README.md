# Penumbra

Jogo 2D multiplayer de perseguição e esconderijo para 2 a 6 jogadores.

## Executar localmente

```powershell
cd D:\CODEX\penumbra
npm install
npm run dev
```

Abra `http://localhost:3001` em duas ou mais abas (ou em computadores na mesma rede apontando para o IP da máquina hospedeira e porta 3001).

## Controles e regras

- `WASD` ou setas movimentam o personagem.
- A sala gera um código curto compartilhável; o primeiro jogador é a autoridade.
- Apenas a autoridade começa a rodada. Ao sair, ela passa de forma única ao próximo jogador conectado.
- Em cada rodada, um jogador é sorteado como monstro. Ele fica imobilizado por 12 segundos; os escondedores vencem se sobreviverem aos 3 minutos.

## Arquitetura

- `server.js`: autoridade de regras, estado das salas, sincronização Socket.IO e detecção de desconexão.
- `public/game.js`: interface, entrada do jogador e renderização Canvas.
- `public/style.css`: interface visual.

As decisões de jogo são validadas no servidor. O campo `ownerId` é separado da lógica da rodada, deixando a transição para um servidor autoritativo dedicado ou uma estratégia de host-fallback futura localizada no módulo de sala.

## Publicar em GitHub Pages

O cliente está preparado para o GitHub Pages, com o workflow em `.github/workflows/deploy-pages.yml`. GitHub Pages entrega apenas arquivos estáticos; para salas e multiplayer continuarem funcionando, `server.js` precisa ficar em uma hospedagem Node separada. Incluí também um `render.yaml` para uma implantação simples no Render.

1. Publique esta pasta em um repositório GitHub e crie o serviço web no Render a partir do repositório.
2. No Render, defina `CLIENT_ORIGIN` como `https://SEU-USUARIO.github.io` (ou a URL de projeto final) e anote a URL HTTPS do serviço.
3. No repositório GitHub, em **Settings → Secrets and variables → Actions → Variables**, crie `PENUMBRA_SERVER_URL` com a URL do Render, por exemplo `https://penumbra-server.onrender.com`.
4. Em **Settings → Pages**, escolha **GitHub Actions** como a origem. O push na branch `main` publica o cliente.

O workflow usa as ações oficiais `configure-pages`, `upload-pages-artifact` e `deploy-pages` para publicar o artefato estático. [Documentação oficial](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

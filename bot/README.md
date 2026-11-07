# Bot Discord — Super Copa Pionner

O bot conecta o Discord à API do site e transforma o servidor em uma central operacional da competição. Ele registra comandos slash, consulta a competição, publica alertas e sincroniza mudanças por polling seguro.

## Funcionalidades

- `/ajuda`: lista os recursos do bot.
- `/competicao`: mostra formato, taxa, premiação, vagas e prazos.
- `/inscricao`: abre o formulário de inscrição do site.
- `/status codigo:SCP-00001`: consulta uma inscrição pelo código.
- `/partidas`: mostra partidas ao vivo e próximos confrontos.
- `/classificacao`: mostra a classificação geral.
- `/painel`: abre o site público.
- `/anunciar mensagem:...`: publica comunicado no canal público para administradores.

O bot também observa a API a cada `BOT_POLL_MS` milissegundos. Ele avisa sobre novas inscrições, envio de comprovantes, mudanças de status, partidas ao vivo e resultados encerrados. Quando o `captainUserId` for um ID Discord válido, ele tenta enviar uma DM ao capitão.

## Configuração

Copie os valores para o `.env` do servidor do site e da máquina que executará o bot:

```env
DISCORD_BOT_TOKEN=token-secreto-do-bot
DISCORD_GUILD_ID=id-do-servidor
DISCORD_ADMIN_IDS=id1,id2
DISCORD_PUBLIC_CHANNEL_ID=id-do-canal-publico
DISCORD_PAYMENT_CHANNEL_ID=id-do-canal-de-pagamentos
DISCORD_ADMIN_CHANNEL_ID=id-do-canal-da-organizacao
SITE_URL=https://seu-dominio.com
BOT_API_URL=https://seu-dominio.com/api/bot/snapshot
BOT_API_TOKEN=segredo-compartilhado-entre-site-e-bot
BOT_POLL_MS=15000
```

O `BOT_API_TOKEN` deve ser diferente do token do Discord, longo e secreto. O site só responde a `/api/bot/snapshot` quando o cabeçalho `x-bot-token` está correto. Nunca coloque o token em código frontend, GitHub ou mensagens públicas.

## Criar o bot no Discord Developer Portal

Crie uma aplicação, adicione um Bot e copie o token para `DISCORD_BOT_TOKEN`. Na instalação, use os scopes `bot` e `applications.commands`. As permissões mínimas são `View Channels`, `Send Messages`, `Embed Links` e `Read Message History`. Para DMs, o usuário precisa permitir mensagens diretas do servidor. O bot não precisa de `Administrator`.

Configure o ID do servidor e dos canais copiando o modo desenvolvedor do Discord. O canal de pagamentos deve ser visível ao bot, mas pode ficar restrito para que apenas organização e capitães vejam suas mensagens.

## Executar

Para iniciar o site e o bot juntos em desenvolvimento, execute na raiz do projeto:

```bash
pnpm dev
```

O comando usa o mesmo `.env` para os dois processos. Para encerrar ambos, pressione `Ctrl+C`.

Para executar somente o bot, com o site já em execução:

```bash
pnpm install
pnpm bot
```

Em produção self-hosted, compile uma vez com `pnpm build` e inicie site e bot juntos com `pnpm start:selfhosted`.

Para manter o bot ligado em produção, use um gerenciador como `systemd`, Docker ou PM2. O processo é separado do site para que uma reinicialização do frontend não derrube a conexão do Discord.

## Segurança e limites

A API do bot expõe somente o snapshot protegido por token. A aprovação financeira continua sendo feita no painel web por administrador; o bot apenas comunica e consulta. O bot não movimenta dinheiro, não altera placares e não aprova pagamentos sozinho.

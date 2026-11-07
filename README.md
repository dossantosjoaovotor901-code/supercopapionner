# Super Copa Pionner

Site de campeonato em React / Express / tRPC / Drizzle, com painel administrativo protegido, chaveamento completo, partidas, placares, equipes, jogadores, avisos e regulamento.

## Desenvolvimento

- `pnpm dev`: inicia o site de desenvolvimento e o bot Discord juntos (site na porta 3000 por padrão).
- `pnpm build` / `pnpm start`: compila e serve `dist/index.js`.
- `pnpm db:migrate`: aplica as migrações do banco gerenciado.
- `pnpm db:seed`: cria dados demonstrativos apenas quando não existe snapshot.
- `pnpm check` / `pnpm test`: tipos e testes.

## Replay de jogos encerrados

O painel administrativo aceita um vídeo MP4, WebM, MOV ou AVI de até 30 MB quando a partida está com status **Encerrado**. O arquivo é enviado ao armazenamento do projeto, fica associado à partida e aparece no detalhe público como **Assistir replay**. A operação exige papel administrativo; partidas agendadas ou ao vivo são recusadas pelo servidor.

## Administrador

No modo self-hosted, o painel usa o e-mail e a senha `LOCAL_ADMIN_EMAIL` / `LOCAL_ADMIN_PASSWORD` definidos no `.env`. Visitantes podem criar contas para inscrições; novas contas recebem papel de usuário e não ganham acesso administrativo.

## Edição portátil Node + SQLite

A pasta [`portable/`](portable/README.md) entrega uma camada local independente usando `node:sqlite` do Node 22. Execute `node portable/init.mjs` para criar `portable/data/super-copa-pionner.sqlite` com o snapshot incluído e `PORT=3010 PORTABLE_ADMIN_KEY=troque-esta-chave node portable/server.mjs` para iniciar a API local. A edição portátil também guarda metadados e arquivos de replay em SQLite + `portable/uploads/`.

O Preview hospedado continua usando o banco gerenciado e o armazenamento da plataforma; o SQLite é a edição portátil solicitada para execução local. O pacote não inclui `node_modules`, credenciais ou arquivos temporários.

## Rodar o site completo no localhost ou VPS

Para rodar o site completo fora da Manus, use Node 22+ e pnpm. O modo self-hosted serve frontend, API, login, SQLite e uploads locais. Configure `LOCAL_ADMIN_EMAIL` e uma senha forte em `LOCAL_ADMIN_PASSWORD` no `.env` e execute:

```bash
pnpm install
pnpm build
pnpm start:selfhosted
```

Em desenvolvimento, `pnpm dev` inicia o site e o bot juntos. Depois abra `http://localhost:3000`. O comando de produção também inicia site e bot; use `PORT=3000` ou outra porta liberada no firewall. Cadastros públicos criam contas comuns, sem acesso ao painel administrativo. O banco fica em `data/super-copa-pionner.sqlite` e os uploads em `data/uploads`. Não são necessárias `DATABASE_URL`, chaves Manus ou OAuth para esse modo.

O passo a passo de VPS com `systemd` está em [`SELFHOSTED.md`](SELFHOSTED.md).

O login self-hosted é feito por e-mail e senha; não precisa de OAuth do Discord. O bot Discord é executado junto com o site nos comandos `pnpm dev` e `pnpm start:selfhosted`.

Para oferecer inscrições gratuitas, defina **Taxa de inscrição** como `0` nas configurações do painel. Essas equipes são confirmadas automaticamente e não precisam enviar comprovante Pix. O prazo de pagamento pode ser desligado desmarcando **Definir prazo de pagamento**; inscrições pagas permanecem abertas sem uma data limite de pagamento.

Quando o campeonato self-hosted ainda não tem partidas, salvar pelo menos duas equipes gera automaticamente os potes, grupos e jogos da fase de grupos, além do chaveamento conforme o número de equipes. Basta informar os placares: ao salvar um placar editado, a partida é encerrada automaticamente; a classificação dos grupos e o avanço dos vencedores são atualizados pelo sistema. Partidas eliminatórias empatadas ainda exigem o placar dos pênaltis. Não é necessário vincular manualmente uma partida à próxima.

Cada confronto também pode ter um prazo individual para as equipes jogarem. A organização define essa data no cadastro/edição da partida; o prazo aparece na agenda pública e nos detalhes do confronto.

O pacote usa `LOCAL_START_EMPTY=true` por padrão: o primeiro banco local começa sem times, jogadores ou partidas, mantendo somente a identidade da Super Copa Pionner. Para preservar os dados demonstrativos do snapshot, altere para `LOCAL_START_EMPTY=false` antes da primeira inicialização.


## Update funcional: inscrições e pagamentos

O site agora possui uma área pública de competições em `/campeonatos` e um fluxo de inscrição em `/inscricoes/nova`. O capitão autenticado cadastra equipe e elenco, aceita o regulamento e recebe um código único no formato `SCP-00001`. Em `/inscricoes`, ele consulta o status, prazo de pagamento e envia um comprovante Pix em imagem ou PDF de até 5 MB.

Na aba **Competições** do painel `/admin`, a organização pode criar várias edições independentes, cada uma com data, limite de equipes, taxa, premiação e inscrições próprias. O formato **Semanal** é um mini campeonato eliminatório realizado em um único dia; quando as partidas são concluídas, a edição é arquivada automaticamente em `/museu`. A página pública de cada edição permite acompanhar os resultados, e uma conta pode inscrever mais de uma equipe enquanto as inscrições estiverem abertas.

Rotas: `/campeonatos` lista as edições, `/inscricoes/nova?competitionId=...` abre a inscrição ou acompanhamento, e `/museu` exibe o acervo concluído.

A organização ganhou a aba **Inscrições** no painel `/admin`. A fila mostra equipe, capitão, elenco, status e arquivo enviado. O administrador pode colocar a solicitação em análise, aprovar, recusar ou pedir um novo comprovante. As transições são persistidas no snapshot e registradas no histórico da inscrição. A página de configurações também permite alterar modalidade, tipo Copa/Liga, taxa, premiação, limite de equipes, prazos e dados do Pix.

O fluxo usa o mesmo banco do campeonato, tanto no modo gerenciado quanto no modo self-hosted SQLite. Snapshots antigos recebem defaults automaticamente; não é necessário recriar o banco para preservar times, partidas, chaveamento ou replays existentes.

### Rotas adicionadas

- `/campeonatos`: vitrine da competição, modalidade, vagas, taxa, premiação e prazos.
- `/inscricoes`: inscrições do usuário autenticado, histórico e envio de comprovante.
- `/inscricoes/nova`: formulário de equipe, capitão, elenco e aceites obrigatórios.

### Configuração do Pix e Discord

A chave Pix, recebedor e prazos são configurados pelo administrador no painel. No self-hosted, capitães podem criar uma conta de e-mail e senha para fazer e acompanhar inscrições; o papel administrativo continua reservado às credenciais configuradas no `.env`. A automação de mensagens do bot Discord usa configuração independente.

### Verificações desta atualização

`pnpm check` passou, `pnpm build` passou e a suíte automatizada passou com 33 testes. O servidor self-hosted temporário respondeu HTTP 200 em `/api/health`, `/campeonatos`, `/inscricoes` e `/inscricoes/nova`, e o manifesto `/manus-routes.json` foi atualizado.


## Bot Discord operacional

A pasta [`bot/`](bot/README.md) agora contém um bot Discord baseado em `discord.js`. Ele registra comandos slash, consulta o site por uma API protegida e monitora alterações do campeonato.

Comandos disponíveis: `/ajuda`, `/competicao`, `/inscricao`, `/status`, `/partidas`, `/classificacao`, `/painel` e `/anunciar` para administradores. O bot também envia avisos de novas inscrições, comprovantes enviados, aprovações/recusas, partidas ao vivo e resultados encerrados.

O site expõe `GET /api/bot/snapshot`, protegido pelo cabeçalho `x-bot-token`. O token do bot Discord e o token da API são segredos diferentes. As instruções completas de instalação, permissões e canais estão em [`bot/README.md`](bot/README.md).

No desenvolvimento, `pnpm dev` carrega as configurações do `.env` do projeto, aguarda a API do site ficar disponível e então inicia o bot no mesmo terminal; pressione `Ctrl+C` para encerrar ambos. Para produção self-hosted, execute `pnpm build` e depois `pnpm start:selfhosted`.

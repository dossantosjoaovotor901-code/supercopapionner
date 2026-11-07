# Edição portátil Node + SQLite

Esta pasta é a edição local solicitada para a Super Copa Pionner. Ela usa a API nativa `node:sqlite` do Node 22, sem `node_modules` e sem dependência binária externa.

## Executar

Na raiz do projeto:

```bash
node portable/init.mjs
PORT=3010 PORTABLE_ADMIN_KEY=troque-esta-chave node portable/server.mjs
```

A API local fica em `http://127.0.0.1:3010`:

- `GET /api/health` verifica Node + SQLite.
- `GET /api/tournament` retorna o snapshot salvo.
- `GET /api/replays/:matchId` retorna os metadados do replay.
- `POST /api/replays/:matchId` aceita `{ "fileName": "jogo.mp4", "mime": "video/mp4", "base64": "..." }` com o header `x-admin-key`. O jogo precisa estar encerrado e o arquivo tem limite de 30 MB.

O banco é criado em `portable/data/super-copa-pionner.sqlite` e os uploads locais em `portable/uploads/`. O inicializador nunca sobrescreve um banco já existente. Para trocar a origem do snapshot, use `PORTABLE_SNAPSHOT=/caminho/arquivo.json`.

A versão hospedada no Preview continua usando o banco gerenciado e o armazenamento da plataforma, enquanto esta camada entrega uma edição Node + SQLite independente para execução local.

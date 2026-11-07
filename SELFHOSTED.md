# Super Copa Pionner — execução própria

## Requisitos

Node.js 22 ou mais recente e pnpm 10. Na VPS Ubuntu:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pnpm
```

## Rodar no localhost

Na pasta do projeto:

```bash
cp .env.selfhosted.example .env
nano .env
pnpm install
pnpm build
pnpm start
```

Abra `http://localhost:3000`. O banco é criado automaticamente em `data/super-copa-pionner.sqlite`; uploads ficam em `data/uploads`.

Por padrão, `LOCAL_START_EMPTY=true` remove os dados demonstrativos na primeira inicialização, mas preserva o nome e a logo. Assim, ao cadastrar os times e salvar o primeiro conjunto com pelo menos duas equipes, os potes, grupos, jogos e mata-mata são criados automaticamente. Se quiser manter o snapshot demonstrativo, use `LOCAL_START_EMPTY=false` antes de criar o banco.

No primeiro acesso ao painel, use `http://localhost:3000/admin` e entre com `LOCAL_ADMIN_EMAIL` e `LOCAL_ADMIN_PASSWORD` definidos no `.env`. Visitantes podem criar uma conta de usuário pela tela de login para fazer e acompanhar inscrições; o cadastro não concede acesso administrativo.

## Bot Discord

O bot é configurado separadamente do login do site. Consulte [bot/README.md](bot/README.md) para configurar e iniciar o bot.

## Rodar na VPS

```bash
PORT=3000 pnpm start
```

Libere a porta configurada no firewall ou coloque Nginx/Caddy na frente como proxy reverso. Para deixar o processo reiniciando sozinho com systemd, crie `/etc/systemd/system/super-copa-pionner.service`:

```ini
[Unit]
Description=Super Copa Pionner
After=network.target

[Service]
WorkingDirectory=/var/www/super-copa-pionner
EnvironmentFile=/var/www/super-copa-pionner/.env
ExecStart=/usr/bin/node /var/www/super-copa-pionner/dist/index.js
Restart=always
RestartSec=5
User=www-data

[Install]
WantedBy=multi-user.target
```

Depois:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now super-copa-pionner
sudo systemctl status super-copa-pionner
```

Use uma senha forte para `LOCAL_ADMIN_PASSWORD` e um valor aleatório longo para `LOCAL_SESSION_SECRET`. Não publique o arquivo `.env` nem compartilhe o banco SQLite sem necessidade.

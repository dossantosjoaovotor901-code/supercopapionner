

## Update funcional: inscrições e pagamentos

- [x] **Catálogo e configuração da competição**
  - A área pública deve exibir a competição Super Copa Pionner com modalidade, taxa, premiação, quantidade de vagas, datas e status das inscrições.
  - O painel deve permitir alterar taxa, premiação, limite de equipes, prazo de inscrição, prazo de pagamento, chave Pix e recebedor.

- [x] **Inscrição autenticada de equipe**
  - O capitão deve entrar com a autenticação disponível, informar equipe e elenco, aceitar o regulamento e confirmar responsabilidade pelas informações.
  - O servidor deve verificar inscrições abertas, limite de vagas e equipe duplicada antes de criar o registro.
  - Após enviar, o sistema deve gerar um código único no formato `SCP-00042` e mostrar o status da inscrição.

- [x] **Comprovante e triagem financeira**
  - O capitão deve poder enviar imagem ou PDF do comprovante, associado à inscrição correta.
  - O administrador deve visualizar a fila de pagamentos, aprovar, recusar ou solicitar novo comprovante, com observação.
  - Toda transição de status deve ficar no histórico e pagamentos em análise não devem expirar automaticamente.

- [ ] **Integração Discord preparada**
  - Os eventos de inscrição e aprovação devem ficar isolados para futura notificação no bot Discord.
  - A integração externa só será ativada após fornecer token, servidor e canais configurados; nenhuma credencial deve ser hardcoded.


## Update do Bot Discord

- [x] **Bot Discord com comandos slash**
  - O bot oferece `/ajuda`, `/competicao`, `/inscricao`, `/status`, `/partidas`, `/classificacao`, `/painel` e `/anunciar` para administradores.

- [x] **Notificações automáticas**
  - O bot consulta a API protegida e comunica novas inscrições, comprovantes, mudanças de status, partidas ao vivo e resultados encerrados.
  - Quando houver ID Discord numérico do capitão, o bot tenta enviar DM automática.

- [ ] **Ativação no servidor oficial**
  - Ainda depende do token do bot, ID do servidor, IDs dos canais e permissões no Discord do usuário.

# Update funcional — Super Copa Pionner

## Objetivo

Evoluir o site existente de acompanhamento esportivo para uma plataforma de competições de HaxBall, preservando o que já funciona (home pública, agenda, chaveamento, classificação, equipes, jogadores, regulamento, painel protegido, replays e modo self-hosted) e adicionando o primeiro fluxo operacional real: catálogo da competição, inscrição de equipe, geração de código, envio de comprovante e triagem administrativa.

## Escopo desta entrega

- Estender o snapshot persistido com configuração de inscrição, valor, premiação, vagas e chave Pix, além de inscrições e pagamentos.
- Adicionar a página pública de inscrições com formulário da equipe, elenco, aceite do regulamento e confirmação financeira.
- Exigir usuário autenticado para envio, associando a inscrição ao usuário da sessão e gerando código SCP-xxxxx.
- Adicionar upload de comprovante com validação de imagem/PDF, limite de 5 MB e status controlado.
- Adicionar painel administrativo de inscrições: lista, filtros e ações para aprovar, recusar ou solicitar novo comprovante, com observação e histórico.
- Adicionar navegação pública para campeonatos/inscrições e uma área de status da inscrição.
- Manter integrações Discord como próxima etapa configurável: os eventos de domínio ficam prontos para notificação, mas nenhuma chamada externa será inventada sem credenciais e canais do servidor.

## Abordagem técnica

O projeto já usa React, Express, tRPC, Drizzle e um snapshot de campeonato com controle otimista de revisão. O domínio de inscrições será armazenado no mesmo snapshot para funcionar tanto no banco gerenciado quanto no modo SQLite portátil, com defaults compatíveis para snapshots existentes. Mutations administrativas continuarão atrás de `adminProcedure`; envio e consulta da própria inscrição usarão `protectedProcedure`.

O comprovante será salvo pelo storage já existente, com validação de MIME e bytes no servidor. O fluxo de estado será: `received` → `awaiting_payment` → `proof_submitted` → `under_review` → `confirmed`/`rejected`/`expired`/`cancelled`. Cada mudança mantém uma entrada de histórico.

## Projeto e responsabilidades

- `shared/championship.ts`: tipos públicos de inscrição, pagamento e configuração.
- `server/championship.ts`: schemas e validações do snapshot.
- `server/routers.ts`: criação, consulta, envio de comprovante e triagem administrativa.
- `client/src/pages/Registration.tsx`: formulário público e status da inscrição.
- `client/src/pages/Championships.tsx`: catálogo/destaque da competição ativa.
- `client/src/pages/Admin.tsx`: gestão de inscrições e pagamentos.
- `client/src/App.tsx`, `client/src/index.css`, `client/public/manus-routes.json`: navegação, layout e manifesto.
- `plan.md` e `TODO.md`: decisões e critérios de entrega.

## Design

### Movimentos avaliados

- Editorial esportivo premium — 0,06.
- Painel operacional neon — 0,07.
- Arena azul institucional — 0,08.

### Escolha: Arena azul institucional

**Movimento:** a linguagem visual existente, inspirada em placares e centros de competição, será mantida e expandida com uma camada de operação clara para inscrições e pagamentos.

**Princípios:** confiança antes de ornamentação; estados sempre visíveis; densidade de informação controlada; ações importantes com confirmação.

**Paleta:** azul profundo e azul elétrico representam organização e energia de jogo; superfícies brancas e cinzas suaves preservam leitura em telas administrativas; âmbar e vermelho aparecem apenas para pendências e exceções.

**Layout:** páginas públicas seguem composição editorial com hero + cartões de ação; a área de inscrição usa formulário em duas colunas no desktop e fluxo vertical no celular; o painel financeiro privilegia filas e indicadores.

**Elementos assinatura:** código de inscrição em destaque, badges de status e faixa “Acompanhe sua inscrição” conectando o site à operação.

**Interação:** toda ação de envio mostra confirmação e código; erros explicam como corrigir; estados de pagamento não são alterados somente pela aparência.

**Animação:** transições curtas de 160–220 ms, entrada suave dos cartões e nenhum movimento decorativo que dificulte leitura.

**Tipografia:** Inter para dados e instruções; Barlow Condensed para títulos e números de placar.

**Essência:** a central de inscrições e jogos da comunidade HaxBall — organizada, transparente e pronta para a próxima partida. Personalidade: competitiva, confiável, direta.

**Voz:** CTAs são objetivos (“Enviar inscrição”, “Conferir pagamento”); microcopy reduz ansiedade (“Seu código acompanha toda a análise”).

**Marca:** manter o wordmark e logo oficial existentes; usar o código SCP como assinatura de produto na jornada de inscrição.

**Cor proprietária:** azul Copa `#1459e6`.

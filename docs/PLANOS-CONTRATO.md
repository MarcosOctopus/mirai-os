# Contrato — Planos no plano de controle ↔ Painel do MIRAI OS

Este arquivo é a **interface** entre duas partes que vão ser construídas em paralelo.
Nenhuma das duas pode mudar isto sozinha: se mudar, as duas mudam juntas.

## Quem é quem

- **Plano de controle** = serviço de identidade (`identity-service`, `/opt/mirai/control/identity/app.py`,
  FastAPI, interno em `127.0.0.1:8085`, público `https://id.miraitohope.com`). É a **fonte da verdade**
  de plano e capacidade: `plans`, `capabilities`, `product_capabilities`, `entitlements`, `tenants.plan`.
- **Painel** = MIRAI OS (`/opt/data/mirai-app`), página `/admin/planos`. Ele **mostra e edita**,
  mas não guarda plano nenhum. Se um dia divergirem, vale o plano de controle.

## Regra de ouro

O painel **nunca** fala com o Postgres do plano de controle nem guarda o segredo de admin
no navegador. O navegador chama a rota do próprio app (`/api/admin/planos`), e **essa rota**
é quem fala com o plano de controle, server-side, com o segredo. O segredo nunca sai do servidor.

## Quem pode mudar preço

Só o e-mail `marcospaulonascimentoguimaraes@gmail.com`. Já existe `OWNER_EMAIL` em
`src/lib/orgs.ts:19` e a trava por prefixo de rota em `src/middleware.ts` (`OWNER_ONLY_PAGES`
inclui `/admin`, `OWNER_ONLY_API` inclui `/api/admin`). Para **escrita de plano** acrescentar
constante explícita `EMAIL_QUE_MUDA_PRECO` — assim mudar o dono da plataforma no futuro
não dá carona para mexer em preço.

## Endpoints a expor no plano de controle

Autenticação: **reusar o padrão que já existe** para o app falar com o plano de controle
(procurar em `src/lib/mirai-oidc.ts` / variáveis de ambiente do app) — não inventar um novo
esquema. Se hoje não houver um segredo de admin, propor um (`MIRAI_ADMIN_SECRET`) e justificar.

| Método | Rota | Corpo / Resposta |
|---|---|---|
| GET | `/v1/admin/plans` | `{ planos: [{ plan_id, product_id, nome, preco_centavos, intervalo, ativo, capacidades: [capability_id], limites: {} }] }` |
| POST | `/v1/admin/plans` | upsert: `{ plan_id, product_id, nome, preco_centavos, intervalo, ativo }` |
| PATCH | `/v1/admin/plans/{plan_id}` | `{ nome?, preco_centavos?, intervalo?, ativo? }` |
| GET | `/v1/admin/plans/{plan_id}/capabilities` | `{ capacidades: [capability_id] }` |
| PUT | `/v1/admin/plans/{plan_id}/capabilities` | `{ capacidades: [capability_id] }` — **substitui** o conjunto |
| GET | `/v1/admin/capabilities` | `{ capacidades: [{ capability_id, product_id, nome, area }] }` |
| GET | `/v1/admin/organizacoes` | `{ organizacoes: [{ tenant_id, nome, plan_id, capacidades_extras: [capability_id], desde }] }` |
| GET | `/v1/admin/usuarios` | `{ usuarios: [{ user_id, nome, email, papel, tenant_id, tenant_nome, plan_id, capacidades_extras: [capability_id], desde }] }` — pedido do Marcos em 05/10 |
| POST | `/v1/admin/organizacoes/{tenant_id}/plano` | `{ plan_id }` |
| POST | `/v1/admin/organizacoes/{tenant_id}/capacidades` | `{ capability_id, conceder: true\|false }` — add-on avulso |

**Os nomes de campo acima são indicativos.** A tarefa é alinhar com o **schema real**
(`/opt/mirai/control/schema/001_control.sql` e `003_capabilities.sql`) e reportar o mapeamento —
inclusive se preço/intervalo **não existirem hoje** em `plans` e precisarem de migration nova.

## O que o painel mostra

1. **Lista de planos** — cartão por plano: nome, preço, quantas organizações usam, resumo do que dá.
   Botão "Novo plano" (criação manual).
2. **Detalhe do plano** — capacidades agrupadas por produto e por área (Atendimento, IA, Canais,
   Add-ons) com chave liga/desliga; campos numéricos de limite (usuários, contatos, canais,
   mensagens/mês); e os dois freios que já existem de verdade: teto de gasto de IA
   (`ai_budgets.monthly_limit_cents`) e teto diário de envio por número
   (`channel_sessions.daily_message_limit`).
3. **Quem tem o quê** — linha por organização: plano, capacidades extras, desde quando,
   e botão de conceder/revogar na mão (sem passar por pagamento).
4. **Usuários** — a lista de pessoas do ecossistema (pedido do Marcos, 05/10): nome, e-mail,
   organização, papel, plano atual, capacidades extras e desde quando. Com busca por
   nome/e-mail/organização, filtro por plano, e uma coluna de **status de pagamento**
   reservada (preenche quando o AbacatePay entrar, para não refazer o layout).

Padrão visual: **Dash** — mesma casca (`Shell`), Poppins, laranja `#ff751f`, cartões 24px,
raios 10px em botão, **ícones de traço, nunca emoji**. Tokens válidos: `bg/side/card/raise/line/muted/brand/ok/warn/bad`
(não existe `surface`).

## Ordem

1. Endpoints no plano de controle (com migration, se faltar campo).
2. Rota-proxy no app (`/api/admin/planos`), server-side, com o segredo.
3. Página `/admin/planos`.
4. Item de menu com `soDono` (só aparece para o dono).

Nada disto vai para produção sem: backup, `py_compile`/build limpo, e prova por medição depois.

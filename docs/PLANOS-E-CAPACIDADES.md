# Planos e Capacidades — escopo MIRAI OS + Saaso

> Documento de trabalho. Escopo definido pelo Marcos em 05/10/2026:
> **só MIRAI OS e Saaso entram nos planos agora.** Pathfinder, Media Factory,
> Mapa Paper, Pocket e os agentes são produtos **vendidos separadamente** —
> quando chegarmos neles, aí entra a integração entre produtos.
>
> Toda capacidade segue o formato `produto.area.acao`, o mesmo que o plano de
> controle (serviço de identidade) já usa no schema `003_capabilities.sql`.

---

## 1. O que nós já temos de graça

O plano de controle em node2 **já tem** a estrutura que este plano precisa:

| Tabela | Para que serve |
|---|---|
| `plans` | o plano (ex.: `mirai-os_pro`) |
| `capabilities` | a capacidade (ex.: `mirai-os.chat.usar`) |
| `product_capabilities` | qual capacidade pertence a qual produto |
| `entitlements` | o que **cada organização** tem liberado |
| `tenants.plan` | toda organização já nasce com um plano (`free`) |

As capacidades viajam **dentro do token**, então o produto não precisa perguntar
no banco a cada clique.

**Já cadastrado:** produtos `mirai`, `mediafactory`, `pathfinder`, `darkmatter`
com planos free/pro/business.
**Falta cadastrar:** `saaso` (não existe no registry) e as capacidades abaixo.

---

## 2. Catálogo — MIRAI OS

### 2.1 Hoje aberto para qualquer conta (o núcleo)

| id | Módulo | O que entrega |
|---|---|---|
| `mirai-os.painel.ver` | Painel | Conta, organização, integrações, status do CRM |
| `mirai-os.navegacao.menu` | Casca/menu | Sidebar, topbar, menu da conta |
| `mirai-os.conta.perfil` | Perfil | Nome, e-mail, papel, organização, sair |
| `mirai-os.organizacao.ver` | Minha organização | White-label: nome, quem entra, papel |
| `mirai-os.chat.usar` | Chat escrito | Conversa com a Mirai em streaming |
| `mirai-os.chat.modo_arquiteto` | Modo Arquiteto | Alterna conversa natural / técnico |
| `mirai-os.chat.contexto_arca` | Memória no chat | Injeta a Arca no contexto da resposta |
| `mirai-os.arca.consultar` | Consultar a Arca | Memória/documentos do ecossistema |

### 2.2 Hoje travado no dono (vira módulo vendável)

| id | Módulo | Situação |
|---|---|---|
| `mirai-os.organizacao.gestao_membros` | Gestão de funcionários | Existe; exige admin da organização |
| `mirai-os.integracoes.ver` | Integrações | Existe; canais por conta |
| `mirai-os.integracoes.drive` | Google Drive | OAuth, precisa do escopo certo |
| `mirai-os.integracoes.youtube` | YouTube | OAuth (hoje reporta token expirado) |
| `mirai-os.integracoes.chave_api` | Canais por chave | Higgsfield, Suno, Telegram, Magnific, Instagram, Kling |
| `mirai-os.integracoes.saaso` | CRM no painel | Via MCP, por organização |
| `mirai-os.orb.conversar` | **Orb — voz** | Tela principal; microfone |
| `mirai-os.orb.wake_word` | **"Hey Mirai"** | Picovoice no navegador |
| `mirai-os.voz.tts` | Fala (TTS) | ElevenLabs + fallback do navegador |
| `mirai-os.voz.stt` | Transcrição (STT) | Groq → OpenAI/Google → Gemini |
| `mirai-os.voz.barge_in` | Interromper falando | Escuta contínua ~30s |
| `mirai-os.chat.contexto_crm` | CRM no contexto do chat | Só se a organização tiver token do CRM |
| `mirai-os.chat.modelo_forte` | Modelo forte sob demanda | "chama o Claude" → OpenRouter |

### 2.3 Dono-only (NÃO vira plano agora)

`mirai-os.admin.organizacoes`, `mirai-os.sistema.*`, `mirai-os.media-factory.*`,
`mirai-os.conta.login_senha`, `mirai-os.conta.google`, `mirai-os.conta.mirai_oidc`
— são controle da plataforma e identidade, não módulo de cliente.

---

## 3. Catálogo — Saaso (CRM)

O Saaso tem uma vantagem enorme: **já tem catálogo declarativo de módulos**
(`lib/recursos-opcionais/catalogo.ts`), com dois níveis — módulos da instalação
(decididos pela Mirai) e capacidades da organização (decididas pela empresa).
É só mapear para `saaso.*`.

### 3.1 Atendimento e CRM (o núcleo)

`saaso.inbox.atender`, `saaso.radar.monitorar`, `saaso.agenda.agendar`,
`saaso.respostas_rapidas.usar`, `saaso.funis.gerir`, `saaso.contatos.gerir`,
`saaso.tarefas.gerir`, `saaso.tags.gerir`, `saaso.produtos.gerir`,
`saaso.metricas.analisar`, `saaso.auditoria.consultar`, `saaso.lgpd.atender`

### 3.2 IA

`saaso.ia_agentes.configurar`, `saaso.ia_followups.rodar`,
`saaso.ia_conhecimento.treinar`, `saaso.ia_memoria.gerir`,
`saaso.ia_skills.gerir`, `saaso.ia_casos.acompanhar`,
`saaso.ia_provedores.configurar`, `saaso.ia_uso.orcamentar`

### 3.3 Canais e integrações

`saaso.canais.conectar` (WhatsApp/WAHA), `saaso.whatsapp_oficial.conectar`,
`saaso.whatsapp_parceiro.conectar`, `saaso.webhooks.receber`,
`saaso.email.enviar`, `saaso.google_agenda.conectar`, `saaso.nuvemshop.integrar`

### 3.4 Add-ons (fora do núcleo)

`saaso.campanhas.disparar`, `saaso.prospeccao.prospectar`, `saaso.propostas.gerar`,
`saaso.crm_b2b.gerir_empresas`, `saaso.ia_atendimento.roteirizar`,
`saaso.financeiro.configurar`, `saaso.comandas.fechar`, `saaso.honorarios.gerir`,
`saaso.chamadas.registrar`, `saaso.voz_whatsapp.chamar`, `saaso.telefonia_sip.ligar`,
`saaso.meta_ads.analisar`, `saaso.google_ads.reportar`, `saaso.dados_externos.consultar`,
`saaso.equipe.convidar`, `saaso.extensoes.instalar`

---

## 4. Os limites que já existem de verdade

Isto é o que dá para amarrar num plano **hoje**, sem inventar:

| Freio | Onde vive | Valor de hoje |
|---|---|---|
| Gasto de IA por organização | `ai_budgets.monthly_limit_cents` | R$50/mês, modo off/avisar/bloquear |
| Envio por número (anti-ban) | `channel_sessions.daily_message_limit` | aquecimento 20/50/100/200… por dia |
| Ritmo de disparo | `throttleMs` 1200ms + jitter 800ms | janela 7h–22h |
| Rate limit por token | `tenant_integrations.rate_limit_rps` | 100 rps |

**Limites que ainda NÃO existem e precisam ser criados** (não há coluna nem tabela):
nº de usuários por plano, nº de contatos/leads, nº de canais/números,
nº de mensagens/mês, teto de agentes de IA, **acesso simultâneo (ver 4.1)**.

---

## 4.1 Acesso simultâneo — teto de 200 + faixa de pico (decidido por Marcos, 06/out/2026)

**A regra:** cada projeto tem **200 acessos simultâneos** no app criado. Passando disso, a cobrança
muda de faixa — o modelo é **faixa de pico** (escolha do Marcos entre três modelos propostos).
O dono escolhe o modelo na tela de **Perfil**.

### O que conta como "um acesso simultâneo"

**Requisição em voo no mesmo instante** (concorrência), medida por organização no gateway.
Não é "sessão aberta": o app autentica por JWT e **não tem store de sessão** — o banco só tem
`users`, `organizations` e `memberships` (o histórico do chat, por exemplo, mora no `localStorage`).
"Quem está com a aba aberta" não é medível hoje, e prometer esse número seria inventar. Concorrência
em voo é medível e já tem **freio irmão** no ecossistema: `tenant_integrations.rate_limit_rps`
(100 rps por token). Os dois convivem: **rps é ritmo** (quantas por segundo), **simultâneo é
quantidade ao mesmo tempo**. O teto de 200 é o irmão grosso do rps.

### As faixas

| Faixa | Pico simultâneo | Preço/mês |
|---|---|---|
| Incluso no plano | até **200** | já incluso |
| Faixa 1 | 201 – 500 | **R$ — (Marcos define)** |
| Faixa 2 | 501 – 1.000 | **R$ — (Marcos define)** |
| Faixa 3 | 1.001 – 2.500 | **R$ — (Marcos define)** |
| Acima | 2.500+ | sob consulta |

- **O pico é o MAIOR valor observado no mês**, não a média — é isso que "faixa de pico" significa:
  se o projeto bateu 640 simultâneos em algum momento do mês, aquele mês fecha na Faixa 2.
- **O preço é da FAIXA, no mês — NÃO é por acesso.** Dois projetos que bateram 350 e 480 no mesmo mês
  pagam **o mesmo** (o preço da Faixa 1). É exatamente o que torna a conta previsível — foi por isso que
  a faixa de pico foi escolhida. *(Dúvida do dono, respondida em 06/out/2026: "nesse preco por centavo
  mes é por um acesso correto?" → **não**.)*
- **Ancorar o preço no TOPO da faixa, não no começo.** O custo mora no topo: 500 simultâneos custam mais
  que 201 e os dois pagam igual, então o número tem de cobrir o pior caso da faixa. Preço pensado para o
  meio (ex.: 300) faz os maiores projetos da faixa darem prejuízo todo mês.
- **A contagem é por projeto/organização.** Cada projeto tem o **próprio** teto e o **próprio** pico do
  mês — não é um bolo compartilhado entre projetos.
- O teto base (200) **mora no plano de controle**, com os outros limites. **CONFERIDO no schema real**
  (`/opt/mirai/control/schema/001_control.sql:73`, em 06/out/2026):
  `plans(plan_id, product_id, name, limits JSONB NOT NULL DEFAULT '{}')` — o campo é **JSONB**, e a
  coluna real se chama **`limits`** (não `limites`; o nome em português no contrato era indicativo).
  **Logo: zero migration.** O teto entra como chave: `limits.acessos_simultaneos = 200`.
- O schema **não tem nenhuma coluna de preço** (varrido `preco|price|centavos|intervalo|billing|currency`
  → zero linhas). Como `limits` é JSONB, **as faixas e os preços cabem no mesmo campo**
  (`limits.faixa_pico`) — o modelo inteiro entra **sem tocar em DDL**.
- **Os preços são decisão do dono** — a tabela fica com o campo vazio até ele definir.

### O que acontece quando estoura

Três opções, **decisão do dono** (uma linha no plano de controle):

1. **Fila / degrada** — acima do teto a requisição espera ou cai na experiência reduzida.
   Nunca derruba quem está dentro da faixa.
2. **429 na porta** — o excedente recebe "teto atingido" e o aviso aparece no app.
3. **Sobe de faixa automático** — passa de 200 e o mês fecha na Faixa 1, sem bloqueio nenhum.

### Onde o dono escolhe

Na tela de **Perfil** (pedido literal: *"a parte do meu perfil tem que deixar escolher uma"*):
um seletor do modelo de cobrança do excedente, com **faixa de pico** já selecionada. A escolha é
da organização; o **teto** continua vindo do plano de controle.

### Decidido em 06/out/2026 (fecha o desenho)

- **Definição de "simultâneo"** = **requisição em voo** (decisão da Mirai, a pedido do dono:
  *"3 deixo em suas mãos"*). É o único número **medível hoje** — "sessão de gente" exigiria um
  store de sessão que não existe (auth é JWT puro).
- **No estouro entra a tela** `/limite`, com a logo da Mirai e a frase
  **"Desculpe, você chegou no limite do seu plano."** — nunca erro cru de servidor na cara do
  cliente. Ela é pública (`middleware.ts` → `PUBLIC_PATHS`) justamente para aparecer de qualquer
  jeito, e recebe o teto por `?limite=`.
- **Os preços são editáveis pelo dono** em `/admin/planos` (ele edita; o valor vive em `limites`).

### Achados do painel de planos (06/out/2026) — leia antes de mexer

1. **O nome do campo muda de lado.** Na API do plano de controle é **`limites`** (pt-BR); no
   Postgres a coluna é **`limits` JSONB DEFAULT '{}'**. O `admin_patch_plan` traduz.
2. **O painel estava MUDO e ninguém sabia.** O controle exige o header **`x-mirai-admin`** igual a
   `MIRAI_ADMIN_SECRET` (`identity/app.py`, `_require_admin`; sem fallback Basic). O `.env.local` do
   app **não tinha** essa var, então o app caía no Basic do OIDC e levava **403 "segredo de admin
   inválido"** — a tela abria, listava vazio e não salvava nada. Corrigido copiando o segredo do
   `/opt/mirai/control/.env` para o `.env.local` do app (que está no `.gitignore`).
3. **`PATCH /v1/admin/plans/{id}` SUBSTITUI o objeto `limits` inteiro** (`limits=%s` com o JSON
   completo) — **não faz merge**. A tela escapa disso porque envia `{...plano.limites}`; qualquer
   código novo que escreva `limites` precisa mandar o objeto **completo**, ou apaga o resto.
4. Os 12 planos (mirai/darkmatter/mediafactory/pathfinder × free/pro/business) estão visíveis com
   `preco_centavos: null` — **nenhum preço cadastrado ainda**.

### O que já está ligado (06/out/2026)

- `acessos_simultaneos` + os 3 preços de faixa **editáveis** em `/admin/planos` (lista `LIMITES`,
  que gera o campo numérico sozinha).
- Tela `/limite` pública, com logo e a frase — provada por medição (logo carregada, Poppins, botão).
- Auth do painel de planos consertada (item 2 acima).

### O que ainda falta

1. **Contador de concorrência em voo** por organização (pico do mês) — sem ele o teto é decorativo:
   nada conta, nada bloqueia, nada cobra.
2. **Seletor no Perfil** — a escolha do dono (pedido literal: *"a parte do meu perfil tem que
   deixar escolher uma"*).
3. Cadastrar os preços (o dono).

---

## 5. Composição proposta

### Free — entrada
Núcleo do MIRAI OS: painel, perfil, organização, chat escrito, Arca.
**Sem** Orb/voz, **sem** CRM. Limite de mensagens de chat por dia.

### Pro — o dia a dia
Tudo do Free **+ Orb de voz completo** (conversa, "Hey Mirai", fala, transcrição)
**+ Saaso núcleo**: inbox, radar, agenda, respostas rápidas, funis, contatos,
tarefas, tags, métricas, auditoria, LGPD **+ IA básica**: agentes, memória,
conhecimento, casos, orçamento de IA.

### Business — a operação inteira
Tudo do Pro **+ add-ons**: campanhas, prospecção, propostas, CRM B2B,
fluxos de atendimento, financeiro, telefonia/voz, Ads, integrações
(Drive, YouTube, Google Agenda, Nuvemshop) **+ equipe** e limites altos.

### Add-ons avulsos
Qualquer capacidade das seções 3.4 pode ser ligada por cima do plano,
sem trocar de plano — é para isso que serve capability em vez de "pacote fechado".

---

## 6. Pagamento (decidido com o Marcos)

- Provedor: **AbacatePay**, via **MCP** (ferramentas `createCheckout`,
  `listCheckouts`, `refundCheckout`, checkout transparente Pix/boleto).
- Modelo: **cobrança única por período + job nosso de renovação** — o MCP deles
  não lista assinatura recorrente.
- Fluxo: a pessoa escolhe o plano na LP → checkout Pix → pagamento confirmado →
  **o plano é liberado como entitlement** para a organização dela.
- Painel no admin: criar plano, marcar o que ele dá, e ver quem tem o quê.

---

## 7. A regra que não se negocia

O entitlement mora **só** no plano de controle. Os produtos nunca têm tabela de
plano própria: perguntam "esta organização tem a capacidade X?" e recebem sim/não.
Mudar a composição de um plano num lugar passa a valer nos produtos na hora —
e é isso que impede sete listas divergentes em dois meses.

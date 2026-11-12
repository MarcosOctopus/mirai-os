# Cosmic Agent — ANEXO DO C3 (agentes personalizados da conta)

> ⚠️ **Este NÃO é o plano do Cosmic Agent.** O plano-mãe é `/opt/data/arca/plans/canais-agentes-mirai-os.md`
> (C1 ✅ concluído · C2 repasse entre agentes · C3 objetivo → time), com a governança em
> `agentes-governanca-tucano.md`. Este documento é só a **camada de dados/tela** que o **C3** vai
> precisar quando o dono aprovar a fase: a pessoa descrevendo o agente que quer.
> Escrito antes de eu puxar os planos que já existiam — registrado como lição: **auditar a Arca
> ANTES de planejar**, não depois.

**Data:** 11/11/2026 · **Estado:** anexo, nada implementado

**Objetivo (uma frase):** o Cosmic Agent deixa de ser uma vitrine fixa de 8 agentes e passa a ser a
CASA dos agentes — os 8 da governança do ecossistema (fixos) **mais** os agentes personalizados da
conta, que a própria pessoa cria, edita, apaga e descreve do jeito que ela quer.

**Arquitetura:** espelhar o caminho que as **skills da conta** já provaram (`skills_cliente` +
`src/lib/skills-do-cliente.ts` + `src/app/api/skills/route.ts`): mesmo banco (`data/auth.db`),
`better-sqlite3`, tabela com `CREATE TABLE IF NOT EXISTS`, escopo por `user_id` em toda leitura e
escrita, e a mesma trava que recusa instrução com cara de credencial.

**O que o dono pediu, em palavras dele:**
- "cópia exata da página de Skills para o Cosmic Agent e só adapta"
- "os agentes personalizados dá pra editar e a pessoa pedir o que ela quer"
- "foto completa que colocarei do agente com nome dele do lado"

---

## Estado atual (tudo NO AR hoje, app.miraitohope.com)

| Peça | Onde vive | Observação |
|---|---|---|
| A aba Cosmic Agent | `src/components/dash/CosmicAgent.tsx` montado em `src/app/dashboard/connect/page.tsx:1333` e na cópia `src/app/dashboard/DashboardCliente.tsx:1331` | dupla superfície, igual ao SkillsEspelho |
| A lista dos 8 agentes | `src/lib/cosmic-agentes.ts` | **estática** — é o que precisa mudar |
| As fotinhas | `public/cosmic/<slug>.png` | pixel art, 384px, fundo transparente |
| O rastro | `/api/canais` | de onde sai "Meus agentes usados" |
| O carrossel | `[data-cosmic-faixa]` | automático (3,8s), uma peça por vez, pausa no hover/foco/dedo |
| O card | `[data-slide-agente]` | 209×299 (0,70), barra laranja 16%, nome girado, foto `contain` |
| O modal | `[data-agente-detalhe]` | já no padrão exato do `ModalProduto` (integrações) |
| O molde a copiar | `src/lib/skills-do-cliente.ts` (206 linhas), `src/app/api/skills/route.ts` (114 linhas), tabela `skills_cliente` | escopo por conta, limites, detector de credencial |

**Pendências de acabamento já conhecidas (não bloqueiam nada):** o recorte do canto (hoje `rounded-[10px]`)
e a margem da figura (hoje `padding: 28px`). São DOIS NÚMEROS — o dono ajusta de olho, um por um.

---

## Fase 1 — Dados: os agentes da conta

**Objetivo:** existir o lugar onde um agente personalizado vive, escopado por conta.

**Criar:** `src/lib/agentes-do-cliente.ts`

Tabela (espelho da das skills, com os campos que um agente tem a mais):

```
agentes_cliente(
  id TEXT PRIMARY KEY,        -- agc_<uuid>
  user_id INTEGER NOT NULL,
  nome TEXT NOT NULL,         -- como ele é chamado (aparece na fala)
  papel TEXT,                 -- uma palavra, vira o tema no card (ex.: Pesquisa)
  descricao TEXT,             -- uma linha do que ele faz
  instrucoes TEXT NOT NULL,   -- o que a pessoa quer que ele faça, em texto
  base TEXT,                  -- nome do agente do ecossistema que serviu de base, ou null
  cor TEXT,                   -- cor do card (a área da foto)
  foto TEXT,                  -- caminho da imagem enviada pela conta, ou null
  criada_em TEXT NOT NULL,
  atualizada_em TEXT NOT NULL
)
CREATE INDEX idx_agentes_cliente_user ON agentes_cliente(user_id);
```

Funções (mesmos nomes e mesma postura das skills, para o código parecer irmão):
`listarAgentesDoCliente(userId)`, `obterAgenteDoCliente(userId, id)`, `criarAgenteDoCliente(...)`,
`atualizarAgenteDoCliente(...)`, `apagarAgenteDoCliente(...)` — **toda** leitura/escrita filtrando
`user_id`; agente de outra conta é tratado como INEXISTENTE (vira 404, nunca "existe mas não é sua").

Limites: `LIMITE_NOME = 40`, `LIMITE_DESCRICAO = 240`, `LIMITE_INSTRUCOES = 20000`, `LIMITE_AGENTES = 20`
(quantos personalizados por conta — evita conta virar fazenda e mantém a tela legível).

**Reusar, não recriar:** `detectarCredencial` de `@/lib/skills-do-cliente` já recusa o que parece
senha/token/chave. Importar de lá (ou promover para um `@/lib/texto-seguro.ts` se houver incômodo em
importar de um módulo de skills) — a regra é: agente é TEXTO que ele segue, credencial mora no cofre.

**Prova:** `sqlite3` (ou Python) mostrando a tabela criada e vazia; um insert de teste direto e remoção.

---

## Fase 2 — API: `/api/agentes`

**Criar:** `src/app/api/agentes/route.ts` (GET, POST) e `src/app/api/agentes/[id]/route.ts` (PATCH, DELETE)

- **GET** → `{ agentes: [os 8 do ecossistema], minhas: [os da conta], limite: 20 }`.
  Os 8 continuam vindo de `cosmic-agentes.ts` (a governança não muda); `minhas` vem do banco, escopado.
- **POST** `{ nome, papel, descricao, instrucoes, base?, cor? }` → valida limites, roda
  `detectarCredencial`, recusa com mensagem em PT-BR, cria com id `agc_…`, responde 201.
  Se a conta já tem `LIMITE_AGENTES`, responde 400 com a razão (nada de falhar em silêncio).
- **PATCH** `/api/agentes/[id]` → edita nome/papel/descricao/instrucoes/cor. De outra conta → 404.
- **DELETE** `/api/agentes/[id]` → apaga. De outra conta → 404.
- **401 sem sessão** em todos (`exigirConta` de `@/lib/orgs`, igual às skills).
- `export const runtime = "nodejs"` e `dynamic = "force-dynamic"` — igual à rota das skills.

**Prova:** com sessão real (JWT do dono), `curl` no GET (ver os dois blocos), POST criando um agente,
PATCH renomeando, DELETE apagando; e SEM sessão, 401 e nada lido. E o caso hostil: tentar tocar o
agente de outra conta (deve dar 404).

---

## Fase 3 — Tela: criar, editar, apagar

**Modificar:** `src/components/dash/CosmicAgent.tsx`

1. **Fonte dos dados** — passar a buscar `/api/agentes` (hoje só importa `AGENTES` do arquivo).
   `AGENTES` continua sendo os 8; o que vem do banco entra como `meus`.
2. **Botão "Novo agente"** — na mesma linha da busca e dos chips (área de ações, como o "Nova skill").
3. **Editor EM LINHA** (a regra do dono: editor em linha, NÃO modal): abre abaixo do cabeçalho, com
   os campos nome, papel, o que ele faz (descrição) e "o que você quer que ele faça" (instruções),
   um seletor de cor a partir da PALETA + `input type=color` livre, e o campo da foto.
   Salvar/cancelar com `rounded-[10px]` (padrão do painel). O botão fica desabilitado enquanto salva.
4. **Os personalizados na grade** — junto dos 8, com um marcador discreto ("seu", um chip fino), e
   na frente para quem criou. Clique abre o MESMO modal (que já segue o padrão das integrações),
   com dois botões a mais para agente PRÓPRIO: **editar** (abre o editor em linha) e **apagar**
   (exige confirmação — a regra de segurança do app para DELETE).
5. **Apagar** — confirmar dentro do próprio fluxo (um segundo clique explícito), nunca um botão que
   apaga ao primeiro toque.

**Prova:** com sessão, criar um agente pela tela, ver ele aparecer na grade (medido no DOM), editar o
nome e ver mudar, apagar e ver sumir; recarregar a página e confirmar que persistiu.

---

## Fase 4 — A foto do agente (a "foto completa")

**O que o dono disse:** "foto completa que colocarei do agente com nome dele do lado" — a imagem é
DELE, ele vai colocar.

- **Upload:** reaproveitar o caminho que o app já usa para upload (existe `uploads` em `auth.db` e a
  pasta correspondente). Aceitar PNG/JPG/WebP, teto de tamanho (a definir, sugestão: 2 MB), guardar
  em `public/cosmic/contas/<user_id>/<id>.png` (ou equivalente fora do repositório, se o deploy
  trocar o build — **a confirmar na auditoria do upload**).
- **Sem foto:** manter o fallback honesto que já existe (bloco da cor do agente + inicial).
- **Recorte:** a foto entra com `objectFit: contain` e a margem do card (hoje 28px) — foto inteira,
  nunca cortada. Isso já está no ar e funciona.

**Prova:** subir uma imagem de teste, ver ela no card do slide e no do modal, e apagar o agente
verificando que o arquivo não fica órfão.

---

## Fase 5 — Comportamento: "a pessoa pede o que ela quer"

**Decisão pendente (a mais importante do plano).** As `instrucoes` do agente personalizado precisam
chegar em algum lugar que as faça valer. Duas leituras possíveis:

- **(A) O agente personalizado é um PARTICIPANTE DE CANAL.** As instruções entram como identidade
  dele quando ele fala no canal (onde hoje nasce o rastro). Exige auditar a camada do canal/MCP para
  saber onde o "quem fala" é definido — inclusive se há mais de um motor (Hermes, CLIs, MCP).
- **(B) O agente personalizado é um PRESET, não um executor.** Ele guarda o que a pessoa quer e serve
  de base para tarefas que a pessoa dispara na conversa (como uma skill). É mais simples, não toca
  no canal, e ainda entrega "pedir o que quer".

**Recomendação:** começar por **(B)** — entrega valor no mesmo dia, sem tocar na camada de canais — e
tratar **(A)** como fase seguinte, depois da auditoria do canal.

**Auditoria necessária antes de decidir:** como `/api/canais` define quem fala, e onde um agente novo
entraria na fila. Não inventar: ler a rota e o modelo antes.

---

## Fase 6 — Acabamento do card (o que o dono ajusta de olho)

Dois números, nada estrutural:
- `rounded-[10px]` — o recorte do canto.
- `padding: 28px` — a margem da figura.

O dono disse "depois mexo nisso". Quando ele apontar, é uma linha cada.

---

## Riscos, trava e perguntas abertas

- **Isolamento por conta é a trava número um.** Toda rota filtra `user_id`; agente de outra conta é
  INEXISTENTE (404). Nunca "existe, mas não é sua" — é a mesma postura de `conversas.ts`.
- **Credencial nunca entra.** Agente é texto; a `detectarCredencial` roda no servidor. Sem exceção.
- **Nada de execução de código** no agente personalizado: sem shell, sem eval, sem import de arquivo.
- **Limite de agentes por conta** (sugestão 20): evita tela ilegível e abuso.
- **Ocupa espaço de usuário?** Sim, e isso está no escopo: é o MIRA OS do usuário, com os agentes
  DELE. O que NÃO entra aqui: melhoria de ecossistema, acervo ou plano global — isso é pauta do dono.
- **Perguntas abertas:** (1) qual fase do comportamento — A ou B; (2) teto do upload e onde o arquivo
  é guardado em produção; (3) o agente personalizado aparece para outros usuários da mesma
  organização, ou só para quem criou? (sugestão: só para quem criou, até haver pedido explícito.)

## Ordem de execução recomendada

1. Fase 1 e 2 (dados + API) — dá para provar por `curl` sem tocar na tela.
2. Fase 3 (tela) — criar/editar/apagar de verdade.
3. Fase 4 (foto) — o que o dono disse que vai colocar.
4. Fase 6 (acabamento do card) — quando ele apontar.
5. Fase 5 (comportamento) — depois da auditoria do canal, na ordem que ele decidir (A ou B).

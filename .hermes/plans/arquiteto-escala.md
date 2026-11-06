# Arquiteto em escala — "não olhar sempre o sistema inteiro"

Dono (13/10/2026): *"n pode ficar dando esse erro. E como se quando demorasse ele desse um
timeout e erro. porém tem projetos que serão muito grandes. preciso que não caia em timeout.
por exemplo quando tiver um milhão de páginas, ele tem que agir de forma separada. e não olhar
sempre o sistema inteiro."*

## O PROBLEMA (medido no código, não suposto)

`src/app/api/arquiteto/gerar/route.ts`:

1. **`promptComArquivos` (L432-517)** manda **TODOS** os arquivos do projeto em todo pedido —
   até **60 arquivos / 90.000 chars**. É literalmente "olhar o sistema inteiro" a cada mensagem.
2. Prompt gigante → o modelo se perde → responde **TEXTO** em vez do bloco de projeto →
   cai no erro *"A resposta do modelo não veio no formato de projeto"* (L920-924).
3. **Teto de relógio** (`TETO_TOTAL_MS = 1200000`, L851; 600s por chamada, L615) corta no meio.
4. Com **1 milhão de páginas** isso é impossível por definição: 90k chars nem chegam perto.

O sintoma do print (espera de 4min25s + erro) é exatamente isso: prompt enorme + corte por tempo.

## A CORREÇÃO (o que o dono descreveu: agir por partes)

### FASE 1 — Índice + escopo do alvo (mata o erro e o timeout)

**Peça nova:** `src/lib/arquiteto-indice.ts`
- `construirIndice(arquivos, docProjeto)` → o **MAPA** do projeto: para cada arquivo,
  nome + tamanho + linhas + papel (o papel sai do PROJETO.md quando ele cita o arquivo;
  senão é inferido do tipo). Texto compacto.
- `escolherAlvos(arquivos, pedido, selecionados)` → **quais** arquivos viajam inteiros.
  Regras determinísticas primeiro (o pedido cita o nome do arquivo? o alvo marcado na
  prévia aponta um arquivo?); nada casou e o projeto é grande → **roteador** (chamada
  pequena e rápida ao modelo, com o mapa + o pedido, devolvendo nomes de arquivo).

**Regra de escopo (sem regressão):**
- Projeto **pequeno** (≤ 6 arquivos e ≤ 90k no total) → comportamento de HOJE (manda tudo).
  É rápido e funciona; não se mexe no que está bom.
- Projeto **grande** → manda o **MAPA** + **só os arquivos do pedido**.

**Escalação (agir de forma separada):** se o modelo precisa de um arquivo que não recebeu,
ele responde **apenas** `=== PRECISA: nome, nome ===` e o servidor **reenvia** com esses
arquivos (até 2 escalações). Assim o pedido nunca falha por falta de contexto — ele PEDE.

**Sem corte por relógio:** o teto deixa de ser limite de trabalho e vira só rede de segurança
(já é a doutrina do dono, 11/10/2026). O batimento de 4s mantém a conexão viva.

### FASE 2 — Fila em lote (o "um milhão de páginas")

Pedido que toca MUITOS arquivos não vira uma chamada gigante: vira uma **FILA**.
- O modelo devolve um **PLANO** (a lista de arquivos que o pedido afeta).
- O servidor processa em **lotes** (K arquivos por chamada), **gravando cada lote** ao terminar.
- Lote que falha não derruba os outros: o que já foi feito está gravado; a tela diz o que faltou.
- A tela mostra o progresso **por lote** ("lote 3 de 12"), não um relógio cego.

## ORDEM DE EXECUÇÃO (cada fase provada e commitada)

1. ✅ FASE 1 — `arquiteto-indice.ts` + `promptComIndice` + escalação. Prova: `scripts/prova-indice.ts` (**32/32**).
2. ✅ FASE 1 — provado ponta a ponta num **projeto de TESTE**: `scripts/prova-escala.ts` (**11/11**).
   Medido: 14 arquivos / 139 mil chars → escopo de 1 → 200 OK em 19-33s; os outros 13 byte a byte iguais.
3. ✅ FASE 2 — fila em lote + progresso por lote. Prova: `scripts/prova-fila.ts` (**13/13**).
   Medido: pedido em 10 páginas html → fila de 3 lotes; as 10 mudam; css/js/md intactos; cada lote gravado.

Commits: `a98a48e` (a peça pura) + `1735298` (escopo, escalação e fila).

## REGRAS DE PROCESSO (aprendidas, valem aqui)

- **Não reiniciar o servidor enquanto o dono usa o app.** Juntar consertos numa publicação só.
- **Teste em projeto SEPARADO** — o servidor grava sozinho, então testar no projeto real ALTERA o real.
- **Backup do banco** antes de migração.
- **Prova com o caminho real** (não "achismo"): rota + banco + diff.

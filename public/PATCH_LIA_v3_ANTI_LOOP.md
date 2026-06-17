# Patch Anti-Loop — Chatbot Lia v3.1

**Data:** 17 Jun 2026  
**Autor:** Mirai  
**Objetivo:** Eliminar loops de regressão de estado na conversação da Lia  
**Afeta:** 3 nós no fluxo N8n "GAZETA - FALA AE CHAT v3"  
**Testes:** 38 roteiros de homologação (RT-ENT-01 a RT-VAL-08)

---

## Índice das Alterações

| # | Nó | Tipo | O que muda |
|---|-----|------|------------|
| 1 | `Valida resposta e estado` | Code | Função `mergeSeguro()` — estado anterior é FONTE DA VERDADE |
| 2 | `Prepara Prompt Agent` | Code | Adiciona `campo_esperado` e `travas` ao JSON de saída |
| 3 | `Chain Classifica Intencao` | Basic LLM Chain | Prompt reformulado — classifica EM RELAÇÃO À ETAPA |

---

## Patch #1 — Valida resposta e estado

**Arquivo:** Nó Code `Valida resposta e estado` (linha 39 do JSON)  
**Ação:** Adicionar função `mergeSeguro()` e substituir chamada no final

### 1.1 Adicionar esta função no início do bloco `validarRespostaEstado()`

Cole após a linha `function rejeitar(estado, erro) {`:

```javascript
// ─────────────────────────────────────────────────────────
// ANTI-LOOP ENGINE: mergeSeguro()
// Estado anterior é FONTE DA VERDADE. A IA sugere, o
// merge decide o que ACEITAR.
// ─────────────────────────────────────────────────────────
function mergeSeguro(anterior, sugestao, classificacao, parsed) {
  const estado = { ...anterior };

  // ── REGRA DE FERRO #1: TIPO ──
  // Uma vez definido, NUNCA muda por sugestão da IA
  if (anterior.tipo) {
    estado.tipo = anterior.tipo;
  } else if (TIPOS_VALIDOS.includes(sugestao.tipo)) {
    estado.tipo = sugestao.tipo;
  }

  // ── REGRA DE FERRO #2: LGPD ──
  // Uma vez true, NUNCA volta pra false
  estado.lgpd_aceito = anterior.lgpd_aceito || sugestao.lgpd_aceito === true;

  // ── REGRA DE FERRO #3: NOME ──
  // Só ACEITA nome novo se:
  // (a) etapa atual PERMITE nome (solicitar_nome), OU
  // (b) o anterior está vazio
  if (!anterior.nome && nomeValido(sugestao.nome)) {
    estado.nome = sugestao.nome.trim();
  } else if (anterior.nome && anterior.etapa !== 'solicitar_nome') {
    estado.nome = anterior.nome; // PRESERVA
  } else if (anterior.nome && anterior.etapa === 'solicitar_nome') {
    estado.nome = anterior.nome; // PRESERVA até confirmação
  }

  // Nome vindo da classificação tem prioridade só na etapa certa
  const nomeClassificado = nomeValido(classificacao?.entidades?.nome)
    ? classificacao.entidades.nome.trim()
    : null;
  if (anterior.etapa === 'solicitar_nome' && nomeClassificado && !anterior.nome) {
    estado.nome = nomeClassificado;
  }

  // ── REGRA DE FERRO #4: ENDEREÇO ──
  if (!anterior.endereco && textoValido(sugestao.endereco)) {
    const pediuConfirmacao =
      anterior.etapa === 'solicitar_endereco' &&
      /só para confirmar|pode confirmar|certo\?|fica em .*espírito santo\?/i.test(parsed.resposta || '');
    if (pediuConfirmacao) {
      estado.endereco_pendente_confirmacao = sugestao.endereco.trim();
    } else {
      estado.endereco = sugestao.endereco.trim();
      estado.endereco_pendente_confirmacao = null;
    }
  } else if (anterior.endereco) {
    estado.endereco = anterior.endereco; // PRESERVA
  }

  // Confirmação de endereço curta ("ok", "sim") deve funcionar
  if (
    anterior.etapa === 'solicitar_endereco' &&
    textoValido(anterior.endereco_pendente_confirmacao) &&
    classificacao?.intencao_usuario === 'confirmacao_endereco'
  ) {
    estado.endereco = anterior.endereco_pendente_confirmacao;
    estado.endereco_pendente_confirmacao = null;
  }

  // ── REGRA DE FERRO #5: CONTEÚDO ──
  if (textoValido(sugestao.conteudo)) {
    estado.conteudo = sugestao.conteudo.trim();
  } else if (anterior.conteudo) {
    estado.conteudo = anterior.conteudo; // PRESERVA
  }

  // ── REGRA DE FERRO #6: ETAPA NUNCA RETROCEDE ──
  const ORDEM_ETAPAS = [
    'identificar_tipo',
    'solicitar_lgpd',
    'solicitar_nome',
    'solicitar_endereco',
    'solicitar_conteudo',
    'apresentar_resumo',
    'encerrar',
  ];

  const idxAnterior = ORDEM_ETAPAS.indexOf(anterior.etapa);
  let etapaSugerida = anterior.etapa;

  // Deriva etapa com base nos campos preenchidos
  if (!estado.tipo) {
    etapaSugerida = 'identificar_tipo';
  } else if (!estado.lgpd_aceito) {
    etapaSugerida = 'solicitar_lgpd';
  } else if (!estado.nome) {
    etapaSugerida = 'solicitar_nome';
  } else if (!estado.endereco) {
    etapaSugerida = 'solicitar_endereco';
  } else if (!estado.conteudo) {
    etapaSugerida = 'solicitar_conteudo';
  } else {
    const confirmou = parsed.confirmacao_resumo === true;
    etapaSugerida = confirmou ? 'encerrar' : 'apresentar_resumo';
  }

  const idxSugerida = ORDEM_ETAPAS.indexOf(etapaSugerida);

  // NUNCA retrocede
  if (idxSugerida < idxAnterior) {
    estado.etapa = anterior.etapa;
  } else {
    estado.etapa = etapaSugerida;
  }

  return estado;
}
```

### 1.2 Substituir lógica de merge atual

No corpo da função `validarRespostaEstado()`, **localize**:

```javascript
const sugestao = objeto(parsed.estado_atualizado);
const proximo = { ...anterior };
const classificacao = $('Prepara Prompt Agent').item.json.classificacao || {};
const intencaoUsuario = classificacao.intencao_usuario || 'mensagem_normal';
// ... (todo o bloco de atribuição manual até a linha "proximo.ultima_interacao_em = Date.now();")
```

**Substitua por:**

```javascript
const sugestao = objeto(parsed.estado_atualizado);
const classificacao = $('Prepara Prompt Agent').item.json.classificacao || {};

// ── ANTI-LOOP: mergeSeguro resolve tudo ──
const proximo = mergeSeguro(anterior, sugestao, classificacao, parsed);
```

### 1.3 Proteção extra contra resposta vazia

**Localize** a linha onde `RESPOSTA_RECUPERACAO` é usada e adicione este blogo antes do return final:

```javascript
// ── ANTI-LOOP: resposta nunca é "tudo bem, vamos" sem ação ──
if (
  /^(tudo bem|ok|entendi|vamos lá|certo|beleza|certo, vamos|ok, vamos|então)$/i.test(resposta.trim()) &&
  estado.etapa !== 'encerrar'
) {
  const etapa = estado.etapa;
  const mapRespostaPorEtapa = {
    'solicitar_nome': 'Por favor, me informe seu nome completo.',
    'solicitar_endereco': `${estado.nome?.split(' ')[0] || 'Por favor'}, me informe seu bairro e sua cidade no Espírito Santo.`,
    'solicitar_conteudo': 'Por favor, me conte mais detalhes.',
    'solicitar_lgpd': 'Para seguirmos, é importante aceitar a LGPD.',
    'apresentar_resumo': 'Só para confirmar, está tudo correto?',
  };
  resposta = mapRespostaPorEtapa[etapa] || resposta;
}
```

---

## Patch #2 — Prepara Prompt Agent

**Arquivo:** Nó Code `Prepara Prompt Agent`  
**Ação:** Adicionar 3 campos ao objeto de saída

### 2.1 Localizar o bloco de retorno

Encontre onde o objeto JSON é montado e **adicione** estes campos:

```javascript
// Antes do return, adicione:
const etapaAtual = estadoObj.etapa || 'identificar_tipo';
const ORDEM_ETAPAS = [
  'identificar_tipo', 'solicitar_lgpd', 'solicitar_nome',
  'solicitar_endereco', 'solicitar_conteudo', 'apresentar_resumo', 'encerrar'
];
const idxAtual = ORDEM_ETAPAS.indexOf(etapaAtual);

// Qual campo a IA DEVERIA coletar AGORA?
const CAMPO_POR_ETAPA = {
  'identificar_tipo': 'tipo',
  'solicitar_lgpd': 'lgpd_aceito',
  'solicitar_nome': 'nome',
  'solicitar_endereco': 'endereco',
  'solicitar_conteudo': 'conteudo',
  'apresentar_resumo': 'confirmacao',
  'encerrar': null,
};

// Campos já preenchidos (NÃO podem ser sobrescritos)
const CAMPOS_ETAPA = ['tipo', 'lgpd_aceito', 'nome', 'endereco', 'conteudo'];
const camposTravados = [];
for (let i = 0; i < idxAtual; i++) {
  const etapaCampo = ORDEM_ETAPAS[i];
  if (etapaCampo === 'apresentar_resumo' || etapaCampo === 'encerrar') continue;
  camposTravados.push(CAMPO_POR_ETAPA[etapaCampo]);
}

return {
  json: {
    // ... campos existentes ...

    // ── NOVOS CAMPOS ANTI-LOOP ──
    campo_esperado: CAMPO_POR_ETAPA[etapaAtual],
    campos_travados: camposTravados,        // ex: ["tipo", "lgpd_aceito", "nome"]
    etapa_idx: idxAtual,                    // posição na máquina de estados
  }
};
```

---

## Patch #3 — Chain Classifica Intencao

**Arquivo:** Prompt do nó `Chain Classifica Intencao` (Basic LLM Chain)  
**Ação:** Substituir o prompt atual

### 3.1 Prompt Novo (Cole por cima do existente)

```markdown
Você é um classificador de intenções para o chatbot Lia (TV Gazeta, ES).

## CONTEXTO ATUAL DA SESSÃO

Estado da sessão (JSON):
{{ estado_json_string }}

Etapa atual: {{ etapa_atual }}
Campo que DEVE ser coletado agora: {{ campo_esperado }}
Campos que já foram preenchidos (NÃO podem mudar): {{ campos_travados }}

Histórico recente:
{{ historico_formatado }}

Mensagem do usuário:
{{ mensagem_atual }}

## REGRA DE FERRO — PRIORIZE A ETAPA

A Etapa Atual é a ÚNICA referência para interpretar a mensagem.
Não reinterprete a intenção do zero — pergunte: "dado que estamos em {{ etapa_atual }}, o usuário forneceu o campo {{ campo_esperado }}?"

## O QUE CLASSIFICAR

### tipo_detectado
- Use APENAS se a etapa for "identificar_tipo" OU se o usuário EXPLICITAMENTE mudar de ideia.
- Se etapa já tiver tipo definido, retorne null com confianca 0.0.
- Tipos válidos: "Sugestão de reportagem", "Comentário", "Mensagem para apresentador(a)", "Falha no sinal da TV digital".

### entidades
Extraia APENAS o campo correspondente à etapa atual:
- Etapa solicitar_nome → extraia "nome"
- Etapa solicitar_endereco → extraia "endereco"
- Etapa solicitar_conteudo → extraia "conteudo" E "endereco" se presente
- Etapa solicitar_lgpd → "nome" é aceitável se fornecido junto
- Etapa identificar_tipo → "nome" e "endereco" são aceitáveis se explícitos
- Etapa apresentar_resumo → APENAS verifique se é confirmação ou correção

NUNCA extraia dados que não correspondem à etapa atual + 1 (ex: em solicitar_nome, não extraia endereco).

### intencao_usuario
Valores: "aceite_lgpd" | "recusa_lgpd" | "confirmacao_nome" | "rejeicao_nome_sugerido" |
"informou_nome" | "confirmacao_endereco" | "forneceu_endereco" | "forneceu_conteudo" |
"confirmacao_resumo" | "correcao_resumo" | "reinicio" | "mensagem_fora_escopo" | "mensagem_normal"

REGRAS POR ETAPA:
- solicitar_nome: "sim", "pode usar", "pode" = "confirmacao_nome"
- solicitar_nome: nome composto válido = "informou_nome"
- solicitar_nome: "prefiro usar X" ou "outro" = "rejeicao_nome_sugerido"
- solicitar_endereco: "sim", "ok", "isso", "correto" APÓS confirmação = "confirmacao_endereco"
- solicitar_endereco: padrão "bairro, cidade" = "forneceu_endereco"
- solicitar_lgpd: "sim", "aceito", "pode", "ok" = "aceite_lgpd"
- solicitar_lgpd: "não", "recuso", "não aceito" = "recusa_lgpd"

### campos_fornecidos
Lista dos campos que o usuário forneceu NESTA mensagem, considerando a etapa atual.
Ex: em solicitar_lgpd + "Meu nome é João, aceito" = ["lgpd_aceito", "nome"]

## RESTRIÇÕES CRÍTICAS

1. Se etapa_atual NÃO for "identificar_tipo" e tipo_detectado ≠ estado_atual.tipo:
   → confianca_tipo deve ser ≤ 0.1 (só muda se usuário EXPLICITAMENTE disser "quero outro tipo")
2. Campos em "campos_travados" NÃO podem aparecer em "estado_atualizado".
3. "Confirmacao_endereco" só é válida se etapa_atual = "solicitar_endereco" e a mensagem anterior da Lia pediu confirmação.
4. "Forneceu_conteudo" só é válido nas etapas "solicitar_conteudo" ou "apresentar_resumo".

## SAÍDA (JSON ONLY)

{
  "tipo_detectado": "string | null",
  "confianca_tipo": 0.0–1.0,
  "entidades": {
    "nome": "string | null",
    "endereco": "string | null",
    "conteudo": "string | null"
  },
  "intencao_usuario": "string",
  "campos_fornecidos": ["string"],
  "estado_atualizado": {
    "tipo": "string | null",
    "lgpd_aceito": boolean | null,
    "nome": "string | null",
    "endereco": "string | null",
    "conteudo": "string | null"
  }
}
```

---

## Checklist de Implementação

### Antes de aplicar
- [ ] Fazer backup do fluxo atual no n8n (Export → Download)
- [ ] Testar em ambiente de homologação
- [ ] Validar com os 38 roteiros de homologação

### Após aplicar
- [ ] RT-ENT-01 a RT-ENT-05 (entrada e identificação)
- [ ] RT-SUG-01 a RT-SUG-05 (sugestão de reportagem)
- [ ] RT-COM-01 a RT-COM-05 (comentário)
- [ ] RT-APR-01 a RT-APR-05 (mensagem para apresentador)
- [ ] RT-SIN-01 a RT-SIN-05 (falha no sinal)
- [ ] RT-SES-01 a RT-SES-05 (sessão e continuidade)
- [ ] RT-VAL-01 a RT-VAL-08 (validações)

### Monitoramento pós-deploy
- [ ] Log de `mergeSeguro()` atuando (console.warn quando trava campo)
- [ ] Taxa de `RESPOSTA_RECUPERACAO` — deve cair a 0 em caminhos felizes
- [ ] Tempo de resposta — GPT-4o-mini + prompt menor deve manter ou melhorar

---

## Rollback

Se algo quebrar, reverta os 3 patches na ordem inversa:
1. Restaurar prompt original da `Chain Classifica Intencao`
2. Remover campos novos do `Prepara Prompt Agent`
3. Restaurar `Valida resposta e estado` original

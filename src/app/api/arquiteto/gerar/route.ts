import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";

import { exigirConta } from "@/lib/orgs";
import { decidirAcessoArquiteto, CAPACIDADE_ARQUITETO } from "@/lib/arquiteto-acesso";
import { gatewayDaConta, MODELO_DA_CONTA } from "@/lib/gateway-da-conta";
import { tetoEstouradoDaConta } from "@/lib/limite-de-tokens";
import { mensagemDeTokensEsgotados } from "@/lib/tokens-esgotados";
import { normalizarTokens, type Tokens } from "@/lib/arquiteto-tokens";
import { mesclarMudanca } from "@/lib/arquiteto-mescla";
import { aplicarEdicoes, extrairEdicoes } from "@/lib/arquiteto-edicoes";
import { donoDoProjeto, obterProjeto, salvarProjeto } from "@/lib/arquiteto-projetos";
import { promptComCraft, promptComIntegracoes, promptComPublicacao, promptComVisual } from "@/lib/arquiteto-craft";
import { PUBLICO_PADRAO } from "@/lib/base-publica";
import { origemPublica } from "@/lib/mirai-oidc";
import { ferramentasDoArquiteto, executarFerramentaArquiteto } from "@/lib/ferramentas-arquiteto";
import type { Conta } from "@/lib/orgs";
import {
  alvosCitados,
  alvosPorPadrao,
  construirIndice,
  ehSoPedidoDeArquivo,
  extrairPedidosDeArquivo,
  projetoPequeno,
  tamanhoTotal,
  textoDoIndice,
  type Arquivo,
} from "@/lib/arquiteto-indice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/arquiteto/gerar — a conversa vira o PROJETO.
 *
 * Esta rota é a mesma chave que o chat do app já usa (ver
 * `src/app/api/chat/route.ts`): a conta responde pelo GATEWAY DELA quando existe
 * vínculo, e cai para o provedor direto do app quando o gateway recusa. Nada de
 * caminho de provedor novo — só o mesmo cano, pedindo a resposta em FORMA de
 * projeto.
 *
 * PORTEIRA (defesa em profundidade): a rota CONFERE a capacidade de novo, no
 * servidor. A tela escondida não é a trava — quem chama esta API sem a
 * capacidade leva 403 e nada é gerado. Falha FECHADO.
 *
 * Anti-vazamento por construção: aqui NÃO entra mapa interno, NÃO entra memória
 * da Arca e NÃO entra material de infraestrutura. O modelo recebe só o pedido da
 * pessoa e o projeto que ele mesmo já devolveu — não há o que vazar.
 */

// Mesma leitura de chave do chat do app (nunca impressa, nunca logada).
function loadEnv(name: string): string {
  try {
    const envFile = "/opt/data/.env";
    if (existsSync(envFile)) {
      const content = readFileSync(envFile, "utf8");
      for (const line of content.split("\n")) {
        const m1 = line.match(new RegExp(`export\\s+${name}=["']([^"']+)["']`));
        if (m1) return m1[1];
        const m2 = line.match(new RegExp(`${name}=["']([^"']+)["']`));
        if (m2) return m2[1];
        const m3 = line.match(new RegExp(`${name}=([^\\s#]+)`));
        if (m3) return m3[1];
      }
    }
  } catch {}
  return process.env[name] || "";
}

const VERBOO_API_KEY = process.env.AIBEE_API_KEY || loadEnv("AIBEE_API_KEY");
const GOOGLE_API_KEY = loadEnv("GOOGLE_API_KEY");

const VERBOO_BASE = "https://api.kpalabz.com/v1";
// Cadeia de modelos do construtor, no kpalabz. Modelos DIFERENTES de propósito:
// se o principal saturar, o seguinte é outra rota de inferência (medido 28/10:
// o kpalabz respondeu 60/60 com 60 requisições simultâneas).
const VERBOO_MODELOS = ["claude-opus-5-5", "claude-sonnet-5", "claude-opus-4-8"];
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = "gemini-2.5-flash";

const MAX_HISTORICO = 12; // últimos turnos enviados ao modelo

/** Instrução do construtor: a resposta é o PROJETO, em formato previsível.
 *
 * A partir de 08/10/2026 o projeto é MULTIARQUIVO: vários arquivos de verdade
 * (HTML + CSS + JS separados), ligados por caminho relativo. O formato de
 * resposta continua o mesmo (`===ARQUIVO: nome===`), então a leitura no cliente
 * já entende N blocos — o que muda é a instrução e o parser passar a aceitar
 * nomes/paths. A prévia embute os arquivos locais no cliente (ver page.tsx). */
const CONSTRUTOR_PROMPT = `Você é o Arquiteto da Mirai: um construtor de projetos web.

## SUA TAREFA
A partir da conversa, você CONSTRÓI um projeto web COMPLETO e pronto para rodar.
O projeto tem VÁRIOS ARQUIVOS de verdade — não um HTML gigante com tudo dentro.

## CONJUNTO PADRÃO (web)
Entregue sempre estes três arquivos:
- index.html — a marcação (é a ENTRADA do projeto)
- styles.css — todo o CSS
- app.js — todo o JavaScript (comportamento)
Divida em mais arquivos SÓ quando fizer sentido de verdade (ex.: mais de uma
página). O projeto é enxuto, real e fácil de ler.

## O .md DO PROJETO (obrigatório)
Entregue também PROJETO.md, em português, curto e verdadeiro: o que o app é, o
papel de cada arquivo e as decisões tomadas (tokens em uso, padrão visual, regras
de interação). A cada mudança, mantenha-o atualizado e SIGA o que ele diz: se a
mudança contrariar o arquivo, mude o arquivo e diga isso no RESUMO.

## COMO OS ARQUIVOS SE LIGAM (obrigatório)
- O index.html REFERENCIA os arquivos locais por caminho relativo:
  no <head>:   <link rel="stylesheet" href="styles.css">
  antes do </body>:  <script src="app.js" defer></script>
- Nada de CDN obrigatório e nada de imagem fora: SVG inline, emoji ou gradiente.
- Faça um projeto de UM arquivo só (CSS/JS embutidos no próprio HTML) apenas se o
  pedido for trivial ou pedir explicitamente um arquivo único.

## FORMATO DA RESPOSTA (obrigatório, sem exceção)
Responda EXATAMENTE neste formato, e NADA fora dele:

===RESUMO===
<uma frase, em português do Brasil, dizendo o que você construiu>
===ARQUIVO: index.html===
<!doctype html>
...o HTML completo...
===ARQUIVO: styles.css===
...o CSS completo...
===ARQUIVO: app.js===
...o JavaScript completo...
===ARQUIVO: PROJETO.md===
...o .md do projeto...
===FIM===

(Um bloco por arquivo, com o nome exato — o .md entra como qualquer arquivo.)

Regras do formato:
- O conteúdo de cada arquivo vem ENTRE as marcações, sem cercas (três crases).
- Sem texto antes de "===RESUMO===" nem depois de "===FIM===".
- Projeto NOVO (nada existe ainda): devolva TODOS os arquivos INTEIROS (não trechos).
- Projeto que JÁ EXISTE: NÃO devolva o arquivo inteiro — troque só o pedaço, no formato de
  EDIÇÃO (=== EDIT: arquivo === com @@BUSCAR/@@TROCAR). A seção COMO MUDAR, mais abaixo, mostra como.
  Devolver o arquivo inteiro numa mudança é ERRO: além de lento, pode apagar o que já estava certo.

## QUALIDADE
- Português do Brasil na interface, a menos que o pedido diga outra língua.
- Responsivo de verdade: funciona em celular, tablet e desktop (media queries).
- Acabamento limpo e moderno (tipografia, espaçamento, contraste).
- Sem promessa falsa: nada de botão que não faz nada sem dizer que é exemplo.`;

/**
 * A instrução ganha a LISTA DE IMAGENS do projeto (quando existem). É assim que
 * o construtor sabe que `assets/logo.png` existe e pode usá-la de verdade — por
 * caminho relativo — em vez de inventar uma URL externa. Sem imagens, a
 * instrução original passa intacta.
 */
function promptComAssets(system: string, assets: string[]): string {
  const limpos = (assets || [])
    .filter((a) => typeof a === "string")
    .map((a) => a.trim())
    .filter((a) => /^assets\/[a-z0-9._/-]+$/i.test(a))
    .slice(0, 40);
  if (!limpos.length) return system;
  return (
    system +
    `

## IMAGENS JÁ ENVIADAS PELO USUÁRIO (EXISTEM DE VERDADE)
O projeto já tem estes arquivos de imagem. USE-OS por caminho relativo quando
fizer sentido (ex.: <img src="assets/logo.png" alt="Descrição">; em CSS:
background-image: url("assets/logo.png")):
${limpos.map((a) => `- ${a}`).join("\n")}
NÃO invente URL externa nem troque essas imagens por bloco de cor no lugar
delas quando o pedido claramente for sobre a imagem enviada. Se precisar de
outra imagem que não está na lista, aí sim use SVG inline, emoji ou gradiente.`
  );
}

/**
 * A instrução ganha os TOKENS DE DESIGN do projeto (item 8 do dono). É assim que
 * um projeto NOVO já nasce obedecendo às cores/fonte/raio/espaçamento da pessoa:
 * o modelo é mandado USAR as variáveis `var(--…)` em vez de fixar valores. Os
 * tokens JÁ EXISTEM na prévia (injetados na raiz); por isso o modelo é proibido
 * de redeclará-los — se ele reescrevesse `:root{--cor-primaria:…}`, o painel de
 * tokens deixaria de mandar no projeto. Sem tokens no pedido, vale o PADRÃO.
 */
function promptComTokens(system: string, tokens: Tokens): string {
  const t = normalizarTokens(tokens);
  return (
    system +
    `

## TOKENS DE DESIGN DO PROJETO (USE — ELES JÁ EXISTEM)
O projeto tem cores, tipografia, raio de borda e espaçamento definidos por TOKENS
(variáveis CSS na RAIZ do documento). Eles JÁ ESTÃO injetados na prévia: você NÃO
precisa — e NÃO deve — declará-los de novo.

Use SEMPRE as variáveis abaixo em vez de fixar a cor/tamanho "na mão":
- var(--cor-primaria) — cor de destaque (botões, links, realces) · hoje: ${t["cor-primaria"]}
- var(--cor-fundo)    — fundo da página · hoje: ${t["cor-fundo"]}
- var(--cor-texto)    — cor do texto · hoje: ${t["cor-texto"]}
- var(--fonte)        — família tipográfica · hoje: ${t["fonte"]}
- var(--raio)         — raio de borda · hoje: ${t["raio"]}
- var(--espaco)       — espaçamento base · hoje: ${t["espaco"]}

Passe um valor de reserva junto da variável (o valor atual acima), por exemplo:
  body { background: var(--cor-fundo, ${t["cor-fundo"]}); color: var(--cor-texto, ${t["cor-texto"]}); }
  .botao { background: var(--cor-primaria, ${t["cor-primaria"]}); border-radius: var(--raio, ${t["raio"]}); padding: var(--espaco, ${t["espaco"]}); }
  :root { font-family: var(--fonte, ${t["fonte"]}); }

PROIBIDO: reescrever os tokens (nada de \`:root{--cor-primaria:…}\`) e usar cor
fixa onde o token serve. Quem manda na cor é o painel de TOKENS do Arquiteto — e
ele só manda se o seu CSS USAR as variáveis.`
  );
}

type Msg = { role: string; content: string };

/**
 * A instrução ganha o `PROJETO.md` do projeto, quando ele já existe. É este o
 * elo que faz o construtor SEGUIR o projeto em vez de reconstruir no escuro: o
 * .md traz o que o app é, o papel de cada arquivo e as decisões já tomadas
 * (tokens em uso, padrão visual, regras de interação).
 *
 * O texto vem do CLIENTE (o que está na tela) — a rota não lê o banco por um
 * projeto que a pessoa não mandou. Sem .md, o bloco não entra: nada muda para
 * quem nunca gerou projeto.
 *
 * Teto de 6.000 chars: a instrução é um orçamento, e o .md não pode engolir o
 * pedido. Passando disso, entra o começo e a instrução AVISA que cortou.
 */
function promptComDoc(system: string, doc: string): string {
  const limpo = (doc || "").trim();
  if (!limpo) return system;
  const corpo =
    limpo.length > 6000 ? `${limpo.slice(0, 6000)}\n[…o .md continua; cortado no teto da instrução]` : limpo;
  return (
    system +
    `

## O PROJETO JÁ EXISTE E MANTÉM ESTE PROJETO.md
Ele é o contrato do projeto: o que o app é, o papel de cada arquivo e as decisões
já tomadas. SIGA o que está aqui — não contrarie escolha anterior sem dizer. Ao
mudar o projeto, devolva o PROJETO.md ATUALIZADO junto com os arquivos.

${corpo}`
  );
}

/** Só o que desenha a página: o diálogo da pessoa + o projeto. Nada interno. */
function montarMensagens(mensagens: Msg[], system: string) {
  const limpo = mensagens
    .filter((m) => m && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_HISTORICO)
    .map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: m.content }));

  return [
    { role: "user" as const, content: `[INSTRUÇÃO PERMANENTE]\n${system}` },
    { role: "assistant" as const, content: "Entendi. Vou responder apenas no formato de projeto combinado." },
    ...limpo,
  ];
}

type Projeto = { resumo: string; arquivos: { nome: string; conteudo: string }[] };

/** Parser do formato do construtor, com rede de segurança para cercas ```. */
function extrairProjeto(texto: string): Projeto {
  const linhas = texto.split("\n");
  const arquivos: { nome: string; conteudo: string }[] = [];
  let resumo = "";
  let modo: "resumo" | "arquivo" | null = null;
  let nomeAtual = "";
  let buf: string[] = [];

  const fecharArquivo = () => {
    if (modo === "arquivo") {
      const conteudo = buf.join("\n").trim();
      if (conteudo) arquivos.push({ nome: (nomeAtual || "index.html").trim(), conteudo });
    }
    buf = [];
  };

  for (const ln of linhas) {
    if (/^===\s*RESUMO\s*===\s*$/i.test(ln)) {
      if (modo === "arquivo") fecharArquivo();
      modo = "resumo";
      continue;
    }
    const mArq = ln.match(/^===\s*ARQUIVO:\s*(.+?)\s*===\s*$/i);
    if (mArq) {
      if (modo === "arquivo") fecharArquivo();
      modo = "arquivo";
      nomeAtual = mArq[1].trim();
      continue;
    }
    if (/^===\s*FIM\s*===\s*$/i.test(ln)) {
      if (modo === "arquivo") fecharArquivo();
      modo = null;
      continue;
    }
    // Um bloco de EDIÇÃO encerra o RESUMO (dono, 11/10/2026): o modelo costuma
    // escrever o resumo e EMENDAR o bloco de edição logo abaixo — sem esta
    // guarda, o bloco inteiro ia parar dentro do texto do resumo na tela.
    if (/^===\s*EDIT:/i.test(ln) || /^@@\s*BUSCAR\s*$/i.test(ln)) {
      if (modo === "arquivo") fecharArquivo();
      modo = null;
      continue;
    }
    if (modo === "resumo") resumo += (resumo ? "\n" : "") + ln;
    else if (modo === "arquivo") buf.push(ln);
  }
  if (modo === "arquivo") fecharArquivo();

  // Rede de segurança: o modelo ignorou o formato mas devolveu código.
  //
  // GUARDA (dono, 11/10/2026): se a resposta é de EDIÇÃO (=== EDIT: / @@BUSCAR),
  // NÃO vale a rede — dentro de um bloco de edição há HTML do trecho a trocar, e
  // tomá-lo por "o projeto inteiro" SUBSTITUIRIA o arquivo bom por um fragmento.
  // A edição é aplicada por `aplicarEdicoes`, não aqui.
  const ehEdicao = /^===\s*EDIT:/im.test(texto) || /^@@\s*BUSCAR\s*$/im.test(texto);
  if (!arquivos.length && !ehEdicao) {
    const cerca = texto.match(/```(?:html|HTML)?\s*\n([\s\S]*?)```/);
    let conteudo = cerca ? cerca[1] : "";
    if (!conteudo && /<(!doctype|html|body|div)/i.test(texto)) conteudo = texto;
    if (conteudo.trim()) arquivos.push({ nome: "index.html", conteudo: conteudo.trim() });
  }

  return { resumo: resumo.trim(), arquivos };
}

type Resultado = { ok: true; texto: string; motor: string } | { ok: false; erro: string };

/**
 * Lê a resposta do modelo e devolve SÓ o TEXTO final. Aceita os DOIS formatos:
 *  - SSE (`text/event-stream`, quando `stream: true`): junta `delta.content`
 *    pedaço a pedaço e DESCARTA o `reasoning_content` do modelo de raciocínio
 *    (ele não faz parte da resposta — e, sem stream, era ele que estourava o
 *    buffer do router e derrubava o build com "upstream unavailable");
 *  - JSON (quando o provedor ignora o stream e devolve a resposta inteira).
 * Nunca lança: formato inesperado → texto vazio (quem chamou decide o fallback).
 */
async function lerTexto(resp: Response, onProgresso?: (caracteres: number) => void): Promise<string> {
  const ct = (resp.headers.get("content-type") || "").toLowerCase();
  if (!ct.includes("text/event-stream")) {
    const j = (await resp.json().catch(() => ({}))) as { choices?: { message?: { content?: string } }[] };
    return j?.choices?.[0]?.message?.content || "";
  }
  const reader = resp.body?.getReader();
  if (!reader) return "";
  const dec = new TextDecoder();
  let buf = "";
  let texto = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const linha = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!linha.startsWith("data:")) continue;
      const dado = linha.slice(5).trim();
      if (!dado || dado === "[DONE]") continue;
      try {
        const j = JSON.parse(dado) as { choices?: { delta?: { content?: string } }[] };
        const pedaco = j?.choices?.[0]?.delta?.content;
        if (pedaco) {
          texto += pedaco;
          // PROGRESSO REAL (dono, 11/10/2026): a cada pedaço que o modelo escreve,
          // avisa quanto já saiu. É o que permite à tela mostrar "já escreveu 12 mil
          // caracteres" numa construção de minutos, em vez de um relógio cego.
          if (onProgresso) onProgresso(texto.length);
        }
      } catch {}
    }
  }
  return texto;
}

// ── VISÃO (dono, 09/10/2026) ────────────────────────────────────────────────
// 28/10/2026: no Verboo, o modelo que CONSTRÓI (deepseek-v4.1-flash) NÃO
// enxerga imagem — quem enxergava era o `glm-5.3-flash`, na mesma chave.
// No kpalabz a situação é MELHOR: o `claude-opus-5-5` ENXERGA (medido: leu um
// PNG e respondeu "Vermelho" nos dois formatos). Então a foto do pedaço marcado
// vai para o `claude-opus-5-5`, que devolve TEXTO; a descrição entra na
// instrução de quem constrói.
const MODELO_VISAO = "claude-opus-5-5";

/** Lê a FOTO do pedaço marcado com o modelo que ENXERGA. Falhou → "" e o pedido
    segue só com a referência de texto — nunca finge que viu a imagem. */
async function lerFotoComVisao(foto: string): Promise<string> {
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(foto.trim());
  if (!m || !VERBOO_API_KEY) return "";
  const url = `data:image/${m[1]};base64,${m[2]}`;
  try {
    const r = await fetch(`${VERBOO_BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${VERBOO_API_KEY}` },
      body: JSON.stringify({
        model: MODELO_VISAO,
        max_tokens: 500,
        temperature: 0.2,
        stream: false,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  "Esta é a foto de um PEDAÇO de uma página web, com um risco rosa marcando o que a pessoa quer mudar. " +
                  "Descreva, em português e em no máximo 4 linhas: (1) que pedaço é (cartão, título, lista, botão, tabela…); " +
                  "(2) TODOS os textos que aparecem, literalmente; (3) as cores de fundo e de texto; (4) o que o risco rosa está marcando. " +
                  "Só o que se vê — sem opinião e sem elogio.",
              },
              { type: "image_url", image_url: { url } },
            ],
          },
        ],
      }),
      // ORÇAMENTO DA VISÃO (dono, 11/10/2026): a leitura da foto leva ~5s no
      // normal. Antes o teto era 90s — e como ela roda ANTES da construção, uma
      // visão lenta empurrava o pedido inteiro para além dos ~100s que o túnel
      // aguenta, e a pessoa via "Caiu a conexão no meio" (medido: 128,5s num
      // pedido com foto). Melhor seguir SEM a descrição da foto do que perder o
      // pedido: estourou o teto, segue só com a referência de texto.
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) {
      console.error("Arquiteto visão:", r.status, (await r.text().catch(() => "")).slice(0, 200));
      return "";
    }
    const j = (await r.json().catch(() => null)) as { choices?: { message?: { content?: string } }[] } | null;
    return (j?.choices?.[0]?.message?.content ?? "").trim().slice(0, 1200);
  } catch (e) {
    console.error("Arquiteto visão rede:", e instanceof Error ? e.message : e);
    return "";
  }
}

/**
 * AS REGRAS DE MUDANÇA — uma fonte só.
 *
 * Ficam aqui (e não dentro de uma função) porque DUAS instruções as usam: a do projeto
 * pequeno (todos os arquivos) e a do projeto grande (mapa + só o alvo). Duas cópias
 * divergiriam — e a que ficasse velha passaria a ensinar o modelo errado.
 */
const REGRAS_DE_MUDANCA = `
## COMO MUDAR (preferido: EDITE — NÃO reescreva o arquivo)
Para uma mudança pontual, devolva SÓ A TROCA, neste formato:

=== EDIT: index.html ===
@@BUSCAR
<trecho EXATO que já existe no arquivo aí em cima, copiado sem reindentar>
@@TROCAR
<trecho novo>
@@FIM

- O trecho do @@BUSCAR tem de aparecer **UMA ÚNICA VEZ** no arquivo, e o **TEXTO** (palavras, tags,
  atributos, pontuação) tem de ser **IDÊNTICO** ao que está lá. Espaço e indentação não precisam ser
  perfeitos, mas não parafraseie, não resuma e não invente: copie as palavras exatas do arquivo.
  Se o trecho não for achado (ou aparecer mais de uma vez), a troca é RECUSADA e o projeto fica como
  estava.
- Use o MENOR trecho que identifica a mudança — de preferência UM pedaço de UMA linha. Trecho curto
  e específico acerta mais que trecho longo.
- Se o trecho aparecer MAIS DE UMA VEZ no arquivo, AUMENTE o trecho: inclua o que vem antes ou
  depois (a linha de cima, o texto ao lado) até ele ficar ÚNICO. Não chute qual das ocorrências era.
  Exemplo: o logo costuma repetir no topo e no rodapé. Se "span class=logo-text" aparece nos dois,
  NÃO use só ele — use o contexto que só existe num lugar:

  === EDIT: index.html ===
  @@BUSCAR
  <a class="logo" href="#topo">
            <span class="logo-text">Mirai<span class="logo-accent">CRM</span></span>
  @@TROCAR
  <a class="logo" href="#topo">
            <span class="logo-text">Mirai<span class="logo-accent">CRM 2</span></span>
  @@FIM
- Várias trocas = vários blocos (um por troca). Troca em outro arquivo = outro bloco, com o nome
  daquele arquivo no === EDIT ===.
- Você NÃO precisa devolver o arquivo inteiro para uma troca pequena. Editar é sempre preferível:
  é mais rápido e não risco de estragar o resto do arquivo.

### Só quando NÃO der para editar, devolva o arquivo INTEIRO (=== ARQUIVO: nome ===)
- Arquivo NOVO (arquivo que ainda não existe no projeto), ou mudança grande/estrutural que
  reescreve boa parte do arquivo.
- Devolva **SÓ os arquivos que mudaram**, cada um **INTEIRO** (a primeira linha até a última).
  Quem monta o projeto guarda o que você não devolveu, exatamente como está.
- **NUNCA devolva um arquivo pela metade.** Meio arquivo não é mudança pequena: é um projeto
  quebrado. Se não couber uma devolução completa, devolva MENOS arquivos — nunca conteúdo cortado.
- Mire no MENOR pedaço: se o pedido é sobre um elemento (ex.: a seção secao-destaque), mude só ele
  (e o estilo que é dele). NÃO toque no resto da página.
- NUNCA troque o projeto por uma "versão melhor" sua, nem invente conteúdo que não foi pedido.
  Pedido de cor → mude a cor e nada mais. Pedido de texto → mude o texto e nada mais.
- Pedido de ACRESCENTAR: MANTENHA tudo o que já existe e acrescente o novo.
- Só relaxe isto se o pedido for vago (ex.: "melhore a página"): aí use o bom senso — e diga no
  RESUMO exatamente o que mudou.`;

/**
 * A INSTRUÇÃO DO PROJETO GRANDE (dono, 13/10/2026) — "não olhar sempre o sistema inteiro".
 *
 * Quando o projeto é grande, mandar TODOS os arquivos faz o modelo se perder (responde texto em
 * vez do bloco de projeto — o erro que o dono viu) e estoura o teto de tamanho. Aqui vai o MAPA
 * de todos os arquivos + o CONTEÚDO só dos que o pedido toca, e a ESCALAÇÃO: faltou um arquivo,
 * o modelo PEDE em vez de inventar.
 */
function promptComIndice(
  system: string,
  arquivos: { nome: string; conteudo: string }[],
  alvos: string[],
  docProjeto: string,
): string {
  const limpos = (arquivos || [])
    .filter((a) => a && typeof a.nome === "string" && typeof a.conteudo === "string" && a.nome.trim())
    .map((a) => ({ nome: a.nome.trim(), conteudo: a.conteudo }));
  if (!limpos.length) return system;

  const itens = construirIndice(limpos, docProjeto);
  const conjunto = new Set(alvos.map((a) => a.toLowerCase()));
  const escolhidos = limpos.filter((a) => conjunto.has(a.nome.toLowerCase()));
  const mapa = textoDoIndice(itens, escolhidos.map((a) => a.nome));

  // Teto do que viaja INTEIRO: com o mapa na mão, o modelo pede o resto pela ESCALAÇÃO.
  const TETO = 60000;
  let usado = 0;
  const blocos: string[] = [];
  for (const a of escolhidos) {
    const sobra = TETO - usado;
    if (sobra <= 2000) {
      blocos.push(
        `=== ARQUIVO: ${a.nome} ===\n[grande demais para caber aqui — peça este arquivo sozinho pelo formato da ESCALAÇÃO]`,
      );
      continue;
    }
    const conteudo =
      a.conteudo.length > sobra
        ? `${a.conteudo.slice(0, sobra)}\n…[cortado por tamanho; peça o resto pela ESCALAÇÃO]`
        : a.conteudo;
    usado += conteudo.length;
    blocos.push(`=== ARQUIVO: ${a.nome} ===\n${conteudo}`);
  }

  return (
    system +
    `

## O PROJETO ATUAL — o MAPA (você já está NO MEIO do projeto)
Este projeto é GRANDE: você recebeu o MAPA de TODOS os arquivos e o CONTEÚDO INTEIRO apenas dos
que este pedido toca (marcados com "VEM INTEIRO ABAIXO"). Isto NÃO é um recomeço: todo pedido
parte daqui.

${mapa}

## OS ARQUIVOS DO PEDIDO (conteúdo completo)
${blocos.join("\n")}

## ESCALAÇÃO — se faltar um arquivo, PEÇA (nunca invente)
Se, para fazer o pedido, você precisar de um arquivo que NÃO está acima, NÃO escreva o pedido no
escuro e NÃO invente o conteúdo dele. Responda APENAS com:

=== PRECISA: nome-do-arquivo ===

(uma linha, nada mais — sem resumo e sem explicação). O sistema reenvia o pedido com ele.
${REGRAS_DE_MUDANCA}`
  );
}

/**
 * A INSTRUÇÃO DO PROJETO — decide sozinha o regime.
 *
 * - Projeto PEQUENO (ou alvo = todos): manda TUDO, como sempre (é rápido e já funciona).
 * - Projeto GRANDE: manda o MAPA + só os arquivos do pedido.
 *
 * Um só ponto de decisão: nenhuma outra parte do código precisa saber qual regime está valendo.
 */
function promptComProjeto(
  system: string,
  arquivos: { nome: string; conteudo: string }[],
  alvos: string[],
  docProjeto: string,
): string {
  const limpos = (arquivos || []).filter(
    (a) => a && typeof a.nome === "string" && typeof a.conteudo === "string" && a.nome.trim(),
  );
  if (!limpos.length) return system;
  const conjunto = new Set((alvos || []).map((a) => a.toLowerCase()));
  const tudo = !conjunto.size || limpos.every((a) => conjunto.has(a.nome.trim().toLowerCase()));
  return tudo
    ? promptComArquivos(system, limpos)
    : promptComIndice(system, limpos, alvos, docProjeto);
}

/**
 * O ROTEADOR (dono, 13/10/2026) — quando o pedido não aponta arquivo nenhum.
 *
 * Só é chamado em projeto GRANDE e quando nem o nome nem o tipo do arquivo aparecem no pedido
 * (ex.: "deixa mais bonito"). Recebe o MAPA + o pedido e devolve só NOMES. É uma chamada curta
 * (saída de poucas linhas), então custa pouco e volta rápido.
 *
 * Falhou/veio vazio → [] e o chamador cai no fallback determinístico. O pedido NUNCA fica sem
 * contexto por causa do roteador.
 */
async function escolherAlvosComModelo(
  arquivos: Arquivo[],
  pedido: string,
  docProjeto: string,
  contaId: number,
): Promise<string[]> {
  const itens = construirIndice(arquivos, docProjeto);
  const instrucao =
    "Você é um ROTEADOR de arquivos. Abaixo está o MAPA de um projeto (nome — tamanho — papel) e, " +
    "na mensagem, o pedido da pessoa. Responda APENAS com os nomes dos arquivos que o pedido " +
    "PRECISA, um por linha, sem marcador, sem explicação e sem texto em volta. " +
    "Escolha o MÍNIMO necessário: só o que precisa ser lido ou mudado. " +
    "Se o pedido for visual e não disser onde, inclua a marcação e o estilo. " +
    "Use EXATAMENTE os nomes que estão no mapa.\n\n## MAPA\n" +
    textoDoIndice(itens, []);
  const r = await chamarModelo(
    [{ role: "user", content: pedido || "(sem texto — a pessoa marcou um pedaço no preview)" }],
    instrucao,
    contaId,
    20000,
  );
  if (!r.ok) return [];
  const achados: string[] = [];
  for (const bruta of r.texto.split("\n")) {
    const c = bruta.replace(/^[-*\d.)\s]+/, "").replace(/`/g, "").trim();
    if (!c || c.length > 120) continue;
    const alvo =
      itens.find((i) => i.nome.toLowerCase() === c.toLowerCase()) ||
      itens.find(
        (i) =>
          (i.nome.split("/").pop() || i.nome).toLowerCase() ===
          (c.split("/").pop() || c).toLowerCase(),
      );
    if (alvo && !achados.includes(alvo.nome)) achados.push(alvo.nome);
  }
  return achados;
}

/**
 * A instrução ganha OS ARQUIVOS ATUAIS do projeto (dono, 10/10/2026).
 *
 * Por que existe: o construtor recebia só a CONVERSA (pedidos + resumos) e o .md
 * — não via o CÓDIGO como estava. Com isso, a cada pedido, ele RECONSTRUÍA o
 * projeto "no escuro": quando a pessoa marcava um pedaço e pedia uma mudança, o
 * resultado mudava outra coisa (ou o projeto todo). Aqui vão os arquivos COMO
 * ESTÃO, com a regra explícita de mudar SÓ o pedido e manter o resto igual.
 *
 * Sem projeto (primeira construção), a instrução passa intacta.
 */
function promptComArquivos(system: string, arquivos: { nome: string; conteudo: string }[]): string {
  const limpos = (arquivos || [])
    .filter((a) => a && typeof a.nome === "string" && typeof a.conteudo === "string" && a.nome.trim())
    .map((a) => ({ nome: a.nome.trim(), conteudo: a.conteudo }))
    .slice(0, 60);
  if (!limpos.length) return system;
  // Teto de tamanho: manda os arquivos inteiros; num projeto gigante, corta o
  // excedente com AVISO HONESTO (nunca finge que o arquivo acabou).
  const TETO = 90000;
  let usado = 0;
  const blocos: string[] = [];
  for (const a of limpos) {
    const sobra = TETO - usado;
    if (sobra <= 0) {
      blocos.push(
        `=== ARQUIVO: ${a.nome} ===\n[arquivo grande demais para caber aqui — peça para trabalhar neste arquivo separadamente]`,
      );
      continue;
    }
    const conteudo =
      a.conteudo.length > sobra
        ? `${a.conteudo.slice(0, sobra)}\n…[cortado por tamanho; peça o resto se precisar]`
        : a.conteudo;
    usado += conteudo.length;
    blocos.push(`=== ARQUIVO: ${a.nome} ===\n${conteudo}`);
  }
  return (
    system +
    `

## O PROJETO ATUAL — a fonte da verdade (você já está NO MEIO do projeto)
Estes são os arquivos COMO ESTÃO AGORA. Isto NÃO é um recomeço: todo pedido parte daqui.

${blocos.join("\n")}

${REGRAS_DE_MUDANCA}`
  );
}

/** A VISÃO entra na instrução como o PEDAÇO ALVO — em TEXTO, que é o que o
    construtor consome. Sem descrição, ele é AVISADO de que a foto não foi lida. */
function promptComFoto(system: string, descricao: string): string {
  const reforco =
    "\n- A FOTO É SÓ UMA AJUDA PARA ACHAR O PEDAÇO. Ela NÃO é motivo para reescrever o arquivo: " +
    "mesmo com a foto, pedido pontual continua sendo EDIÇÃO (=== EDIT === com @@BUSCAR/@@TROCAR). " +
    "Se o risco marca UM elemento, troque esse elemento — não regenere a página.";
  const bloco = descricao
    ? `\n\nO QUE A PESSOA MARCOU NO PREVIEW: um modelo que ENXERGA leu a foto do pedaço marcado (com o risco rosa dela) e descreveu:\n"""${descricao}"""\nO pedido é sobre ESTE pedaço: mexa no que o risco marca e não mude o resto sem necessidade. Se a descrição não bater com o projeto, siga o texto do pedido e diga a diferença.${reforco}`
    : `\n\nO QUE A PESSOA MARCOU NO PREVIEW: existe uma foto do pedaço marcado, mas nenhum modelo que enxerga conseguiu lê-la agora. Trabalhe só com a referência de texto do pedido — não invente o que estava na foto.${reforco}`;
  return system + bloco;
}

/** O mesmo cano do chat: gateway da conta → Verboo (V4.1→V4.0) → Gemini.
 *  `orcamentoMs` limita a CORRENTE inteira de modelos (o tempo que a pessoa
 *  espera). Sem ele, cada modelo teria 240s e a soma passaria do que o túnel
 *  aguenta — a conexão morre e a pessoa vê "Caiu a conexão no meio" em vez de
 *  uma mensagem honesta. */
async function chamarModelo(
  mensagens: Msg[],
  system: string,
  tenant: number,
  orcamentoMs = 90000,
  onProgresso?: (caracteres: number) => void,
): Promise<Resultado> {
  const msgs = montarMensagens(mensagens, system);
  // Projeto MULTIARQUIVO cabe em muito mais texto que um HTML único: o teto é
  // alto para os arquivos inteiros caberem. E os modelos Verboo são de
  // RACIOCÍNIO (devolvem `reasoning_content` à parte): com o teto baixo o
  // raciocínio consome a cota, o `content` volta VAZIO ou cortado
  // (`finish_reason: length`) e o construtor "falha" sem erro de rede. O
  // RACIOCÍNIO vai DESLIGADO (`enable_thinking: false`, ver `corpoBase`) — e
  // NADA de `reasoning_effort`: medido em 10/10/2026, qualquer `reasoning_effort`
  // ANULA o `enable_thinking: false` e o modelo volta ao loop infinito.
  const corpoBase = {
    messages: msgs,
    max_tokens: 32000,
    temperature: 0.3,
    // RACIOCÍNIO DESLIGADO (correção 10/10/2026, medida): com o raciocínio LIGADO
    // (`reasoning_effort: low`, `none`, etc.) o modelo entra em LOOP INFINITO: o
    // stream corre (34 mil eventos medidos) e NUNCA emite `content` — só
    // `reasoning_content`. O build travava os 240s do timeout e devolvia 502. Com
    // `enable_thinking: false` a MESMA instrução devolve conteúdo em ~1,6s.
    // Não é preferência: é o que faz o build funcionar (e ficou muito mais rápido).
    enable_thinking: false,
    // STREAM SEMPRE LIGADO (correção de transporte, 08/10/2026): a chamada
    // BUFFERIZADA (`stream: false`) fazia o router do provedor devolver
    // "upstream unavailable" a ~240s nos builds grandes (o modelo de
    // RACIOCÍNIO enche o buffer). Em SSE o MESMO pedido completa em ~110s. A
    // leitura junta o texto em `lerTexto()`; para FORA a resposta não muda
    // (continua o JSON de projeto) — só o transporte.
    stream: true,
  };

  // 1) Gateway da conta (vínculo + plano/medição). Recusou/caiu → provedor direto.
  // O relógio do orçamento começa AQUI: vale para o gateway, para os modelos Verboo
  // e para o Gemini — a corrente inteira, não só uma perna dela.
  const inicioModelos = Date.now();
  const gw = gatewayDaConta(tenant);
  if (gw) {
    try {
      const r = await gw.chamar({ ...corpoBase, model: MODELO_DA_CONTA });
      if (r.ok) {
        const texto = await lerTexto(r, onProgresso);
        if (texto.trim()) return { ok: true, texto, motor: "conta" };
      }
      /* TETO DE TOKENS (27/11/2026): 402 do gateway NÃO cai em provedor de
         reserva. Antes, cair aqui gastava a chave da casa por uma conta que já
         tinha estourado a franquia do mês — o oposto do que o teto existe para
         fazer. A recusa sobe com o recado humano, com o número. */
      if (r.status === 402) {
        const estado = await tetoEstouradoDaConta(tenant);
        console.warn(
          `[limite] Arquiteto: teto de tokens da conta ${tenant} atingido — não vai a provedor de reserva`,
        );
        return {
          ok: false,
          erro: mensagemDeTokensEsgotados(estado?.usado ?? null, estado?.teto ?? null),
        };
      }
      console.error("Arquiteto: gateway da conta recusou:", r.status);
    } catch (e) {
      console.error("Arquiteto: gateway da conta fora do ar:", e instanceof Error ? e.message : e);
    }
  }

  // 2) Verboo direto (mesma chave e mesma base do chat do app).
  //
  // ORÇAMENTO TOTAL: os modelos correm EM SÉRIE; a corrente inteira cabe no
  // `orcamentoMs` (o primeiro pega o tempo cheio, os seguintes o que sobrou).
  // Ninguém espera além disso por um erro.
  if (VERBOO_API_KEY) {
    for (const modelo of VERBOO_MODELOS) {
      const resta = orcamentoMs - (Date.now() - inicioModelos);
      // Sobrou pouco? Não vale começar outra tentativa (ela só nasceria cortada).
      if (resta < 20000) {
        console.error(`Arquiteto Verboo: orçamento esgotado (${modelo} não tentado)`);
        break;
      }
      try {
        const r = await fetch(`${VERBOO_BASE}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${VERBOO_API_KEY}` },
          body: JSON.stringify({ ...corpoBase, model: modelo }),
          // TETO POR CHAMADA (dono, 11/10/2026: "não pode ter timeout — quero apps
          // complexos"). Era 240s e CORTava o modelo no meio da escrita de um app
          // grande — medido: um pedido longo gerava ~36 mil caracteres e era
          // abortado, e a pessoa via "caiu a conexão". 600s (10 min) cobre qualquer
          // geração real (o modelo escreve ~150 caracteres/s, então 10 min ≈ 90 mil
          // caracteres); o teto TOTAL do pedido é quem limita de verdade.
          signal: AbortSignal.timeout(Math.max(20000, Math.min(600000, resta))),
        });
        if (!r.ok) {
          const err = await r.text().catch(() => "");
          console.error(`Arquiteto Verboo ${modelo}:`, r.status, err.slice(0, 200));
          continue;
        }
        const texto = await lerTexto(r, onProgresso);
        if (texto.trim()) return { ok: true, texto, motor: "verboo" };
      } catch (e) {
        console.error("Arquiteto Verboo rede:", e instanceof Error ? e.message : e);
      }
    }
  }

  // 3) Gemini (reserva do ecossistema).
  if (GOOGLE_API_KEY) {
    try {
      const contents = msgs.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
      const r = await fetch(
        `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${GOOGLE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents }),
          signal: AbortSignal.timeout(
            Math.max(20000, Math.min(600000, orcamentoMs - (Date.now() - inicioModelos))),
          ),
        },
      );
      if (r.ok) {
        const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
        const texto = j?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
        if (texto.trim()) return { ok: true, texto, motor: "gemini" };
      } else {
        console.error("Arquiteto Gemini:", r.status);
      }
    } catch (e) {
      console.error("Arquiteto Gemini rede:", e instanceof Error ? e.message : e);
    }
  }

  return {
    ok: false,
    erro: "Não consegui falar com o modelo agora. O acesso está liberado, mas o provedor não respondeu — tente de novo em instantes.",
  };
}

export async function POST(req: NextRequest) {
  // 1) Conta pela sessão.
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  // 2) PORTEIRA: capacidade conferida de novo, no servidor. Falha fechado.
  const acesso = await decidirAcessoArquiteto(g.conta);
  if (!acesso.permitido) {
    return NextResponse.json(
      {
        erro: "O Arquiteto não está liberado para esta conta.",
        capacidade: CAPACIDADE_ARQUITETO,
        motivo: acesso.motivo,
      },
      { status: 403 },
    );
  }

  // 2b) TETO DE TOKENS (27/11/2026): com a franquia do mês estourada, a rota
  // não monta prompt, não lê projeto e não chama modelo — nada é gasto. O dono
  // nunca é barrado (a isenção vive no plano de controle e é espelhada aqui).
  if (!g.conta.ehDono) {
    const estouro = await tetoEstouradoDaConta(g.conta.id);
    if (estouro) {
      console.warn(
        `[limite] Arquiteto: conta ${g.conta.id} sem tokens (${estouro.usado}/${estouro.teto}) — pedido recusado antes de montar o prompt`,
      );
      return NextResponse.json(
        {
          erro: mensagemDeTokensEsgotados(estouro.usado, estouro.teto),
          tokens: "esgotados",
        },
        { status: 402 },
      );
    }
  }

  // 3) O pedido.
  let corpo: { mensagens?: Msg[]; assets?: string[]; tokens?: unknown; docProjeto?: string; foto?: string; projetoId?: string; integracoes?: string[]; arquivos?: { nome: string; conteudo: string }[] } = {};
  try {
    corpo = (await req.json()) as {
      mensagens?: Msg[];
      assets?: string[];
      tokens?: unknown;
      docProjeto?: string;
      foto?: string;
      projetoId?: string;
      integracoes?: string[];
      arquivos?: { nome: string; conteudo: string }[];
    };
  } catch {
    corpo = {};
  }
  const mensagens = Array.isArray(corpo.mensagens) ? corpo.mensagens : [];
  if (!mensagens.length) {
    return NextResponse.json({ erro: "Escreva, na conversa, o que você quer construir." }, { status: 400 });
  }
  const assets = Array.isArray(corpo.assets) ? corpo.assets.filter((a) => typeof a === "string") : [];
  // Os TOKENS DE DESIGN vêm do cliente (o painel). Ausente/ilegível → PADRÃO:
  // o projeto gerado JÁ NASCE com os tokens por padrão.
  const tokens = normalizarTokens(corpo.tokens);
  // O .md DO PROJETO (dono, 08/10/2026): o cliente manda o texto do PROJETO.md que
  // está na tela — é por ele que o construtor segue as decisões já tomadas. Sem
  // projeto (ou sem .md), vem vazio e o bloco não entra. (O valor é montado mais
  // abaixo, junto com a autocorreção que busca o projeto no banco.)
  const foto = typeof corpo.foto === "string" ? corpo.foto : "";
  const integracoes = Array.isArray(corpo.integracoes)
    ? corpo.integracoes.filter((i): i is string => typeof i === "string")
    : [];
  const projetoId = typeof corpo.projetoId === "string" ? corpo.projetoId : "";
  let arquivosAtuais: { nome: string; conteudo: string }[] = Array.isArray(corpo.arquivos)
    ? corpo.arquivos
        .filter((a) => !!a && typeof a.nome === "string" && typeof a.conteudo === "string" && a.nome.trim() !== "")
        .map((a) => ({ nome: a.nome.trim(), conteudo: a.conteudo }))
    : [];

  // AUTOCORREÇÃO (dono, 11/10/2026): "Não deu para construir agora (200). Tente de
  // novo." — medido aqui: o pedido chegou com `arquivos: []` (a tela manda lista
  // vazia quando o estado dela não tem o projeto carregado), o construtor tentou
  // editar o vazio e a resposta voltou `ok:true` com ZERO arquivos — e a tela, sem
  // nada para mostrar, culpava o status. O projeto é do dono e está no banco:
  // BUSCAR LÁ é mais confiável que depender do que a tela mandou. Não muda o
  // resultado de um pedido normal (só roda quando a lista vem vazia).
  if (!arquivosAtuais.length && projetoId) {
    try {
      if (donoDoProjeto(projetoId) === g.conta.id) {
        const salvo = obterProjeto(g.conta.id, projetoId);
        if (salvo?.arquivos.length) {
          arquivosAtuais = salvo.arquivos.map((a) => ({ nome: a.nome, conteudo: a.conteudo }));
          console.log(`Arquiteto: pedido veio sem arquivos — carreguei ${arquivosAtuais.length} do projeto`);
        }
      }
    } catch (e) {
      console.error("Arquiteto: falha ao carregar os arquivos do projeto:", e instanceof Error ? e.message : e);
    }
  }
  // O .md do projeto: a tela manda o texto do PROJETO.md; se ela não tem o projeto
  // carregado (o caso acima), o .md vem vazio — usa o do projeto salvo.
  const docProjeto =
    (typeof corpo.docProjeto === "string" ? corpo.docProjeto : "").trim() ||
    arquivosAtuais.find((a) => a.nome.toLowerCase() === "projeto.md")?.conteudo ||
    "";

  // ── A PARTE LENTA VAI NUM FLUXO QUE INFORMA (dono, 11/10/2026) ──────────────
  // Antes: a rota mandava um ESPAÇO a cada 8s só para a conexão não ficar ociosa
  // (conexão ociosa é cortada pelo Cloudflare/túnel). Agora vai uma LINHA com o
  // TEMPO DECORRIDO e quantos CARACTERES o modelo já escreveu: quem pediu um app
  // grande vê que está andando, e no fim sabe quanto tempo levou. Pedido que
  // demora deixa de ser uma caixa-preta.
  //
  // O formato continua compatível: o cliente lê as LINHAS e a última é a resposta.
  const codificador = new TextEncoder();
  const inicioPedido = Date.now();
  let caracteresGerados = 0;
  // O LOTE da fila (dono, 13/10/2026): num pedido que toca muitos arquivos o trabalho vai em
  // lotes, e a tela mostra "lote 3 de 12" em vez de um relógio cego. `total = 0` = regime de
  // uma chamada só (não é fila). É um OBJETO (e não uma variável solta) para o fechamento do
  // batimento enxergar a mudança.
  const loteDaFila = { lote: 0, total: 0 };
  const fluxo = new ReadableStream({
    async start(controlador) {
      const batida = setInterval(() => {
        try {
          const aviso = {
            progresso: {
              segundos: Math.round((Date.now() - inicioPedido) / 1000),
              caracteres: caracteresGerados,
              ...(loteDaFila.total ? { lote: loteDaFila.lote, lotes: loteDaFila.total } : {}),
            },
          };
          controlador.enqueue(codificador.encode(JSON.stringify(aviso) + "\n"));
        } catch {
          /* já fechou */
        }
      }, 4000);
      let saida: unknown = { erro: "Falha inesperada ao construir. Tente de novo." };
      const inicioConstrucao = Date.now();
      try {
        // ── A FASE DE AÇÃO (dono, 15/10/2026: "dá mãos a ela") ────────────────
        // Antes do construtor: se o pedido é AÇÃO (subir, git, servidor), quem
        // responde são as FERRAMENTAS — o construtor nem é chamado. Se não for
        // ação, o modelo responde SEM_ACAO e tudo segue como sempre foi.
        // Devolver `arquivos: arquivosAtuais` (e não lista vazia) é de propósito:
        // a tela usa essa lista como o estado do projeto, e lista vazia apagaria
        // o que a pessoa já tem.
        const ultimoPedido =
          [...mensagens].reverse().find((m) => m.role !== "assistant")?.content || "";
        const acao = PEDE_ACAO.test(ultimoPedido)
          ? await faseDeFerramentas(ultimoPedido, g.conta)
          : null;
        if (acao && !/^\s*SEM_ACAO\s*$/i.test(acao.texto)) {
          console.log("[arquiteto] ação resolvida por ferramenta:", acao.usou.join(", ") || "(nenhuma)");
          saida = {
            ok: true,
            resumo: acao.texto,
            arquivos: arquivosAtuais,
            ferramentas: acao.usou,
          };
        } else {
          saida = await construirProjeto(
          {
            mensagens,
            assets,
            tokens,
            docProjeto,
            foto,
            integracoes,
            arquivosAtuais,
            contaId: g.conta.id,
            projetoId,
          },
          (n) => {
            // SEMPRE CRESCENTE (dono, 11/10/2026): quando o sistema tenta de novo
            // (a segunda tentativa depois de uma edição que não casou), o contador
            // do modelo reinicia — e a tela mostraria o número CAINDO de 35 mil
            // para 1,6 mil, que parece que o trabalho foi perdido. O número só
            // sobe: é o que a pessoa já viu escrito.
            caracteresGerados = Math.max(caracteresGerados, n);
          },
          // O progresso da FILA (dono, 13/10/2026): "lote 3 de 12" na tela.
          (l, t) => {
            loteDaFila.lote = l;
            loteDaFila.total = t;
          },
          );
        }
      } catch (e) {
        console.error("Arquiteto: falha no construir:", e instanceof Error ? e.message : e);
      } finally {
        clearInterval(batida);
      }
      // O TEMPO REAL vai na resposta, SEMPRE (sucesso ou erro): é o que permite ao
      // dono saber se o que ele pediu realmente aconteceu e quanto custou esperar.
      const levouMs = Date.now() - inicioConstrucao;
      if (saida && typeof saida === "object") {
        saida = { ...(saida as Record<string, unknown>), levouMs };
      }
      try {
        controlador.enqueue(codificador.encode(JSON.stringify(saida) + "\n"));
        controlador.close();
      } catch {
        /* já fechou */
      }
    },
  });
  return new Response(fluxo, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      // Desliga o buffer de proxies: o batimento precisa FLUIR, não acumular.
      "X-Accel-Buffering": "no",
    },
  });
}

/** A parte LENTA do construtor: lê a foto (visão), monta a instrução, chama o
 *  modelo e extrai o projeto. Devolve SEMPRE um objeto JSON — o MESMO corpo que
 *  o cliente já esperava (ok/erro/resumo/arquivos/visao). */
/** O que o construtor recebe — a MESMA forma nos dois regimes (um escopo só, ou a fila). */
type EntradaConstrutor = {
  mensagens: Msg[];
  assets: string[];
  tokens: Tokens;
  docProjeto: string;
  foto: string;
  integracoes: string[];
  arquivosAtuais: { nome: string; conteudo: string }[];
  contaId: number;
  projetoId: string;
};

/**
 * A FASE DE FERRAMENTAS (dono, 15/10/2026: *"dá mãos a ela"*).
 *
 * A tela do Arquiteto tinha chat próprio mas NENHUMA ferramenta: ela construía
 * arquivos e, quando a pessoa pedia "sobe pra mim", só sabia dizer que não
 * conseguia. Aqui ela ganha as MESMAS mãos do chat da Mirai — o conjunto
 * `ferramentasDoArquiteto()` (github_conta, github_publicar, servidor_*,
 * arquiteto_*), pela MESMA porteira da conta.
 *
 * Roda ANTES do construtor, e só quando o pedido parece AÇÃO (ver PEDE_ACAO):
 * construir tela não paga o custo de uma ida a mais ao modelo. Se o modelo
 * concluir que o pedido não é ação, responde SEM_ACAO e o construtor assume —
 * exatamente como antes desta mudança.
 */
const PEDE_ACAO =
  /\b(subir|suba|sobe|publicar|publica|reposit[óo]rio|repo|github|git|commit|branch|servidor|ssh|rodar|roda|rode|executar|executa|instalar|instala|comando|terminal|clonar|clone|trazer|importar)\b/i;

/** Teto de idas ao modelo na fase de ação (cada uma pode pedir ferramenta). */
const RODADAS_FERRAMENTAS = 4;
/** Teto do que volta ao modelo: resultado gigante não pode estourar o contexto. */
const MAX_RESULTADO_FERRAMENTA = 6000;

const INSTRUCOES_FERRAMENTAS =
  "Você é o Arquiteto da Mirai no modo AÇÃO. Aqui você NÃO escreve código: você USA " +
  "as ferramentas para fazer o que a pessoa pediu no mundo real — subir o projeto para " +
  "o GitHub, mexer no servidor dela, trazer projeto de fora, ler e gravar arquivos.\n\n" +
  "Regras:\n" +
  "- Se o pedido for para CONSTRUIR ou MUDAR o app (tela, cor, texto, layout, " +
  "comportamento), NÃO use ferramenta nenhuma: responda apenas com a palavra SEM_ACAO.\n" +
  "- Se a mensagem CITA um repositório (link do GitHub ou 'dono/repo') e pede para " +
  "trazer, importar, clonar, instalar, configurar, analisar ou mexer nele, isso é AÇÃO: " +
  "chame `arquiteto_trazer_git`. NÃO responda SEM_ACAO nesse caso, e NUNCA construa uma " +
  "página de instruções no lugar de trazer o código — foi medido: pediram um repositório " +
  "e o construtor desenhou um 'guia de instalação' dizendo que não conseguia clonar.\n" +
  "- Se for AÇÃO (subir, publicar, git, repositório, servidor, rodar comando, trazer " +
  "projeto de fora), use a ferramenta certa e depois responda em português do Brasil, " +
  "curto e direto, dizendo o que aconteceu DE VERDADE.\n" +
  "- Você TEM internet e trabalha com a conta e os projetos DESTA pessoa. NUNCA diga que " +
  "não tem acesso à rede ou à conta: as ferramentas são a prova de que tem.\n" +
  "- Se faltar conexão, a própria ferramenta devolve o LINK para conectar — entregue esse " +
  "link na resposta, sozinho numa linha, para a pessoa clicar.\n" +
  "- NUNCA invente resultado: conte só o que a ferramenta devolveu.\n" +
  "- NUNCA peça senha, token ou chave, e nunca mande a pessoa colar comando de terminal.";

/** O que a fase de ação devolveu: o texto final e quais ferramentas foram usadas. */
type FaseFerramentas = { texto: string; usou: string[] };

/** A forma da resposta do provedor quando se oferecem ferramentas. */
type RespostaComFerramentas = {
  choices?: {
    message?: {
      content?: string | null;
      tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
    };
  }[];
};

async function faseDeFerramentas(
  pedido: string,
  conta: Conta,
  orcamentoMs = 90000,
): Promise<FaseFerramentas | null> {
  const ferramentas = ferramentasDoArquiteto();
  if (!ferramentas.length || !VERBOO_API_KEY) return null;
  const msgs: unknown[] = [
    { role: "system", content: INSTRUCOES_FERRAMENTAS },
    { role: "user", content: pedido },
  ];
  const usou: string[] = [];
  const inicio = Date.now();

  for (let rodada = 0; rodada < RODADAS_FERRAMENTAS; rodada++) {
    const resta = orcamentoMs - (Date.now() - inicio);
    if (resta < 10000) break;

    let j: RespostaComFerramentas | null = null;

    for (const modelo of VERBOO_MODELOS) {
      try {
        const r = await fetch(VERBOO_BASE + "/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + VERBOO_API_KEY },
          body: JSON.stringify({
            model: modelo,
            messages: msgs,
            tools: ferramentas,
            tool_choice: "auto",
            max_tokens: 2048,
            temperature: 0.2,
            // Mesma correção do construtor: raciocínio LIGADO trava o stream.
            enable_thinking: false,
          }),
          signal: AbortSignal.timeout(Math.max(10000, Math.min(120000, resta))),
        });
        if (!r.ok) {
          console.error("Arquiteto ação " + modelo + ":", r.status);
          continue;
        }
        j = (await r.json()) as RespostaComFerramentas;
        break;
      } catch (e) {
        console.error("Arquiteto ação rede:", e instanceof Error ? e.message : e);
      }
    }
    if (!j) return null;

    const msg = j.choices?.[0]?.message;
    const pedidos = msg?.tool_calls || [];
    if (!pedidos.length) {
      const texto = (msg?.content || "").trim();
      return texto ? { texto, usou } : null;
    }

    msgs.push({ role: "assistant", content: msg?.content || "", tool_calls: pedidos });
    for (const p of pedidos) {
      const nome = p?.function?.name || "";
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(p?.function?.arguments || "{}") as Record<string, unknown>;
      } catch {
        /* argumento ilegível: a ferramenta decide o que fazer com {}. */
      }
      // Registro do que a conta executou — sem despejar dado pessoal no log.
      console.log("[arquiteto] ação: " + nome);
      let saida = "";
      try {
        saida = (await executarFerramentaArquiteto(nome, args, conta)) || "(ferramenta desconhecida)";
      } catch (e) {
        saida = "erro ao executar: " + (e instanceof Error ? e.message : "?");
      }
      if (saida.length > MAX_RESULTADO_FERRAMENTA) {
        saida = saida.slice(0, MAX_RESULTADO_FERRAMENTA) + "…(resultado cortado)";
      }
      usou.push(nome);
      msgs.push({ role: "tool", tool_call_id: p?.id || nome, content: saida || "(sem resultado)" });
    }
  }
  return null;
}

/** Acima de LIMITE_LOTE alvos, o pedido vira FILA EM LOTE em vez de uma chamada só. */
const LIMITE_LOTE = 8;
const TAMANHO_LOTE = 4;

async function construirProjeto(
  p: EntradaConstrutor,
  onProgresso?: (caracteres: number) => void,
  onLote?: (lote: number, total: number) => void,
): Promise<unknown> {
  // REDE DE SEGURANÇA, NÃO LIMITE DE TRABALHO (dono, 11/10/2026): "não pode ter
  // timeout — quero fazer apps complexos". O dono tem razão: cortar por tempo
  // derruba justamente o trabalho grande, que é o que ele quer fazer.
  //
  // MEDIDO no caminho real (Cloudflare → cloudflared → app): a conexão aguenta o
  // túnel enquanto houver tráfego — o batimento de 4s mantém viva por 104s+ e
  // segue. O que demora é o MODELO: escreve ~40 tokens/s, então um app grande leva
  // MINUTOS. O teto aqui existe só para o pedido não ficar pendurado para sempre
  // se o provedor travar (20 min é muito acima de qualquer construção real). Quem
  // quiser construir mais do que isso deve construir em partes.
  const TETO_TOTAL_MS = 1200000;
  const inicio = Date.now();
  const resta = () => TETO_TOTAL_MS - (Date.now() - inicio);

  // A foto do pedaço marcado vai para um modelo que ENXERGA (o construtor não vê
  // imagem) e volta como TEXTO; a descrição entra na instrução.
  const visao = p.foto ? await lerFotoComVisao(p.foto) : "";

  // ── O ESCOPO DO PEDIDO (dono, 13/10/2026) ──────────────────────────────────
  // "quando tiver um milhão de páginas, ele tem que agir de forma separada. e não olhar
  // sempre o sistema inteiro." Projeto grande NÃO manda todos os arquivos: manda o MAPA e
  // só os que o pedido toca. O pedido da pessoa é o último turno de fala dela.
  const pedido = [...(p.mensagens || [])].reverse().find((m) => m.role !== "assistant")?.content || "";
  const base = promptComPublicacao(
    promptComIntegracoes(
      promptComDoc(
        promptComVisual(promptComCraft(promptComTokens(promptComAssets(CONSTRUTOR_PROMPT, p.assets), p.tokens))),
        p.docProjeto,
      ),
      p.integracoes,
    ),
    origemPublica() || PUBLICO_PADRAO,
  );
  const pequeno = projetoPequeno(p.arquivosAtuais);
  let alvos: string[];
  if (pequeno || !p.arquivosAtuais.length) {
    alvos = p.arquivosAtuais.map((a) => a.nome);
  } else {
    const citados = alvosCitados(p.arquivosAtuais, pedido);
    alvos = citados.length
      ? citados
      : await escolherAlvosComModelo(p.arquivosAtuais, pedido, p.docProjeto, p.contaId);
    // Nada decidiu os alvos? Fallback determinístico — NUNCA manda tudo num projeto grande
    // (é justamente o que estoura o teto e faz o modelo se perder).
    if (!alvos.length) alvos = alvosPorPadrao(p.arquivosAtuais);
  }
  console.log(
    pequeno || !p.arquivosAtuais.length
      ? `Arquiteto: projeto pequeno (${p.arquivosAtuais.length} arquivo(s)) — manda tudo`
      : `Arquiteto: projeto GRANDE (${p.arquivosAtuais.length} arquivos, ${tamanhoTotal(p.arquivosAtuais)} chars) — escopo: ${alvos.length} (${alvos.join(", ")})`,
  );

  // ── O PEDIDO QUE TOCA MUITOS ARQUIVOS VIRA FILA (dono, 13/10/2026) ──────────
  // "quando tiver um milhão de páginas, ele tem que agir de forma separada". Uma chamada só
  // para 200 arquivos não caberia nem no teto nem no tempo. Aqui o pedido vira uma FILA: o
  // modelo planeja a lista, o servidor processa de TAMANHO_LOTE em TAMANHO_LOTE e GRAVA cada
  // lote ao terminar — um lote que falha não derruba os outros.
  if (!pequeno && alvos.length > LIMITE_LOTE) {
    return await construirEmLotes({ p, base, visao, alvos, resta, onProgresso, onLote });
  }
  return await construirEscopo({ p, base, visao, alvos, arquivosBase: p.arquivosAtuais, resta, onProgresso });
}

/**
 * UM ESCOPO: monta a instrução para os arquivos de `alvos`, chama o modelo e aplica o resultado
 * em `arquivosBase`. É o MESMO caminho no regime de uma chamada só e em cada lote da fila — o
 * que muda entre eles é apenas QUANTOS arquivos entram no escopo.
 */
async function construirEscopo(e: {
  p: EntradaConstrutor;
  base: string;
  visao: string;
  alvos: string[];
  arquivosBase: Arquivo[];
  resta: () => number;
  onProgresso?: (caracteres: number) => void;
}): Promise<unknown> {
  const { p, base, visao, arquivosBase, resta, onProgresso } = e;
  // Cópia mutável: a ESCALAÇÃO acrescenta arquivos a este escopo.
  let alvos = [...e.alvos];

  const montarInstrucao = () => {
    const i = promptComProjeto(base, arquivosBase, alvos, p.docProjeto);
    return p.foto ? promptComFoto(i, visao) : i;
  };

  let r = await chamarModelo(p.mensagens, montarInstrucao(), p.contaId, Math.max(20000, resta()), onProgresso);
  if (!r.ok) return { erro: r.erro };

  // ── A ESCALAÇÃO (dono, 13/10/2026): faltou arquivo? O modelo PEDE ──────────
  // Em vez de escrever no escuro (e errar), ele responde `=== PRECISA: nome ===` e o
  // pedido é reenviado com o arquivo. Até 2 vezes — depois disso, o que ele trouxe é o que vale.
  for (let escalada = 0; escalada < 2 && resta() > 30000; escalada++) {
    if (!ehSoPedidoDeArquivo(r.texto)) break;
    const pedidos = extrairPedidosDeArquivo(r.texto)
      .map((n) => {
        const b = (n.split("/").pop() || n).toLowerCase();
        return arquivosBase.find(
          (a) => a.nome.toLowerCase() === n.toLowerCase() || (a.nome.split("/").pop() || a.nome).toLowerCase() === b,
        )?.nome;
      })
      .filter((n): n is string => typeof n === "string" && !alvos.includes(n));
    if (!pedidos.length) break;
    alvos = [...alvos, ...pedidos];
    console.log(`Arquiteto: o modelo pediu ${pedidos.join(", ")} — reenviando com eles`);
    r = await chamarModelo(p.mensagens, montarInstrucao(), p.contaId, Math.max(20000, resta()), onProgresso);
    if (!r.ok) return { erro: r.erro };
  }
  // O modelo pediu arquivo e não há mais o que reenviar (o nome não existe no projeto, ou o
  // fôlego acabou). Melhor dizer ISSO do que o genérico "não veio no formato de projeto".
  if (ehSoPedidoDeArquivo(r.texto)) {
    const faltando = extrairPedidosDeArquivo(r.texto).join(", ");
    return {
      erro:
        `O construtor pediu um arquivo que não existe neste projeto (${faltando || "nome não identificado"}). ` +
        "Nada foi alterado — confira o nome do arquivo e repita o pedido.",
    };
  }

  // Régua do formato (ops): mostra se o modelo obedeceu a EDIÇÃO ou reescreveu tudo.
  // Um "ARQUIVO" numa mudança pontual explica sozinho uma espera de 90s+.
  console.log(
    `Arquiteto: ${r.motor} | ${r.texto.length} chars | formato=${
      r.texto.includes("=== EDIT:") || r.texto.includes("@@BUSCAR")
        ? "EDIT"
        : r.texto.includes("=== ARQUIVO:")
          ? "ARQUIVO"
          : "livre"
    }`,
  );

  // Formato previsível → projeto. Sem projeto reconhecível: TENTA DE NOVO antes de
  // desistir (dono, 11/10/2026).
  //
  // MEDIDO: de vez em quando o modelo responde TEXTO ("Claro! Vou adicionar uma
  // seção de perguntas frequentes…") em vez do bloco de edição — e o pedido, que era
  // claro, morria com "não veio no formato de projeto". Recusar e parar deixa a
  // pessoa sem saída. Uma segunda chamada DIRIGIDA, mostrando o formato exato e
  // proibindo explicação, resolve; se também falhar, aí sim a tela diz o motivo.
  let projeto = extrairProjeto(r.texto);
  // E as EDIÇÕES (dono, 11/10/2026): o caminho RÁPIDO — a troca em vez do arquivo
  // inteiro. É o que faz uma mudança pontual voltar em segundos em vez de ~90s.
  let edicoes = extrairEdicoes(r.texto);
  if (!projeto.arquivos.length && !edicoes.length && resta() > 30000) {
    const correcao =
      "A sua resposta anterior NÃO veio no formato exigido — veio texto. " +
      "Responda DE NOVO, APENAS com o bloco no formato, sem nenhuma explicação antes ou depois. " +
      "Para MUDAR algo em um arquivo que já existe, use exatamente:\n" +
      "=== EDIT: nome-do-arquivo\n@@BUSCAR\n(um trecho EXATO que está no arquivo hoje)\n@@TROCAR\n(o trecho novo)\n=== FIM\n" +
      "Se precisar devolver um arquivo inteiro, use === ARQUIVO: nome ... === FIM.";
    const r2 = await chamarModelo(
      [...p.mensagens, { role: "assistant", content: r.texto }, { role: "user", content: correcao }],
      montarInstrucao(),
      p.contaId,
      Math.max(20000, resta()),
      onProgresso,
    );
    if (r2.ok) {
      const proj2 = extrairProjeto(r2.texto);
      const ed2 = extrairEdicoes(r2.texto);
      if (proj2.arquivos.length || ed2.length) {
        console.log(`Arquiteto: a segunda tentativa trouxe o formato (${proj2.arquivos.length} arquivo(s), ${ed2.length} edição(ões))`);
        projeto = proj2;
        edicoes = ed2;
      }
    }
  }
  if (!projeto.arquivos.length && !edicoes.length) {
    return {
      erro: "A resposta do modelo não veio no formato de projeto (nenhum arquivo reconhecido). Tente reformular o pedido.",
    };
  }

  // 1) As EDIÇÕES entram por substituição literal no projeto ATUAL.
  let comEdicoes = aplicarEdicoes(arquivosBase, edicoes);

  // SEGUNDA TENTATIVA quando o trecho NÃO CASOU (dono, 11/10/2026: "não aplicou
  // porque aparece duas vezes"). Dois modos de errar, o mesmo remédio: o modelo
  // copiou um trecho curto demais (ambíguo — em página real o MESMO bloco costuma
  // existir no topo e no rodapé) ou um trecho que não existe no arquivo (inventou
  // ou reformatou). Recusar e parar deixa a pessoa sem saída (ela pediu, o sistema
  // disse não, e nada mudou); uma segunda chamada DIRIGIDA — dizendo exatamente o
  // que falhou e pedindo o trecho exato e único — resolve. É barata: a resposta de
  // edição tem poucas linhas. Se também falhar, aí sim a tela diz o motivo.
  // NUNCA se adivinha qual das ocorrências era.
  const naoCasaram = comEdicoes.recusadas.filter(
    (x) => x.motivo.includes("ambíguo") || x.motivo.includes("não foi encontrado"),
  );
  // Só vale tentar de novo se ainda houver fôlego no teto: uma segunda chamada
  // que estoure o tempo só troca um erro por uma conexão morta.
  if (naoCasaram.length && resta() > 25000) {
    const nomes = [...new Set(naoCasaram.map((a) => a.nome))].join(", ");
    const ambiguo = naoCasaram.some((a) => a.motivo.includes("ambíguo"));
    const correcao =
      `A sua resposta anterior NÃO foi aplicada em ${nomes}: ` +
      (ambiguo
        ? `o trecho de @@BUSCAR aparece mais de uma vez no arquivo (é comum o mesmo bloco existir no topo e no rodapé). `
        : `o trecho de @@BUSCAR não foi encontrado no arquivo — o texto tem de ser IDÊNTICO ao que está lá (palavras, tags, atributos, pontuação). `) +
      `Responda DE NOVO, apenas com o bloco de edição, copiando o trecho do arquivo tal como ele está e ` +
      `incluindo a linha de cima ou o que vem antes/depois até o trecho ficar ÚNICO. O pedido é o mesmo; ` +
      `não mude nada além dele.`;
    const r2 = await chamarModelo(
      [...p.mensagens, { role: "assistant", content: r.texto }, { role: "user", content: correcao }],
      montarInstrucao(),
      p.contaId,
      Math.max(20000, resta()),
      onProgresso,
    );
    if (r2.ok) {
      const ed2 = extrairEdicoes(r2.texto);
      if (ed2.length) {
        const ap2 = aplicarEdicoes(comEdicoes.arquivos, ed2);
        comEdicoes = {
          arquivos: ap2.arquivos,
          aplicadas: comEdicoes.aplicadas + ap2.aplicadas,
          recusadas: ap2.recusadas,
        };
      }
    }
  }

  // 2) Os ARQUIVOS INTEIROS (quando vieram) entram por cima, na mescla: os que não
  // vieram ficam byte a byte como estavam.
  const { arquivos, recusados } = mesclarMudanca(comEdicoes.arquivos, projeto.arquivos);

  const avisos: string[] = [];
  for (const rec of comEdicoes.recusadas) {
    // O PROJETO.md é o doc do PRÓPRIO app: o formato-base manda devolvê-lo
    // atualizado, e o modelo tenta editá-lo mesmo em projeto que (ainda) não tem
    // esse arquivo. Não há nada a atualizar — e avisar disso só confunde quem
    // está usando. Some do aviso; os outros casos continuam sendo ditos.
    const ehDocDoProjeto =
      rec.nome.toLowerCase() === "projeto.md" && rec.motivo === "arquivo não existe neste projeto";
    if (ehDocDoProjeto) continue;
    avisos.push(`Não apliquei a troca em ${rec.nome} (${rec.motivo}).`);
  }
  if (recusados.length) {
    avisos.push(
      `Não substituí ${recusados.join(", ")}: a resposta veio incompleta. O arquivo anterior está intacto — tente de novo.`,
    );
  }
  const resumo = [projeto.resumo || "Projeto atualizado.", ...avisos].filter(Boolean).join(" ");

  // HONESTIDADE (dono, 11/10/2026): `ok:true` com ZERO arquivos não é sucesso — é
  // uma resposta vazia, e a tela a transformava em "Não deu para construir agora
  // (200)". Acontece quando o pedido chega sem os arquivos do projeto (e o banco
  // também não tinha) e o modelo devolve só edições: não há o que editar. Melhor
  // dizer o motivo do que devolver nada.
  if (!arquivos.length) {
    return {
      erro:
        "Não recebi os arquivos deste projeto, então não havia o que mudar. Abra o projeto de novo " +
        "(ou recarregue a página) e repita o pedido — nada foi alterado.",
    };
  }

  // GRAVA NO SERVIDOR ANTES DE RESPONDER (dono, 11/10/2026: "quero apps grandes").
  // Antes, só a TELA salvava: se a conexão caísse no minuto 5 de uma construção de
  // 7 minutos, o trabalho tinha sido FEITO e era PERDIDO — a pessoa refazia tudo.
  // Agora o servidor grava o resultado por conta própria: a conexão pode cair que o
  // trabalho está a salvo e a pessoa o encontra ao recarregar. `salvarProjeto` é
  // idempotente (arquivos iguais = não cria versão), então o salvamento da tela
  // depois não duplica nada.
  let salvoNoServidor = false;
  if (p.projetoId && donoDoProjeto(p.projetoId) === p.contaId) {
    try {
      salvoNoServidor = Boolean(salvarProjeto(p.contaId, p.projetoId, null, arquivos));
    } catch (e) {
      console.error("Arquiteto: não consegui gravar no servidor:", e instanceof Error ? e.message : e);
    }
  }

  return {
    ok: true,
    resumo,
    arquivos,
    // "lida" = a foto foi entendida por um modelo que enxerga; "ilegivel" = não
    // foi e a tela DIZ; "sem-foto" = não houve foto neste pedido.
    visao: p.foto ? (visao ? "lida" : "ilegivel") : "sem-foto",
    // A tela usa isto para saber que NÃO precisa salvar de novo (e para avisar, se
    // a conexão cair, que o resultado já está guardado no servidor).
    salvoNoServidor,
  };
}

/**
 * O PLANO da fila (dono, 13/10/2026): quais dos alvos o pedido REALMENTE afeta.
 *
 * A lista de candidatos já vem do escopo; aqui o modelo só a filtra — é uma chamada curta
 * (saída de poucas linhas), então volta rápido. Falhou → devolve os próprios alvos (nunca
 * deixa a fila sem lista).
 */
async function planejarArquivos(p: EntradaConstrutor, pedido: string, alvos: string[]): Promise<string[]> {
  if (alvos.length <= TAMANHO_LOTE) return alvos;
  const itens = construirIndice(p.arquivosAtuais, p.docProjeto).filter((i) => alvos.includes(i.nome));
  const instrucao =
    "Você é um PLANEJADOR. Abaixo está a lista de arquivos CANDIDATOS de um projeto " +
    "(nome — tamanho — papel) e, na mensagem, o pedido da pessoa. Responda APENAS com os nomes dos " +
    "arquivos que o pedido REALMENTE precisa mudar, um por linha, sem marcador e sem explicação. " +
    "Se o pedido vale para todos, liste todos. Use EXATAMENTE os nomes da lista.\n\n## CANDIDATOS\n" +
    textoDoIndice(itens, []);
  const r = await chamarModelo(
    [{ role: "user", content: pedido || "(sem texto — a pessoa marcou um pedaço no preview)" }],
    instrucao,
    p.contaId,
    25000,
  );
  if (!r.ok) return alvos;
  const achados: string[] = [];
  for (const bruta of r.texto.split("\n")) {
    const c = bruta.replace(/^[-*\d.)\s]+/, "").replace(/`/g, "").trim();
    if (!c || c.length > 120) continue;
    const alvo =
      alvos.find((a) => a.toLowerCase() === c.toLowerCase()) ||
      alvos.find(
        (a) =>
          (a.split("/").pop() || a).toLowerCase() === (c.split("/").pop() || c).toLowerCase(),
      );
    if (alvo && !achados.includes(alvo)) achados.push(alvo);
  }
  return achados;
}

/**
 * A FILA EM LOTE (dono, 13/10/2026) — "quando tiver um milhão de páginas, ele tem que agir de
 * forma separada".
 *
 * Um pedido que toca MUITOS arquivos não vira uma chamada gigante (que estouraria o teto e faria
 * o modelo se perder — o erro que o dono viu): vira uma FILA.
 *
 *  1. O PLANO — o modelo lê os candidatos + o pedido e devolve a lista dos arquivos afetados.
 *  2. OS LOTES — a lista é processada de TAMANHO_LOTE em TAMANHO_LOTE; cada lote recebe só os
 *     seus arquivos, e o resultado entra por cima do que já existe.
 *  3. GRAVA A CADA LOTE — o trabalho de cada lote vai para o banco assim que termina. Um lote
 *     que falha (ou a conexão que cai) NÃO perde os anteriores: o que já foi feito está gravado.
 *
 * Devolve o MESMO corpo do regime de uma chamada só, com o resumo dizendo quantos lotes foram
 * processados e o que falhou.
 */
async function construirEmLotes(e: {
  p: EntradaConstrutor;
  base: string;
  visao: string;
  alvos: string[];
  resta: () => number;
  onProgresso?: (caracteres: number) => void;
  onLote?: (lote: number, total: number) => void;
}): Promise<unknown> {
  const { p, base, visao, alvos, resta, onProgresso, onLote } = e;
  const pedido = [...(p.mensagens || [])].reverse().find((m) => m.role !== "assistant")?.content || "";

  // 1) O PLANO.
  const plano = await planejarArquivos(p, pedido, alvos);
  const lista = plano.length ? plano : alvos;

  // 2) OS LOTES.
  const lotes: string[][] = [];
  for (let i = 0; i < lista.length; i += TAMANHO_LOTE) lotes.push(lista.slice(i, i + TAMANHO_LOTE));
  console.log(`Arquiteto FILA: ${lista.length} arquivo(s) em ${lotes.length} lote(s) de até ${TAMANHO_LOTE}`);

  let acumulado: Arquivo[] = p.arquivosAtuais;
  const resumos: string[] = [];
  const falhas: string[] = [];
  let salvos = 0;

  for (let i = 0; i < lotes.length; i++) {
    onLote?.(i + 1, lotes.length);
    // O fôlego acabou: para de forma HONESTA e diz o que faltou — o que já foi, está gravado.
    if (resta() < 30000) {
      falhas.push(`faltaram ${lotes.length - i} lote(s) (o tempo desta rodada acabou)`);
      break;
    }
    const r = (await construirEscopo({
      p,
      base,
      visao,
      alvos: lotes[i],
      arquivosBase: acumulado,
      resta,
      onProgresso,
    })) as { ok?: boolean; erro?: string; resumo?: string; arquivos?: Arquivo[] };

    if (!r?.ok || !r.arquivos?.length) {
      // UM lote que falha NÃO derruba os outros — segue para o próximo.
      falhas.push(`lote ${i + 1} (${lotes[i].join(", ")}): ${r?.erro || "não voltou resultado"}`);
      continue;
    }
    acumulado = r.arquivos;
    if (r.resumo) resumos.push(r.resumo);
    // 3) GRAVA AGORA: este lote não depende do próximo para estar a salvo.
    if (p.projetoId && donoDoProjeto(p.projetoId) === p.contaId) {
      try {
        if (salvarProjeto(p.contaId, p.projetoId, null, acumulado)) salvos++;
      } catch (err) {
        console.error("Arquiteto FILA: não consegui gravar o lote:", err instanceof Error ? err.message : err);
      }
    }
  }

  if (!acumulado.length) {
    return { erro: "A fila não conseguiu aplicar nenhum lote. Nada foi alterado — tente de novo." };
  }

  const avisos = [
    `Trabalhei em ${lotes.length} lote(s); ${salvos} gravado(s) no servidor.`,
    ...(falhas.length ? [`Não terminei tudo: ${falhas.join("; ")}.`] : []),
  ];
  return {
    ok: true,
    resumo: [resumos.join(" ") || "Projeto atualizado.", ...avisos].filter(Boolean).join(" "),
    arquivos: acumulado,
    visao: p.foto ? (visao ? "lida" : "ilegivel") : "sem-foto",
    salvoNoServidor: salvos > 0,
    lotes: lotes.length,
    lotesFalhos: falhas.length,
  };
}

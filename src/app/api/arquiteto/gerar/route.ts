import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";

import { exigirConta } from "@/lib/orgs";
import { decidirAcessoArquiteto, CAPACIDADE_ARQUITETO } from "@/lib/arquiteto-acesso";
import { gatewayDaConta, MODELO_DA_CONTA } from "@/lib/gateway-da-conta";
import { normalizarTokens, type Tokens } from "@/lib/arquiteto-tokens";
import { promptComCraft, promptComVisual } from "@/lib/arquiteto-craft";

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

const VERBOO_API_KEY = process.env.VERBOO_API_KEY || loadEnv("VERBOO_API_KEY");
const GOOGLE_API_KEY = loadEnv("GOOGLE_API_KEY");

const VERBOO_BASE = "https://code.verboo.ai/router/v1";
// Mesmos modelos do chat: V4.1 (principal) com o V4.0 logo atrás como reserva.
const VERBOO_MODELOS = ["deepseek-v4.1-flash", "deepseek-v4-flash"];
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
- A cada pedido, devolva TODOS os arquivos INTEIROS (não trechos).

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
    if (modo === "resumo") resumo += (resumo ? "\n" : "") + ln;
    else if (modo === "arquivo") buf.push(ln);
  }
  if (modo === "arquivo") fecharArquivo();

  // Rede de segurança: o modelo ignorou o formato mas devolveu código.
  if (!arquivos.length) {
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
async function lerTexto(resp: Response): Promise<string> {
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
        if (pedaco) texto += pedaco;
      } catch {}
    }
  }
  return texto;
}

// ── VISÃO (dono, 09/10/2026) ────────────────────────────────────────────────
// O modelo que CONSTRÓI (deepseek-v4.1-flash) NÃO enxerga imagem: pedido com
// imagem nele volta 502 "upstream unavailable" (medido em 09/10/2026). Quem
// enxerga — na MESMA chave e no MESMO provedor — é o `glm-5.3-flash` (medido:
// descreveu corretamente a marca da Mirai). Então a foto do pedaço marcado vai
// para ELE, que devolve TEXTO; a descrição entra na instrução de quem constrói.
const MODELO_VISAO = "glm-5.3-flash";

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
        reasoning_effort: "low",
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
      signal: AbortSignal.timeout(90000),
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

/** A VISÃO entra na instrução como o PEDAÇO ALVO — em TEXTO, que é o que o
    construtor consome. Sem descrição, ele é AVISADO de que a foto não foi lida. */
function promptComFoto(system: string, descricao: string): string {
  const bloco = descricao
    ? `\n\nO QUE A PESSOA MARCOU NO PREVIEW: um modelo que ENXERGA leu a foto do pedaço marcado (com o risco rosa dela) e descreveu:\n"""${descricao}"""\nO pedido é sobre ESTE pedaço: mexa no que o risco marca e não mude o resto sem necessidade. Se a descrição não bater com o projeto, siga o texto do pedido e diga a diferença.`
    : `\n\nO QUE A PESSOA MARCOU NO PREVIEW: existe uma foto do pedaço marcado, mas nenhum modelo que enxerga conseguiu lê-la agora. Trabalhe só com a referência de texto do pedido — não invente o que estava na foto.`;
  return system + bloco;
}

/** O mesmo cano do chat: gateway da conta → Verboo (V4.1→V4.0) → Gemini. */
async function chamarModelo(mensagens: Msg[], system: string, tenant: number): Promise<Resultado> {
  const msgs = montarMensagens(mensagens, system);
  // Projeto MULTIARQUIVO cabe em muito mais texto que um HTML único: o teto é
  // alto para os arquivos inteiros caberem. E os modelos Verboo são de
  // RACIOCÍNIO (devolvem `reasoning_content` à parte): com o teto baixo o
  // raciocínio consome a cota, o `content` volta VAZIO ou cortado
  // (`finish_reason: length`) e o construtor "falha" sem erro de rede. Por isso
  // o `reasoning_effort: "low"` no caminho direto: raciocínio curto, sobra cota
  // e a resposta fecha. O caminho do gateway continua exatamente o mesmo.
  const corpoBase = {
    messages: msgs,
    max_tokens: 32000,
    temperature: 0.3,
    // STREAM SEMPRE LIGADO (correção de transporte, 08/10/2026): a chamada
    // BUFFERIZADA (`stream: false`) fazia o router do provedor devolver
    // "upstream unavailable" a ~240s nos builds grandes (o modelo de
    // RACIOCÍNIO enche o buffer). Em SSE o MESMO pedido completa em ~110s. A
    // leitura junta o texto em `lerTexto()`; para FORA a resposta não muda
    // (continua o JSON de projeto) — só o transporte.
    stream: true,
  };

  // 1) Gateway da conta (vínculo + plano/medição). Recusou/caiu → provedor direto.
  const gw = gatewayDaConta(tenant);
  if (gw) {
    try {
      const r = await gw.chamar({ ...corpoBase, model: MODELO_DA_CONTA });
      if (r.ok) {
        const texto = await lerTexto(r);
        if (texto.trim()) return { ok: true, texto, motor: "conta" };
      }
      console.error("Arquiteto: gateway da conta recusou:", r.status);
    } catch (e) {
      console.error("Arquiteto: gateway da conta fora do ar:", e instanceof Error ? e.message : e);
    }
  }

  // 2) Verboo direto (mesma chave e mesma base do chat do app).
  if (VERBOO_API_KEY) {
    for (const modelo of VERBOO_MODELOS) {
      try {
        const r = await fetch(`${VERBOO_BASE}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${VERBOO_API_KEY}` },
          body: JSON.stringify({ ...corpoBase, model: modelo, reasoning_effort: "low" }),
          signal: AbortSignal.timeout(240000),
        });
        if (!r.ok) {
          const err = await r.text().catch(() => "");
          console.error(`Arquiteto Verboo ${modelo}:`, r.status, err.slice(0, 200));
          continue;
        }
        const texto = await lerTexto(r);
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
          signal: AbortSignal.timeout(120000),
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

  // 3) O pedido.
  let corpo: { mensagens?: Msg[]; assets?: string[]; tokens?: unknown; docProjeto?: string; foto?: string } = {};
  try {
    corpo = (await req.json()) as {
      mensagens?: Msg[];
      assets?: string[];
      tokens?: unknown;
      docProjeto?: string;
      foto?: string;
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
  // projeto (ou sem .md), vem vazio e o bloco não entra.
  const docProjeto = typeof corpo.docProjeto === "string" ? corpo.docProjeto : "";
  // A FOTO DO PEDAÇO MARCADO (dono, 09/10/2026): o construtor não enxerga imagem,
  // então a foto é lida por um modelo que ENXERGA e entra na instrução como TEXTO.
  const foto = typeof corpo.foto === "string" ? corpo.foto : "";
  const visao = foto ? await lerFotoComVisao(foto) : "";

  // 4) O modelo. A instrução leva o PADRÃO DO ARQUITETO (as cinco skills de
  // craft: dados/isolamento, quatro estados, estrutura, craft visual, front-end
  // e bibliotecas) + o PADRÃO VISUAL ANTI-GENÉRICO (VISUAL.md §5: composição,
  // tipografia com escala única, contraste AA declarado, estrutura, mídia e
  // movimento) + a LISTA de imagens + os TOKENS do projeto. A porteira, o
  // formato, a persistência e o fluxo do plano NÃO mudam — só a instrução.
  const instrucao = promptComDoc(
    promptComVisual(promptComCraft(promptComTokens(promptComAssets(CONSTRUTOR_PROMPT, assets), tokens))),
    docProjeto,
  );
  const r = await chamarModelo(
    mensagens,
    // Com FOTO do pedaço marcado, a descrição do modelo que ENXERGA entra como
    // PEDAÇO ALVO — é assim que o construtor "vê" o que foi marcado.
    foto ? promptComFoto(instrucao, visao) : instrucao,
    g.conta.id,
  );
  if (!r.ok) {
    return NextResponse.json({ erro: r.erro }, { status: 502 });
  }

  // 5) Formato previsível → projeto. Sem projeto reconhecível: diz a verdade.
  const projeto = extrairProjeto(r.texto);
  if (!projeto.arquivos.length) {
    return NextResponse.json(
      {
        erro:
          "A resposta do modelo não veio no formato de projeto (nenhum arquivo reconhecido). Tente reformular o pedido.",
      },
      { status: 422 },
    );
  }

  return NextResponse.json({
    ok: true,
    resumo: projeto.resumo || "Projeto atualizado.",
    arquivos: projeto.arquivos,
    // A VISÃO (dono, 09/10/2026): "lida" = a foto do pedaço marcado foi entendida por
    // um modelo que enxerga; "ilegivel" = não foi e a tela DIZ; "sem-foto" = não houve
    // foto neste pedido.
    visao: foto ? (visao ? "lida" : "ilegivel") : "sem-foto",
  });
}

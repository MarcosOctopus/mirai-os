import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";

import { exigirConta } from "@/lib/orgs";
import { decidirAcessoArquiteto, CAPACIDADE_ARQUITETO } from "@/lib/arquiteto-acesso";
import { REGRAS_CRAFT, REGRAS_VISUAL } from "@/lib/arquiteto-craft";
import { gatewayDaConta, MODELO_DA_CONTA } from "@/lib/gateway-da-conta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/arquiteto/planejar — o MODO PLANO do Arquiteto.
 *
 * É o par NÃO-destrutivo do construtor. Aqui a conversa vira um PLANO em TEXTO,
 * resposta para ler no chat. Esta rota **NÃO** grava projeto, **NÃO** cria versão
 * e **NÃO** devolve arquivos: nada do projeto é tocado — nem `arquiteto_projetos`
 * nem `arquiteto_arquivos` nem `arquiteto_versoes`. Por construção, é impossível
 * "Plano" alterar o projeto: a escrita vive SÓ no /api/arquiteto/gerar.
 *
 * PORTEIRA: mesma sessão e mesma capacidade do resto do Arquiteto. Sem conta →
 * 401; sem a capacidade `mirai.arquiteto.construir` → 403. Falha FECHADO.
 *
 * Anti-vazamento por construção: só entra o diálogo que a pessoa vê — nada de
 * mapa interno, memória da Arca ou material de infraestrutura.
 */

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
  } catch {
    /* sem arquivo de env: cai no process.env */
  }
  return process.env[name] || "";
}

const VERBOO_API_KEY = process.env.AIBEE_API_KEY || loadEnv("AIBEE_API_KEY");
const GOOGLE_API_KEY = loadEnv("GOOGLE_API_KEY");

const VERBOO_BASE = "https://api.kpalabz.com/v1";
const VERBOO_MODELOS = ["claude-opus-5-5", "claude-sonnet-5", "claude-opus-4-8"];
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = "gemini-2.5-flash";

const MAX_HISTORICO = 12;

type Msg = { role: string; content: string };

/** A instrução do PLANO: resposta é texto — nunca o formato de arquivos.
 *  O contrato é ESTRUTURADO e estável: título, objetivo, passos numerados (cada
 *  um com a ação e o ARQUIVO que ela afeta) e uma seção curta de decisões. Assim
 *  o chat renderiza formatação de verdade e o botão "Executar plano" tem o que
 *  mandar ao construtor. */
const PLANEJADOR_PROMPT = `Você é o Arquiteto da Mirai, no MODO PLANO.

## SUA TAREFA
NÃO escreva código. NÃO entregue um projeto. NÃO use o formato "===ARQUIVO: nome===".
Você PENSAA junto com a pessoa e devolve um PLANO ESTRUTURADO, em português do
Brasil, como TEXTO para ler na conversa. O plano é sobre ESTE projeto.

## FORMATO (siga SEMPRE esta estrutura, nesta ordem)
# <título curto do plano>

**Objetivo:** <uma linha: o que o projeto precisa ser>

## Passos
1. <ação concreta> — arquivo: \`index.html\`
2. <ação concreta> — arquivo: \`styles.css\`
3. <ação concreta> — arquivo: \`app.js\`

Cada passo tem UMA ação e o arquivo que ela afeta (index.html, styles.css,
app.js ou um asset em assets/). Use os nomes REAIS dos arquivos do projeto
quando ele já existir.

## Decisões e dúvidas
- <o que ainda precisa ser decidido, quando houver>

## Regras
- Título curto (até 6 palavras). Objetivo em 1 linha. Passos numerados e acionáveis.
- Se o projeto já existir, fale DELE: cite os arquivos que ele já tem e diga o
  que muda em cada um.
- Se faltar decidir algo que muda o resultado (público, tom, seções
  obrigatórias), pergunte — mas ainda entregue o plano com o que já sabe.
- NÃO invente dado sobre a pessoa nem sobre o negócio dela.
- NÃO prometa que já construiu: quem constrói é o botão "Executar plano".
- Nada de cercas de código com arquivos inteiros. No máximo, um trecho curto
  quando ajudar a explicar a ideia. Nada de tabelas.`;

/**
 * O PADRÃO DO ARQUITETO no MODO PLANO (dono, 11/10/2026: "coloca todas as skills
 * de design e construção de sites ligadas sempre em todas as contas").
 *
 * O construtor JÁ segue o padrão (as cinco skills entram no prompt dele desde
 * 08/10); o modo Plano não seguia — e é AQUI que as decisões de design são
 * tomadas. Sem isto, a pessoa planejava uma coisa e o construtor construía outra.
 *
 * As MESMAS regras entram por inteiro, com uma ponte em cima: no plano não se
 * escreve código, então a ponte diz o que fazer com elas (decidir, não codar).
 * Sem a ponte, as regras (que dizem "você constrói…") contradizem o "NÃO escreva
 * código" do planejador — e instrução que se contradiz é falta grave.
 */
const PONTE_PADRAO = `
## O PADRÃO DO ARQUITETO já vale para este plano
Você NÃO escreve o código agora (o plano é TEXTO), mas o plano tem de estar de
acordo com o padrão abaixo: é ele que o construtor segue quando a pessoa clicar
em "Executar plano". Decida, nos passos e nas dúvidas, só o que se aplica a ESTE
projeto — não repita o padrão inteiro nem cite estas regras.`;

/** O prompt do planejador já com o PADRÃO DO ARQUITETO (as cinco skills). */
function promptComPadrao(system: string): string {
  return system + PONTE_PADRAO + REGRAS_CRAFT + REGRAS_VISUAL;
}

function montarMensagens(mensagens: Msg[], system: string) {
  const limpo = mensagens
    .filter((m) => m && typeof m.content === "string" && m.content.trim())
    .slice(-MAX_HISTORICO)
    .map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: m.content,
    }));

  return [
    { role: "user" as const, content: `[INSTRUÇÃO PERMANENTE]\n${system}` },
    { role: "assistant" as const, content: "Entendi. Vou responder com um plano em texto, sem escrever código." },
    ...limpo,
  ];
}

type Resultado = { ok: true; texto: string; motor: string } | { ok: false; erro: string };

/** Teto do plano INTEIRO: plano é rápido (medido: 18–20s). O teto existe para
 *  devolver erro honesto ANTES de o túnel matar a conexão (~100s), não para
 *  esperar mais. */
const TETO_PLANO_MS = 80000;

/** O mesmo cano do chat/construtor: gateway da conta → Verboo → Gemini.
 *  `orcamentoMs` limita a CORRENTE inteira (o que a pessoa espera), não cada tentativa. */
async function chamarModelo(
  mensagens: Msg[],
  system: string,
  tenant: number,
  orcamentoMs = TETO_PLANO_MS,
): Promise<Resultado> {
  const msgs = montarMensagens(mensagens, system);
  const inicioModelos = Date.now();
  const resta = () => orcamentoMs - (Date.now() - inicioModelos);
  // Plano é TEXTO curto — o teto é bem menor que o do construtor (que precisa
  // dos arquivos inteiros). Mesmo assim com folga para raciocínio.
  const corpoBase = {
    messages: msgs,
    max_tokens: 6000,
    temperature: 0.4,
    stream: false,
    // RACIOCÍNIO DESLIGADO (correção 10/10/2026): com o raciocínio ligado o modelo
    // entra em LOOP INFINITO e a resposta TRAVA (mesmo defeito do construtor e do
    // chat). Sem isto, o modo Plano do Arquiteto "faz besteira" — não responde.
    enable_thinking: false,
  };

  // 1) Gateway da conta (vínculo + plano/medição).
  const gw = gatewayDaConta(tenant);
  if (gw) {
    try {
      const r = await gw.chamar({ ...corpoBase, model: MODELO_DA_CONTA });
      if (r.ok) {
        const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
        const texto = j?.choices?.[0]?.message?.content || "";
        if (texto.trim()) return { ok: true, texto, motor: "conta" };
      }
      console.error("Arquiteto plano: gateway da conta recusou:", r.status);
    } catch (e) {
      console.error("Arquiteto plano: gateway da conta fora do ar:", e instanceof Error ? e.message : e);
    }
  }

  // 2) Verboo direto.
  if (VERBOO_API_KEY) {
    for (const modelo of VERBOO_MODELOS) {
      // Sem fôlego para outra tentativa? Ela só nasceria cortada — e o túnel
      // mataria a conexão antes de qualquer resposta.
      if (resta() < 20000) {
        console.error(`Arquiteto plano: orçamento esgotado (${modelo} não tentado)`);
        break;
      }
      try {
        const r = await fetch(`${VERBOO_BASE}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${VERBOO_API_KEY}` },
          body: JSON.stringify({ ...corpoBase, model: modelo }),
          signal: AbortSignal.timeout(Math.max(20000, Math.min(240000, resta()))),
        });
        if (!r.ok) {
          const err = await r.text().catch(() => "");
          console.error(`Arquiteto plano Verboo ${modelo}:`, r.status, err.slice(0, 200));
          continue;
        }
        const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
        const texto = j?.choices?.[0]?.message?.content || "";
        if (texto.trim()) return { ok: true, texto, motor: "verboo" };
      } catch (e) {
        console.error("Arquiteto plano Verboo rede:", e instanceof Error ? e.message : e);
      }
    }
  }

  // 3) Gemini (reserva do ecossistema).
  if (GOOGLE_API_KEY) {
    try {
      const contents = msgs.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));
      const r = await fetch(
        `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${GOOGLE_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents }),
          signal: AbortSignal.timeout(Math.max(20000, Math.min(120000, resta()))),
        },
      );
      if (r.ok) {
        const j = (await r.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const texto = j?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
        if (texto.trim()) return { ok: true, texto, motor: "gemini" };
      } else {
        console.error("Arquiteto plano Gemini:", r.status);
      }
    } catch (e) {
      console.error("Arquiteto plano Gemini rede:", e instanceof Error ? e.message : e);
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

  // 2) PORTEIRA: mesma capacidade do Arquiteto (leitura). Falha fechado.
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
  let corpo: { mensagens?: Msg[]; projeto?: { resumo?: string; arquivos?: string[] } | null } = {};
  try {
    corpo = (await req.json()) as typeof corpo;
  } catch {
    corpo = {};
  }
  const mensagens = Array.isArray(corpo.mensagens) ? corpo.mensagens : [];
  if (!mensagens.length) {
    return NextResponse.json({ erro: "Escreva, na conversa, o que você quer planejar." }, { status: 400 });
  }

  // 3b) CONTEXTO do projeto atual — só nomes de arquivo e o resumo, nada mais.
  // O plano fala DESTE projeto (nomes reais), não de um genérico.
  const arquivos = Array.isArray(corpo.projeto?.arquivos)
    ? corpo.projeto!.arquivos!.filter((n) => typeof n === "string" && n.trim()).slice(0, 40)
    : [];
  const resumo = typeof corpo.projeto?.resumo === "string" ? corpo.projeto.resumo.slice(0, 400) : "";
  const contextoProjeto = corpo.projeto
    ? `\n\n## PROJETO ATUAL (o seu plano é sobre ELE)\nResumo: ${resumo || "(sem resumo)"}\nArquivos: ${arquivos.length ? arquivos.join(", ") : "(nenhum arquivo ainda)"}`
    : `\n\n## PROJETO ATUAL\nAinda não existe projeto nesta conta — o plano é o primeiro passo.`;

  // 4) O modelo — e SÓ o modelo. Daqui para baixo nada escreve o projeto.
  //
  // O TRABALHO LENTO VAI NUM FLUXO COM BATIMENTO (dono, 11/10/2026: "pode colocar
  // em todos"). O construtor já tinha essa proteção; o plano não tinha — e caía no
  // MESMO defeito: provedor engasgado = 240s + 120s em série (até 6 min) com a
  // conexão já morta pelo túnel (~100s) e a pessoa vendo "Caiu a conexão no meio".
  // Aqui o plano inteiro cabe num teto e o batimento mantém a conexão viva; o
  // corpo devolvido é o MESMO JSON de antes (só o transporte muda).
  const instrucaoPlano = promptComPadrao(PLANEJADOR_PROMPT) + contextoProjeto;
  const codificador = new TextEncoder();
  const inicioPedido = Date.now();
  let caracteresGerados = 0;
  const fluxo = new ReadableStream({
    async start(controlador) {
      const batida = setInterval(() => {
        try {
          // Igual ao construtor: o batimento INFORMA (tempo + caracteres) em vez de
          // só segurar a conexão. Quem espera vê que está andando.
          controlador.enqueue(
            codificador.encode(
              JSON.stringify({
                progresso: {
                  segundos: Math.round((Date.now() - inicioPedido) / 1000),
                  caracteres: caracteresGerados,
                },
              }) + "\n",
            ),
          );
        } catch {
          /* já fechou */
        }
      }, 4000);
      let saida: unknown = { erro: "Não consegui montar o plano agora. Tente de novo." };
      const inicioPlano = Date.now();
      try {
        const r = await chamarModelo(mensagens, instrucaoPlano, g.conta.id, TETO_PLANO_MS);
        saida = r.ok
          ? { ok: true, texto: r.texto.trim() }
          : { erro: r.erro };
      } catch (e) {
        console.error("Arquiteto plano: falha:", e instanceof Error ? e.message : e);
      } finally {
        clearInterval(batida);
      }
      // O tempo real na resposta, sempre (mesma regra do construtor).
      if (saida && typeof saida === "object") {
        saida = { ...(saida as Record<string, unknown>), levouMs: Date.now() - inicioPlano };
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

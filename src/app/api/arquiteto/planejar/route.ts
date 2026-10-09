import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "fs";

import { exigirConta } from "@/lib/orgs";
import { decidirAcessoArquiteto, CAPACIDADE_ARQUITETO } from "@/lib/arquiteto-acesso";
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

const VERBOO_API_KEY = process.env.VERBOO_API_KEY || loadEnv("VERBOO_API_KEY");
const GOOGLE_API_KEY = loadEnv("GOOGLE_API_KEY");

const VERBOO_BASE = "https://code.verboo.ai/router/v1";
const VERBOO_MODELOS = ["deepseek-v4.1-flash", "deepseek-v4-flash"];
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

/** O mesmo cano do chat/construtor: gateway da conta → Verboo → Gemini. */
async function chamarModelo(mensagens: Msg[], system: string, tenant: number): Promise<Resultado> {
  const msgs = montarMensagens(mensagens, system);
  // Plano é TEXTO curto — o teto é bem menor que o do construtor (que precisa
  // dos arquivos inteiros). Mesmo assim com folga para raciocínio.
  const corpoBase = {
    messages: msgs,
    max_tokens: 6000,
    temperature: 0.4,
    stream: false,
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
      try {
        const r = await fetch(`${VERBOO_BASE}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${VERBOO_API_KEY}` },
          body: JSON.stringify({ ...corpoBase, model: modelo, reasoning_effort: "low" }),
          signal: AbortSignal.timeout(240000),
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
          signal: AbortSignal.timeout(120000),
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
  const r = await chamarModelo(mensagens, PLANEJADOR_PROMPT + contextoProjeto, g.conta.id);
  if (!r.ok) {
    return NextResponse.json({ erro: r.erro }, { status: 502 });
  }

  return NextResponse.json({ ok: true, texto: r.texto.trim() });
}

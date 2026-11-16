/**
 * COSMIC AGENT — a rota do CANAL (C1: leitura e rastro).
 *
 * POR QUE ESTA ROTA NÃO VIVE EM /api/admin (lição de 10/11/2026, registrada em
 * `/api/acervo`): `/api/admin` está na lista SÓ-DONO do middleware. O canal é
 * produto de QUEM ESTÁ LOGADO, não recurso de administração — o namespace
 * errado devolveria 403 antes do handler, mesmo com o handler correto.
 *
 * O QUE ELA FAZ: resolve a org de QUEM ENTROU (mesma régua do acervo — quem sabe
 * o slug é a Arca, via `espaco criar`), pega o token DAQUELA pessoa e repassa
 * para os `/canais/*` da Arca. Não decide nada: o canal, o isolamento e o
 * append-only são da camada da Arca.
 *
 * A ISOLAÇÃO NÃO DEPENDE DESTA ROTA: a Arca resolve a org pelo TOKEN, nunca pelo
 * pedido. Se este arquivo tivesse um bug e pedisse o canal de outra pessoa, a
 * Arca responderia 404 (medido na prova do C1). Aqui é conveniência, não a trava.
 */

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

import { NextRequest, NextResponse } from "next/server";

import { erroDeCredencial } from "@/lib/arca-cliente";
import { exigirConta } from "@/lib/orgs";

const execFileP = promisify(execFile);

const API_ARCA = process.env.ARCA_API_URL || "http://127.0.0.1:8080";
const CLI = "/opt/data/arca/integrity/cli.py";
const CLI_CWD = "/opt/data/arca/integrity";
const ARQUIVO_CREDENCIAIS = "/opt/data/mirai-app/data/arca-credenciais.json";
const ORG_CORE = "core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A org de quem entrou. O dono lê o Core; cada pessoa lê o espaço dela. */
async function orgDaPessoa(email: string, ehDono: boolean): Promise<string> {
  if (ehDono) return ORG_CORE;
  try {
    // Mesma régua do acervo: a Arca é quem sabe o slug. Duas implementações
    // de slug divergiriam com o tempo.
    const { stdout } = await execFileP("python3", [CLI, "espaco", "criar", email], {
      cwd: CLI_CWD,
      timeout: 20000,
    });
    const m = stdout.match(/"org"\s*:\s*"([^"]+)"/);
    if (m && m[1]) return m[1];
  } catch {
    /* sem espaço resolvido: abaixo, credencial ausente vira 503 honesto */
  }
  return "";
}

/** Token da Arca para esta pessoa nesta org (nunca sai daqui para o navegador). */
async function tokenDaPessoa(org: string, email: string): Promise<string> {
  if (org === ORG_CORE) {
    try {
      return (await readFile("/opt/data/arca/api/.arca-token", "utf8")).trim();
    } catch {
      return "";
    }
  }
  try {
    const bruto = JSON.parse(await readFile(ARQUIVO_CREDENCIAIS, "utf8")) as Record<
      string,
      string | { token?: string }
    >;
    const chave = `${org}|${email.trim().toLowerCase()}`;
    const guardado = bruto[chave] || bruto[org];
    if (typeof guardado === "string") return guardado;
    return guardado?.token || "";
  } catch {
    return "";
  }
}

async function arca(caminho: string, token: string, metodo = "GET", corpo?: unknown) {
  const r = await fetch(`${API_ARCA}${caminho}`, {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      "X-Arca-Token": token,
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
    cache: "no-store",
  });
  const texto = await r.text();
  let dados: unknown = null;
  try {
    dados = JSON.parse(texto);
  } catch {
    dados = { bruto: texto.slice(0, 400) };
  }
  return { status: r.status, dados };
}

/** GET ?canal=<id> → o rastro daquele canal. Sem `canal` → a lista de canais. */
export async function GET(req: NextRequest) {
  const auth = await exigirConta(req);
  if (!auth.ok) return auth.resposta;
  const conta = auth.conta;

  const email = (conta.email || "").trim().toLowerCase();
  const ehDono = Boolean(conta.ehDono);
  const org = await orgDaPessoa(email, ehDono);
  if (!org) return NextResponse.json({ erro: "não consegui resolver seu espaço" }, { status: 503 });

  const token = await tokenDaPessoa(org, email);
  if (!token) return NextResponse.json({ erro: erroDeCredencial() }, { status: 503 });

  const canal = req.nextUrl.searchParams.get("canal") || "";
  const desde = req.nextUrl.searchParams.get("desde") || "0";

  // C3 — as propostas de time DESTA org (o Foreman). Mesma régua de org e de token:
  // quem entra vê as propostas do espaço dele, e a Arca confirma pelo token.
  if (req.nextUrl.searchParams.get("agenda")) {
    /* A Arca pode falhar (org sem agenda, token, rede). Isso NÃO pode derrubar
       a lista inteira: as agendas do app são nossas e continuam válidas. Se a
       Arca falhar, devolvemos 200 com o aviso em `aviso_arca` — nunca um erro
       que apague o que já sabemos. */
    let d: { agendas?: unknown[]; total?: number } = {};
    let avisoArca = "";
    try {
      const { status, dados } = await arca("/canais/agenda", token);
      if (status >= 400) {
        avisoArca =
          (dados as { detail?: string; erro?: string })?.detail ||
          (dados as { erro?: string })?.erro ||
          `a Arca respondeu ${status}`;
      } else {
        d = dados as { agendas?: unknown[]; total?: number };
      }
    } catch (erro) {
      avisoArca = `não alcancei a Arca (${(erro as Error)?.message || "erro"})`;
    }
    /* DUAS ORIGENS: as agendas da Arca (acervo, notas, grafo) e as do APP
       (email). Vivem em bancos diferentes — a Arca recusa tarefa que não é
       dela. Sem juntar aqui, o agendamento de email não apareceria na tela. */
    let doApp: Record<string, unknown>[] = [];
    try {
      const { listarAgendasApp } = await import("@/lib/agendador-app");
      const { contaDaRequisicao } = await import("@/lib/orgs");
      const { escoposDaConta } = await import("@/lib/escopos");
      const conta = await contaDaRequisicao(req);
      if (conta) {
        /* ESCOPOS (13/11/2026): a pessoa vê as agendas do espaço DELA e, se
           tiver organização, também as da organização — são dois escopos do
           mesmo nível, e o pessoal não deixa de existir por haver empresa.
           Antes, ter organização escondia as agendas pessoais: o "org se
           existir" fazia a tela mostrar só um dos dois. */
        const escopos = escoposDaConta(conta).map((e) => e.id);
        doApp = escopos.flatMap((escopo) => listarAgendasApp(conta.id, escopo)).map((a) => ({
          id: a.id,
          nome: a.nome,
          org: a.org,
          intervalo_min: a.intervalo_min,
          ativa: a.ativa === 1,
          /* agenda manual (intervalo 0) guarda uma data-sentinela no banco:
             para a tela ela não tem "próxima", tem "só quando você pedir". */
          proxima_em: a.intervalo_min > 0 ? a.proxima_em : null,
          ultima_em: a.ultima_em,
          ultimo_status: a.ultimo_status ?? null,
          tarefas: a.tarefas,
          origens: ["app"],
        }));
      }
    } catch {
      /* a Arca é a fonte principal; o app é complemento — falha aqui não derruba a tela */
    }
    const todas = [...(d.agendas || []), ...doApp];
    return NextResponse.json({
      org,
      ...d,
      agendas: todas,
      total: todas.length,
      do_app: doApp.length,
      ...(avisoArca ? { aviso_arca: avisoArca } : {}),
    });
  }

  if (req.nextUrl.searchParams.get("foreman")) {
    const { status, dados } = await arca("/canais/foreman/propostas", token);
    return NextResponse.json({ org, ...(dados as object) }, { status });
  }

  const caminho = canal
    ? `/canais/${encodeURIComponent(canal)}/mensagens?limite=200&desde_id=${Number(desde) || 0}`
    : "/canais";

  const { status, dados } = await arca(caminho, token);
  return NextResponse.json({ org, ...(dados as object) }, { status });
}

/** POST → abrir canal ({nome, objetivo}) ou publicar ({canal, texto, de_quem}). */
export async function POST(req: NextRequest) {
  const auth = await exigirConta(req);
  if (!auth.ok) return auth.resposta;
  const conta = auth.conta;

  const email = (conta.email || "").trim().toLowerCase();
  const ehDono = Boolean(conta.ehDono);
  const org = await orgDaPessoa(email, ehDono);
  if (!org) return NextResponse.json({ erro: "não consegui resolver seu espaço" }, { status: 503 });

  const token = await tokenDaPessoa(org, email);
  if (!token) return NextResponse.json({ erro: erroDeCredencial() }, { status: 503 });

  let corpo: { canal?: string; nome?: string; objetivo?: string; texto?: string; de_quem?: string; para_quem?: string; tipo?: string; ferramenta?: string; foreman?: string; proposta?: string; tarefas?: { acao: string; argumentos?: Record<string, unknown>; para?: string }[]; intervalo_min?: number; agenda?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  // C3 — FOREMAN: do objetivo ao time. `propor` devolve a proposta e NÃO cria agente
  // nenhum; `aprovar` é ato separado e explícito. O cliente nunca cria time sem querer.
  // C4 — o time TRABALHA: despacho de tarefas para o time aprovado. A política (grant,
  // aprovação, recibo) fica na Arca; aqui é só o caminho do clique.
  if (corpo.foreman === "despachar" && corpo.proposta && corpo.tarefas?.length) {
    const { status, dados } = await arca("/canais/despachar", token, "POST", {
      proposta_id: corpo.proposta,
      tarefas: corpo.tarefas,
    });
    return NextResponse.json({ org, ...(dados as object) }, { status });
  }

  // C4 — o time SE ORGANIZA: agenda. intervalo_min=0 é MANUAL (só roda quando pedirem).
  if (corpo.foreman === "agendar" && corpo.proposta && corpo.tarefas?.length) {
    const { status, dados } = await arca("/canais/agenda", token, "POST", {
      proposta_id: corpo.proposta,
      tarefas: corpo.tarefas,
      intervalo_min: Number(corpo.intervalo_min) || 0,
    });
    return NextResponse.json({ org, ...(dados as object) }, { status });
  }

  if (corpo.foreman === "rodar-agenda" && corpo.agenda) {
    /* A agenda do APP (id `agp_…`) tem runner próprio. O id dela não existe na
       Arca — antes o clique era repassado para lá e voltava "agenda inexistente
       nesta org", que a tela exibia como "Não consegui carregar os agendamentos".
       Agora: se o id é nosso, roda aqui; se não, segue para a Arca como sempre. */
    const { executarAgendaAgora } = await import("@/lib/agendador-app");
    const noApp = await executarAgendaAgora(conta.id, corpo.agenda);
    if (noApp) {
      return NextResponse.json({
        org,
        rodou_no_app: true,
        status: noApp.status,
        run: { executadas: 1, recusadas: 0, duracao_ms: noApp.duracao_ms, bytes: 0 },
      });
    }
    const { status, dados } = await arca(
      `/canais/agenda/${encodeURIComponent(corpo.agenda)}/rodar`, token, "POST", {},
    );
    return NextResponse.json({ org, ...(dados as object) }, { status });
  }

  if (corpo.foreman === "propor" && corpo.objetivo) {
    const { status, dados } = await arca("/canais/foreman/propor", token, "POST", { objetivo: corpo.objetivo });
    return NextResponse.json({ org, ...(dados as object) }, { status });
  }

  if (corpo.foreman === "aprovar" && corpo.proposta) {
    const { status, dados } = await arca(
      `/canais/foreman/${encodeURIComponent(corpo.proposta)}/aprovar`,
      token,
      "POST",
      {},
    );
    return NextResponse.json({ org, ...(dados as object) }, { status });
  }

  if (corpo.canal && corpo.texto) {
    const { status, dados } = await arca(`/canais/${encodeURIComponent(corpo.canal)}/mensagens`, token, "POST", {
      texto: corpo.texto,
      de_quem: corpo.de_quem || `pessoa:${email}`,
      para_quem: corpo.para_quem || "",
      tipo: corpo.tipo || "fala",
      // C2 — quando é repasse, diz QUAL ferramenta está sendo delegada: é o que faz o
      // receptor ser conferido contra o grant dele (sem grant, 403 e rastro no ledger).
      ferramenta: corpo.ferramenta || "",
    });
    return NextResponse.json({ org, ...(dados as object) }, { status });
  }

  if (corpo.nome) {
    const { status, dados } = await arca("/canais", token, "POST", {
      nome: corpo.nome,
      objetivo: corpo.objetivo || "",
    });
    return NextResponse.json({ org, ...(dados as object) }, { status });
  }

  return NextResponse.json({ erro: "nada a fazer: mande {nome} para abrir ou {canal, texto} para falar" }, { status: 400 });
}

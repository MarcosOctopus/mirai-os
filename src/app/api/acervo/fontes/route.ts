import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";

/**
 * /api/acervo/fontes — a TELA "FONTES" da Arca: o que está ligado trazendo coisa pra dentro.
 *
 * POR QUE EXISTE (18/11/2026): o dono pediu a ligação que "fica rodando buscando novidades"
 * (fonte viva do Google Drive). Fonte sem tela é ligação cega: ninguém vê o que entrou, o que
 * ficou de fora nem consegue pedir uma rodada na hora. Aqui mora essa visão.
 *
 * LÊ DO DISCO, NÃO INVENTA: o estado real é o arquivo que o próprio conector escreve
 * (`/opt/data/arca/fonte-drive-estado.json`) + o log + o cadeado de execução. O app roda como o
 * MESMO usuário do conector (hermes/10000), então lê e dispara sem precisar de privilégio.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ESTADO = "/opt/data/arca/fonte-drive-estado.json";
const LOG = "/opt/data/arca/fonte-drive.log";
const CADEADO = "/opt/data/arca/fonte-drive.rodando";
const SCRIPT_DRIVE = "/opt/data/scripts/fonte-drive-silencioso.sh";
const SCRIPT_SP = "/opt/data/scripts/fonte-sharepoint-silencioso.sh";
const SP_CONFIG = "/opt/data/arca/fonte-sharepoint.json";
const SP_ESTADO = "/opt/data/arca/fonte-sharepoint-estado.json";
const SP_LOG = "/opt/data/arca/fonte-sharepoint.log";
const SP_CADEADO = "/opt/data/arca/fonte-sharepoint.rodando";
/** Guia que fica na Arca: é o que o dono (ou o TI do cliente) precisa seguir para autorizar. */
const SP_GUIA = "03_PROJETOS/arca/sharepoint-na-arca-como-ligar.md";

type Registro = {
  nome?: string;
  nota?: string;
  modifiedTime?: string;
  erro?: string;
  tentativas?: number;
  desistiu?: boolean;
  em?: number;
};

async function lerEstado(): Promise<Record<string, Registro>> {
  const { readFile } = await import("node:fs/promises");
  try {
    return JSON.parse(await readFile(ESTADO, "utf8")) as Record<string, Registro>;
  } catch {
    return {};
  }
}

async function lerLog(): Promise<{ ultimaLinha: string; ultimaRodada: string }> {
  const { readFile } = await import("node:fs/promises");
  try {
    const texto = await readFile(LOG, "utf8");
    const linhas = texto.trim().split("\n");
    const resumos = linhas.filter((l) => l.includes("resumo:"));
    const ultima = resumos[resumos.length - 1] || "";
    const inicio = [...linhas].reverse().find((l) => l.includes("fonte drive:")) || "";
    return {
      ultimaLinha: ultima.replace(/^\[[^\]]+\]\s*/, ""),
      ultimaRodada: (inicio.match(/\[([^\]]+)\]/) || [, ""])[1] as string,
    };
  } catch {
    return { ultimaLinha: "", ultimaRodada: "" };
  }
}

async function rodando(): Promise<{ ativo: boolean; desde: string }> {
  const { stat } = await import("node:fs/promises");
  try {
    const s = await stat(CADEADO);
    // Cadeado velho (mais de 40 min) é rodada morta, não rodada em curso.
    const idadeMin = (Date.now() - s.mtimeMs) / 60000;
    return { ativo: idadeMin < 40, desde: s.mtime.toISOString() };
  } catch {
    return { ativo: false, desde: "" };
  }
}

/** SharePoint/OneDrive: o estado depende de haver credencial da Microsoft. Sem credencial a
 *  fonte fica "aguardando credencial" — e a tela diz onde está o guia, em vez de fingir que existe. */
async function lerSharepoint() {
  const { readFile, stat } = await import("node:fs/promises");
  let temCred = false;
  try {
    await stat(SP_CONFIG);
    temCred = true;
  } catch {
    temCred = false;
  }
  let estado: Record<string, { itens?: Record<string, Registro>; delta?: string }> = {};
  try {
    estado = JSON.parse(await readFile(SP_ESTADO, "utf8"));
  } catch {
    estado = {};
  }
  const itens = Object.values(estado).flatMap((d) => Object.values(d.itens || {}));
  const comNota = itens.filter((r) => r.nota && !r.erro);
  const fora = itens.filter((r) => r.erro);
  let ultimaRodada = "";
  let ultimoResumo = "";
  try {
    const linhas = (await readFile(SP_LOG, "utf8")).trim().split("\n");
    ultimaRodada = ((linhas.filter((l) => l.includes("fonte sharepoint:")).pop() || "").match(/\[([^\]]+)\]/) || [, ""])[1] as string;
    ultimoResumo = (linhas.filter((l) => l.includes("resumo:")).pop() || "").replace(/^\[[^\]]+\]\s*/, "");
  } catch {
    /* sem log ainda */
  }
  let rodando = false;
  try {
    const s = await stat(SP_CADEADO);
    rodando = (Date.now() - s.mtimeMs) / 60000 < 40;
  } catch {
    rodando = false;
  }
  const motivos: Record<string, number> = {};
  for (const r of fora) {
    const mm = (r.erro || "?").split("—")[0].trim();
    motivos[mm] = (motivos[mm] || 0) + 1;
  }
  return {
    id: "sharepoint",
    nome: "SharePoint / OneDrive",
    estado: !temCred ? "aguardando credencial" : rodando ? "sincronizando" : "ligada",
    cadencia: "a cada 3 horas",
    escopo: "somente leitura (Microsoft Graph)",
    ultimaRodada,
    ultimoResumo,
    rodando,
    configurada: temCred,
    guia: SP_GUIA,
    numeros: { rastreados: itens.length, noAcervo: comNota.length, fora: fora.length,
               desistiram: itens.filter((r) => r.desistiu).length },
    recentes: comNota.slice().sort((a, b) => (b.em || 0) - (a.em || 0)).slice(0, 12)
      .map((r) => ({ nome: r.nome || "", nota: r.nota || "", quando: r.em || 0 })),
    motivosFora: Object.entries(motivos).map(([motivo, quantos]) => ({ motivo, quantos }))
      .sort((a, b) => b.quantos - a.quantos),
    foraAmostra: fora.slice(0, 20).map((r) => ({ nome: r.nome || "", erro: r.erro || "" })),
  };
}

/** Drives conectados por pessoa (`google_drive` no cofre de cada uma).
 *  É o que faz a tela mostrar "quem conectou, quando sincronizou e quantos entraram" — em vez de
 *  um número só, que esconderia de quem é cada arquivo. */
async function lerDrivesConectados(emailFiltro?: string) {
  const { default: Database } = await import("better-sqlite3");
  const { lerCofre } = await import("@/lib/cofre-escopo");
  const path = await import("node:path");
  const db = new Database(path.join(process.cwd(), "data", "auth.db"), { readonly: true });
  const saida: Record<string, unknown>[] = [];
  try {
    // QUEM PERGUNTA: com `emailFiltro`, lê só o cofre daquela pessoa. Sem ele (dono), lê todos —
    // é a visão de administração. Antes desta correção (26/11/2026) a lista de TODOS os drives
    // conectados ia para QUALQUER conta logada, com nome, e-mail e resumo de cada um.
    const pessoas = (emailFiltro
      ? db.prepare("SELECT id, email, name FROM users WHERE lower(email) = lower(?)").all(emailFiltro)
      : db.prepare("SELECT id, email, name FROM users").all()) as {
      id: number;
      email: string;
      name?: string;
    }[];
    for (const p of pessoas) {
      const escopo = { tipo: "pessoal" as const, id: `pessoal-${p.id}`, nome: "Meu espaço", usuarioId: p.id };
      let cfg: Record<string, unknown> = {};
      try {
        cfg = lerCofre(escopo);
      } catch {
        continue;
      }
      const lista = Array.isArray(cfg?.google_drive) ? (cfg.google_drive as Record<string, unknown>[]) : [];
      for (const c of lista) {
        const estado = (c.estado || {}) as Record<string, unknown>;
        saida.push({
          dono: p.name || p.email,
          email: String(c.email || ""),
          desde: String(c.connected_at || ""),
          ultima: String(estado.ultima || ""),
          resumo: String(estado.resumo || ""),
          arquivos: Object.keys((estado.feitos || {}) as Record<string, string>).length,
        });
      }
    }
  } finally {
    db.close();
  }
  return saida;
}

export async function GET(req: NextRequest) {
  const auth = await exigirConta(req);
  if (!auth.ok) return auth.resposta;

  // ── O ESTADO GLOBAL É DO DONO (correção 26/11/2026) ─────────────────────────
  // Esta rota lia o estado da fonte do Drive DO DONO (nomes de arquivo, contagem,
  // log da rodada) e devolvia a QUALQUER conta logada: `exigirConta` só confere a
  // sessão. Na prática, quem tinha conta no MIRAI OS abria Arca → Fontes e via os
  // NOMES dos documentos do Drive do dono (relatório de cliente, contrato, proposta).
  // Agora quem não é dono recebe apenas o próprio drive conectado.
  if (!auth.conta.ehDono) {
    return NextResponse.json({
      fontes: [],
      drivesConectados: await lerDrivesConectados(auth.conta.email),
      conectarDrive: "/api/oauth/gdrive/iniciar",
      agora: Date.now(),
    });
  }

  const estado = await lerEstado();
  const registros = Object.entries(estado).map(([id, v]) => ({ id, ...v }));
  const comNota = registros.filter((r) => r.nota && !r.erro);
  const fora = registros.filter((r) => r.erro);
  const recentes = comNota
    .slice()
    .sort((a, b) => (b.em || 0) - (a.em || 0))
    .slice(0, 12)
    .map((r) => ({ nome: r.nome || "", nota: r.nota || "", quando: r.em || 0 }));
  const motivos: Record<string, number> = {};
  for (const r of fora) {
    const m = (r.erro || "?").split("—")[0].trim();
    motivos[m] = (motivos[m] || 0) + 1;
  }
  const log = await lerLog();
  const trava = await rodando();

  return NextResponse.json({
    fontes: [
      {
        id: "gdrive",
        nome: "Google Drive",
        estado: trava.ativo ? "sincronizando" : "ligada",
        cadencia: "a cada 3 horas",
        escopo: "somente leitura",
        ultimaRodada: log.ultimaRodada,
        ultimoResumo: log.ultimaLinha,
        rodando: trava.ativo,
        numeros: {
          rastreados: registros.length,
          noAcervo: comNota.length,
          fora: fora.length,
          desistiram: registros.filter((r) => r.desistiu).length,
        },
        recentes,
        motivosFora: Object.entries(motivos)
          .map(([motivo, quantos]) => ({ motivo, quantos }))
          .sort((a, b) => b.quantos - a.quantos),
        foraAmostra: fora.slice(0, 20).map((r) => ({ nome: r.nome || "", erro: r.erro || "" })),
      },
      await lerSharepoint(),
    ],
    // Quem conectou o próprio Drive (a fonte viva por pessoa, pedida em 18/11/2026).
    drivesConectados: await lerDrivesConectados(),
    // Para onde mandar quem quer conectar: o fluxo exige sessão e é ele que guarda o refresh token.
    conectarDrive: "/api/oauth/gdrive/iniciar",
    agora: Date.now(),
  });
}

export async function POST(req: NextRequest) {
  const auth = await exigirConta(req);
  if (!auth.ok) return auth.resposta;

  let corpo: { acao?: string; fonte?: string } = {};
  try {
    corpo = (await req.json()) as { acao?: string; fonte?: string };
  } catch {
    corpo = {};
  }
  if ((corpo.acao || "") !== "sincronizar") {
    return NextResponse.json({ error: "ação desconhecida" }, { status: 400 });
  }
  const fonte =
    corpo.fonte === "sharepoint" ? "sharepoint" : corpo.fonte === "drives" ? "drives" : "gdrive";

  // A fonte do Drive do dono (script) e a do SharePoint do cliente são DELE: quem não é dono não
  // dispara nem força rodada. O drive da própria pessoa passa por "drives" e segue liberado.
  if (!auth.conta.ehDono && fonte !== "drives") {
    return NextResponse.json(
      { error: "esta fonte é da administração; conecte o seu Drive em Arca → Fontes" },
      { status: 403 },
    );
  }

  // ── DRIVES DAS PESSOAS (18/11/2026) ────────────────────────────────────────
  // Diferente de "gdrive" (a fonte do dono, por script): aqui é o Drive de TODO MUNDO que conectou
  // em Arca → Fontes. A rota do sincronizador faz o trabalho pesado; esta só a aciona com a chave
  // interna, então o botão funciona sem o agendador.
  if (fonte === "drives") {
    const chave = process.env.MIRAI_FONTE_SECRET || "";
    if (!chave) {
      return NextResponse.json(
        { error: "falta MIRAI_FONTE_SECRET no ambiente do app — sem ela o sincronizador não roda." },
        { status: 503 },
      );
    }
    const r = await fetch(new URL("/api/acervo/fontes/drive/sincronizar", req.nextUrl.origin), {
      method: "POST",
      headers: { "x-mirai-servico": chave, "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
    });
    const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) {
      return NextResponse.json(
        { error: (d?.error as string) || `o sincronizador recusou (HTTP ${r.status})` },
        { status: 502 },
      );
    }
    const rel = (d.relatorio as Record<string, number>[] | undefined) || [];
    const novos = rel.reduce((s, x) => s + (x.novos || 0), 0);
    const fora = rel.reduce((s, x) => s + (x.fora || 0), 0);
    return NextResponse.json({
      ok: true,
      mensagem: d.conexoes
        ? `sincronizei ${d.conexoes} conexão(ões): ${novos} arquivo(s) novo(s)${fora ? `, ${fora} fora` : ""}.`
        : (d.mensagem as string) || "ninguém conectou o Drive ainda.",
      relatorio: rel,
    });
  }

  if (fonte === "sharepoint") {
    // Sem credencial da Microsoft não há o que rodar — e fingir que rodou seria mentira.
    const { stat } = await import("node:fs/promises");
    try {
      await stat(SP_CONFIG);
    } catch {
      return NextResponse.json(
        { error: `a fonte do SharePoint ainda não tem credencial da Microsoft. O passo a passo está na Arca em ${SP_GUIA}.` },
        { status: 409 },
      );
    }
  }

  const trava = await rodando();
  if (trava.ativo && fonte === "gdrive") {
    return NextResponse.json({ ok: true, jaRodando: true, desde: trava.desde });
  }

  // Dispara DESTACADO: a rodada leva minutos e a tela não pode ficar presa esperando.
  try {
    const { spawn } = await import("node:child_process");
    const filho = spawn("bash", [fonte === "sharepoint" ? SCRIPT_SP : SCRIPT_DRIVE],
                        { detached: true, stdio: "ignore" });
    filho.unref();
    return NextResponse.json({
      ok: true,
      mensagem:
        "sincronização disparada — leva alguns minutos; os arquivos novos aparecem aqui e viram nota catalogada no acervo",
    });
  } catch (e) {
    return NextResponse.json(
      { error: `não consegui disparar a fonte: ${e instanceof Error ? e.message : "?"}` },
      { status: 500 },
    );
  }
}

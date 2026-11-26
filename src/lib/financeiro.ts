import { db } from "@/lib/auth";

/**
 * FINANCEIRO do CRM (só-dono, 26/11/2026).
 *
 * Duas metades, como no resto do ecossistema:
 *   • ENTRADAS vêm do gateway (Asaas em BRL, Paddle em USD) pelo serviço de cobrança —
 *     este arquivo NÃO fala com gateway e NÃO inventa valor: só lê o que o webhook gravou.
 *   • SAÍDAS são lançamentos do dono (infra, APIs de IA, impostos, marketing, pró-labore),
 *     guardados no SQLite do app. Empresa inteira mora aqui; nada por organização.
 *
 * Moeda: BRL e USD aparecem separados e o consolidado usa o câmbio abaixo. O câmbio é
 * explícito na tela (R$ 5,00 por dólar por padrão), configurável por
 * `FINANCEIRO_CAMBIO_USD_BRL` — nunca escondido dentro do número.
 */
export const CAMBIO_USD_BRL = Number(process.env.FINANCEIRO_CAMBIO_USD_BRL || 5);

export const CATEGORIAS_SAIDA = [
  "Infra e servidores",
  "APIs de IA",
  "Impostos e taxas",
  "Marketing",
  "Ferramentas e software",
  "Pró-labore e equipe",
  "Gateway e câmbio",
  "Outros",
] as const;

export type Saida = {
  id: number;
  data: string;
  categoria: string;
  descricao: string;
  valor_centavos: number;
  moeda: string;
  criado_em: string;
};

function comBanco<T>(acao: (conexao: ReturnType<typeof db>) => T): T {
  const conexao = db();
  try {
    conexao.exec(`
    create table if not exists financeiro_saidas (
      id integer primary key autoincrement,
      data text not null,
      categoria text not null,
      descricao text not null default '',
      valor_centavos integer not null,
      moeda text not null default 'BRL',
      criado_em text not null default (datetime('now'))
    )
  `);
    conexao.exec("create index if not exists financeiro_saidas_data on financeiro_saidas (data desc)");
    return acao(conexao);
  } finally {
    conexao.close();
  }
}

export function listarSaidas(limite = 200): Saida[] {
  return comBanco((c) =>
    c
      .prepare("select * from financeiro_saidas order by data desc, id desc limit ?")
      .all(Math.max(1, Math.min(limite, 500))) as Saida[],
  );
}

export function criarSaida(dados: {
  data: string;
  categoria: string;
  descricao?: string;
  valor_centavos: number;
  moeda?: string;
}): Saida {
  return comBanco((c) => {
    const moeda = (dados.moeda || "BRL").toUpperCase() === "USD" ? "USD" : "BRL";
    const info = c
      .prepare(
        "insert into financeiro_saidas (data, categoria, descricao, valor_centavos, moeda) values (?,?,?,?,?)",
      )
      .run(
        dados.data,
        dados.categoria,
        dados.descricao || "",
        Math.abs(Math.round(dados.valor_centavos)),
        moeda,
      );
    return c.prepare("select * from financeiro_saidas where id = ?").get(info.lastInsertRowid) as Saida;
  });
}

export function apagarSaida(id: number): boolean {
  return comBanco((c) => c.prepare("delete from financeiro_saidas where id = ?").run(id).changes > 0);
}

/** Consolidado: BRL nativo, USD convertido pelo câmbio declarado na tela. */
export function consolidar(entradas: { brl_centavos: number; usd_centavos: number }, saidas: Saida[]) {
  let brlEntrada = entradas.brl_centavos || 0;
  let usdEntrada = entradas.usd_centavos || 0;
  let brlSaida = 0;
  let usdSaida = 0;
  for (const s of saidas) {
    if (s.moeda === "USD") usdSaida += s.valor_centavos;
    else brlSaida += s.valor_centavos;
  }
  const brlEntradaTotal = brlEntrada + usdEntrada * CAMBIO_USD_BRL;
  const brlSaidaTotal = brlSaida + usdSaida * CAMBIO_USD_BRL;
  return {
    cambio_usd_brl: CAMBIO_USD_BRL,
    entradas: { brl_centavos: brlEntrada, usd_centavos: usdEntrada },
    saidas: { brl_centavos: brlSaida, usd_centavos: usdSaida },
    resultado_brl_centavos: brlEntradaTotal - brlSaidaTotal,
    resultado_usd_centavos: usdEntrada - usdSaida,
  };
}

/** Nome legível do país do comprador (o gateway manda o código de duas letras). */
const PAISES: Record<string, string> = {
  BR: "Brasil", US: "Estados Unidos", PT: "Portugal", CA: "Canadá", MX: "México",
  AR: "Argentina", CL: "Chile", CO: "Colômbia", ES: "Espanha", GB: "Reino Unido",
  DE: "Alemanha", FR: "França", IT: "Itália", NL: "Holanda", IE: "Irlanda",
  AU: "Austrália", NZ: "Nova Zelândia", JP: "Japão", IN: "Índia", AE: "Emirados Árabes",
  ZA: "África do Sul", CH: "Suíça", SE: "Suécia", NO: "Noruega", DK: "Dinamarca",
};

export function nomeDoPais(codigo?: string | null): string {
  if (!codigo) return "Não informado";
  return PAISES[codigo.toUpperCase()] || codigo.toUpperCase();
}

export function bandeiraDoPais(codigo?: string | null): string {
  const c = (codigo || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "🌐";
  return String.fromCodePoint(...[...c].map((l) => 0x1f1e6 + l.charCodeAt(0) - 65));
}

/* ─────────────────────── CONTAS QUE SE REPETEM ──────────────────────────
 * Pedido do dono (26/11/2026): a tela precisa das contas que voltam todo mês, com
 * vencimento, repetição e o "lançar sozinho". Aqui mora o cadastro; quem LANÇA de
 * verdade no vencimento é o agendador (próxima peça), por isso a coluna `automatico`
 * existe e é mostrada — ela descreve a intenção declarada, não um pagamento feito.
 */
export const REPETICOES = ["mensal", "semanal", "anual", "unica"] as const;
export type Repeticao = (typeof REPETICOES)[number];

export type Conta = {
  id: number;
  tipo: "entrada" | "saida";
  descricao: string;
  categoria: string;
  valor_centavos: number;
  moeda: string;
  vencimento: string;
  repeticao: Repeticao;
  automatico: number;
  ativo: number;
  criado_em: string;
  proxima?: string;
};

function comBancoContas<T>(acao: (conexao: ReturnType<typeof db>) => T): T {
  return comBanco((c) => {
    c.exec(`
      create table if not exists financeiro_contas (
        id integer primary key autoincrement,
        tipo text not null default 'saida',
        descricao text not null,
        categoria text not null default 'Outros',
        valor_centavos integer not null,
        moeda text not null default 'BRL',
        vencimento text not null,
        repeticao text not null default 'mensal',
        automatico integer not null default 1,
        ativo integer not null default 1,
        criado_em text not null default (datetime('now'))
      )
    `);
    return acao(c);
  });
}

/** Próxima data da conta a partir de hoje, andando na cadência dela. */
export function proximoVencimento(conta: Conta, hoje = new Date()): Date {
  const base = new Date(`${conta.vencimento}T12:00:00`);
  if (Number.isNaN(base.getTime())) return hoje;
  const alvo = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 12);
  if (conta.repeticao === "unica") return base;
  const passo = (d: Date, n: number) => {
    const x = new Date(d);
    if (conta.repeticao === "mensal") x.setMonth(x.getMonth() + n);
    else if (conta.repeticao === "semanal") x.setDate(x.getDate() + 7 * n);
    else x.setFullYear(x.getFullYear() + n);
    return x;
  };
  let atual = base;
  let voltas = 0;
  while (atual < alvo && voltas < 600) {
    atual = passo(base, ++voltas);
  }
  return atual;
}

export function listarContas(): Conta[] {
  return comBancoContas((c) => {
    const lista = c.prepare("select * from financeiro_contas order by vencimento asc, id asc").all() as Conta[];
    return lista.map((x) => ({ ...x, proxima: proximoVencimento(x).toISOString().slice(0, 10) }));
  });
}

export function criarConta(dados: {
  tipo: "entrada" | "saida";
  descricao: string;
  categoria?: string;
  valor_centavos: number;
  moeda?: string;
  vencimento: string;
  repeticao?: Repeticao;
  automatico?: boolean;
}): Conta {
  return comBancoContas((c) => {
    const info = c
      .prepare(
        `insert into financeiro_contas
           (tipo, descricao, categoria, valor_centavos, moeda, vencimento, repeticao, automatico, ativo)
         values (?,?,?,?,?,?,?,?,1)`,
      )
      .run(
        dados.tipo === "entrada" ? "entrada" : "saida",
        dados.descricao,
        dados.categoria || "Outros",
        Math.abs(Math.round(dados.valor_centavos)),
        (dados.moeda || "BRL").toUpperCase() === "USD" ? "USD" : "BRL",
        dados.vencimento,
        REPETICOES.includes(dados.repeticao as Repeticao) ? (dados.repeticao as string) : "mensal",
        dados.automatico === false ? 0 : 1,
      );
    return c.prepare("select * from financeiro_contas where id = ?").get(info.lastInsertRowid) as Conta;
  });
}

export function alternarConta(id: number, ativo: boolean, automatico?: boolean): boolean {
  return comBancoContas((c) => {
    if (automatico === undefined) return c.prepare("update financeiro_contas set ativo = ? where id = ?").run(ativo ? 1 : 0, id).changes > 0;
    return c
      .prepare("update financeiro_contas set ativo = ?, automatico = ? where id = ?")
      .run(ativo ? 1 : 0, automatico ? 1 : 0, id).changes > 0;
  });
}

export function apagarConta(id: number): boolean {
  return comBancoContas((c) => c.prepare("delete from financeiro_contas where id = ?").run(id).changes > 0);
}

/** O que vence nos próximos N dias, convertido pelo câmbio declarado. */
export function projetar(contas: Conta[], dias = 30) {
  const hoje = new Date();
  const limite = new Date(hoje.getTime() + dias * 86400000);
  let receberBrl = 0;
  let receberUsd = 0;
  let pagarBrl = 0;
  let pagarUsd = 0;
  for (const conta of contas) {
    if (!conta.ativo) continue;
    const quando = proximoVencimento(conta, hoje);
    if (quando > limite) continue;
    const emUsd = conta.moeda === "USD";
    if (conta.tipo === "entrada") {
      if (emUsd) receberUsd += conta.valor_centavos;
      else receberBrl += conta.valor_centavos;
    } else if (emUsd) pagarUsd += conta.valor_centavos;
    else pagarBrl += conta.valor_centavos;
  }
  const aReceber = receberBrl + receberUsd * CAMBIO_USD_BRL;
  const aPagar = pagarBrl + pagarUsd * CAMBIO_USD_BRL;
  return {
    dias,
    a_receber_brl_centavos: aReceber,
    a_pagar_brl_centavos: aPagar,
    saldo_previsto_brl_centavos: aReceber - aPagar,
  };
}
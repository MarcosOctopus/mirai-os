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
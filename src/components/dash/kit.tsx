/* Kit do padrão Dash — a base de TODAS as páginas do MIRAI OS.
   Estrutura e linguagem visual vêm do template ArtDash; acento e estados são nossos.
   Componentes puros (sem hooks): servem em página de servidor e de cliente. */

import Link from "next/link";

/* ── Card ───────────────────────────────────────────────────────────── */
export function Card({
  children,
  className = "",
  interativo = false,
}: {
  children: React.ReactNode;
  className?: string;
  interativo?: boolean;
}) {
  return (
    <section
      className={`rounded-[24px] border border-dash-hair/[0.07] bg-dash-card p-6 ${
        interativo ? "transition-colors hover:border-dash-hair/15" : ""
      } ${className}`}
    >
      {children}
    </section>
  );
}

export function CardTitulo({
  titulo,
  rotulo,
  acao,
}: {
  titulo: string;
  rotulo?: string;
  acao?: React.ReactNode;
}) {
  return (
    <header className="mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        {rotulo && (
          <p className="text-[11px] uppercase tracking-[0.18em] text-dash-dim">{rotulo}</p>
        )}
        <h2 className="mt-1 truncate text-[17px] font-semibold text-dash-fg">{titulo}</h2>
      </div>
      {acao}
    </header>
  );
}

/* ── StatCard (número grande, a peça central de qualquer painel) ────── */
export function StatCard({
  rotulo,
  valor,
  nota,
  tom = "neutro",
  icone,
  className = "",
  tamanho = "grande",
}: {
  rotulo: string;
  valor: string | number;
  nota?: string;
  tom?: "neutro" | "ok" | "alerta" | "erro" | "marca";
  icone?: React.ReactNode;
  className?: string;
  tamanho?: "grande" | "medio";
}) {
  const corNota =
    tom === "ok"
      ? "text-dash-ok"
      : tom === "alerta"
        ? "text-dash-warn"
        : tom === "erro"
          ? "text-dash-bad"
          : tom === "marca"
            ? "text-dash-brand"
            : "text-dash-muted";

  return (
    <section
      className={`rounded-[24px] border border-dash-hair/[0.07] bg-dash-card p-5 ${className}`}
    >
      <div className="flex items-center gap-2.5">
        {icone && (
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-dash-raise text-dash-brand">
            {icone}
          </span>
        )}
        <p className="text-[13px] text-dash-muted">{rotulo}</p>
      </div>
      <p
        className={`mt-4 truncate font-public leading-none font-semibold text-dash-fg ${
          tamanho === "medio" ? "text-[22px]" : "text-[30px]"
        }`}
        title={typeof valor === "string" ? valor : undefined}
      >
        {valor}
      </p>
      {nota && <p className={`mt-2.5 text-[12px] ${corNota}`}>{nota}</p>}
    </section>
  );
}

/* ── Chip / filtro ──────────────────────────────────────────────────── */
export function Chip({
  ativo = false,
  children,
  onClick,
}: {
  ativo?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  const classe = `shrink-0 rounded-full px-4 py-[7px] text-[12px] transition ${
    ativo
      ? "bg-dash-brand text-white"
      : "bg-dash-raise text-dash-muted hover:text-dash-fg"
  }`;
  return onClick ? (
    <button onClick={onClick} className={classe}>
      {children}
    </button>
  ) : (
    <span className={classe}>{children}</span>
  );
}

/* ── Selo de estado (bolinha + texto) ───────────────────────────────── */
export function Selo({
  tom = "ok",
  children,
}: {
  tom?: "ok" | "alerta" | "erro" | "info";
  children: React.ReactNode;
}) {
  const ponto =
    tom === "ok"
      ? "bg-dash-ok"
      : tom === "alerta"
        ? "bg-dash-warn"
        : tom === "erro"
          ? "bg-dash-bad"
          : "bg-dash-brand";
  return (
    <span className="inline-flex items-center gap-2 text-[12px] text-dash-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${ponto}`} />
      {children}
    </span>
  );
}

/* ── Barra de progresso/ocupação ────────────────────────────────────── */
export function Barra({
  valor,
  tom = "marca",
  legenda,
}: {
  valor: number;
  tom?: "marca" | "ok" | "alerta" | "erro";
  legenda?: string;
}) {
  const pct = Math.max(0, Math.min(100, valor));
  const cor =
    tom === "ok"
      ? "bg-dash-ok"
      : tom === "alerta"
        ? "bg-dash-warn"
        : tom === "erro"
          ? "bg-dash-bad"
          : "bg-dash-brand";
  return (
    <div>
      <div className="h-[6px] w-full overflow-hidden rounded-full bg-dash-raise">
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${pct}%` }} />
      </div>
      {legenda && <p className="mt-2 text-[12px] text-dash-muted">{legenda}</p>}
    </div>
  );
}

/* ── Título de seção ────────────────────────────────────────────────── */
export function Secao({
  titulo,
  contagem,
  acao,
  children,
}: {
  titulo: string;
  contagem?: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-[19px] font-semibold text-dash-fg">{titulo}</h2>
        {contagem && <span className="text-[13px] text-dash-muted">{contagem}</span>}
        {acao && <div className="ml-auto flex items-center gap-3">{acao}</div>}
      </div>
      {children}
    </section>
  );
}

/* ── Tabela (rola sozinha no celular, não estoura a página) ─────────── */
export type Coluna = { chave: string; titulo: string; fracao: string };

export function Tabela({
  colunas,
  linhas,
}: {
  colunas: Coluna[];
  linhas: { chave: string; celulas: Record<string, React.ReactNode> }[];
}) {
  const grade = colunas.map((c) => c.fracao).join(" ");
  return (
    <div className="overflow-x-auto rounded-[20px] bg-dash-side">
      <div className="min-w-[820px]">
        <div
          className="grid gap-6 border-b border-dash-hair/[0.07] px-6 py-[15px] text-[12px] text-dash-muted"
          style={{ gridTemplateColumns: grade }}
        >
          {colunas.map((c) => (
            <span key={c.chave}>{c.titulo}</span>
          ))}
        </div>
        {linhas.length === 0 ? (
          <p className="px-6 py-8 text-center text-[13px] text-dash-dim">
            Nada aqui ainda.
          </p>
        ) : (
          linhas.map((l) => (
            <div
              key={l.chave}
              className="grid items-center gap-6 border-b border-dash-hair/[0.04] px-6 py-[14px] text-[13px] text-dash-muted last:border-0"
              style={{ gridTemplateColumns: grade }}
            >
              {colunas.map((c) => (
                <div key={c.chave} className="min-w-0">
                  {l.celulas[c.chave]}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ── Estado vazio (nunca deixar um espaço em branco sem explicação) ─── */
export function Vazio({
  icone,
  titulo,
  texto,
  acao,
}: {
  icone?: React.ReactNode;
  titulo: string;
  texto?: string;
  acao?: { href: string; label: string; externo?: boolean };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-dash-hair/10 bg-dash-card/60 px-6 py-12 text-center">
      {icone && <span className="text-dash-dim">{icone}</span>}
      <p className="text-[15px] font-semibold text-dash-fg">{titulo}</p>
      {texto && <p className="max-w-sm text-[13px] leading-[1.6] text-dash-muted">{texto}</p>}
      {acao &&
        (acao.externo ? (
          <a
            href={acao.href}
            target="_blank"
            rel="noreferrer"
            className="mt-1 rounded-[10px] bg-dash-brand px-5 py-2.5 text-[12px] font-semibold text-white transition hover:bg-dash-brandHi"
          >
            {acao.label}
          </a>
        ) : (
          <Link
            href={acao.href}
            className="mt-1 rounded-[10px] bg-dash-brand px-5 py-2.5 text-[12px] font-semibold text-white transition hover:bg-dash-brandHi"
          >
            {acao.label}
          </Link>
        ))}
    </div>
  );
}

/* ── Botão ──────────────────────────────────────────────────────────── */
export function Botao({
  href,
  externo,
  children,
  variante = "marca",
  className = "",
}: {
  href: string;
  externo?: boolean;
  children: React.ReactNode;
  variante?: "marca" | "linha";
  className?: string;
}) {
  const classe = `inline-flex items-center justify-center gap-2 rounded-[10px] px-5 py-2.5 text-[12px] font-semibold transition ${
    variante === "marca"
      ? "bg-dash-brand text-white hover:bg-dash-brandHi"
      : "border border-dash-hair/12 text-dash-muted hover:text-dash-fg"
  } ${className}`;
  return externo ? (
    <a href={href} target="_blank" rel="noreferrer" className={classe}>
      {children}
    </a>
  ) : (
    <Link href={href} className={classe}>
      {children}
    </Link>
  );
}

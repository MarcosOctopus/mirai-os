"use client";

// PROJETOS — o portfólio do Arquiteto (dono, 11/10/2026).
//
// O que é: TODOS os projetos do Arquiteto da conta, num grid estilo portfólio,
// com a MINIATURA do projeto como imagem destacada (o projeto VIVO, não um
// screenshot guardado), agrupados por PASTAS (categorias que a própria pessoa
// cria) e com PESQUISA por nome.
//
// Fonte única da verdade: o servidor. Os projetos vêm de /api/arquiteto/projetos
// e as pastas de /api/arquiteto/pastas — nada é inventado na tela. Mover/renomear/
// apagar vão por essas rotas e a tela RECARREGA do servidor (sem estado paralelo).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Shell from "@/components/dash/Shell";
import {
  IconeBusca,
  IconeMais,
  IconeFechar,
  IconeRobo,
  IconeCaret,
  IconeCheck,
  IconeAlerta,
} from "@/components/dash/icons";

type Conta = { nome?: string; email?: string; ehDono?: boolean };

type Projeto = {
  id: string;
  titulo: string;
  criado_em: string;
  atualizado_em: string;
  pasta_id?: string | null;
  slug?: string | null;
  dominio?: string | null;
  publicado_em?: string | null;
};

type Pasta = {
  id: string;
  nome: string;
  criado_em: string;
  atualizado_em: string;
  projetos: number;
};

const TODAS = "__todas__";
const SEM_PASTA = "__sem__";

/** Ícone de pasta (o `icons.tsx` não tem um — inline, com a mesma espessura). */
function IconePasta({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className={className} aria-hidden="true">
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.1c.6 0 1.2.25 1.6.7l1.1 1.3h7.2A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * A MINIATURA (imagem destacada). É o projeto VIVO dentro de um iframe escalado:
 * a rota `/previa` monta o HTML atual do projeto e o iframe o mostra inteiro,
 * reduzido ao tamanho do card.
 *
 * A escala é medida por `ResizeObserver` (o card muda de largura com 1/2/4
 * colunas). O CSS `100cqw` dentro de `scale()` NÃO funciona — o browser rejeita
 * o valor e o transform cai para `none` (o iframe aparece em tamanho real,
 * cortado). Por isso a escala vem do JS, sempre `largura do card / 1280`.
 *
 * `sandbox="allow-scripts"` SEM `allow-same-origin`: o código do projeto roda em
 * origem opaca — não enxerga cookie, DOM do app nem rota interna. `pointer-events`
 * desligado: o card inteiro é o alvo do clique.
 */
const LARGURA_PAGINA = 1280;
function Miniatura({ id, titulo }: { id: string; titulo: string }) {
  const caixa = useRef<HTMLDivElement | null>(null);
  const [escala, setEscala] = useState(0.25);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setEscala((el.clientWidth || 320) / LARGURA_PAGINA);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={caixa} className="relative aspect-[4/3] w-full overflow-hidden bg-white">
      <iframe
        title={`Prévia de ${titulo}`}
        src={`/api/arquiteto/projetos/${encodeURIComponent(id)}/previa`}
        sandbox="allow-scripts"
        loading="lazy"
        className="pointer-events-none absolute left-0 top-0 border-0"
        style={{
          width: `${LARGURA_PAGINA}px`,
          height: `${Math.round(LARGURA_PAGINA * 0.75)}px`,
          transform: `scale(${escala})`,
          transformOrigin: "top left",
        }}
      />
    </div>
  );
}

export default function ProjetosPage() {
  const [conta, setConta] = useState<Conta | null>(null);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [pastas, setPastas] = useState<Pasta[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<string>(TODAS); // TODAS | pasta_id | SEM_PASTA

  // Modais / ações
  const [modalPasta, setModalPasta] = useState(false);
  const [nomePasta, setNomePasta] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [menuAberto, setMenuAberto] = useState<string | null>(null); // id do projeto com o menu aberto
  const [renomeando, setRenomeando] = useState<Projeto | null>(null);
  const [nomeProjeto, setNomeProjeto] = useState("");
  const [apagando, setApagando] = useState<Projeto | null>(null);
  const [movendo, setMovendo] = useState<Projeto | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [rp, ra] = await Promise.all([
        fetch("/api/arquiteto/projetos", { cache: "no-store" }),
        fetch("/api/arquiteto/pastas", { cache: "no-store" }),
      ]);
      const jp = rp.ok ? await rp.json() : null;
      const ja = ra.ok ? await ra.json() : null;
      setProjetos(Array.isArray(jp?.projetos) ? jp.projetos : []);
      setPastas(Array.isArray(ja?.pastas) ? ja.pastas : []);
      setErro("");
    } catch {
      setErro("Caiu a conexão ao ler os projetos. Tenta de novo.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        d?.user && setConta({ nome: d.user.name, email: d.user.email, ehDono: Boolean(d.user.ehDono) }),
      )
      .catch(() => {});
    void carregar();
  }, [carregar]);

  // Fecha o menu do card ao clicar fora.
  useEffect(() => {
    if (!menuAberto) return;
    const fora = () => setMenuAberto(null);
    document.addEventListener("click", fora);
    return () => document.removeEventListener("click", fora);
  }, [menuAberto]);

  const nomeDaPasta = useCallback(
    (id?: string | null) => pastas.find((p) => p.id === id)?.nome ?? null,
    [pastas],
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return projetos.filter((p) => {
      if (filtro === SEM_PASTA && p.pasta_id) return false;
      if (filtro !== TODAS && filtro !== SEM_PASTA && p.pasta_id !== filtro) return false;
      if (q && !p.titulo.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [projetos, busca, filtro]);

  const semPasta = projetos.filter((p) => !p.pasta_id).length;

  /* ───────────────────────────── AÇÕES ───────────────────────────── */

  async function criarPasta() {
    const nome = nomePasta.trim();
    if (!nome || salvando) return;
    setSalvando(true);
    try {
      const r = await fetch("/api/arquiteto/pastas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      if (!r.ok) {
        setErro("Não deu para criar a pasta agora.");
        return;
      }
      setModalPasta(false);
      setNomePasta("");
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function mover(projeto: Projeto, pastaId: string | null) {
    setMovendo(null);
    setMenuAberto(null);
    const r = await fetch(`/api/arquiteto/projetos/${encodeURIComponent(projeto.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pastaId }),
    });
    if (r.ok) await carregar();
    else setErro("Não deu para mover o projeto.");
  }

  async function renomear() {
    if (!renomeando) return;
    const titulo = nomeProjeto.trim();
    if (!titulo || salvando) return;
    setSalvando(true);
    try {
      const r = await fetch(`/api/arquiteto/projetos/${encodeURIComponent(renomeando.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ titulo }),
      });
      if (r.ok) {
        setRenomeando(null);
        await carregar();
      } else setErro("Não deu para renomear o projeto.");
    } finally {
      setSalvando(false);
    }
  }

  async function apagar() {
    if (!apagando) return;
    setSalvando(true);
    try {
      const r = await fetch(`/api/arquiteto/projetos/${encodeURIComponent(apagando.id)}`, {
        method: "DELETE",
      });
      if (r.ok) {
        setApagando(null);
        await carregar();
      } else setErro("Não deu para apagar o projeto.");
    } finally {
      setSalvando(false);
    }
  }

  /* ───────────────────────────── TELA ───────────────────────────── */

  const chip = (id: string, rotulo: string, n: number) => {
    const ativo = filtro === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => setFiltro(id)}
        className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12.5px] transition ${
          ativo
            ? "border-dash-brand bg-dash-brand/15 text-white"
            : "border-dash-line bg-dash-raise/40 text-dash-muted hover:text-white"
        }`}
      >
        {id !== TODAS && id !== SEM_PASTA && <IconePasta className="h-[14px] w-[14px] shrink-0 opacity-80" />}
        <span className="truncate max-w-[180px]">{rotulo}</span>
        <span className="text-[11px] text-dash-dim">{n}</span>
      </button>
    );
  };

  return (
    <Shell titulo="Projetos" usuario={conta}>
      {/* TOPO: título da seção + busca + nova pasta */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <p className="text-[13px] text-dash-muted">
            O portfólio do Arquiteto: cada projeto é uma peça. Agrupe em pastas — por cliente, por produto.
          </p>
        </div>
        <div className="relative min-w-[210px] flex-1 sm:max-w-[320px]">
          <IconeBusca className="pointer-events-none absolute left-3 top-1/2 h-[16px] w-[16px] -translate-y-1/2 text-dash-dim" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Pesquisar projeto…"
            aria-label="Pesquisar projeto"
            className="w-full rounded-[10px] border border-dash-line bg-dash-side py-2.5 pl-9 pr-3 text-[13px] text-white outline-none placeholder:text-dash-dim focus:border-dash-brand"
          />
        </div>
        <button
          type="button"
          onClick={() => setModalPasta(true)}
          className="inline-flex shrink-0 items-center gap-2 rounded-[10px] bg-dash-brand px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-dash-brandHi"
        >
          <IconeMais className="h-[16px] w-[16px]" />
          Nova pasta
        </button>
      </div>

      {/* CHIPS DE PASTA (categorias) */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {chip(TODAS, "Todos", projetos.length)}
        {pastas.map((p) => chip(p.id, p.nome, p.projetos))}
        {semPasta > 0 && chip(SEM_PASTA, "Sem pasta", semPasta)}
      </div>

      {erro && (
        <p className="mb-4 flex items-center gap-2 rounded-[10px] bg-dash-bad/10 px-3 py-2 text-[12.5px] text-dash-bad">
          <IconeAlerta className="h-[15px] w-[15px] shrink-0" />
          {erro}
        </p>
      )}

      {/* GRID PORTFÓLIO */}
      {carregando ? (
        <p className="py-16 text-center text-[13px] text-dash-dim">Carregando projetos…</p>
      ) : filtrados.length === 0 ? (
        <div className="rounded-[16px] border border-dash-line bg-dash-card/50 px-6 py-16 text-center">
          <IconeRobo className="mx-auto mb-3 h-8 w-8 text-dash-dim" />
          <p className="text-[14px] text-white/85">
            {projetos.length === 0
              ? "Nenhum projeto ainda."
              : "Nada encontrado com esse filtro."}
          </p>
          <p className="mt-1 text-[12.5px] text-dash-dim">
            {projetos.length === 0
              ? "Construa o primeiro no Arquiteto — ele aparece aqui sozinho."
              : "Tente outro nome ou troque de pasta."}
          </p>
          {projetos.length === 0 && (
            <Link
              href="/arquiteto"
              className="mt-5 inline-flex items-center gap-2 rounded-[10px] bg-dash-brand px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-dash-brandHi"
            >
              <IconeRobo className="h-[16px] w-[16px]" />
              Abrir o Arquiteto
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {filtrados.map((p) => {
            const noAr = Boolean(p.publicado_em);
            const endereco = p.dominio || (p.slug ? `${p.slug}.miraitohope.com` : null);
            return (
              <div
                key={p.id}
                className="group relative overflow-hidden rounded-[16px] border border-dash-line bg-dash-card transition hover:border-dash-brand/60"
              >
                {/* a imagem destacada */}
                <Link href={`/arquiteto?projeto=${encodeURIComponent(p.id)}`} className="block">
                  <div className="relative overflow-hidden border-b border-dash-line">
                    <Miniatura id={p.id} titulo={p.titulo} />
                    {noAr && (
                      <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-dash-ok/90 px-2.5 py-1 text-[10.5px] font-semibold text-dash-side">
                        <span className="h-1.5 w-1.5 rounded-full bg-dash-side" />
                        no ar
                      </span>
                    )}
                  </div>
                </Link>

                {/* rodapé do card */}
                <div className="flex items-start gap-2 px-3.5 py-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/arquiteto?projeto=${encodeURIComponent(p.id)}`}
                      className="block truncate text-[13.5px] font-medium text-white hover:text-dash-brand"
                      title={p.titulo}
                    >
                      {p.titulo}
                    </Link>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-dash-dim">
                      {nomeDaPasta(p.pasta_id) ? (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <IconePasta className="h-[12px] w-[12px] shrink-0" />
                          <span className="truncate max-w-[110px]">{nomeDaPasta(p.pasta_id)}</span>
                        </span>
                      ) : (
                        <span>Sem pasta</span>
                      )}
                      {endereco && <span className="truncate max-w-[120px]">· {endereco}</span>}
                    </div>
                  </div>

                  {/* menu do card */}
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      aria-label="Ações do projeto"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuAberto((m) => (m === p.id ? null : p.id));
                      }}
                      className="grid h-7 w-7 place-items-center rounded-[8px] text-dash-muted transition hover:bg-white/[0.07] hover:text-white"
                    >
                      <span className="text-[16px] leading-none">⋯</span>
                    </button>
                    {menuAberto === p.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-[34px] z-30 w-[212px] rounded-[12px] border border-dash-line bg-dash-card p-1 shadow-2xl"
                      >
                        <Link
                          href={`/arquiteto?projeto=${encodeURIComponent(p.id)}`}
                          className="flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2 text-left text-[12.5px] text-dash-muted transition hover:bg-white/[0.06] hover:text-white"
                        >
                          <IconeRobo className="h-[15px] w-[15px]" /> Abrir no Arquiteto
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setRenomeando(p);
                            setNomeProjeto(p.titulo);
                            setMenuAberto(null);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2 text-left text-[12.5px] text-dash-muted transition hover:bg-white/[0.06] hover:text-white"
                        >
                          <IconeCaret className="h-[15px] w-[15px] rotate-90" /> Renomear
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMovendo(p);
                            setMenuAberto(null);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2 text-left text-[12.5px] text-dash-muted transition hover:bg-white/[0.06] hover:text-white"
                        >
                          <IconePasta className="h-[15px] w-[15px]" /> Mover para pasta…
                        </button>
                        <div className="my-1 border-t border-dash-line" />
                        <button
                          type="button"
                          onClick={() => {
                            setApagando(p);
                            setMenuAberto(null);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2 text-left text-[12.5px] text-dash-bad transition hover:bg-dash-bad/10"
                        >
                          <IconeFechar className="h-[15px] w-[15px]" /> Apagar projeto
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── MODAL: nova pasta ── */}
      {modalPasta && (
        <Modal titulo="Nova pasta" onFechar={() => setModalPasta(false)}>
          <p className="mb-3 text-[12.5px] text-dash-muted">
            Uma pasta agrupa projetos — como uma categoria. Ex.: o nome do cliente, ou o produto.
          </p>
          <input
            autoFocus
            value={nomePasta}
            onChange={(e) => setNomePasta(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void criarPasta()}
            placeholder="Ex.: Projeto Mirai OS"
            className="w-full rounded-[10px] border border-dash-line bg-dash-side px-3 py-2.5 text-[13px] text-white outline-none placeholder:text-dash-dim focus:border-dash-brand"
          />
          <div className="mt-4 flex justify-end gap-2">
            <BotaoSecundario onClick={() => setModalPasta(false)}>Cancelar</BotaoSecundario>
            <BotaoPrincipal onClick={() => void criarPasta()} desabilitado={!nomePasta.trim() || salvando}>
              Criar pasta
            </BotaoPrincipal>
          </div>
        </Modal>
      )}

      {/* ── MODAL: renomear projeto ── */}
      {renomeando && (
        <Modal titulo="Renomear projeto" onFechar={() => setRenomeando(null)}>
          <input
            autoFocus
            value={nomeProjeto}
            onChange={(e) => setNomeProjeto(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void renomear()}
            className="w-full rounded-[10px] border border-dash-line bg-dash-side px-3 py-2.5 text-[13px] text-white outline-none focus:border-dash-brand"
          />
          <div className="mt-4 flex justify-end gap-2">
            <BotaoSecundario onClick={() => setRenomeando(null)}>Cancelar</BotaoSecundario>
            <BotaoPrincipal onClick={() => void renomear()} desabilitado={!nomeProjeto.trim() || salvando}>
              Salvar
            </BotaoPrincipal>
          </div>
        </Modal>
      )}

      {/* ── MODAL: mover para pasta ── */}
      {movendo && (
        <Modal titulo="Mover para pasta" onFechar={() => setMovendo(null)}>
          <p className="mb-3 truncate text-[12.5px] text-dash-muted">“{movendo.titulo}”</p>
          <div className="max-h-[280px] space-y-1 overflow-y-auto">
            <button
              type="button"
              onClick={() => void mover(movendo, null)}
              className="flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2.5 text-left text-[13px] text-dash-muted transition hover:bg-white/[0.06] hover:text-white"
            >
              <IconeFechar className="h-[15px] w-[15px]" /> Sem pasta
              {!movendo.pasta_id && <IconeCheck className="ml-auto h-[15px] w-[15px] text-dash-brand" />}
            </button>
            {pastas.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void mover(movendo, p.id)}
                className="flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2.5 text-left text-[13px] text-dash-muted transition hover:bg-white/[0.06] hover:text-white"
              >
                <IconePasta className="h-[15px] w-[15px]" />
                <span className="truncate">{p.nome}</span>
                {movendo.pasta_id === p.id && <IconeCheck className="ml-auto h-[15px] w-[15px] text-dash-brand" />}
              </button>
            ))}
            {pastas.length === 0 && (
              <p className="px-3 py-2 text-[12.5px] text-dash-dim">
                Você ainda não tem pastas. Crie uma em “Nova pasta”.
              </p>
            )}
          </div>
        </Modal>
      )}

      {/* ── MODAL: apagar projeto ── */}
      {apagando && (
        <Modal titulo="Apagar projeto" onFechar={() => setApagando(null)}>
          <p className="text-[13px] text-dash-muted">
            Apagar <span className="text-white">“{apagando.titulo}”</span>? Isto remove o projeto e seus
            arquivos. Não dá para desfazer.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <BotaoSecundario onClick={() => setApagando(null)}>Cancelar</BotaoSecundario>
            <button
              type="button"
              onClick={() => void apagar()}
              disabled={salvando}
              className="rounded-[10px] bg-dash-bad px-4 py-2.5 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            >
              Apagar
            </button>
          </div>
        </Modal>
      )}
    </Shell>
  );
}

/* ─────────────────────────── peças de UI ─────────────────────────── */

function Modal({
  titulo,
  onFechar,
  children,
}: {
  titulo: string;
  onFechar: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onFechar}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] rounded-[16px] border border-dash-line bg-dash-card p-5 shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] text-white">{titulo}</h2>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="grid h-8 w-8 place-items-center rounded-[9px] text-dash-muted transition hover:bg-white/[0.07] hover:text-white"
          >
            <IconeFechar className="h-[16px] w-[16px]" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function BotaoPrincipal({
  children,
  onClick,
  desabilitado,
}: {
  children: React.ReactNode;
  onClick: () => void;
  desabilitado?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      className="rounded-[10px] bg-dash-brand px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-dash-brandHi disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function BotaoSecundario({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[10px] border border-dash-line px-4 py-2.5 text-[13px] text-dash-muted transition hover:text-white"
    >
      {children}
    </button>
  );
}

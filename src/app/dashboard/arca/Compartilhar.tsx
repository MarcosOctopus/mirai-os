"use client";

/**
 * COMPARTILHAR PASTA — estilo Google Drive, dentro da Arca.
 *
 * A REGRA VIVE NA ARCA (concessão por pasta, com herança para as notas e
 * subpastas). Aqui é só a cara: as fotinhas de quem tem acesso ao lado da
 * pasta ("fulano e +3") e o painel para conceder/ajustar/remover.
 *
 * Nada de plano, nada de preço: é compartilhamento. Quem recebe entra por
 * LINK (sem conta) ou porque a conta dele foi colocada aqui.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { Botao, Chip } from "@/components/dash/kit";
import { IconeFechar, IconeLapis, IconeLixeira, IconeOlho } from "@/components/dash/icons";

export type Concessao = {
  id?: string;
  alvo: string;
  convidado: string;
  nome?: string;
  foto?: string | null;
  ver: boolean;
  editar: boolean;
  excluir: boolean;
  criada_em?: string;
};

/** Pedido de novo link: alguém abriu um convite morto e pediu outro. */
export type Pedido = {
  quando?: string;
  org?: string;
  pasta?: string;
  convidado?: string;
  token_curto?: string;
  atendido?: boolean;
};

type Estado = {
  concessoes: Concessao[];
  indisponivel: boolean;
  recarregar: () => Promise<void>;
  abrir: (pasta: string) => void;
  pasta: string | null;
  fechar: () => void;
};

const Ctx = createContext<Estado | null>(null);

export function useAcesso(): Estado {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAcesso fora do ProvedorAcesso");
  return c;
}

/** Busca a lista de quem tem acesso (uma vez) e guarda para a árvore inteira. */
export function ProvedorAcesso({ children }: { children: React.ReactNode }) {
  const [concessoes, setConcessoes] = useState<Concessao[]>([]);
  const [indisponivel, setIndisponivel] = useState(false);
  const [pasta, setPasta] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/acervo?acao=acesso", { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (Array.isArray(d?.concessoes)) {
        setConcessoes(d.concessoes as Concessao[]);
        setIndisponivel(Boolean(d.indisponivel));
      } else {
        setIndisponivel(true);
      }
    } catch {
      setIndisponivel(true);
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const valor = useMemo<Estado>(
    () => ({
      concessoes,
      indisponivel,
      recarregar,
      abrir: (p: string) => setPasta(p),
      pasta,
      fechar: () => setPasta(null),
    }),
    [concessoes, indisponivel, recarregar, pasta],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/** Quem alcança esta pasta: a concessão dela e as herdadas das pastas acima. */
function quemAlcanca(concessoes: Concessao[], pasta: string): Concessao[] {
  const alvo = pasta.replace(/^\/+|\/+$/g, "");
  return concessoes.filter((c) => {
    const raiz = (c.alvo || "").replace(/^\/+|\/+$/g, "");
    if (raiz === "*") return true; // concessão da ARCA INTEIRA alcança qualquer pasta
    return raiz === alvo || alvo.startsWith(raiz + "/");
  });
}

function iniciais(nome: string): string {
  const partes = (nome || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

function Rosto({ pessoa, tamanho = 18 }: { pessoa: Concessao; tamanho?: number }) {
  const rotulo = pessoa.nome || pessoa.convidado;
  if (pessoa.foto) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={pessoa.foto}
        alt={rotulo}
        title={rotulo}
        width={tamanho}
        height={tamanho}
        style={{ width: tamanho, height: tamanho, borderRadius: 999, objectFit: "cover" }}
        className="shrink-0 ring-1 ring-black/60"
      />
    );
  }
  return (
    <span
      title={rotulo}
      aria-label={rotulo}
      style={{
        width: tamanho,
        height: tamanho,
        borderRadius: 999,
        fontSize: Math.max(8, Math.round(tamanho * 0.42)),
        background: "rgba(255,255,255,0.10)",
        color: "rgba(232,234,240,0.9)",
      }}
      className="flex shrink-0 items-center justify-center font-semibold ring-1 ring-black/60"
    >
      {iniciais(rotulo)}
    </span>
  );
}

/**
 * As FOTINHAS ao lado da pasta: até 3 rostos e o "+N" de quem sobra.
 * Sem ninguém, aparece o convite discreto de compartilhar.
 */
export function Fotinhas({ pasta }: { pasta: string }) {
  const { concessoes, abrir } = useAcesso();
  const gente = quemAlcanca(concessoes, pasta);
  const unicos = useMemo(() => {
    const vistos = new Set<string>();
    return gente.filter((c) => {
      const k = (c.convidado || "").toLowerCase();
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
  }, [gente]);

  const mostrar = unicos.slice(0, 3);
  const resto = unicos.length - mostrar.length;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        abrir(pasta);
      }}
      title={
        unicos.length
          ? `${unicos.map((c) => c.nome || c.convidado).join(", ")} — clique para gerenciar`
          : "compartilhar esta pasta"
      }
      aria-label={unicos.length ? `quem tem acesso a ${pasta}` : `compartilhar ${pasta}`}
      data-arca-fotinhas={pasta}
      className="flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 hover:bg-white/[0.06]"
      style={{ cursor: "pointer" }}
    >
      {unicos.length === 0 ? (
        <span
          aria-hidden
          className="text-[10px] leading-none opacity-0 transition-opacity group-hover:opacity-100"
          style={{ color: "rgba(198,202,212,0.55)" }}
        >
          👥
        </span>
      ) : (
        <span className="flex items-center" style={{ paddingLeft: 0 }}>
          {mostrar.map((c, i) => (
            <span key={(c.convidado || "") + i} style={{ marginLeft: i === 0 ? 0 : -6 }}>
              <Rosto pessoa={c} />
            </span>
          ))}
          {resto > 0 && (
            <span
              style={{
                marginLeft: -6,
                width: 18,
                height: 18,
                borderRadius: 999,
                fontSize: 8.5,
              }}
              data-arca-mais="sim"
              className="flex shrink-0 items-center justify-center bg-dash-raise font-semibold text-dash-muted ring-1 ring-black/60"
            >
              +{resto}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

const NIVEIS = [
  { chave: "ver", Icone: IconeOlho, rotulo: "ver" },
  { chave: "editar", Icone: IconeLapis, rotulo: "editar" },
  { chave: "excluir", Icone: IconeLixeira, rotulo: "excluir" },
] as const;

/**
 * O painel: e-mail, os três níveis, o link e a lista de quem já tem acesso.
 *
 * É desenhado DENTRO da casca (.dash-root) pela tela — nascer fora dela custou
 * caro: o painel herdava a fonte do body (Courier) e a cor de texto (preta), e a
 * borda do tema resolvia para preto. Medido no ar em 11/11/2026.
 */
export function PainelCompartilhar() {
  const { pasta, fechar, concessoes, recarregar, indisponivel } = useAcesso();
  const [email, setEmail] = useState("");
  const [niveis, setNiveis] = useState({ ver: true, editar: false, excluir: false });
  const [ocupado, setOcupado] = useState(false);
  const [recado, setRecado] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<string | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);

  // PEDIDOS DE NOVO LINK: quem abriu um link morto e bateu em "pedir novamente".
  // Só o dono enxerga (a Arca devolve vazio para os outros).
  useEffect(() => {
    fetch("/api/admin/acervo?acao=pedidos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && Array.isArray(d.pedidos)) {
          setPedidos((d.pedidos as Pedido[]).filter((q) => !q.atendido));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setEmail("");
    setNiveis({ ver: true, editar: false, excluir: false });
    setRecado(null);
    setLink(null);
  }, [pasta]);

  if (!pasta) return null;

  const daPasta = quemAlcanca(concessoes, pasta);
  const proprias = daPasta.filter((c) => (c.alvo || "").replace(/^\/+|\/+$/g, "") === pasta.replace(/^\/+|\/+$/g, ""));
  const herdadas = daPasta.filter((c) => !proprias.includes(c));

  const chamar = async (corpo: Record<string, unknown>) => {
    setOcupado(true);
    setRecado(null);
    try {
      const r = await fetch("/api/admin/acervo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setRecado(String(d?.error || d?.detail || "não deu agora — tente de novo"));
        return null;
      }
      await recarregar();
      return d as {
        link?: string | null;
        obs?: string;
        email?: { ok?: boolean; pulado?: boolean; motivo?: string };
      };
    } catch {
      setRecado("não deu agora — tente de novo");
      return null;
    } finally {
      setOcupado(false);
    }
  };

  const compartilhar = async () => {
    const alvo = email.trim().toLowerCase();
    if (!alvo.includes("@")) {
      setRecado("informe um e-mail");
      return;
    }
    const d = await chamar({ acao: "compartilhar", pasta, email: alvo, ...niveis });
    if (d) {
      setLink(d.link || null);
      const niveisTexto = [
        niveis.ver && "ver",
        niveis.editar && "editar",
        niveis.excluir && "excluir",
      ]
        .filter(Boolean)
        .join(" + ");
      // Aviso NA HORA e COM QUEM — e dizendo se o e-mail saiu. Sem isto o dono
      // concedia, mandava o link na mão e não sabia que o aviso tinha falhado.
      const envio = d.email || {};
      const parteEmail =
        envio.ok === true
          ? "aviso enviado por e-mail"
          : envio.pulado === true
            ? "e-mail não configurado"
            : "o aviso por e-mail não saiu";
      setConfirmacao(`compartilhado com ${alvo} · ${niveisTexto} · ${parteEmail}`);
      setRecado(d.obs || "acesso concedido");
      setEmail("");
    }
  };

  const reenviar = async (q: Pedido) => {
    const alvo = q.pasta || (pasta === "*" ? "*" : pasta);
    const d = await chamar({ acao: "link-convidado", pasta: alvo, email: q.convidado });
    if (d) {
      setLink(d.link || null);
      await chamar({ acao: "atender-pedido", convidado: q.convidado, pasta: alvo, org: q.org });
      setPedidos((antes) => antes.filter((x) => x !== q));
      setConfirmacao(`novo link para ${q.convidado} — mande para a pessoa`);
    }
  };

  const remover = async (convidado: string) => {
    await chamar({ acao: "descompartilhar", pasta, email: convidado });
  };

  const copiar = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setRecado("link copiado — mande para a pessoa");
    } catch {
      setRecado("selecione o link e copie");
    }
  };

  return (
    <div
      data-arca-painel-compartilhar={pasta}
      className="fixed bottom-4 right-4 z-50 w-[min(92vw,380px)] rounded-[24px] border border-dash-hair/[0.12] bg-dash-card p-4 shadow-2xl"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-dash-muted">compartilhar pasta</p>
          <p className="truncate text-[12.5px] font-medium text-dash-fg" title={pasta}>
            {pasta === "*" ? "toda a Arca" : pasta}
          </p>
        </div>
        <button
          type="button"
          onClick={fechar}
          aria-label="fechar"
          title="fechar"
          className="flex h-6 w-6 shrink-0 items-center justify-center text-dash-muted transition hover:text-dash-fg"
        >
          <IconeFechar className="h-4 w-4" />
        </button>
      </div>

      {indisponivel && (
        <p className="mb-2 rounded-[10px] bg-dash-warn/10 px-3 py-2 text-[11.5px] leading-snug text-dash-warn">
          a camada de compartilhamento ainda não respondeu — a Arca precisa estar com o código novo.
        </p>
      )}

      {pasta === "*" && (
        <p className="mb-2 text-[11px] leading-snug text-dash-muted">
          esta é a Arca inteira — a pessoa passa a enxergar todas as suas pastas.
        </p>
      )}

      <div className="flex items-center gap-1.5">
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void compartilhar();
          }}
          placeholder="e-mail de quem vai receber"
          inputMode="email"
          className="min-w-0 flex-1 rounded-[10px] border border-dash-hair/10 bg-dash-bg px-4 py-2.5 text-[13px] text-dash-fg outline-none placeholder:text-dash-dim focus:border-dash-brand/60"
        />
        <Botao onClick={() => void compartilhar()} desabilitado={ocupado} className="shrink-0">
          {ocupado ? "…" : "dar acesso"}
        </Botao>
      </div>

      <div className="mt-2 flex items-center gap-1">
        {NIVEIS.map((n) => (
          <Chip
            key={n.chave}
            ativo={niveis[n.chave]}
            onClick={() => setNiveis((v) => ({ ...v, [n.chave]: !v[n.chave] }))}
          >
            <span data-arca-nivel={n.chave} className="flex items-center gap-1.5">
              <n.Icone className="h-[13px] w-[13px]" />
              {n.rotulo}
            </span>
          </Chip>
        ))}
      </div>

      {link && (
        <div className="mt-2 rounded-md border border-white/10 bg-white/[0.03] p-1.5">
          <p className="mb-1 text-[10px] uppercase tracking-wide text-dash-muted">link do convite</p>
          <div className="flex items-center gap-1">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 bg-transparent text-[11px] text-dash-fg outline-none"
            />
            <Botao variante="linha" onClick={() => void copiar()} className="shrink-0">
              copiar
            </Botao>
          </div>
        </div>
      )}

      {recado && <p className="mt-2 text-[11px] leading-snug text-dash-muted">{recado}</p>}

      {confirmacao && (
        <p
          data-arca-compartilhado="sim"
          className="mt-2 rounded-[10px] border border-dash-line bg-white/[0.03] px-2 py-1.5 text-[11.5px] text-dash-fg"
        >
          {confirmacao}
        </p>
      )}

      {pedidos.length > 0 && (
        <div
          data-arca-pedidos={pedidos.length}
          className="mt-2 rounded-[10px] border border-dash-line bg-white/[0.03] p-2"
        >
          <p className="mb-1 text-[10px] uppercase tracking-wide text-dash-muted">pediram novo link</p>
          <ul className="space-y-1.5">
            {pedidos.map((q) => (
              <li key={`${q.convidado}|${q.pasta}|${q.quando}`} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-dash-fg" title={q.convidado}>
                  {q.convidado || "alguém com o link"}
                </span>
                <Botao variante="linha" onClick={() => void reenviar(q)} className="shrink-0">
                  novo link
                </Botao>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-2 border-t border-white/[0.07] pt-2">
        <p className="mb-1 text-[10px] uppercase tracking-wide text-dash-muted">
          quem tem acesso {proprias.length ? `(${proprias.length})` : ""}
        </p>
        {proprias.length === 0 && <p className="text-[11.5px] text-dash-muted">só você.</p>}
        <ul className="space-y-1">
          {proprias.map((c) => (
            <li key={c.convidado} className="flex items-center gap-1.5">
              <Rosto pessoa={c} tamanho={20} />
              <span className="min-w-0 flex-1 truncate text-[11.5px] text-dash-fg" title={c.convidado}>
                {c.nome || c.convidado}
              </span>
              <span className="flex shrink-0 items-center gap-1 text-dash-muted">
                {c.ver && <IconeOlho className="h-[13px] w-[13px]" />}
                {c.editar && <IconeLapis className="h-[13px] w-[13px]" />}
                {c.excluir && <IconeLixeira className="h-[13px] w-[13px]" />}
              </span>
              <button
                type="button"
                onClick={() => void remover(c.convidado)}
                aria-label={`remover acesso de ${c.convidado}`}
                title="remover acesso"
                className="flex h-6 w-6 shrink-0 items-center justify-center text-dash-muted transition hover:text-dash-bad"
              >
                <IconeLixeira className="h-[15px] w-[15px]" />
              </button>
            </li>
          ))}
        </ul>
        {herdadas.length > 0 && (
          <p className="mt-1.5 text-[10.5px] leading-snug text-dash-muted/80">
            + {herdadas.length} com acesso herdado de uma pasta acima
          </p>
        )}
      </div>
    </div>
  );
}

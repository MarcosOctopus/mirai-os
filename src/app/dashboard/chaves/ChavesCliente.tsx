"use client";

/**
 * CHAVES DE API (BYOK) — a tela onde a pessoa cadastra a PRÓPRIA chave.
 *
 * POR QUE existe (dono, 13/11/2026): o chat sempre gastou a chave global do
 * app. Quem tem contrato próprio com a OpenRouter/OpenAI ficava sem caminho.
 *
 * REGRAS QUE A TELA RESPEITA (e que o servidor garante, não ela):
 *   - a chave digitada vai por POST e NUNCA volta: o que aparece depois de
 *     salvar é a mascarada que o servidor devolveu (`sk-…4f2a`);
 *   - não existe campo "qual conta" — o cofre é o da sessão, sempre;
 *   - remover é por provedor, com confirmação em dois passos (apagar a chave
 *     sem querer devolve a pessoa para a fila do app sem ela perceber).
 *
 * Visual: o MESMO do resto do painel (fundo dash-bg, texto dash-fg/muted,
 * campos e botões rounded-[10px], chips rounded-full, cartão 24px, ícone de
 * traço). Nada de emoji e nada de cor inventada.
 */
import { useCallback, useEffect, useState } from "react";

import Shell from "@/components/dash/Shell";
import { IconeAlerta, IconeCadeado, IconeCheck } from "@/components/dash/icons";

type Usuario = { nome?: string; email?: string; ehDono?: boolean } | null;

type ChaveNaTela = {
  provider: "openrouter" | "openai";
  nome: string;
  modelo: string;
  mascarada: string;
  criado_em: string;
  padrao: boolean;
};

type Provedor = { id: "openrouter" | "openai"; nome: string; modeloPadrao: string; ondePegar: string };

/** Um espaço onde uma chave pode viver: o pessoal (padrão) ou o da empresa. */
type EscopoNaTela = { id: string; tipo: "pessoal" | "organizacao"; nome: string };

/** Data curta em pt-BR — sem biblioteca nova para uma linha. */
function quando(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  } catch {
    return iso;
  }
}

/** Um cartão por provedor. O estado é local à linha: uma chave por provedor. */
function CartaoProvedor({
  provedor,
  chave,
  escopoId,
  onAtualizar,
  onErro,
}: {
  provedor: Provedor;
  chave?: ChaveNaTela;
  /** Onde a chave é gravada — escolhido pela pessoa, nunca adivinhado. */
  escopoId: string;
  onAtualizar: () => Promise<void>;
  onErro: (msg: string) => void;
}) {
  const [valor, setValor] = useState("");
  const [modelo, setModelo] = useState(chave?.modelo || provedor.modeloPadrao);
  const [salvando, setSalvando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);

  /* O modelo do servidor manda: se a lista recarregar, o campo acompanha. */
  useEffect(() => {
    setModelo(chave?.modelo || provedor.modeloPadrao);
  }, [chave?.modelo, provedor.modeloPadrao]);

  async function salvar() {
    const limpa = valor.trim();
    if (!limpa) {
      onErro("Cole a chave antes de salvar.");
      return;
    }
    setSalvando(true);
    onErro("");
    try {
      const r = await fetch("/api/byok/chaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provedor.id, chave: limpa, modelo: modelo.trim(), escopo: escopoId }),
      });
      const d = (await r.json().catch(() => ({}))) as { erro?: string };
      if (!r.ok) {
        onErro(d?.erro || `não consegui salvar (HTTP ${r.status})`);
        return;
      }
      // A chave sai da MEMÓRIA da tela assim que é gravada: não fica no DOM,
      // não fica no estado do React, não sobrevive a um print da página.
      setValor("");
      await onAtualizar();
    } catch {
      onErro("a conexão caiu antes de a chave ser gravada.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover() {
    setSalvando(true);
    onErro("");
    try {
      const r = await fetch(
        `/api/byok/chaves?provider=${encodeURIComponent(provedor.id)}&escopo=${encodeURIComponent(escopoId)}`,
        { method: "DELETE" },
      );
      const d = (await r.json().catch(() => ({}))) as { erro?: string };
      if (!r.ok) {
        onErro(d?.erro || `não consegui remover (HTTP ${r.status})`);
        return;
      }
      setConfirmando(false);
      await onAtualizar();
    } catch {
      onErro("a conexão caiu antes de a chave ser removida.");
    } finally {
      setSalvando(false);
    }
  }

  async function tornarPadrao() {
    setSalvando(true);
    onErro("");
    try {
      const r = await fetch("/api/byok/chaves", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: provedor.id, escopo: escopoId }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { erro?: string };
        onErro(d?.erro || "não consegui definir como padrão");
        return;
      }
      await onAtualizar();
    } catch {
      onErro("a conexão caiu antes de a escolha ser gravada.");
    } finally {
      setSalvando(false);
    }
  }

  const cadastrada = Boolean(chave);

  return (
    <article className="rounded-[24px] border border-dash-hair/[0.10] bg-dash-card/[0.55] p-6">
      <header className="flex flex-wrap items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-dash-raise/60 text-dash-fg/80">
          <IconeCadeado className="h-[17px] w-[17px]" />
        </span>
        <h2 className="text-[15.5px] font-semibold text-dash-fg">{provedor.nome}</h2>

        {/* Estado: sempre pelo que o SERVIDOR disse, nunca pelo que a tela acha. */}
        <span className="inline-flex items-center gap-2 rounded-full bg-dash-raise/60 px-3 py-[5px] text-[11px] text-dash-muted">
          <span
            className={`h-1.5 w-1.5 rounded-full ${cadastrada ? "bg-dash-ok" : "bg-dash-dim"}`}
            aria-hidden
          />
          {cadastrada ? `conectada · ${chave?.mascarada}` : "sem chave própria"}
        </span>

        {cadastrada && chave?.padrao ? (
          <span className="rounded-full bg-dash-brand/[0.15] px-3 py-[5px] text-[11px] font-medium text-dash-brandHi">
            em uso no chat
          </span>
        ) : null}

        {cadastrada && !chave?.padrao ? (
          <button
            type="button"
            onClick={() => void tornarPadrao()}
            disabled={salvando}
            className="rounded-full border border-dash-hair/[0.15] px-3 py-[5px] text-[11px] text-dash-muted transition-colors duration-200 hover:border-dash-brand/40 hover:text-dash-fg disabled:opacity-50"
          >
            usar no chat
          </button>
        ) : null}
      </header>

      <p className="mt-3 text-[12.5px] leading-[1.6] text-dash-muted">
        {cadastrada
          ? `Sua chave ${provedor.nome} está guardada cifrada nesta conta e é ela que responde no chat.`
          : `Cole a chave da sua conta ${provedor.nome}. Sem chave aqui, o chat segue com a inteligência do app.`}
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_200px]">
        <label className="block">
          <span className="mb-1.5 block text-[11.5px] text-dash-muted">Chave de API</span>
          <input
            type="password"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder={cadastrada ? "colar uma nova chave substitui a atual" : "sk-…"}
            className="w-full rounded-[10px] border border-dash-hair/[0.12] bg-dash-bg px-3.5 py-2.5 text-[13px] text-dash-fg outline-none placeholder:text-dash-dim focus:border-dash-brand/60"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[11.5px] text-dash-muted">Modelo</span>
          <input
            type="text"
            value={modelo}
            onChange={(e) => setModelo(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-[10px] border border-dash-hair/[0.12] bg-dash-bg px-3.5 py-2.5 text-[13px] text-dash-fg outline-none placeholder:text-dash-dim focus:border-dash-brand/60"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void salvar()}
          disabled={salvando || !valor.trim()}
          className="inline-flex items-center gap-1.5 rounded-[10px] bg-dash-brand px-4 py-2 text-[12px] font-semibold text-dash-fg transition-colors duration-200 hover:bg-dash-brandHi disabled:opacity-40"
        >
          <IconeCheck className="h-[15px] w-[15px]" />
          {salvando ? "Salvando…" : cadastrada ? "Substituir chave" : "Salvar chave"}
        </button>

        {cadastrada ? (
          confirmando ? (
            <>
              <span className="text-[12px] text-dash-muted">Remover a chave desta conta?</span>
              <button
                type="button"
                onClick={() => void remover()}
                disabled={salvando}
                className="rounded-[10px] border border-dash-bad/[0.35] px-3 py-2 text-[12px] text-dash-bad transition-colors duration-200 hover:bg-dash-bad/[0.10] disabled:opacity-50"
              >
                remover
              </button>
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                className="rounded-[10px] px-2 py-2 text-[12px] text-dash-muted transition-colors duration-200 hover:text-dash-fg"
              >
                cancelar
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              className="rounded-[10px] px-2 py-2 text-[12px] text-dash-muted underline underline-offset-2 transition-colors duration-200 hover:text-dash-fg"
            >
              remover
            </button>
          )
        ) : null}

        <a
          href={provedor.ondePegar}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-[11.5px] text-dash-dim transition-colors duration-200 hover:text-dash-fg"
        >
          onde pego a chave →
        </a>
      </div>

      {cadastrada ? (
        <p className="mt-3 text-[11px] text-dash-dim">
          cadastrada em {quando(chave?.criado_em || "")} · guardada cifrada, nunca exibida de volta
        </p>
      ) : null}
    </article>
  );
}

export default function ChavesCliente() {
  const [chaves, setChaves] = useState<ChaveNaTela[]>([]);
  const [provedores, setProvedores] = useState<Provedor[]>([]);
  /* ESCOPO (13/11/2026): o pessoal é o PADRÃO — o produto inteiro funciona sem
     organização nenhuma. Quem tem organização ganha o segundo escopo como
     escolha, não como substituto. O id "pessoal" é resolvido no servidor para
     `pessoal-<id>` — a tela não calcula escopo. */
  /* SEM seletor de organização (definição final do dono, 13/11/2026): a org se
     ativa pelo PEDIDO no chat, não por um botão na tela. Aqui a pessoa gerencia
     a chave do espaço DELA (o padrão) e vê, quando existirem, as chaves que
     moram em outros espaços que ela alcança. */
  const [outrosEspacos, setOutrosEspacos] = useState<{ escopo: EscopoNaTela; chaves: ChaveNaTela[] }[]>([]);
  const [escopoAtivo, setEscopoAtivo] = useState<string>("");
  /**
   * ONDE a chave será guardada NESTA gravação. Não é um "modo organização":
   * é a escolha da operação, feita no momento de salvar e esquecida depois —
   * o padrão é sempre o espaço pessoal. Só aparece quando a pessoa tem outro
   * espaço (a organização) para onde mandar a chave.
   */
  const [alvo, setAlvo] = useState<string>("");
  const [usuario, setUsuario] = useState<Usuario>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/byok/chaves", { cache: "no-store" });
      const d = (await r.json().catch(() => ({}))) as {
        chaves?: ChaveNaTela[];
        provedores?: Provedor[];
        outrosEspacos?: { escopo: EscopoNaTela; chaves: ChaveNaTela[] }[];
        escopo?: { id: string };
        erro?: string;
      };
      if (!r.ok) {
        setErro(d?.erro || "não consegui ler as chaves desta conta");
        return;
      }
      setChaves(Array.isArray(d.chaves) ? d.chaves : []);
      setProvedores(Array.isArray(d.provedores) ? d.provedores : []);
      setOutrosEspacos(Array.isArray(d.outrosEspacos) ? d.outrosEspacos : []);
      // O id REAL do escopo vem do servidor (pessoal-<id>): a tela só espelha.
      setEscopoAtivo(d.escopo?.id || "");
      setErro("");
    } catch {
      setErro("a conexão caiu antes da resposta chegar");
    } finally {
      setCarregando(false);
    }
  }, []);

  const carregarConta = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/me", { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { user?: Usuario };
      setUsuario(d?.user ?? null);
    } catch {
      /* a casca funciona sem a conta */
    }
  }, []);

  useEffect(() => {
    void carregar();
    void carregarConta();
  }, [carregar, carregarConta]);

  const emUso = chaves.find((c) => c.padrao);

  return (
    <Shell titulo="Chaves de API" usuario={usuario}>
      <div className="w-full max-w-[900px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12.5px] text-dash-muted">
            {carregando && !chaves.length
              ? "Lendo o cofre desta conta…"
              : emUso
                ? `O chat está usando a sua chave ${emUso.nome}${emUso.modelo ? ` · ${emUso.modelo}` : ""}`
                : "Nenhuma chave própria cadastrada — o chat usa a inteligência do app"}
          </p>
          <button
            type="button"
            onClick={() => void carregar()}
            disabled={carregando}
            className="rounded-[10px] px-3 py-1.5 text-[12px] text-dash-muted transition-colors duration-200 hover:bg-dash-hair/[0.05] hover:text-dash-fg disabled:opacity-50"
          >
            {carregando ? "Atualizando…" : "Atualizar"}
          </button>
        </div>

        {erro ? (
          <div className="mt-5 flex items-start gap-3 rounded-[16px] border border-dash-bad/[0.15] bg-dash-bad/[0.05] px-4 py-3.5">
            <IconeAlerta className="mt-[1px] h-4 w-4 shrink-0 text-dash-bad" />
            <p className="text-[12.5px] leading-[1.55] text-dash-muted">{erro}</p>
          </div>
        ) : null}

        {/* Escolha da OPERAÇÃO (não um modo): só existe quando há outro espaço.
            Sem isso, a chave da organização só poderia ser criada por API. */}
        {outrosEspacos.length ? (
          <div className="mt-5 flex flex-wrap items-center gap-2 text-[11.5px] text-dash-muted">
            <span>Guardar em</span>
            {[{ id: escopoAtivo || "pessoal", nome: "Meu espaço" }, ...outrosEspacos.map((b) => ({ id: b.escopo.id, nome: b.escopo.nome }))].map((e) => {
              const ativo = (alvo || escopoAtivo) === e.id;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setAlvo(e.id)}
                  className={`rounded-full border px-3 py-1 transition-colors ${
                    ativo
                      ? "border-dash-fg/[0.25] bg-dash-fg/[0.10] text-dash-fg"
                      : "border-dash-hair/[0.10] text-dash-muted hover:text-dash-fg"
                  }`}
                >
                  {e.nome}
                </button>
              );
            })}
          </div>
        ) : null}

        <section className="mt-6 grid gap-4">
          {provedores.map((p) => (
            <CartaoProvedor
              key={`${p.id}:${alvo || escopoAtivo}`}
              provedor={p}
              chave={chaves.find((c) => c.provider === p.id)}
              escopoId={alvo || escopoAtivo || "pessoal"}
              onAtualizar={carregar}
              onErro={setErro}
            />
          ))}
          {!provedores.length && carregando ? (
            <div className="rounded-[24px] border border-dash-hair/[0.08] bg-dash-card/[0.35] p-6">
              <div className="h-[13px] w-[38%] animate-pulse rounded-full bg-dash-hair/[0.07] motion-reduce:animate-none" />
              <div className="mt-3 h-[11px] w-[60%] animate-pulse rounded-full bg-dash-hair/[0.05] motion-reduce:animate-none" />
            </div>
          ) : null}
        </section>

        {/* Chaves que vivem em OUTRO espaço (a organização, quando for o caso).
            Aparecem com o nome do espaço, sem formulário: cadastrar ali é uma
            operação que se pede no chat ("na <organização>, usa esta chave"),
            porque é o PEDIDO que ativa o escopo da organização — não existe
            botão de "modo organização". */}
        {outrosEspacos.map((bloco) => (
          <section
            key={bloco.escopo.id}
            className="mt-4 rounded-[24px] border border-dash-hair/[0.08] bg-dash-card/[0.35] p-5"
          >
            <h2 className="text-[12.5px] font-semibold text-dash-fg">
              Chaves em {bloco.escopo.nome}
            </h2>
            <p className="mt-1 text-[11px] leading-[1.55] text-dash-muted">
              Este espaço é compartilhado com os membros de {bloco.escopo.nome}. Para cadastrar
              ou trocar uma chave aqui, escolha {bloco.escopo.nome} em “Guardar em” — ou peça no
              chat, citando o nome do espaço.
            </p>
            <ul className="mt-3 divide-y divide-dash-hair/[0.07]">
              {bloco.chaves.map((c) => (
                <li key={c.provider} className="flex items-center gap-3 py-2.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-dash-ok" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-dash-fg">
                    {c.nome} · {c.mascarada}
                  </span>
                  <span className="shrink-0 text-[11px] text-dash-dim">{c.modelo}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      await fetch(
                        `/api/byok/chaves?provider=${encodeURIComponent(c.provider)}&escopo=${encodeURIComponent(bloco.escopo.id)}`,
                        { method: "DELETE" },
                      );
                      await carregar();
                    }}
                    className="shrink-0 rounded-full px-2.5 py-1 text-[11px] text-dash-muted transition hover:text-dash-bad"
                  >
                    remover
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {/* A honestidade sobre o que muda: sem este texto, a pessoa cadastra a
            chave esperando continuar no Supernova e o modelo muda sem aviso. */}
        <p className="mt-6 max-w-[620px] text-[11.5px] leading-[1.6] text-dash-dim">
          Com uma chave cadastrada, o modelo do chat passa a ser o que está no campo
          “Modelo” dela — o seletor Supernova vale só para a inteligência do app. A
          chave é gravada cifrada e nunca é devolvida em claro por nenhuma rota.
        </p>
      </div>
    </Shell>
  );
}

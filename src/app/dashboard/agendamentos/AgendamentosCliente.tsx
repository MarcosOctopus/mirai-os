"use client";

/**
 * Agendamentos — o que o time faz sozinho, no estilo enxuto do Claude:
 * uma linha por agenda, frequência em português, próxima execução e o que
 * aconteceu na última. Nada de tabela pesada; a separação é um fio, não moldura.
 *
 * A lógica de dados é a MESMA de antes (/api/canais?agenda=1 e o POST
 * {foreman:'rodar-agenda'}); aqui só mudou a apresentação.
 */
import { useCallback, useEffect, useState } from "react";

import Shell from "@/components/dash/Shell";
import { IconeAlerta, IconeRaio, IconeRelogio } from "@/components/dash/icons";

type Run = {
  em: string;
  tarefas?: number;
  executadas?: number;
  recusadas?: number;
  duracao_ms?: number;
  chamadas?: number;
  bytes?: number;
  tokens?: number | null;
  parou_em_aprovacao?: boolean;
};

type Agenda = {
  id: string;
  nome: string;
  intervalo_min: number;
  ativa: boolean;
  proxima_em?: string | null;
  ultima_em?: string;
  tarefas: { acao: string }[];
  runs?: Run[];
};

type Usuario = { nome?: string; email?: string; ehDono?: boolean } | null;

function frequencia(min: number): string {
  if (!min) return "Só quando eu pedir";
  if (min === 60) return "A cada hora";
  if (min === 1440) return "Todo dia";
  if (min % 1440 === 0) return `A cada ${min / 1440} dias`;
  if (min % 60 === 0) return `A cada ${min / 60} horas`;
  return `A cada ${min} minutos`;
}

function quando(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return `${dia} às ${hora}`;
  } catch {
    return iso;
  }
}

function duracao(ms?: number): string | null {
  if (!ms || ms < 0) return null;
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

function tamanho(bytes?: number): string | null {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/* Uma pílula de leitura do último run. Fica muda (não é controle). */
function Dado({ children, tom = "neutro" }: { children: React.ReactNode; tom?: "neutro" | "alerta" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full bg-dash-raise/60 px-[9px] py-[3px] text-[11.5px] ${
        tom === "alerta" ? "text-dash-warn" : "text-dash-muted"
      }`}
    >
      {children}
    </span>
  );
}

function Esqueleto() {
  return (
    <div className="divide-y divide-dash-hair/[0.07]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-start justify-between gap-6 py-5">
          <div className="min-w-0 flex-1 animate-pulse motion-reduce:animate-none">
            <div className="h-[13px] w-[42%] rounded-full bg-dash-hair/[0.07]" />
            <div className="mt-2.5 h-[11px] w-[26%] rounded-full bg-dash-hair/[0.05]" />
            <div className="mt-3 flex gap-1.5">
              <div className="h-[18px] w-[54px] rounded-full bg-dash-hair/[0.04]" />
              <div className="h-[18px] w-[66px] rounded-full bg-dash-hair/[0.04]" />
            </div>
          </div>
          <div className="h-[11px] w-[108px] shrink-0 animate-pulse rounded-full bg-dash-hair/[0.05] motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

export default function AgendamentosCliente() {
  const [agendas, setAgendas] = useState<Agenda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [rodando, setRodando] = useState<string>("");
  const [usuario, setUsuario] = useState<Usuario>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await fetch("/api/canais?agenda=1", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) {
        setErro(d?.detail || d?.erro || "não consegui ler a lista de agendamentos");
        return;
      }
      setAgendas((d?.agendas || []) as Agenda[]);
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
      /* a casca funciona sem a conta; só perde o corte por papel no menu */
    }
  }, []);

  useEffect(() => {
    void carregar();
    void carregarConta();
  }, [carregar, carregarConta]);

  async function rodarAgora(id: string) {
    setRodando(id);
    setErro("");
    setAviso("");
    try {
      const r = await fetch("/api/canais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foreman: "rodar-agenda", agenda: id }),
      });
      const d = await r.json();
      if (!r.ok) {
        setErro(d?.detail || d?.erro || "a execução não foi aceita");
        return;
      }
      const run = d?.run as Run | undefined;
      setAviso(
        `Rodou agora: ${run?.executadas ?? 0} executada(s), ${run?.recusadas ?? 0} recusada(s), ${duracao(
          run?.duracao_ms,
        ) ?? "—"}.`,
      );
      await carregar();
    } catch {
      setErro("a conexão caiu antes de a execução começar");
    } finally {
      setRodando("");
    }
  }

  const ativas = agendas.filter((a) => a.ativa).length;
  const proxima = agendas
    .filter((a) => a.ativa && a.proxima_em)
    .map((a) => a.proxima_em as string)
    .sort()[0];

  return (
    <Shell titulo="Agendamentos" usuario={usuario}>
      <div className="w-full max-w-[900px]">
        {/* Linha de contexto — o título já vive no topo da casca, aqui fica só a leitura do conjunto. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12.5px] text-dash-muted">
            {carregando && agendas.length === 0
              ? "Lendo as agendas do time…"
              : erro && agendas.length === 0
                ? "A lista não chegou"
                : agendas.length === 0
                ? "Nenhuma agenda ainda"
                : `${agendas.length} ${agendas.length === 1 ? "agenda" : "agendas"} · ${ativas} ativa${
                    ativas === 1 ? "" : "s"
                  }${proxima ? ` · a próxima às ${quando(proxima).split(" às ")[1]}` : ""}`}
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

        {aviso ? (
          <p
            role="status"
            className="mt-4 flex items-start gap-2 text-[12px] leading-[1.55] text-dash-muted"
          >
            <span className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-dash-ok" aria-hidden />
            {aviso}
          </p>
        ) : null}

        {erro ? (
          <div className="mt-6 flex items-start gap-3 rounded-[16px] border border-dash-bad/[0.15] bg-dash-bad/[0.05] px-4 py-3.5">
            <IconeAlerta className="mt-[1px] h-4 w-4 shrink-0 text-dash-bad" />
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-dash-fg">Não consegui carregar os agendamentos</p>
              <p className="mt-1 text-[12px] leading-[1.55] text-dash-muted">{erro}. </p>
              <button
                type="button"
                onClick={() => void carregar()}
                className="mt-2.5 rounded-[10px] border border-dash-hair/[0.15] px-3 py-[6px] text-[12px] text-dash-fg transition-colors duration-200 hover:border-dash-brand/40"
              >
                Tentar de novo
              </button>
            </div>
          </div>
        ) : null}

        <section className="mt-7">
          {erro && agendas.length === 0 ? null : carregando && agendas.length === 0 ? (
            <Esqueleto />
          ) : agendas.length === 0 ? (
            <div className="flex flex-col items-start gap-3 py-14">
              <IconeRelogio className="h-6 w-6 text-dash-dim" />
              <p className="text-[15px] font-medium text-dash-fg">Nada agendado ainda.</p>
              <p className="max-w-[440px] text-[13px] leading-[1.65] text-dash-muted">
                Peça no chat — “toda segunda às 9h, organiza minhas notas” — e a agenda aparece aqui,
                com a próxima execução e o rastro de cada rodada.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-dash-hair/[0.07]">
              {agendas.map((a) => {
                const ultimo = a.runs && a.runs.length ? a.runs[a.runs.length - 1] : undefined;
                const dur = duracao(ultimo?.duracao_ms);
                const tam = tamanho(ultimo?.bytes);
                const recusadas = ultimo?.recusadas ?? 0;
                return (
                  <li
                    key={a.id}
                    className="group flex flex-col gap-4 py-5 transition-colors duration-200 hover:bg-dash-hair/[0.02] lg:flex-row lg:items-start lg:gap-8 lg:px-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                            a.ativa ? "bg-dash-ok" : "bg-dash-dim"
                          }`}
                          aria-hidden
                        />
                        <p className="truncate text-[14.5px] font-medium text-dash-fg" title={a.nome}>
                          {a.nome}
                        </p>
                        {!a.ativa ? (
                          <span className="shrink-0 text-[11.5px] text-dash-muted">pausada</span>
                        ) : null}
                      </div>

                      <p className="mt-1.5 pl-[16px] text-[12px] text-dash-muted">
                        {frequencia(a.intervalo_min)} · {a.tarefas?.length || 0}{" "}
                        {a.tarefas?.length === 1 ? "tarefa" : "tarefas"}
                      </p>

                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pl-[16px]">
                        {ultimo ? (
                          <>
                            <Dado>
                              {ultimo.executadas ?? 0}{" "}
                              {(ultimo.executadas ?? 0) === 1 ? "executada" : "executadas"}
                            </Dado>
                            <Dado tom={recusadas > 0 ? "alerta" : "neutro"}>
                              {recusadas} {recusadas === 1 ? "recusada" : "recusadas"}
                            </Dado>
                            {dur ? <Dado>{dur}</Dado> : null}
                            {tam ? <Dado>{tam}</Dado> : null}
                            {ultimo.tokens ? <Dado>{ultimo.tokens} tokens</Dado> : null}
                            {ultimo.parou_em_aprovacao ? <Dado tom="alerta">parou em aprovação</Dado> : null}
                          </>
                        ) : (
                          <Dado>ainda não rodou</Dado>
                        )}
                      </div>
                    </div>

                    <div className="flex items-end justify-between gap-6 pl-[16px] lg:w-[300px] lg:shrink-0 lg:flex-col lg:items-end lg:gap-2.5 lg:pl-0">
                      <div className="text-left lg:text-right">
                        <p className="text-[12px] text-dash-muted">
                          {a.ativa ? `Próxima ${quando(a.proxima_em)}` : "Fora do ar"}
                        </p>
                        <p className="mt-1 text-[11.5px] text-dash-muted">
                          Última {quando(ultimo?.em || a.ultima_em)}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => void rodarAgora(a.id)}
                        disabled={rodando === a.id}
                        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-dash-hair/[0.12] px-3 py-[6px] text-[12px] text-dash-muted transition-all duration-200 hover:border-dash-brand/40 hover:text-dash-fg focus-visible:opacity-100 disabled:opacity-60 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 max-lg:opacity-100"
                      >
                        <IconeRaio className="h-3.5 w-3.5" />
                        {rodando === a.id ? "Rodando…" : "Rodar agora"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Shell>
  );
}
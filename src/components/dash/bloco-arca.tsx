"use client";

/* ── ARCA — o painel de conexão da conta (17/11/2026) ────────────────────────
 *
 * ESPECIFICAÇÃO (dono, 17/11/2026): no Synapse a Arca fica SEMPRE HABILITADA.
 * Não existe passo de "conectar" nem callback. Ao carregar o cartão, o próprio
 * servidor usa o E-MAIL DA SESSÃO e chama a Arca no endpoint de serviço
 * (`POST /org/token-servico`, idempotente), guarda o token cifrado no cofre
 * desta pessoa e devolve o token para o painel exibir.
 *
 * ORGANIZAÇÃO VISUAL (dono, 17/11/2026 — segunda rodada): UM CONTAINER SÓ.
 * Antes havia um cartão do bloco e, dentro dele, outra caixa com organização,
 * URL e token ("caixa dentro da caixa"). Agora o bloco é UMA seção plana dentro
 * do cartão do popup — sem moldura própria, sem caixa aninhada — e o conteúdo
 * fica em LINHAS alinhadas de rótulo + valor, separadas por fio. Nenhuma ação,
 * texto de ação, campo ou rota foi removida nesta mudança: só a diagramação.
 *
 * O que este painel mostra:
 *   (a) a URL do MCP            — https://arca.miraitohope.com/mcp
 *   (b) o token da organização  — já visível, com botão de copiar
 *   (c) revogar                 — DELETE na Arca (?email=) + cofre esquecido
 *
 * Regras: nada de token em log; falha é dita em português com o que NÃO mudou;
 * depois de revogar, a emissão de um novo token é explícita (sem recarregar a
 * página) — nada de token fantasma na tela.
 */

import { useCallback, useEffect, useState } from "react";

const URL_MCP = "https://arca.miraitohope.com/mcp";

/* Ícones de traço, no padrão da casa (stroke 1.6, 24x24, currentColor). */
function Svg({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-[15px] w-[15px] shrink-0"}
      aria-hidden
    >
      {children}
    </svg>
  );
}

const IconeCopiar = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M15 5.5A2.5 2.5 0 0 0 12.5 3H6.5A2.5 2.5 0 0 0 4 5.5v6A2.5 2.5 0 0 0 6.5 14" />
  </Svg>
);

const IconeSair = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M14 4.5h3.5A2.5 2.5 0 0 1 20 7v10a2.5 2.5 0 0 1-2.5 2.5H14" />
    <path d="M10 8.5 6.5 12l3.5 3.5" />
    <path d="M6.5 12H15" />
  </Svg>
);

const IconeCadeado = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="3" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </Svg>
);

const IconeRaio = ({ className }: { className?: string }) => (
  <Svg className={className}>
    <path d="M13 3 5.5 13.5H11l-1 7.5L18.5 10H13z" />
  </Svg>
);

type Estado = {
  servico_configurado: boolean;
  conectado: boolean;
  org: string | null;
  usuario: string | null;
  criado_em: string | null;
  conectado_em: string | null;
  impressao: string | null;
  token?: string | null;
  url_mcp?: string;
  mensagem?: string;
  erro?: string;
};

function quando(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* LINHA de leitura: rótulo à esquerda, valor ao centro, copiar à direita.
   A URL e o token usam o mesmo desenho — é o que dá o alinhamento do painel.
   Em telas estreitas a linha empilha (rótulo, valor, copiar) sem sair do eixo. */
function Linha({
  rotulo,
  valor,
  aoCopiar,
  copiado,
}: {
  rotulo: string;
  valor: string;
  aoCopiar: () => void;
  copiado: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-1.5 px-1 py-3 sm:grid-cols-[150px_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
      <span className="text-[10.5px] uppercase leading-[1.4] tracking-[0.14em] text-dash-muted">
        {rotulo}
      </span>
      <p className="min-w-0 select-all break-all font-mono text-[12px] leading-[1.5] tracking-[0.02em] text-dash-fg">
        {valor}
      </p>
      <button
        onClick={aoCopiar}
        className="inline-flex w-fit items-center gap-1.5 rounded-[10px] border border-dash-hair/[0.20] px-2.5 py-1 text-[11px] text-dash-fg/80 transition hover:border-dash-brand/40 hover:text-dash-fg sm:justify-self-end"
        aria-label={`Copiar ${rotulo.toLowerCase()}`}
      >
        <IconeCopiar className="h-[13px] w-[13px]" />
        {copiado ? "copiado" : "copiar"}
      </button>
    </div>
  );
}

export default function BlocoArca({ onMudou }: { onMudou?: () => void }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [lendo, setLendo] = useState(true);
  const [ocupado, setOcupado] = useState<"" | "gerar" | "revogar">("");
  const [erro, setErro] = useState("");
  const [recado, setRecado] = useState("");
  const [copiado, setCopiado] = useState<"" | "url" | "token">("");
  const [confirmando, setConfirmando] = useState(false);

  /* O provisionamento é do SERVIDOR: abrir o cartão já emite (ou relê) o token
     idempotente da organização desta pessoa. */
  const carregar = useCallback(async () => {
    setErro("");
    try {
      const r = await fetch("/api/integracoes/arca", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = (await r.json()) as Estado;
      setEstado(d);
      setToken(d.token ?? null);
      if (d.mensagem && !d.conectado) setErro(d.mensagem);
    } catch {
      setErro("não consegui falar com a Arca agora — recarregue a tela em instantes.");
    } finally {
      setLendo(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /* Revogar: NA ARCA primeiro (DELETE ?email=), depois o cofre esquece. Se a
     Arca não confirmar, a tela continua dizendo que está conectada — porque
     está. */
  async function revogar() {
    setErro("");
    setRecado("");
    setOcupado("revogar");
    try {
      const r = await fetch("/api/integracoes/arca/desconectar", { method: "POST" });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; mensagem?: string };
      if (!r.ok || !d.ok) {
        setErro(d.mensagem || "a Arca não confirmou a revogação agora.");
        return;
      }
      setToken(null);
      setConfirmando(false);
      setEstado((e) => (e ? { ...e, conectado: false, token: null } : e));
      setRecado(
        "Token revogado na Arca. Nada mais usa este acesso — se quiser voltar a usar agora, gere um novo (o antigo não revive).",
      );
      onMudou?.();
    } catch {
      setErro("a conexão caiu antes de terminar. Nada foi alterado.");
    } finally {
      setOcupado("");
    }
  }

  /* Emissão explícita de um novo token (depois de revogar, sem recarregar). */
  async function gerar() {
    setErro("");
    setRecado("");
    setOcupado("gerar");
    try {
      const r = await fetch("/api/integracoes/arca/conectar", { method: "POST" });
      const d = (await r.json().catch(() => ({}))) as Estado & { ok?: boolean; mensagem?: string };
      if (!r.ok || !d.ok) {
        setErro(d.mensagem || "não foi possível emitir um novo token agora.");
        return;
      }
      setEstado(d);
      setToken(d.token ?? null);
      setRecado(`Novo token emitido${d.org ? ` para ${d.org}` : ""} e guardado nesta conta.`);
      onMudou?.();
    } catch {
      setErro("a conexão caiu antes de terminar. Nada foi alterado.");
    } finally {
      setOcupado("");
    }
  }

  async function copiar(o: "url" | "token") {
    const valor = o === "url" ? (estado?.url_mcp || URL_MCP) : token;
    if (!valor) return;
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(o);
      window.setTimeout(() => setCopiado(""), 1800);
    } catch {
      setErro("o navegador bloqueou a área de transferência — o texto está selecionável, copie à mão.");
    }
  }

  const disponivel = estado ? estado.servico_configurado : true;
  const temToken = Boolean(token);

  /* UM CONTAINER SÓ: seção plana dentro do cartão do popup (mesmo desenho do
     bloco de contas de e-mail). Nada de moldura própria, nada de caixa dentro
     de caixa — o conteúdo é que organiza a leitura, em linhas. */
  return (
    <section className="mt-6 border-t border-dash-hair/[0.12] pt-5">
      {/* CABEÇALHO: a Arca já nasce habilitada — o chip diz o que é FATO agora */}
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="inline-flex items-center gap-2 rounded-full bg-dash-hair/[0.10] px-3 py-[5px] text-[11px] text-dash-fg/85">
          <span className={`h-1.5 w-1.5 rounded-full ${temToken ? "bg-dash-ok" : "bg-dash-muted"}`} />
          {lendo ? "lendo…" : temToken ? "conectada" : "sem token agora"}
        </span>
        {estado?.org && (
          <span className="rounded-full bg-dash-brand/[0.14] px-3 py-[5px] text-[11px] text-dash-brandHi">
            organização {estado.org}
          </span>
        )}
        {!disponivel && (
          <span className="rounded-full bg-[#ff2d55]/[0.16] px-3 py-[5px] text-[11px] text-dash-bad">
            indisponível neste ambiente
          </span>
        )}
      </div>

      <p className="mt-3 text-[12.5px] leading-[1.6] text-dash-fg/70">
        A Arca já está habilitada nesta conta: o token da organização foi emitido pela sua sessão Mirai, sem
        segundo login e sem colar nada. Ele serve para usar o acervo fora do MIRAI OS — no editor, no terminal ou
        em qualquer agente.
      </p>

      {erro && (
        <p className="mt-3 rounded-[10px] border border-[#ff2d55]/30 bg-[#ff2d55]/[0.07] px-3.5 py-2.5 text-[12px] text-[#ff2d55]">
          {erro}
        </p>
      )}
      {recado && (
        <p className="mt-3 rounded-[10px] border border-dash-brand/30 bg-dash-brand/[0.07] px-3.5 py-2.5 text-[12px] text-dash-brandHi">
          {recado}
        </p>
      )}

      {/* TÍTULO DO PAINEL — dentro do mesmo container, sem moldura em volta */}
      <div className="mt-5 flex items-center gap-2">
        <IconeCadeado className="h-[14px] w-[14px] text-dash-muted" />
        <p className="text-[12.5px] font-medium text-dash-fg">usar em qualquer ambiente</p>
      </div>
      <p className="mt-1 text-[11.5px] leading-[1.5] text-dash-muted">
        Servidor MCP da Arca. Cole a URL e o token onde o agente pede — o acervo é o da sua organização.
      </p>

      {/* LINHAS: rótulo + valor + copiar, separadas por fio (sem caixa) */}
      <div className="mt-3 divide-y divide-dash-hair/[0.10] border-y border-dash-hair/[0.10]">
        <Linha
          rotulo="URL do MCP"
          valor={estado?.url_mcp || URL_MCP}
          aoCopiar={() => void copiar("url")}
          copiado={copiado === "url"}
        />
        <Linha
          rotulo="Token da sua organização"
          valor={
            token ??
            (lendo
              ? "emitindo o token desta conta…"
              : estado?.impressao
                ? `${estado.impressao} — revogado, gere um novo abaixo`
                : "—")
          }
          aoCopiar={() => void copiar("token")}
          copiado={copiado === "token"}
        />
      </div>

      <p className="mt-3 text-[11px] leading-[1.5] text-dash-dim">
        {estado?.usuario ? `Reconhecido como ${estado.usuario}` : "Reconhecido pela sessão desta conta"} · emitido
        em {quando(estado?.criado_em)}. Este token é só desta conta: quem entra com outro login na Mirai recebe o
        token da própria organização.
      </p>

      {/* AÇÕES — revogar em dois passos; depois de revogar, gerar é explícito */}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        {!temToken && !lendo && disponivel && (
          <button
            onClick={gerar}
            disabled={ocupado !== ""}
            className="inline-flex items-center gap-2 rounded-[10px] bg-dash-brand px-4 py-2 text-[11.5px] font-semibold text-dash-fg transition hover:bg-[#ff8f4d] disabled:opacity-40"
          >
            <IconeRaio className="h-[13px] w-[13px]" />
            {ocupado === "gerar" ? "emitindo…" : "gerar novo token"}
          </button>
        )}

        {confirmando ? (
          <>
            <button
              onClick={() => setConfirmando(false)}
              className="rounded-[10px] border border-dash-hair/[0.20] px-3.5 py-2 text-[11.5px] text-dash-fg/75 transition hover:text-dash-fg"
            >
              cancelar
            </button>
            <button
              onClick={revogar}
              disabled={ocupado !== ""}
              className="rounded-[10px] bg-[#ff2d55] px-3.5 py-2 text-[11.5px] font-semibold text-white transition hover:bg-[#e02449] disabled:opacity-40"
            >
              {ocupado === "revogar" ? "revogando…" : "confirmar revogação"}
            </button>
          </>
        ) : (
          <button
            onClick={() => setConfirmando(true)}
            disabled={!temToken || ocupado !== ""}
            className="inline-flex items-center gap-2 rounded-[10px] border border-[#ff2d55]/35 px-3.5 py-2 text-[11.5px] text-[#ff2d55] transition hover:bg-[#ff2d55]/[0.08] disabled:opacity-40"
          >
            <IconeSair className="h-[13px] w-[13px]" />
            revogar token
          </button>
        )}
      </div>
    </section>
  );
}

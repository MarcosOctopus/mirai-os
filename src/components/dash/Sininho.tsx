"use client";

/**
 * SININHO DE AVISOS — o sino do topo era um `<span>` morto (só enfeite).
 *
 * O QUE ELE DIZ: "alguém compartilhou uma pasta com você". A verdade vem da ARCA
 * (`recebidos`), o "já vi" vem do banco do app (`lib/avisos.ts`), e o nome/foto de
 * quem compartilhou vêm da conta. Nada de feed genérico: é um aviso por pasta
 * concedida, com PORTA DE ENTRADA — clicar leva DIRETO na pasta, dentro da Arca
 * (`?recebido=<org>/<pasta>`), e marca como visto.
 *
 * SEM SESSÃO ele fica mudo (não inventa contagem). É o mesmo idioma do menu da
 * conta ao lado: bolinha de 34px, painel `dash-card` com raio 16, fecha ao clicar
 * fora e no Esc.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { IconeSino } from "./icons";

type Aviso = {
  org: string;
  alvo: string;
  de?: string | null;
  foto?: string | null;
  nome?: string | null;
  nivel?: string;
  quando?: string | null;
  novo?: boolean;
};

function desde(iso?: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 2592000) return `há ${Math.floor(s / 86400)} d`;
  return new Date(t).toLocaleDateString("pt-BR");
}

export function Sininho() {
  const [aberto, setAberto] = useState(false);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [pronto, setPronto] = useState(false);
  const caixa = useRef<HTMLDivElement | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/acervo?acao=avisos", { cache: "no-store" });
      if (!r.ok) return; // sem sessão: fica mudo, sem contagem inventada
      const d = (await r.json()) as { avisos?: Aviso[] };
      if (Array.isArray(d.avisos)) setAvisos(d.avisos);
    } catch {
      /* rede caiu: sininho silencioso */
    } finally {
      setPronto(true);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const novos = avisos.filter((a) => a.novo).length;

  const abrirPasta = async (a: Aviso) => {
    setAvisos((antes) => antes.map((x) => (x.org === a.org && x.alvo === a.alvo ? { ...x, novo: false } : x)));
    await fetch("/api/acervo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "visto", org: a.org, alvo: a.alvo }),
    }).catch(() => {});
    window.location.href = `/dashboard/arca?recebido=${encodeURIComponent(`${a.org}/${a.alvo}`)}`;
  };

  const marcarTudo = async () => {
    setAvisos((antes) => antes.map((x) => ({ ...x, novo: false })));
    await fetch("/api/acervo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "visto-tudo" }),
    }).catch(() => {});
  };

  return (
    <span className="relative" ref={caixa}>
      <button
        type="button"
        aria-label={novos ? `Avisos: ${novos} novo(s)` : "Avisos"}
        title={novos ? `${novos} pasta(s) compartilhada(s) com você` : "avisos"}
        data-arca-sininho="sim"
        onClick={() => {
          setAberto((v) => !v);
          if (!aberto) void carregar();
        }}
        className={
          "relative grid h-[34px] w-[34px] place-items-center rounded-full bg-dash-side transition " +
          (aberto ? "text-dash-fg" : "text-dash-muted hover:text-dash-fg")
        }
      >
        <IconeSino />
        {novos > 0 && (
          <span
            data-arca-sininho-badge={novos}
            className="absolute -right-[3px] -top-[3px] grid h-[16px] min-w-[16px] place-items-center rounded-full bg-dash-brand px-[4px] text-[9.5px] font-semibold leading-none text-white"
          >
            {novos > 9 ? "9+" : novos}
          </span>
        )}
      </button>

      {aberto && (
        <div
          data-arca-sininho-painel="sim"
          className="absolute right-0 top-[calc(100%+10px)] z-50 w-[min(92vw,330px)] rounded-[16px] border border-dash-line bg-dash-card p-1.5 shadow-2xl"
        >
          <div className="flex items-center justify-between px-2.5 pb-1 pt-1.5">
            <p className="text-[10px] uppercase tracking-[0.16em] text-dash-muted">avisos</p>
            {novos > 0 && (
              <button
                type="button"
                onClick={() => void marcarTudo()}
                className="text-[10.5px] text-dash-muted transition hover:text-dash-fg"
              >
                marcar tudo como visto
              </button>
            )}
          </div>

          {!pronto && <p className="px-2.5 py-3 text-[12px] text-dash-muted">abrindo…</p>}
          {pronto && avisos.length === 0 && (
            <p className="px-2.5 py-3 text-[12px] leading-snug text-dash-muted">
              nada por aqui. quando alguém compartilhar uma pasta com você, avisa aqui.
            </p>
          )}

          {avisos.map((a) => (
            <button
              key={`${a.org}|${a.alvo}`}
              type="button"
              onClick={() => void abrirPasta(a)}
              data-aviso={`${a.org}/${a.alvo}`}
              data-aviso-novo={a.novo ? "sim" : "nao"}
              className="flex w-full items-start gap-2.5 rounded-[11px] px-2.5 py-2 text-left transition hover:bg-white/[0.04]"
            >
              {a.foto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.foto} alt="" className="mt-0.5 h-6 w-6 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-dash-raise text-[10.5px] font-semibold text-dash-muted">
                  {(a.nome || a.de || "?").trim().charAt(0).toUpperCase()}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-dash-fg">
                  <span className="font-medium">{a.nome || a.de || "alguém"}</span> compartilhou{" "}
                  <span className="font-medium">{a.alvo}</span> com você
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-dash-muted">
                  <span>{a.nivel || "ver"}</span>
                  {a.quando && <span>· {desde(a.quando)}</span>}
                </span>
              </span>
              {a.novo && <span className="mt-2 h-[7px] w-[7px] shrink-0 rounded-full bg-dash-brand" />}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

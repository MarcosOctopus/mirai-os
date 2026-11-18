"use client";

/**
 * CARTÃO DE FONTE — a peça da aba Fontes (e da Synapse) na forma que o dono aprovou
 * (18/11/2026): *"algo nessa linha só que mais organizado e com as logos originais em branco ou
 * laranja"*.
 *
 * REGRAS QUE ESTE ARQUIVO CUMPRE (skills de design da casa):
 *  - logo é ARQUIVO OFICIAL da marca (`public/integracoes/`), nunca ícone improvisado nem emoji;
 *  - a marca colorida é pintada de BRANCO por FILTRO (`brightness(0) invert(1)`) — o arquivo
 *    original fica intacto e a volta é uma linha; o LARANJA da marca fica na ação e no estado;
 *  - `object-contain` + `max-w-none` + `self-start` no <img>: sem isto, contêiner flex em coluna
 *    ESTICA o logo e ele sai "amassado" (pitfall medido na skill);
 *  - alinhamento por NÚMERO: todo texto do cartão começa no mesmo left (o do nome), porque a
 *    logo e o bloco de texto são irmãos de um `flex` com o mesmo `gap`.
 */

import type { ReactNode } from "react";

export type Acao = {
  rotulo: string;
  href?: string;
  onClick?: () => void;
  principal?: boolean;
  desabilitado?: boolean;
  titulo?: string;
  dataAttr?: string;
};

export type Numero = { valor: number | string; rotulo: string };

export default function FonteDriveCard({
  logo,
  alt,
  nome,
  chip,
  tom = "neutro",
  linha1,
  acoes = [],
  numeros = [],
  rodape,
  nota,
  children,
}: {
  logo: string;
  alt: string;
  nome: string;
  chip?: string;
  tom?: "ok" | "espera" | "neutro";
  linha1?: string;
  acoes?: Acao[];
  numeros?: Numero[];
  rodape?: { esquerda?: string; direita?: string };
  nota?: string;
  children?: ReactNode;
}) {
  const corChip =
    tom === "ok"
      ? "text-dash-ok"
      : tom === "espera"
        ? "text-dash-fg/55"
        : "text-dash-fg/55";
  const bolinha =
    tom === "ok" ? "bg-dash-ok" : tom === "espera" ? "bg-dash-brandHi" : "bg-dash-hair";

  return (
    <section className="mt-4 rounded-[14px] bg-dash-hair/[0.06] px-4 py-3.5">
      {/* linha 1 — marca + nome + estado (e as ações à direita, sempre no mesmo lugar) */}
      <div className="flex items-start gap-3">
        <img
          src={logo}
          alt={alt}
          className="mt-[1px] h-5 w-5 shrink-0 self-start object-contain"
          style={{ filter: "brightness(0) invert(1)" }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
          }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <p className="text-[12.5px] font-medium text-dash-fg">{nome}</p>
            {chip ? (
              <span className="flex items-center gap-1.5 text-[10.5px] text-dash-fg/60">
                <span className={`h-1.5 w-1.5 rounded-full ${bolinha}`} aria-hidden />
                <span className={corChip}>{chip}</span>
              </span>
            ) : null}
            {!!acoes.length && (
              <span className="ml-auto flex flex-wrap items-center gap-2">
                {acoes.map((a) =>
                  a.href ? (
                    <a
                      key={a.rotulo}
                      href={a.href}
                      data-attr={a.dataAttr}
                      className={
                        "rounded-[10px] px-3 py-2 text-[11.5px] transition " +
                        (a.principal
                          ? "border border-dash-brand bg-dash-brand text-white hover:bg-dash-brandHi"
                          : "border border-dash-hair/[0.20] text-dash-fg/85 hover:border-dash-brand/40 hover:text-dash-fg")
                      }
                    >
                      {a.rotulo}
                    </a>
                  ) : (
                    <button
                      key={a.rotulo}
                      type="button"
                      data-attr={a.dataAttr}
                      title={a.titulo}
                      onClick={a.onClick}
                      disabled={a.desabilitado}
                      className={
                        "rounded-[10px] px-3 py-2 text-[11.5px] transition disabled:opacity-45 " +
                        (a.principal
                          ? "border border-dash-brand bg-dash-brand text-white hover:bg-dash-brandHi"
                          : "border border-dash-hair/[0.20] text-dash-fg/85 hover:border-dash-brand/40 hover:text-dash-fg")
                      }
                    >
                      {a.rotulo}
                    </button>
                  ),
                )}
              </span>
            )}
          </div>

          {linha1 ? <p className="mt-1 truncate text-[11px] text-dash-fg/50">{linha1}</p> : null}

          {!!numeros.length && (
            <div className="mt-2.5 flex flex-wrap items-baseline gap-x-5 gap-y-1">
              {numeros.map((n, i) => (
                <span key={n.rotulo} className="flex items-baseline gap-1.5">
                  <span
                    className={
                      (i === 0
                        ? "text-[16px] leading-none text-dash-fg"
                        : "text-[12.5px] leading-none text-dash-fg/75") + " tabular-nums"
                    }
                  >
                    {n.valor}
                  </span>
                  <span className="text-[10.5px] text-dash-fg/45">{n.rotulo}</span>
                </span>
              ))}
            </div>
          )}

          {children}

          {nota ? <p className="mt-2 text-[10.5px] leading-[1.5] text-dash-fg/40">{nota}</p> : null}

          {rodape && (rodape.esquerda || rodape.direita) ? (
            <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-2 border-t border-dash-hair/[0.12] pt-2.5">
              <span className="text-[10.5px] text-dash-fg/45">{rodape.esquerda || ""}</span>
              <span className="text-[10.5px] text-dash-fg/45">{rodape.direita || ""}</span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

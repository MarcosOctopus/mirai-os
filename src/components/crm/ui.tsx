"use client";

/**
 * Peças do desenho do CRM (26/11/2026) — tokens do sistema "Mirai" que o dono
 * desenhou no Claude, para as três telas ficarem idênticas entre si:
 *
 *   fundo da página #000 · painel #0A0A0A · superfície #111 · aresta #333
 *   texto #F9F9F9 · apoio #A7A7A7 · apagado #646464 · marca #E85002
 *   positivo #34D399 · informação #60A5FA · negativo #F87171
 *   rótulo: JetBrains Mono 11px, maiúsculo, tracking .14em
 *   título: Unbounded 40px, peso 500, tracking -0.02em
 *   corpo: Poppins 15/16px · raio: 24 painel, 14 controle, 10 item, 999 pílula
 */

import type { ReactNode } from "react";

export const MONO = "'JetBrains Mono', ui-monospace, monospace";
export const TITULO = "'Unbounded', Poppins, system-ui, sans-serif";
export const CORPO = "Poppins, system-ui, sans-serif";

export const CAMPO =
  "h-12 w-full rounded-[14px] border border-[#333] bg-black px-3.5 text-[14px] text-[#F9F9F9] outline-none placeholder:text-[#646464] focus:border-[#E85002]";

export const BOTAO_MARCA =
  "inline-flex h-12 items-center gap-2.5 rounded-[14px] bg-[#E85002] px-5 text-[15px] font-semibold text-black transition hover:brightness-110 disabled:opacity-50";

export const BOTAO_CONTORNO =
  "inline-flex h-11 items-center gap-2 rounded-[14px] border border-[#333] bg-transparent px-4 text-[14px] text-[#F9F9F9] transition hover:border-[#646464]";

/** Rótulo mono do desenho. */
export function Rotulo({ children, cor = "#A7A7A7" }: { children: ReactNode; cor?: string }) {
  return (
    <span
      style={{ fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em", color: cor }}
      className="uppercase"
    >
      {children}
    </span>
  );
}

/** Filete de abertura: quadrado da marca + "02 — CRM". */
export function Filete({ texto }: { texto: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="h-2 w-2 bg-[#E85002]" />
      <span style={{ fontFamily: MONO, fontSize: 13, letterSpacing: "0.14em", color: "#E85002" }}>
        {texto}
      </span>
    </div>
  );
}

/** Título grande da tela. */
export function Titulo({ children }: { children: ReactNode }) {
  return (
    <h1
      style={{ fontFamily: TITULO, fontSize: 40, fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.1 }}
      className="m-0 text-[#F9F9F9]"
    >
      {children}
    </h1>
  );
}

/** Apoio logo abaixo do título. */
export function Apoio({ children }: { children: ReactNode }) {
  return (
    <p style={{ fontFamily: CORPO, fontSize: 16, lineHeight: 1.5 }} className="m-0 max-w-[680px] text-[#A7A7A7]">
      {children}
    </p>
  );
}

/** Painel de vidro do desenho. */
export function Painel({
  children,
  className = "",
  fundo = "#0A0A0A",
}: {
  children: ReactNode;
  className?: string;
  fundo?: string;
}) {
  return (
    <section
      className={`rounded-[24px] border border-[#333] ${className}`}
      style={{ background: fundo }}
    >
      {children}
    </section>
  );
}

/** Pílula de estado (gateway, papel, aviso). */
export function Pilula({
  children,
  cor = "#A7A7A7",
  tracejada = false,
  ponto,
}: {
  children: ReactNode;
  cor?: string;
  tracejada?: boolean;
  ponto?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-[3px] ${tracejada ? "border-dashed" : ""}`}
      style={{ borderColor: tracejada ? "#646464" : "#333", color: cor, fontFamily: MONO, fontSize: 11, letterSpacing: "0.14em" }}
    >
      {ponto ? <span className="h-1.5 w-1.5 rounded-full" style={{ background: ponto }} /> : null}
      {children}
    </span>
  );
}

/** Número grande (valores de KPI). */
export function Numero({ children, cor = "#F9F9F9" }: { children: ReactNode; cor?: string }) {
  return (
    <span style={{ fontFamily: TITULO, fontSize: 30, fontWeight: 500, letterSpacing: "-0.02em", color: cor }}>
      {children}
    </span>
  );
}

/** Abas/pílulas de filtro (segmentado em fundo preto). */
export function Segmentado({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-[14px] border border-[#333] bg-black p-1">
      {children}
    </div>
  );
}

export function SegmentadoItem({
  ativo,
  children,
  contagem,
  onClick,
}: {
  ativo: boolean;
  children: ReactNode;
  contagem?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-9 items-center gap-2 rounded-[10px] px-3.5 text-[14px] transition"
      style={{
        background: ativo ? "#E85002" : "transparent",
        color: ativo ? "#000" : "#A7A7A7",
        fontWeight: ativo ? 600 : 400,
      }}
    >
      {children}
      {contagem !== undefined ? (
        <span style={{ fontFamily: MONO, fontSize: 11, color: ativo ? "#000" : "#646464" }}>{contagem}</span>
      ) : null}
    </button>
  );
}

export function dinheiro(centavos: number, moeda = "BRL") {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: moeda,
    maximumFractionDigits: 2,
  });
}
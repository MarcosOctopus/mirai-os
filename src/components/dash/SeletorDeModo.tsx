"use client";

/**
 * SELETOR DE MODO — FORA DA TELA (dono, 19/11/2026).
 *
 *   "deixa esses dois invocáveis como skill e coloca aqui os supernovas"
 *
 * O dropdown de modo saiu da linha da caixa de escrever; no lugar dele ficou o
 * seletor do SUPER NOVA. Os dois modos de pesquisa continuam existindo e
 * funcionando — deixaram de ser um botão e passaram a ser invocação:
 *
 *   · o servidor escala o modo pelo TEXTO do pedido (`modoDaMensagem`), e agora
 *     também pelo NOME ("chama o observador", "usa o Sr. Xi");
 *   · cada modo chama a ferramenta dele (`fontes_curadas`, `pesquisar_a_fundo`).
 *
 * O componente ficou aqui de propósito: se o dono quiser o botão de volta, é
 * uma linha na `CaixaDeEntrada`. Nada importa este arquivo hoje.
 */

/**
 * SELETOR DE MODO — o dropdown ao lado do microfone.
 *
 * ─── Por que ele existe (dono, 14/10/2026, verbatim) ─────────────────────────
 *
 *   "um dropdown com icone... Ali do lado do icone de microfone de dictar no
 *    chat. Sempre deixa a base como leve de inicio."
 *
 * ─── As duas decisões de desenho que importam ────────────────────────────────
 *
 * 1. O modo ATIVO fica VISÍVEL fora do menu. Um seletor que só mostra o estado
 *    quando aberto faz o cliente achar que está no leve enquanto a Mirai
 *    pesquisa — e a espera vira defeito aos olhos dele. Por isso o botão muda
 *    de cor quando não é leve.
 *
 * 2. O menu abre PARA CIMA. Ele vive na base da tela, dentro do composer: abrir
 *    para baixo sairia da tela.
 *
 * O ícone é o do modo, e o rótulo vem junto — ícone sozinho não se explica.
 */

import { useEffect, useRef, useState } from "react";
import { MODOS, type ModoId } from "@/lib/modos-do-chat";
import { IconeRaio, IconeRadar, IconeProfundo, IconeSeta } from "@/components/dash/icons";

const ICONES: Record<ModoId, (p: { className?: string }) => React.ReactElement> = {
  leve: IconeRaio,
  observador: IconeRadar,
  profundo: IconeProfundo,
};

export default function SeletorDeModo({
  modo,
  aoTrocar,
  desabilitado,
  compacto,
}: {
  modo: ModoId;
  aoTrocar: (m: ModoId) => void;
  desabilitado?: boolean;
  /** Só o ícone, com o rótulo no `title` e no `aria-label` (usado quando o nome
   *  do modelo já ocupa a linha e o "Leve" escrito duas vezes confunde). */
  compacto?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const atual = MODOS.find((m) => m.id === modo) ?? MODOS[0];
  const Icone = ICONES[atual.id];

  // Fecha ao clicar fora e no Escape — menu que só fecha no próprio botão é
  // armadilha quando ele cobre o campo de texto.
  useEffect(() => {
    if (!aberto) return;
    const foraDoMenu = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const comEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    document.addEventListener("mousedown", foraDoMenu);
    document.addEventListener("keydown", comEsc);
    return () => {
      document.removeEventListener("mousedown", foraDoMenu);
      document.removeEventListener("keydown", comEsc);
    };
  }, [aberto]);

  const ativo = atual.id !== "leve";

  return (
    <div className="relative shrink-0" ref={caixa}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        disabled={desabilitado}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={`Modo de resposta: ${atual.rotulo}`}
        title={`Modo: ${atual.rotulo} — ${atual.resumo}`}
        className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full text-[12px] font-medium transition ${
          compacto ? "w-11 justify-center" : "px-3"
        } ${
          ativo
            ? "bg-dash-brand/15 text-dash-brand ring-1 ring-dash-brand/40 hover:bg-dash-brand/20"
            : "text-dash-muted hover:bg-dash-hair/[0.06] hover:text-dash-fg"
        } ${desabilitado ? "cursor-not-allowed opacity-50" : ""}`}
      >
        <Icone className="h-[17px] w-[17px]" />
        {!compacto && (
          <>
            <span className="hidden sm:inline">{atual.rotulo}</span>
            <IconeSeta
              className={`hidden h-3 w-3 transition-transform sm:inline ${aberto ? "" : "rotate-180"}`}
            />
          </>
        )}
      </button>

      {aberto && (
        <div
          role="menu"
          aria-label="Modo de resposta"
          className="absolute bottom-[52px] right-0 z-50 w-[300px] rounded-[16px] border border-dash-line bg-dash-card p-1.5 shadow-2xl"
        >
          <div className="px-3 pb-1.5 pt-2 text-[10px] uppercase tracking-wide text-dash-dim">
            Como a Mirai responde
          </div>
          {MODOS.map((m) => {
            const I = ICONES[m.id];
            const escolhido = m.id === atual.id;
            return (
              <button
                key={m.id}
                type="button"
                role="menuitemradio"
                aria-checked={escolhido}
                onClick={() => {
                  aoTrocar(m.id);
                  setAberto(false);
                }}
                className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-left transition ${
                  escolhido ? "bg-dash-brand/12" : "hover:bg-dash-hair/[0.06]"
                }`}
              >
                <span
                  className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
                    escolhido ? "bg-dash-brand/20 text-dash-brand" : "bg-dash-hair/[0.07] text-dash-muted"
                  }`}
                >
                  <I className="h-[16px] w-[16px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`flex items-center gap-1.5 text-[13px] font-medium ${
                      escolhido ? "text-dash-brand" : "text-dash-fg"
                    }`}
                  >
                    {m.rotulo}
                    {m.id === "leve" && (
                      <span className="rounded-full bg-dash-hair/[0.1] px-1.5 py-px text-[9px] font-normal text-dash-dim">
                        padrão
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-dash-dim">{m.resumo}</span>
                </span>
              </button>
            );
          })}
          <div className="px-3 pb-2 pt-1.5 text-[10px] leading-snug text-dash-dim">
            No meio da conversa, pedir “busque mais a fundo” sobe o modo sozinho.
          </div>
        </div>
      )}
    </div>
  );
}

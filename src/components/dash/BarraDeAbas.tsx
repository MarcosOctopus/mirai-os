"use client";

import type { ReactNode } from "react";
import { IconeOrb, IconePainel, IconePlug, IconeRaio } from "@/components/dash/icons";

// BarraDeAbas — o menu de 4 abas (Dashboard · Cosmic Agent · Integrações · Skills)
// FIXO NO RODAPÉ, só no celular.
//
// POR QUE EXISTE (dono, 23/11/2026: "menu lá em cima tá horrível, móbile um em
// cima do outro"): o SeletorModo nasceu para a pílula do cabeçalho, onde cabiam
// 2 opções ("Chat/Orb"). Com 4 opções ele passou a disputar a mesma linha com o
// título, o sininho e o avatar: em tela estreita os quatro botões espremiam e
// caíam um sobre o outro. No celular o menu sai do cabeçalho e vira barra de
// aplicativo embaixo; no desktop continua na pílula do topo (lg:).
//
// SEGUNDO PEDIDO (dono, 23/11/2026: "colocaria ícones e aumentaria esses 4
// menus que ficam embaixo"): cada aba ganhou o ícone da CASA (o mesmo traço 1.6
// do resto da tela, sem SVG de fora) e a barra subiu para 59px, com botões de
// 58px — alvo de toque folgado, do tamanho de app de verdade.
//
// Regra da casa: luz contida (o ativo é um traço fino da marca + o ícone na cor,
// não um bloco aceso) e fundo escuro translúcido, para o céu/3D seguir aparecendo.

export type AbaDeBarra = { id: string; rotulo: string };

/* O ícone mora AQUI, por id, e não nas páginas: são DUAS telas usando a mesma
   barra (DashboardCliente e connect/page.tsx) e um mapa só evita que uma
   desenhe ícone e a outra esqueça. */
const ICONES: Record<string, ReactNode> = {
  dashboard: <IconePainel className="h-[23px] w-[23px]" />,
  cosmic: <IconeOrb className="h-[23px] w-[23px]" />,
  integracoes: <IconePlug className="h-[23px] w-[23px]" />,
  skills: <IconeRaio className="h-[23px] w-[23px]" />,
};

export default function BarraDeAbas({
  opcoes,
  ativo,
  onTrocar,
  rotuloAria,
}: {
  opcoes: AbaDeBarra[];
  ativo: string;
  onTrocar: (id: string) => void;
  rotuloAria: string;
}) {
  return (
    <nav
      aria-label={rotuloAria}
      /* /95 e não /94: o Tailwind só gera a opacidade da escala (…/90, /95). Com
         /94 ele descarta em silêncio e a barra fica TRANSPARENTE (medido no CSS
         compilado: `04060c]/94` não existia). */
      className="fixed inset-x-0 bottom-0 z-40 border-t border-dash-hair/10 bg-[#04060c]/95 backdrop-blur-md lg:hidden"
      /* iPhone: a barra tem de ficar ACIMA do indicador de home, não atrás dele. */
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="grid grid-cols-4">
        {opcoes.map((o) => {
          const on = ativo === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onTrocar(o.id)}
              aria-current={on ? "page" : undefined}
              /* 58px de altura: medido em 390px, a primeira versão saiu com 35px
                 (abaixo dos 44px de alvo de toque). Com ícone + rótulo de 11px o
                 dedo acerta sem mirar. */
              className={`relative flex min-h-[58px] flex-col items-center justify-center gap-[3px] px-1 pb-[8px] pt-[10px] text-[11px] leading-[1.1] transition ${
                on ? "text-dash-brandHi" : "text-dash-muted hover:text-dash-fg"
              }`}
            >
              {/* o traço da marca, fino, colado no topo do item ativo */}
              <span
                className={`absolute inset-x-0 top-0 mx-auto h-[3px] w-9 rounded-b-full transition-colors ${
                  on ? "bg-dash-brand" : "bg-transparent"
                }`}
              />
              {ICONES[o.id] ?? <IconePlug className="h-[23px] w-[23px]" />}
              <span className="w-full text-center">{o.rotulo}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
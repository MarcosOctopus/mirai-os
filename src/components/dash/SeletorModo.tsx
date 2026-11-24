"use client";

// SeletorModo — o SELETOR de dois modos que nasceu na PRIMEIRA TELA (`/`),
// onde troca "Chat" por "Orb" no MESMO lugar, sem navegar de página.
//
// Ele foi EXTRAÍDO de src/app/page.tsx COMO ESTÁ (mesmo markup, mesmas classes,
// mesmo visual): um `role="tablist"` de botões `role="tab"`, pílula
// `border-white/10 bg-dash-card`, item ativo em `bg-dash-brand text-white`. A
// página `/` continua usando a MESMA peça (nada foi redesenhado lá) e a página
// Synapse (`/dashboard/connect`) usa esta mesma peça para trocar
// Integrações ⇄ Skills — um só seletor, um só visual.
//
// TAMANHO (dono, 10/11/2026): "consegue deixar os dois toggles menores tanto da
// Arca quanto do Chat orb" — corpo reduzido um degrau nos DOIS estados.
//
// `grande` é o único eixo que muda: na tela de início, em conversa vazia, o
// seletor ganha corpo (p-1.5 / px-6 py-2.5 text-[14px]); fora disso ele fica
// discreto (p-1 / px-4 py-1.5 text-[12px]) — exatamente como era antes.

export type OpcaoModo = { id: string; rotulo: string };

export default function SeletorModo({
  opcoes,
  ativo,
  onTrocar,
  grande = false,
  semFundo = false,
  rotuloAria,
}: {
  opcoes: OpcaoModo[];
  ativo: string;
  onTrocar: (id: string) => void;
  grande?: boolean;
  /** Tira a PÍLULA de trás (borda + fundo), deixando só os botões. Pedido do
   *  dono (24/11/2026) para o modo Orb: "tira essa barra que fica atrás do
   *  toggle no topo". Só onde ele pediu — Arca e Synapse seguem com a pílula. */
  semFundo?: boolean;
  rotuloAria: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={rotuloAria}
      className={`flex items-center gap-1 rounded-full transition-all ${
        semFundo ? "" : "border border-dash-hair/10 bg-dash-card"
      } ${grande ? "p-1" : "p-[3px]"}`}
    >
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={ativo === o.id}
          onClick={() => onTrocar(o.id)}
          className={`rounded-full font-semibold transition-all ${
            grande ? "px-4 py-1 text-[12px] leading-[18px]" : "px-3 py-0.5 text-[11px] leading-[16px]"
          } ${ativo === o.id ? "bg-dash-brand text-white" : "text-dash-muted hover:text-dash-fg"}`}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

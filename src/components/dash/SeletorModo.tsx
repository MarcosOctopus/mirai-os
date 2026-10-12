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
// `grande` é o único eixo que muda: na tela de início, em conversa vazia, o
// seletor ganha corpo (p-1.5 / px-6 py-2.5 text-[14px]); fora disso ele fica
// discreto (p-1 / px-4 py-1.5 text-[12px]) — exatamente como era antes.

export type OpcaoModo = { id: string; rotulo: string };

export default function SeletorModo({
  opcoes,
  ativo,
  onTrocar,
  grande = false,
  rotuloAria,
}: {
  opcoes: OpcaoModo[];
  ativo: string;
  onTrocar: (id: string) => void;
  grande?: boolean;
  rotuloAria: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={rotuloAria}
      className={`flex items-center gap-1 rounded-full border border-dash-hair/10 bg-dash-card transition-all ${
        grande ? "p-1.5" : "p-1"
      }`}
    >
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={ativo === o.id}
          onClick={() => onTrocar(o.id)}
          className={`rounded-full font-semibold transition-all ${
            grande ? "px-6 py-2.5 text-[14px]" : "px-4 py-1.5 text-[12px]"
          } ${ativo === o.id ? "bg-dash-brand text-white" : "text-dash-muted hover:text-dash-fg"}`}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

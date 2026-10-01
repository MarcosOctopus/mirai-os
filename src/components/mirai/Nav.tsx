"use client";

// Menu do painel (MIRAI OS).
//
// Existe porque o painel nasceu sem navegação nenhuma: quem entrava não tinha
// como ir a lugar algum. No celular vira um botão (hambúrguer) que abre a
// gaveta; em tela larga (Chromebook/desktop) os links ficam na própria linha.
//
// `flutuante` é para a tela de conversa (`/`, o orb): ela é imersiva e não pode
// ganhar uma barra em cima — então recebe só um botãozinho no canto, que abre a
// mesma gaveta. Sem isso, quem entra no modo conversa fica sem saída.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

const ITENS = [
  { href: "/dashboard", label: "Painel", desc: "Métricas e pipeline" },
  { href: "/dashboard/connect", label: "Integrações", desc: "Conectar as ferramentas" },
  { href: "/chat", label: "Chat", desc: "Conversar por escrito" },
  { href: "/", label: "Conversa", desc: "Falar com a Mirai (orb)" },
  { href: "/system", label: "Sistema", desc: "Estado do app" },
];

function IconeMenu({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function IconeFechar({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export default function Nav({
  atual,
  flutuante = false,
}: {
  atual: string;
  flutuante?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  // A gaveta vai para o <body> por PORTAL. Motivo medido: dentro da <nav>, que
  // tem backdrop-blur, o filtro vira "referencia de posicionamento" e o
  // `fixed inset-0` passa a valer so a altura da barrinha (62px) -> a gaveta
  // abria como uma faixa fina, com os itens invisiveis (0x0). Portal nao tem
  // ancestral com filtro, entao cobre a tela inteira.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const itemClasse = (href: string) =>
    `rounded-lg px-3 py-2 text-sm transition-colors ${
      href === atual
        ? "bg-cyan-500/15 text-cyan-200"
        : "text-white/60 hover:bg-white/5 hover:text-white"
    }`;

  const gaveta = aberto && montado
    ? createPortal(
        <div
          className="fixed inset-0 z-50 flex flex-col bg-[#03040d] p-6"
          onPointerDown={(e) => e.stopPropagation()}
        >
      <div className="mb-8 flex items-center justify-between">
        <span className="text-sm font-semibold tracking-[0.2em] text-cyan-200">
          MIRAI OS
        </span>
        <button
          type="button"
          onClick={() => setAberto(false)}
          aria-label="Fechar menu"
          className="rounded-lg border border-white/15 p-2 text-cyan-200 hover:bg-white/5"
        >
          <IconeFechar />
        </button>
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto">
        {ITENS.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            onClick={() => setAberto(false)}
            className={`rounded-xl border px-4 py-4 transition-colors ${
              i.href === atual
                ? "border-cyan-400/40 bg-cyan-500/10"
                : "border-white/10 hover:bg-white/5"
            }`}
          >
            <span className="block text-base text-white">{i.label}</span>
            <span className="mt-0.5 block text-xs text-white/40">{i.desc}</span>
          </Link>
        ))}
      </div>

      <button
        type="button"
        onClick={sair}
        className="mt-auto rounded-xl border border-white/10 px-4 py-4 text-left text-sm text-white/50 hover:bg-white/5"
      >
            Sair
          </button>
        </div>,
        document.body,
      )
    : null;

  // Tela de conversa: só o botãozinho no canto (a tela é imersiva).
  if (flutuante) {
    return (
      <>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setAberto(true);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Abrir menu"
          className="fixed left-4 top-4 z-50 rounded-xl border border-cyan-300/20 bg-black/40 p-2.5 text-cyan-200/80 backdrop-blur hover:bg-black/70 hover:text-cyan-100"
        >
          <IconeMenu />
        </button>
        {gaveta}
      </>
    );
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-white/10 bg-[#03040d]/95 backdrop-blur">
      {/* celular: título + hambúrguer */}
      <div className="flex items-center justify-between px-4 py-3 md:hidden">
        <Link
          href="/dashboard"
          className="text-sm font-semibold tracking-[0.2em] text-cyan-200"
        >
          MIRAI OS
        </Link>
        <button
          type="button"
          onClick={() => setAberto(true)}
          aria-label="Abrir menu"
          className="rounded-lg border border-white/15 p-2 text-cyan-200 hover:bg-white/5"
        >
          <IconeMenu />
        </button>
      </div>

      {/* tela larga: links na linha */}
      <div className="hidden items-center gap-1 px-5 py-2.5 md:flex">
        <span className="mr-4 text-sm font-semibold tracking-[0.2em] text-cyan-200">
          MIRAI OS
        </span>
        {ITENS.map((i) => (
          <Link key={i.href} href={i.href} className={itemClasse(i.href)}>
            {i.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={sair}
          className="ml-auto rounded-lg px-3 py-2 text-sm text-white/45 hover:bg-white/5 hover:text-white"
        >
          Sair
        </button>
      </div>

      {gaveta}
    </nav>
  );
}

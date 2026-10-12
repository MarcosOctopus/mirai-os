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

type ItemMenu = { href: string; label: string; desc: string; donoOnly?: boolean; destaque?: boolean };

// Mesmo corte de grupos da casca (Shell.tsx): o PRIMARIO sustenta o uso diário;
// o SECUNDARIO é o grupo que saiu da lateral e vive no menu do perfil. Aqui
// (nav de /system e do orb) os dois seguem visíveis, só que separados — assim
// nenhum menu diverge do outro.
const PRIMARIO: ItemMenu[] = [
  // A AÇÃO primária do menu: começar uma conversa nova (a tela inicial, `/`).
  // Fica no topo e destacada porque é o caminho que a pessoa mais usa.
  { href: "/", label: "Novo", desc: "Começar uma conversa", destaque: true },
  { href: "/projetos", label: "Projetos", desc: "O que está sendo construído" },
  // Synapse: mesmo destino de antes (/dashboard/connect) — só o nome mudou.
  { href: "/dashboard/connect", label: "Synapse", desc: "Integrações e skills" },
  { href: "/arquiteto", label: "Arquiteto", desc: "Modo técnico de construção" },
];

// Só o dono vê as áreas internas (a trava real é no servidor).
const SECUNDARIO: ItemMenu[] = [
  { href: "/admin/organizacoes", label: "Organizações", desc: "Clientes e acessos", donoOnly: true },
  { href: "/explorar", label: "Explorar", desc: "Descobrir o que a Mirai faz" },
  { href: "/system", label: "Sistema", desc: "Estado da plataforma", donoOnly: true },
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
  // Quem é esta conta: dono da plataforma ou cliente de uma organização.
  const [ehDono, setEhDono] = useState(false);
  useEffect(() => {
    let vivo = true;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo && d?.user) setEhDono(Boolean(d.user.ehDono));
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);
  const filtrar = (lista: ItemMenu[]) => lista.filter((i) => !i.donoOnly || ehDono);
  const primarios = filtrar(PRIMARIO);
  const secundarios = filtrar(SECUNDARIO);
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

  const itemClasse = (i: ItemMenu) =>
    `rounded-lg px-3 py-2 text-sm transition-colors ${
      i.destaque
        ? "bg-cyan-500/15 font-semibold text-cyan-100 hover:bg-cyan-500/25"
        : i.href === atual
          ? "bg-cyan-500/15 text-cyan-200"
          : "text-dash-fg/60 hover:bg-dash-hair/5 hover:text-dash-fg"
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
          className="rounded-lg border border-dash-hair/15 p-2 text-cyan-200 hover:bg-dash-hair/5"
        >
          <IconeFechar />
        </button>
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto">
        {primarios.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            onClick={() => setAberto(false)}
            className={`rounded-xl border px-4 py-4 transition-colors ${
              i.destaque
                ? "border-cyan-400/50 bg-cyan-500/10"
                : i.href === atual
                  ? "border-cyan-400/40 bg-cyan-500/10"
                  : "border-dash-hair/10 hover:bg-dash-hair/5"
            }`}
          >
            <span className={`block text-base ${i.destaque ? "font-semibold text-cyan-100" : "text-dash-fg"}`}>
              {i.label}
            </span>
            <span className="mt-0.5 block text-xs text-dash-fg/40">{i.desc}</span>
          </Link>
        ))}

        {/* Mesma separação da lateral: o secundário é um grupo à parte. */}
        {secundarios.length > 0 && <div className="my-1 h-px bg-dash-hair/10" />}

        {secundarios.map((i) => (
          <Link
            key={i.href}
            href={i.href}
            onClick={() => setAberto(false)}
            className={`rounded-xl border px-4 py-4 transition-colors ${
              i.href === atual
                ? "border-cyan-400/40 bg-cyan-500/10"
                : "border-dash-hair/10 hover:bg-dash-hair/5"
            }`}
          >
            <span className="block text-base text-dash-fg">{i.label}</span>
            <span className="mt-0.5 block text-xs text-dash-fg/40">{i.desc}</span>
          </Link>
        ))}
      </div>

      <button
        type="button"
        onClick={sair}
        className="mt-auto rounded-xl border border-dash-hair/10 px-4 py-4 text-left text-sm text-dash-fg/50 hover:bg-dash-hair/5"
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
          className="fixed left-4 top-4 z-50 rounded-xl border border-cyan-300/20 bg-dash-scrim/40 p-2.5 text-cyan-200/80 backdrop-blur hover:bg-dash-scrim/70 hover:text-cyan-100"
        >
          <IconeMenu />
        </button>
        {gaveta}
      </>
    );
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-dash-hair/10 bg-[#03040d]/95 backdrop-blur">
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
          className="rounded-lg border border-dash-hair/15 p-2 text-cyan-200 hover:bg-dash-hair/5"
        >
          <IconeMenu />
        </button>
      </div>

      {/* tela larga: links na linha */}
      <div className="hidden items-center gap-1 px-5 py-2.5 md:flex">
        <span className="mr-4 text-sm font-semibold tracking-[0.2em] text-cyan-200">
          MIRAI OS
        </span>
        {primarios.map((i) => (
          <Link key={i.href} href={i.href} className={itemClasse(i)}>
            {i.label}
          </Link>
        ))}

        {secundarios.length > 0 && <div className="mx-1.5 h-5 w-px bg-dash-hair/10" />}

        {secundarios.map((i) => (
          <Link key={i.href} href={i.href} className={itemClasse(i)}>
            {i.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={sair}
          className="ml-auto rounded-lg px-3 py-2 text-sm text-dash-fg/45 hover:bg-dash-hair/5 hover:text-dash-fg"
        >
          Sair
        </button>
      </div>

      {gaveta}
    </nav>
  );
}

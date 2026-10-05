"use client";

/* Shell do padrão Dash — casca de TODAS as páginas internas.
   Estrutura do template ArtDash: sidebar fixa (off-canvas no celular), topbar com
   título/notificações/avatar e conteúdo em coluna centrada. */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconeAgentes,
  IconeBackup,
  IconeChat,
  IconeFechar,
  IconeInfra,
  IconeMenu,
  IconeOrb,
  IconeOrganizacoes,
  IconePainel,
  IconePlug,
  IconeProdutos,
  IconeSeta,
  IconeSino,
  IconeSistema,
} from "./icons";

type Item = {
  label: string;
  href?: string;
  icone: React.ReactNode;
  soDono?: boolean;
  emBreve?: boolean;
  selo?: string;
};

const PRIMARIO: Item[] = [
  { label: "Painel", href: "/dashboard", icone: <IconePainel /> },
  { label: "Agentes", icone: <IconeAgentes />, emBreve: true },
  { label: "Produtos", icone: <IconeProdutos />, emBreve: true },
  { label: "Infra", icone: <IconeInfra />, emBreve: true },
  { label: "Integrações", href: "/dashboard/connect", icone: <IconePlug /> },
  { label: "Chat", href: "/chat", icone: <IconeChat /> },
];

const SECUNDARIO: Item[] = [
  { label: "Orb (voz)", href: "/", icone: <IconeOrb /> },
  { label: "Organizações", href: "/admin/organizacoes", icone: <IconeOrganizacoes />, soDono: true },
  { label: "Sistema", href: "/system", icone: <IconeSistema />, soDono: true },
  { label: "Backups", icone: <IconeBackup />, emBreve: true },
];

function Marca({ recolhida = false }: { recolhida?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${recolhida ? "lg:justify-center" : ""}`}>
      {/* menu aberto: a logo completa. menu recolhido: só a marca laranja. */}
      <img
        src="/logo-mirai.png"
        alt="MIRAI"
        className={`h-[26px] w-auto shrink-0 ${recolhida ? "lg:hidden" : ""}`}
      />
      <img
        src="/logo-mirai-marca.png"
        alt="MIRAI"
        className={`hidden h-[30px] w-auto shrink-0 ${recolhida ? "lg:block" : ""}`}
      />
    </div>
  );
}

function ItemMenu({
  item,
  ativo,
  onNavegar,
  recolhida = false,
}: {
  item: Item;
  ativo: boolean;
  onNavegar: () => void;
  recolhida?: boolean;
}) {
  const base = `flex w-full items-center gap-4 rounded-[12px] px-4 py-3 text-left text-[14px] transition ${
    recolhida ? "lg:justify-center lg:px-0 lg:gap-0" : ""
  }`;
  const cor = ativo ? "bg-dash-brand/12 text-dash-brand" : "text-dash-muted hover:bg-white/[0.04] hover:text-white";
  const rotulo = `truncate ${recolhida ? "lg:hidden" : ""}`;
  const selo = `ml-auto rounded-full px-2 py-[3px] text-[10px] ${recolhida ? "lg:hidden" : ""}`;

  if (!item.href || item.emBreve) {
    return (
      <div className={`${base} ${cor} cursor-default`} title={item.label}>
        {item.icone}
        <span className={rotulo}>{item.label}</span>
        {item.emBreve && <span className={`${selo} bg-dash-raise text-dash-dim`}>em breve</span>}
      </div>
    );
  }

  return (
    <Link href={item.href} onClick={onNavegar} className={`${base} ${cor}`} title={item.label}>
      {item.icone}
      <span className={rotulo}>{item.label}</span>
      {item.selo && <span className={`${selo} bg-dash-ok font-semibold text-dash-side`}>{item.selo}</span>}
    </Link>
  );
}

export default function Shell({
  titulo,
  usuario,
  children,
  recolhidaInicial = false,
  cheio = false,
}: {
  titulo: string;
  usuario?: { nome?: string; email?: string; ehDono?: boolean } | null;
  children: React.ReactNode;
  /** abre já com a lateral recolhida (ex.: a tela do Orb, que é visual) */
  recolhidaInicial?: boolean;
  /** conteúdo em tela cheia: sem margem, sem largura máxima, ocupa o miolo todo
      (usado pela tela do Orb, que é visual e pede a área inteira) */
  cheio?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [recolhida, setRecolhida] = useState(recolhidaInicial);
  const caminho = usePathname();
  const inicial = (usuario?.nome || usuario?.email || "?").trim().charAt(0).toUpperCase();
  const visiveis = (lista: Item[]) => lista.filter((i) => !i.soDono || usuario?.ehDono);

  return (
    <div className="dash-root min-h-dvh bg-dash-bg text-white">
      {/* overlay do menu no celular */}
      {aberto && (
        <button
          aria-label="Fechar menu"
          onClick={() => setAberto(false)}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col overflow-y-auto bg-dash-side px-5 pb-8 pt-6 transition-all lg:translate-x-0 ${
          aberto ? "translate-x-0" : "-translate-x-full"
        } ${recolhida ? "lg:w-[84px] lg:px-3" : "lg:w-[320px] lg:px-5"}`}
      >
        <div className={`flex items-center ${recolhida ? "lg:justify-center" : "justify-between"}`}>
          <Marca recolhida={recolhida} />
          <button
            aria-label="Fechar menu"
            onClick={() => setAberto(false)}
            className="grid h-9 w-9 place-items-center rounded-[10px] bg-dash-raise text-dash-muted lg:hidden"
          >
            <IconeFechar />
          </button>
        </div>

        {/* setinha: recolhe/expande só no desktop — só a seta, sem caixa nem texto */}
        <button
          aria-label={recolhida ? "Expandir menu" : "Recolher menu"}
          title={recolhida ? "Expandir menu" : "Recolher menu"}
          onClick={() => setRecolhida((v) => !v)}
          className={`mt-5 hidden h-6 w-6 items-center justify-center text-dash-muted transition hover:text-white lg:flex ${
            recolhida ? "self-center" : "self-end"
          }`}
        >
          <IconeSeta className={`h-4 w-4 transition-transform ${recolhida ? "" : "rotate-180"}`} />
        </button>

        <nav className="mt-9 space-y-1.5">
          {visiveis(PRIMARIO).map((i) => (
            <ItemMenu
              key={i.label}
              item={i}
              ativo={!!i.href && caminho === i.href}
              onNavegar={() => setAberto(false)}
              recolhida={recolhida}
            />
          ))}
        </nav>

        <div className="my-6 border-t border-white/[0.07]" />

        <nav className="space-y-1.5">
          {visiveis(SECUNDARIO).map((i) => (
            <ItemMenu
              key={i.label}
              item={i}
              ativo={!!i.href && caminho === i.href}
              onNavegar={() => setAberto(false)}
              recolhida={recolhida}
            />
          ))}
        </nav>

        <div className={`mt-auto pt-8 ${recolhida ? "lg:hidden" : ""}`}>
          <div className="rounded-[20px] bg-dash-raise/70 p-5">
            <p className="text-[13px] font-semibold text-white">Mirai está de pé</p>
            <p className="mt-2 text-[12px] leading-[1.5] text-dash-muted">
              Para conversar por voz, é no Orb: toque, desperte e fale.
            </p>
            <Link
              href="/"
              onClick={() => setAberto(false)}
              className="mt-4 inline-flex rounded-[10px] bg-dash-brand px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-dash-brandHi"
            >
              Ir para o Orb
            </Link>
          </div>
        </div>
      </aside>

      <main
        className={`transition-all ${recolhida ? "lg:ml-[84px]" : "lg:ml-[320px]"} ${
          cheio ? "dash-cheio flex h-dvh flex-col overflow-hidden" : "min-h-dvh"
        }`}
      >
        <div
          className={
            cheio
              ? "mx-auto flex h-full min-h-0 w-full max-w-none flex-col px-5 pb-0 pt-5 sm:px-8 lg:px-[44px] lg:pt-10"
              : "mx-auto max-w-[1145px] px-5 pb-16 pt-5 sm:px-8 lg:px-[44px] lg:pt-10"
          }
        >
          <header className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <button
                aria-label="Abrir menu"
                onClick={() => setAberto(true)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-dash-side text-dash-muted lg:hidden"
              >
                <IconeMenu />
              </button>
              <h1 className="truncate text-[20px] text-white">{titulo}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              <span className="relative grid h-[34px] w-[34px] place-items-center rounded-full bg-dash-side text-dash-muted">
                <IconeSino />
              </span>
              <MenuDaConta inicial={inicial} usuario={usuario} />
            </div>
          </header>

          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}

/* Canto superior direito do Shell: clicar na bolinha abre o menu da conta.
   Perfil e saída — sair chama o /api/auth/logout que já existe no app. */
function MenuDaConta({
  inicial,
  usuario,
}: {
  inicial: string;
  usuario?: { nome?: string; email?: string; ehDono?: boolean } | null;
}) {
  const [aberto, setAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const caixa = useRef<HTMLDivElement | null>(null);

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

  async function sair() {
    setSaindo(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <div className="relative" ref={caixa}>
      <button
        aria-label="Menu da conta"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className={`grid h-[34px] w-[34px] place-items-center rounded-full border text-[13px] text-white transition ${
          aberto
            ? "border-dash-brand bg-dash-raise"
            : "border-white/15 bg-dash-raise hover:border-dash-brand/60"
        }`}
      >
        {inicial}
      </button>

      {aberto && (
        <div className="absolute right-0 top-[42px] z-50 w-[236px] rounded-[16px] border border-dash-line bg-dash-card p-1.5 shadow-2xl">
          <div className="px-3 py-2.5">
            <p className="truncate text-[12.5px] font-semibold text-white">
              {usuario?.nome || "Sua conta"}
            </p>
            {usuario?.email && (
              <p className="truncate text-[11.5px] text-dash-muted">{usuario.email}</p>
            )}
          </div>

          <div className="my-1 h-px bg-white/[0.08]" />

          <Link
            href="/perfil"
            onClick={() => setAberto(false)}
            className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] text-white/85 transition hover:bg-white/[0.06] hover:text-white"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-[17px] w-[17px] shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            >
              <circle cx="12" cy="8" r="3.5" />
              <path d="M4.5 20c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4" />
            </svg>
            Perfil
          </Link>

          <button
            onClick={sair}
            disabled={saindo}
            className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[13px] text-dash-bad transition hover:bg-white/[0.06] disabled:opacity-60"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-[17px] w-[17px] shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            >
              <path d="M15 4.5h3.5A1.5 1.5 0 0 1 20 6v12a1.5 1.5 0 0 1-1.5 1.5H15" />
              <path d="M10 16.5 14.5 12 10 7.5M14.5 12H4" />
            </svg>
            {saindo ? "Saindo..." : "Sair"}
          </button>
        </div>
      )}
    </div>
  );
}

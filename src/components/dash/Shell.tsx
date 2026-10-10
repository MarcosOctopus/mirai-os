"use client";

/* Shell do padrão Dash — casca de TODAS as páginas internas.
   Estrutura do template ArtDash: sidebar fixa (off-canvas no celular), topbar com
   título/notificações/avatar e conteúdo em coluna centrada. */

import { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  carregarLista,
  definirAberta,
  novaConversa,
  useConversas,
} from "@/lib/conversas-cliente";
import {
  IconeBusca,
  IconeChat,
  IconeFechar,
  IconeMais,
  IconeMenu,
  IconeOrganizacoes,
  IconeProdutos,
  IconeRobo,
  IconeSeta,
  IconeSino,
  IconeSistema,
  IconeSynapse,
} from "./icons";

type Item = {
  label: string;
  href?: string;
  icone: React.ReactNode;
  soDono?: boolean;
  emBreve?: boolean;
  selo?: string;
  /** ação primária do menu: fica visualmente um degrau acima das demais */
  destaque?: boolean;
  /** item que não navega: dispara uma ação (ex.: abrir conversa nova) */
  acao?: "nova";
};

// "+ novo" NÃO é um link para a tela inicial: precisa ABRIR uma conversa nova
// de verdade (cria a linha no servidor, muda o foco para ela). Por isso é ação,
// não href.
const PRIMARIO: Item[] = [
  { label: "Novo", acao: "nova", icone: <IconeMais />, destaque: true },
  { label: "Projetos", href: "/projetos", icone: <IconeProdutos /> },
  // Synapse (08/10/2026): a antiga entrada "Integrações" mudou de NOME e de
  // ÍCONE (dois nós ligados por um elo), mas a URL continua a MESMA
  // (/dashboard/connect) — nenhum link quebra. Lá dentro a tela tem duas
  // seções (Integrações e Skills), trocadas pelo seletor do topo.
  { label: "Synapse", href: "/dashboard/connect", icone: <IconeSynapse /> },
  { label: "Arquiteto", href: "/arquiteto", icone: <IconeRobo /> },
  // A entrada "Skills" saiu do menu (dono, 08/10/2026): "Essa página do menu
  // esquerdo chamada skill tem que sumir. Só existir da Synapse junto com essa do
  // botão de explorar todas as skills." A vitrine vive na aba Skills da Synapse
  // e na grade (/dashboard/skills, destino do "Ver todas as skills"). /skills só
  // redireciona para a Synapse.
];

// Grupo secundário: ele NÃO fica mais na lateral. No desktop vive no menu do
// PERFIL (topo à direita, como ChatGPT/Claude); no celular, dentro da gaveta.
// A ORDEM é a que o dono ditou: Organizações, e só então Explorar; Sistema
// fecha. O corte por `soDono` é o que muda conforme quem entrou.
const SECUNDARIO: Item[] = [
  { label: "Organizações", href: "/admin/organizacoes", icone: <IconeOrganizacoes />, soDono: true },
  { label: "Explorar", href: "/explorar", icone: <IconeBusca /> },
  { label: "Sistema", href: "/system", icone: <IconeSistema />, soDono: true },
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
  onAcionar,
  recolhida = false,
}: {
  item: Item;
  ativo: boolean;
  onNavegar: () => void;
  onAcionar?: () => void;
  recolhida?: boolean;
}) {
  const base = `flex w-full items-center gap-4 rounded-[12px] px-4 py-3 text-left text-[14px] transition ${
    recolhida ? "lg:justify-center lg:px-0 lg:gap-0" : ""
  }`;
  const cor = ativo
    ? "bg-dash-brand/12 text-dash-brand"
    : item.destaque
      ? "bg-dash-brand/15 font-semibold text-dash-brand ring-1 ring-dash-brand/25 hover:bg-dash-brand/25"
      : "text-dash-muted hover:bg-white/[0.04] hover:text-white";
  const rotulo = `truncate ${recolhida ? "lg:hidden" : ""}`;
  const selo = `ml-auto rounded-full px-2 py-[3px] text-[10px] ${recolhida ? "lg:hidden" : ""}`;

  // Item de AÇÃO ("+ novo"): não navega sozinho, dispara a criação da conversa.
  if (item.acao) {
    return (
      <button type="button" onClick={onAcionar} className={`${base} ${cor}`} title={item.label}>
        {item.icone}
        <span className={rotulo}>{item.label}</span>
      </button>
    );
  }

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

/** O jeito de ABRIR a gaveta do menu a partir de DENTRO da página (dono,
    10/10/2026). A tela de chat é `cheio` e o CSS esconde o cabeçalho do Shell
    (onde mora o botão de menu) — sem isto, no celular NÃO havia menu na tela do
    chat. Quem está dentro (ex.: a barra do chat) chama `useMenu().abrir()`. */
export const MenuContext = createContext<{ abrir: () => void }>({ abrir: () => {} });
export function useMenu() {
  return useContext(MenuContext);
}

export default function Shell({
  titulo,
  usuario,
  children,
  recolhidaInicial = false,
  cheio = false,
  cabecalhoDireita,
}: {
  titulo: string;
  usuario?: { nome?: string; email?: string; ehDono?: boolean } | null;
  children: React.ReactNode;
  /** abre já com a lateral recolhida (ex.: a tela do Orb, que é visual) */
  recolhidaInicial?: boolean;
  /** conteúdo em tela cheia: sem margem, sem largura máxima, ocupa o miolo todo
      (usado pela tela do Orb, que é visual e pede a área inteira) */
  cheio?: boolean;
  /** peça opcional encaixada à DIREITA do cabeçalho (ex.: o seletor
      Integrações/Skills da Synapse). Sem ela, o cabeçalho é o de sempre. */
  cabecalhoDireita?: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [recolhida, setRecolhida] = useState(recolhidaInicial);
  const caminho = usePathname();
  const router = useRouter();
  const { lista, aberta } = useConversas();
  const inicial = (usuario?.nome || usuario?.email || "?").trim().charAt(0).toUpperCase();
  const visiveis = (lista: Item[]) => lista.filter((i) => !i.soDono || usuario?.ehDono);

  // Histórico: a MESMA lista do chat (módulo compartilhado). Carrega uma vez.
  useEffect(() => {
    void carregarLista();
  }, []);

  async function abrirNova() {
    setAberto(false);
    await novaConversa();
    if (caminho !== "/") router.push("/");
  }

  function abrirConversa(id: string) {
    setAberto(false);
    definirAberta(id);
    if (caminho !== "/") router.push("/");
  }

  return (
    <MenuContext.Provider value={{ abrir: () => setAberto(true) }}>
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
              onAcionar={() => void abrirNova()}
              recolhida={recolhida}
            />
          ))}
        </nav>

        {/* Histórico — SOBE para o lugar que o grupo secundário deixou, logo
            abaixo de "+ novo/Projetos/Integrações/Arquiteto" (como ChatGPT).
            Mesma linguagem do resto da lateral; recolhida no desktop quando o
            menu fecha (`lg:hidden` mantém a lista viva no drawer do celular).
            A lista rola por conta própria (max-h + overflow) para que muitas
            conversas não empurrem nem os itens nem o rodapé para fora. */}
        <div className={`mt-7 min-h-0 ${recolhida ? "lg:hidden" : ""}`}>
          <p className="px-4 text-[11px] uppercase tracking-[0.18em] text-dash-dim">Recentes</p>
          <div className="mt-2 max-h-[38vh] space-y-0.5 overflow-y-auto pr-1">
            {lista.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => abrirConversa(c.id)}
                title={c.titulo}
                className={`flex w-full items-center rounded-[10px] px-4 py-2 text-left text-[13px] transition ${
                  c.id === aberta
                    ? "bg-dash-brand/12 text-white"
                    : "text-dash-muted hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                <span className="truncate">{c.titulo}</span>
              </button>
            ))}
            {!lista.length && (
              <p className="px-4 pb-1 text-[12px] leading-[1.5] text-dash-dim">
                Suas conversas aparecem aqui.
              </p>
            )}
          </div>
        </div>

        {/* No CELULAR o grupo secundário ainda precisa de um caminho pela
            gaveta (no desktop ele vive no menu do PERFIL, topo à direita). Fica
            abaixo das Recentes e escondido em tela larga: nada some no telefone
            e nada duplica na lateral do desktop. */}
        <div className="my-6 border-t border-white/[0.07] lg:hidden" />

        <nav className="space-y-1.5 lg:hidden">
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
              Para conversar, é na tela inicial: escrita ou voz, no mesmo lugar.
            </p>
            <Link
              href="/"
              onClick={() => setAberto(false)}
              className="mt-4 inline-flex rounded-[10px] bg-dash-brand px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-dash-brandHi"
            >
              Abrir a Mirai
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
              {cabecalhoDireita}
              <span className="relative grid h-[34px] w-[34px] place-items-center rounded-full bg-dash-side text-dash-muted">
                <IconeSino />
              </span>
              <MenuDaConta inicial={inicial} usuario={usuario} caminho={caminho} />
            </div>
          </header>

          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
    </MenuContext.Provider>
  );
}

/* Canto superior direito do Shell: clicar na bolinha abre o menu da conta —
   agora também o lugar do grupo secundário que saiu da lateral (Organizações,
   Explorar, Sistema), como ChatGPT/Claude. Perfil e saída seguem aqui; sair
   chama o /api/auth/logout que já existe no app. */
function MenuDaConta({
  inicial,
  usuario,
  caminho,
}: {
  inicial: string;
  usuario?: { nome?: string; email?: string; ehDono?: boolean } | null;
  caminho: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const caixa = useRef<HTMLDivElement | null>(null);
  // Mesmo corte por dono do resto do menu (a trava real segue no servidor).
  const itens = SECUNDARIO.filter((i) => !i.soDono || usuario?.ehDono);

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

          {/* O grupo que saiu da lateral. Mesma ordem e mesmo corte por dono;
              a pílula de ativo segue a rota atual, como no menu antigo. */}
          <nav className="space-y-0.5">
            {itens.map((i) => (
              <Link
                key={i.label}
                href={i.href ?? "#"}
                onClick={() => setAberto(false)}
                title={i.label}
                className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] transition ${
                  i.href === caminho
                    ? "bg-dash-brand/12 text-dash-brand"
                    : "text-white/85 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <span className="shrink-0">{i.icone}</span>
                {i.label}
              </Link>
            ))}
          </nav>

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

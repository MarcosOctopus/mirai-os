"use client";

/* Shell do padrão Dash — casca de TODAS as páginas internas.
   Estrutura do template ArtDash: sidebar fixa (off-canvas no celular), topbar com
   título/notificações/avatar e conteúdo em coluna centrada. */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  apagarConversaCliente,
  carregarLista,
  definirAberta,
  favoritarConversaCliente,
  abrirEmBranco,
  useConversas,
  type ConversaResumo,
} from "@/lib/conversas-cliente";
import {
  IconeBusca,
  IconeCadeado,
  IconeChat,
  IconeEstrela,
  IconeEstrelaCheia,
  IconeFechar,
  IconeCamadas,
  IconeLixeira,
  IconeLua,
  IconeMais,
  IconeMenu,
  IconeOrganizacoes,
  IconePontos,
  IconeProdutos,
  IconeRelogio,
  IconeRobo,
  IconeSeta,
  IconeSino,
  IconeSistema,
  IconeSol,
  IconeSynapse,
  IconeUsuarios,
} from "./icons";
import { usarTema } from "@/lib/tema";
import { Sininho } from "./Sininho";

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
  // A Arca desceu do grupo secundario para a lista principal (dono, 10/11/2026:
  // "no menu lateral de baixo do arquiteto coloca 'A Arca'"). Continua NAO
  // sendo so-dono: o acervo e de quem entrou.
  { label: "A Arca", href: "/dashboard/arca", icone: <IconeCamadas /> },
  // Agendamentos logo abaixo da Arca (dono, 12/11/2026): o que o time faz
  // sozinho — mesma família visual e mesmo corte por papel dos vizinhos.
  { label: "Agendamentos", href: "/dashboard/agendamentos", icone: <IconeRelogio /> },
  // Chaves de API (dono, 13/11/2026): a chave PRÓPRIA da pessoa (BYOK). Fica
  // logo abaixo de Agendamentos porque é o mesmo tipo de coisa — configuração
  // da conta, não produto. Sem esta entrada a tela existiria e ninguém acharia.
  { label: "Chaves de API", href: "/dashboard/chaves", icone: <IconeCadeado /> },
  // A entrada "Skills" saiu do menu (dono, 08/10/2026): "Essa página do menu
  // esquerdo chamada skill tem que sumir. Só existir da Synapse junto com essa do
  // botão de explorar todas as skills." A vitrine vive na aba Skills da Synapse
  // e na grade (/dashboard/skills, destino do "Ver todas as skills"). /skills só
  // redireciona para a Synapse.
];

// Grupo secundário: ele NÃO fica mais na lateral. No desktop vive no menu do
// PERFIL (topo à direita, como ChatGPT/Claude); no celular, dentro da gaveta.
// A ORDEM é a que o dono ditou: Clientes e Organizações primeiro, e só então
// Explorar; Sistema fecha. O corte por `soDono` é o que muda conforme quem entrou.
const SECUNDARIO: Item[] = [
  { label: "Intelligence Control", href: "/admin/intelligence", icone: <IconeRobo />, soDono: true, selo: "NOVO" },
  { label: "Clientes", href: "/admin/clientes", icone: <IconeUsuarios />, soDono: true },
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
        className={`logo-tema h-[26px] w-auto shrink-0 ${recolhida ? "lg:hidden" : ""}`}
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
      : "text-dash-muted hover:bg-dash-hair/[0.04] hover:text-dash-fg";
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

/* Uma conversa da lateral, com os TRÊS PONTINHOS (dono, 12/10/2026: "põe três
   pontos do lado da conversa, botão para apagar ou favoritar, como o GPT").
   O botão de pontos aparece no hover no desktop e SEMPRE no celular/tablet, onde
   hover não existe — se dependesse do hover, no toque ele seria inalcançável.
   Ele não desenha o menu: avisa a casca, que o desenha FORA da lateral. */
function LinhaConversa({
  c,
  ativa,
  menuAberto,
  onAbrir,
  onMenu,
}: {
  c: ConversaResumo;
  ativa: boolean;
  menuAberto: boolean;
  onAbrir: () => void;
  onMenu: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onAbrir}
        title={c.titulo}
        className={`flex w-full items-center gap-2 rounded-[10px] py-2 pl-4 pr-9 text-left text-[13px] transition ${
          ativa
            ? "bg-dash-brand/12 text-dash-fg"
            : "text-dash-muted hover:bg-dash-hair/[0.04] hover:text-dash-fg"
        }`}
      >
        {!!c.favorita && (
          <IconeEstrelaCheia className="h-[13px] w-[13px] shrink-0 text-dash-brand" />
        )}
        <span className="min-w-0 flex-1 truncate">{c.titulo}</span>
      </button>

      <button
        type="button"
        data-menu-conversa
        aria-label={`Opções de "${c.titulo}"`}
        onClick={onMenu}
        className={`absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-[8px] text-dash-muted transition hover:bg-dash-hair/10 hover:text-dash-fg ${
          menuAberto ? "opacity-100" : "opacity-0 group-hover:opacity-100 max-lg:opacity-100"
        }`}
      >
        <IconePontos className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function Shell({
  titulo,
  usuario,
  children,
  recolhidaInicial = false,
  cheio = false,
  cabecalhoDireita,
  cabecalhoCentro,
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
  /** No MEIO do topo (pedido do dono: igual ao toggle de chat/orb). */
  cabecalhoCentro?: React.ReactNode;
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
    // NÃO cria conversa no servidor. O "+ Novo" abre uma conversa EM BRANCO; a
    // conversa nasce quando a primeira mensagem é enviada (o /api/chat cria e
    // devolve o id). Antes isto fazia POST a cada clique e enchia a lista de
    // conversas vazias — dono, 14/10/2026: "só pode criar conversa nova quando
    // inicia o chat".
    abrirEmBranco();
    if (caminho !== "/") router.push("/");
  }

  function abrirConversa(id: string) {
    setAberto(false);
    definirAberta(id);
    if (caminho !== "/") router.push("/");
  }

  // ── O menu de UMA conversa (três pontinhos) ────────────────────────────────
  // Ele é desenhado FORA da lateral (fixed) e as coordenadas vêm do retângulo do
  // botão clicado. Motivo: a lateral rola (`overflow-y-auto`) e tem `transform`
  // (o deslizar do celular) — um menu FILHO seria cortado no fim da lista e o
  // `position: fixed` ficaria preso ao transform. Fora dela, flutua sobre tudo.
  const [menuConv, setMenuConv] = useState<{ id: string; top: number; left: number } | null>(null);
  const [confirmaApagar, setConfirmaApagar] = useState(false);
  const caixaMenu = useRef<HTMLDivElement | null>(null);

  const favoritas = lista.filter((c) => !!c.favorita);
  const recentes = lista.filter((c) => !c.favorita);
  const conversaDoMenu = menuConv ? lista.find((c) => c.id === menuConv.id) : null;

  function abrirMenuConversa(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const LARGURA = 224;
    const ALTO = 140; // cabe o passo de confirmação, que é mais alto
    const abaixo = r.bottom + ALTO + 12 < window.innerHeight;
    setConfirmaApagar(false);
    setMenuConv({
      id,
      top: abaixo ? r.bottom + 6 : Math.max(8, r.top - ALTO - 6),
      left: Math.max(8, Math.min(r.right - LARGURA, window.innerWidth - LARGURA - 8)),
    });
  }

  function fecharMenuConversa() {
    setMenuConv(null);
    setConfirmaApagar(false);
  }

  async function alternarFavorita(id: string) {
    const c = lista.find((x) => x.id === id);
    await favoritarConversaCliente(id, !c?.favorita);
  }

  useEffect(() => {
    if (!menuConv) return;
    const fora = (e: MouseEvent) => {
      const alvo = e.target as HTMLElement;
      // O toque no próprio botão de pontos não fecha: ele reabre logo em seguida.
      if (alvo.closest?.("[data-menu-conversa]")) return;
      if (caixaMenu.current && !caixaMenu.current.contains(alvo)) fecharMenuConversa();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") fecharMenuConversa();
    };
    // A lista rola por baixo: um menu flutuante ficaria solto no ar — fecha.
    const rolar = () => fecharMenuConversa();
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", rolar, true);
    window.addEventListener("resize", rolar);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", rolar, true);
      window.removeEventListener("resize", rolar);
    };
  }, [menuConv]);

  return (
    <div className="dash-root min-h-dvh bg-dash-bg text-dash-fg">
      {/* O BOTÃO DE MENU EM TELA CHEIA (dono, 10/10/2026). Em `cheio` o CSS
          esconde o cabeçalho do Shell — onde mora o botão de menu — e a tela
          ficava SEM MENU no celular. O botão tem de viver AQUI (dentro do Shell),
          porque só aqui `setAberto` existe: um botão na página ficaria ACIMA
          deste componente e não alcançaria o estado (foi o defeito do primeiro
          conserto — o toque chegava e não fazia nada). Some com a gaveta aberta. */}
      {cheio && !aberto && (
        <button
          aria-label="Abrir menu"
          onClick={() => setAberto(true)}
          className="fixed left-5 top-5 z-40 grid h-9 w-9 place-items-center rounded-[10px] bg-dash-side/85 text-dash-muted backdrop-blur transition hover:text-dash-fg lg:hidden"
        >
          <IconeMenu />
        </button>
      )}
      {/* O MENU DA CONTA NO TOPO DIREITO DAS TELAS CHEIAS (dono, 12/10/2026):
          "O menu estava dentro do perfil, né? Eu clico na foto. ... Tá em cima, no
          chat." Em `cheio` o cabeçalho da casca é escondido — e com ele o AVATAR,
          que é onde vive o grupo secundário (Organizações, Explorar, Sistema). Sem
          isto a tela de chat/Arquiteto ficava SEM caminho nenhum para esse grupo: a
          gaveta não o mostra (decisão do dono) e o avatar não existia. Fica no topo
          direito, espelhando o botão de menu à esquerda, e some com a gaveta aberta. */}
      {cheio && !aberto && (
        <div className="fixed right-5 top-5 z-40 lg:right-[44px] lg:top-8">
          <MenuDaConta inicial={inicial} usuario={usuario} caminho={caminho} />
        </div>
      )}
      {/* overlay do menu no celular */}
      {aberto && (
        <button
          aria-label="Fechar menu"
          onClick={() => setAberto(false)}
          className="fixed inset-0 z-30 bg-dash-scrim/60 lg:hidden"
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
          className={`mt-5 hidden h-6 w-6 items-center justify-center text-dash-muted transition hover:text-dash-fg lg:flex ${
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
          {/* FAVORITAS no topo, separadas do histórico — padrão do ChatGPT
              (dono, 12/10/2026). Só aparece a seção se houver alguma: sem
              favoritas, a lateral fica exatamente como era. */}
          {favoritas.length > 0 && (
            <>
              <p className="px-4 text-[11px] uppercase tracking-[0.18em] text-dash-dim">Favoritas</p>
              <div className="mt-2 space-y-0.5 pr-1">
                {favoritas.map((c) => (
                  <LinhaConversa
                    key={c.id}
                    c={c}
                    ativa={c.id === aberta}
                    menuAberto={menuConv?.id === c.id}
                    onAbrir={() => abrirConversa(c.id)}
                    onMenu={(e) => abrirMenuConversa(e, c.id)}
                  />
                ))}
              </div>
            </>
          )}

          <p
            className={`px-4 text-[11px] uppercase tracking-[0.18em] text-dash-dim ${
              favoritas.length ? "mt-5" : ""
            }`}
          >
            Recentes
          </p>
          <div className="mt-2 max-h-[38vh] space-y-0.5 overflow-y-auto pr-1">
            {recentes.map((c) => (
              <LinhaConversa
                key={c.id}
                c={c}
                ativa={c.id === aberta}
                menuAberto={menuConv?.id === c.id}
                onAbrir={() => abrirConversa(c.id)}
                onMenu={(e) => abrirMenuConversa(e, c.id)}
              />
            ))}
            {!lista.length && (
              <p className="px-4 pb-1 text-[12px] leading-[1.5] text-dash-dim">
                Suas conversas aparecem aqui.
              </p>
            )}
          </div>
        </div>

        {/* O GRUPO SECUNDÁRIO SAIU DA GAVETA (dono, 12/10/2026): "Voltou esses menus
            laterais ... Explorar, organizações… já tínhamos tirado isso."

            A decisão registrada acima é que ele NÃO fica na lateral — vive no menu
            do AVATAR (topo à direita, como ChatGPT/Claude), em qualquer tamanho de
            tela. Ele estava DUPLICADO aqui: no celular aparecia na gaveta E no menu
            do avatar. Agora tem UM lugar só.

            Consequência honesta: nas telas de TELA CHEIA (início e Arquiteto) o
            cabeçalho da casca é escondido no celular, então o avatar não aparece
            nelas — dali se chega a estes itens abrindo "Projetos" (aí o cabeçalho
            existe). Se o dono quiser o atalho direto nessas telas, o caminho é pôr
            o avatar fixo no topo à direita — NÃO devolver a gaveta. */}

      </aside>

      {/* O MENU DA CONVERSA — favoritar / apagar (dono, 12/10/2026: "põe três
          pontos do lado da conversa, botão para apagar ou favoritar, como o GPT").
          Vive AQUI, fora da lateral, e é `fixed`: a lateral rola e tem transform,
          então um menu filho seria cortado no fim da lista. Apagar pede
          confirmação (é destrutivo) — em dois toques, sem `window.confirm`. */}
      {menuConv && conversaDoMenu && (
        <div
          ref={caixaMenu}
          style={{ top: menuConv.top, left: menuConv.left }}
          className="fixed z-[70] w-[224px] rounded-[14px] border border-dash-line bg-dash-card p-1.5 shadow-2xl"
        >
          {!confirmaApagar ? (
            <>
              <button
                type="button"
                onClick={() => {
                  void alternarFavorita(menuConv.id);
                  fecharMenuConversa();
                }}
                className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[13px] text-dash-muted transition hover:bg-dash-hair/[0.05] hover:text-dash-fg"
              >
                {conversaDoMenu.favorita ? (
                  <IconeEstrelaCheia className="h-4 w-4 text-dash-brand" />
                ) : (
                  <IconeEstrela className="h-4 w-4" />
                )}
                {conversaDoMenu.favorita ? "Desfavoritar" : "Favoritar"}
              </button>

              <button
                type="button"
                onClick={() => setConfirmaApagar(true)}
                className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[13px] text-dash-muted transition hover:bg-red-500/12 hover:text-red-300"
              >
                <IconeLixeira className="h-4 w-4" />
                Apagar
              </button>
            </>
          ) : (
            <div className="p-2">
              <p className="text-[12.5px] font-semibold text-dash-fg">Apagar esta conversa?</p>
              <p className="mt-1 text-[11.5px] leading-[1.45] text-dash-muted">
                Não tem como voltar atrás.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={fecharMenuConversa}
                  className="flex-1 rounded-[10px] bg-dash-raise px-3 py-2 text-[12px] text-dash-muted transition hover:text-dash-fg"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void apagarConversaCliente(menuConv.id);
                    fecharMenuConversa();
                  }}
                  className="flex-1 rounded-[10px] bg-red-500/90 px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-red-500"
                >
                  Apagar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <main
        className={`transition-all ${recolhida ? "lg:ml-[84px]" : "lg:ml-[320px]"} ${
          cheio ? "dash-cheio relative flex h-dvh flex-col overflow-hidden" : "min-h-dvh"
        }`}
      >
        <div
          className={
            cheio
              ? "relative flex h-full min-h-0 w-full max-w-none flex-col"
              : "mx-auto max-w-[1145px] px-5 pb-16 pt-5 sm:px-8 lg:px-[44px] lg:pt-10"
          }
        >
          {/* Em `cheio` o cabeçalho FLUTUA sobre o conteúdo (pedido do dono, 10/11/2026):
              antes ele empurrava o conteúdo, e a tela cheia ficava com uma faixa vazia em
              cima e sem o seletor de modo à vista. Agora o céu/3D vai até a borda e o
              seletor de modo continua acessível, como no toggle do chat/orb. */}
          <header
            className={
              "flex items-center justify-between gap-4 " +
              (cheio
                ? "absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-[#04060c]/92 via-[#04060c]/55 to-transparent px-5 pb-7 pt-4 sm:px-8 lg:px-[44px] lg:pt-6"
                : "relative")
            }
          >
            {cabecalhoCentro && (
              <div className="pointer-events-auto absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
                {cabecalhoCentro}
              </div>
            )}
            <div className="flex min-w-0 items-center gap-4">
              <button
                aria-label="Abrir menu"
                onClick={() => setAberto(true)}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-dash-side text-dash-muted lg:hidden"
              >
                <IconeMenu />
              </button>
              <h1 className="truncate text-[20px] text-dash-fg">{titulo}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              {cabecalhoDireita}
              {/* Sininho de VERDADE (11/11/2026): antes era um `<span>` só de
                  enfeite. Agora conta as pastas compartilhadas com esta conta e
                  leva DIRETO na pasta. */}
              <Sininho />
              <MenuDaConta inicial={inicial} usuario={usuario} caminho={caminho} />
            </div>
          </header>

          <div className={cheio ? "min-h-0 flex-1" : "mt-8"}>{children}</div>
        </div>
      </main>
    </div>
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
  const { tema, alternar: alternarTema } = usarTema();
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
        className={`grid h-[34px] w-[34px] place-items-center rounded-full border text-[13px] text-dash-fg transition ${
          aberto
            ? "border-dash-brand bg-dash-raise"
            : "border-dash-hair/15 bg-dash-raise hover:border-dash-brand/60"
        }`}
      >
        {inicial}
      </button>

      {aberto && (
        <div className="absolute right-0 top-[42px] z-50 w-[236px] rounded-[16px] border border-dash-line bg-dash-card p-1.5 shadow-2xl">
          <div className="px-3 py-2.5">
            <p className="truncate text-[12.5px] font-semibold text-dash-fg">
              {usuario?.nome || "Sua conta"}
            </p>
            {usuario?.email && (
              <p className="truncate text-[11.5px] text-dash-muted">{usuario.email}</p>
            )}
          </div>

          <div className="my-1 h-px bg-dash-hair/[0.08]" />

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
                    : "text-dash-fg/85 hover:bg-dash-hair/[0.06] hover:text-dash-fg"
                }`}
              >
                <span className="shrink-0">{i.icone}</span>
                {i.label}
              </Link>
            ))}
          </nav>

          <div className="my-1 h-px bg-dash-hair/[0.08]" />

          <Link
            href="/perfil"
            onClick={() => setAberto(false)}
            className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[13px] text-dash-fg/85 transition hover:bg-dash-hair/[0.06] hover:text-dash-fg"
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

          {/* O TEMA — escuro (padrão, a cara da Mirai) ou claro. O botão mostra
              o ícone do tema de DESTINO ("sol" = vai para o claro), que é como
              se lê a ação. A escolha fica guardada e o script do <head> a
              aplica antes da primeira pintura, sem piscar. */}
          <button
            onClick={() => {
              alternarTema();
              setAberto(false);
            }}
            className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[13px] text-dash-fg/85 transition hover:bg-dash-hair/[0.06] hover:text-dash-fg"
          >
            {tema === "claro" ? (
              <IconeLua className="h-[17px] w-[17px] shrink-0" />
            ) : (
              <IconeSol className="h-[17px] w-[17px] shrink-0" />
            )}
            {tema === "claro" ? "Tema escuro" : "Tema claro"}
          </button>

          <button
            onClick={sair}
            disabled={saindo}
            className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-[13px] text-dash-bad transition hover:bg-dash-hair/[0.06] disabled:opacity-60"
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

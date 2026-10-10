"use client";

// Primeira tela do MIRAI OS: a CONVERSA ocupa a tela inteira, com o menu ao
// lado (como ChatGPT/Claude). No topo, um seletor troca entre dois modos no
// MESMO lugar, sem navegar de página:
//   • Chat — a conversa por escrito (o mesmo corpo de `/chat`);
//   • Orb  — a presença por voz (o componente de sempre, `MiraiApp`).
//
// A troca é um cross-fade: as duas camadas ficam montadas e uma apaga enquanto
// a outra acende (opacidade, ~300ms — transição de CSS, sem rota nova). A camada
// do Orb só monta de fato depois da PRIMEIRA visita ao modo voz: quem só quer
// escrever não é incomodado com o pedido de microfone da wake word.
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import Shell, { useMenu } from "@/components/dash/Shell";
import { IconeMenu } from "@/components/dash/icons";
import ChatEscrito from "@/components/dash/ChatEscrito";
import SeletorModo from "@/components/dash/SeletorModo";

const MiraiApp = dynamic(() => import("./MiraiApp"), { ssr: false });

type Conta = { nome?: string; email?: string; ehDono?: boolean };
type Modo = "chat" | "orb";

export default function Page() {
  const [conta, setConta] = useState<Conta | null>(null);
  const [modo, setModo] = useState<Modo>("chat");
  const [orbMontado, setOrbMontado] = useState(false);
  // A tela do chat avisa quando está na TELA DE INÍCIO (conversa vazia). Nesse
  // palco limpo o seletor Chat/Orb ganha corpo (ver `grande` abaixo); na
  // conversa em andamento ele volta ao tamanho de sempre.
  const [inicio, setInicio] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        d?.user &&
        setConta({
          nome: d.user.name,
          email: d.user.email,
          ehDono: Boolean(d.user.ehDono),
        }),
      )
      .catch(() => {
        /* sem conta: a tela continua, só o menu de dono não aparece */
      });
  }, []);

  function trocar(m: Modo) {
    // Monta o Orb no primeiro acesso ao modo voz (e mantém montado: as trocas
    // seguintes já fazem fade com as duas camadas vivas).
    if (m === "orb") setOrbMontado(true);
    setModo(m);
  }

  // O seletor só cresce no palco limpo da tela de início, e só no modo Chat
  // (no modo Orb ele fica discreto, que a estrela ali é o próprio Orb).
  const menu = useMenu();
  const seletorGrande = modo === "chat" && inicio;

  return (
    <Shell titulo="Mirai" usuario={conta} recolhidaInicial cheio>
      {/* tela cheia: `.tela-cheia` prende a tela no miolo do menu (mesma ideia
          do antigo orb-cheio), sem cartão e sem margem nas laterais */}
      <div className="tela-cheia flex flex-col overflow-hidden bg-dash-bg">
        {/* topo: o seletor Chat/Orb — a única moldura da tela. Na tela de
            início a linha de baixo some (nada de moldura no palco limpo) e o
            seletor ganha corpo. */}
        <div
          className={`relative z-30 flex shrink-0 items-center justify-center border-b px-4 transition-all ${
            seletorGrande ? "border-transparent py-4" : "border-white/[0.07] py-2.5"
          }`}
        >
          {/* O BOTÃO DE MENU (dono, 10/10/2026): a tela de chat é `cheio` e o CSS
              esconde o cabeçalho do Shell — onde mora o botão de menu. Sem este,
              no celular a tela do chat ficava SEM MENU. Só no celular (lg:hidden);
              no desktop a lateral já está sempre à vista. */}
          <button
            aria-label="Abrir menu"
            onClick={() => menu.abrir()}
            className="absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-[10px] text-dash-muted transition hover:text-white lg:hidden"
          >
            <IconeMenu />
          </button>
          <SeletorModo
            rotuloAria="Modo de conversa"
            grande={seletorGrande}
            ativo={modo}
            onTrocar={(m) => trocar(m as Modo)}
            opcoes={[
              { id: "chat", rotulo: "Chat" },
              { id: "orb", rotulo: "Orb" },
            ]}
          />
        </div>

        {/* palco: as duas camadas ficam uma sobre a outra e fazem cross-fade */}
        <div className="relative min-h-0 flex-1">
          {/* camada Chat (escrita) */}
          <div
            className={`absolute inset-0 z-10 bg-dash-bg transition-opacity duration-300 ease-out ${
              modo === "chat" ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            aria-hidden={modo !== "chat"}
          >
            <ChatEscrito cheio onInicioChange={setInicio} />
          </div>

          {/* camada Orb (voz) — só monta depois da primeira visita ao modo voz */}
          <div
            className={`absolute inset-0 z-0 transition-opacity duration-300 ease-out ${
              modo === "orb" ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            aria-hidden={modo !== "orb"}
          >
            {orbMontado && <MiraiApp />}
          </div>
        </div>
      </div>
    </Shell>
  );
}

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
import Shell from "@/components/dash/Shell";
import ChatEscrito from "@/components/dash/ChatEscrito";
import SeletorModo from "@/components/dash/SeletorModo";
import SessaoVencida from "@/components/dash/SemSessao";

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
  // Sessão vencida com a tela já aberta: a causa é a sessão, e a saída é entrar
  // de novo — não faz sentido deixar a pessoa digitando para o vazio.
  const [semSessao, setSemSessao] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => {
        // SESSÃO VENCIDA (dono, 11/10/2026): o 401 era engolido e a tela seguia
        // como se estivesse tudo bem — até o primeiro envio falhar sem explicação.
        if (r.status === 401) setSemSessao(true);
        return r.ok ? r.json() : null;
      })
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
  const seletorGrande = modo === "chat" && inicio;

  // Sessão vencida: a tela certa, com a saída certa (entrar de novo).
  if (semSessao) {
    return (
      <Shell titulo="Mirai" usuario={conta} recolhidaInicial cheio>
        <div className="grid h-full w-full place-items-center">
          <SessaoVencida oQue="sua conversa continua aqui." />
        </div>
      </Shell>
    );
  }

  return (
    <Shell titulo="Mirai" usuario={conta} recolhidaInicial cheio>
      {/* tela cheia: `.tela-cheia` prende a tela no miolo do menu (mesma ideia
          do antigo orb-cheio), sem cartão e sem margem nas laterais */}
      <div className="tela-cheia relative flex flex-col overflow-hidden bg-dash-bg">
        {/* topo: o seletor Chat/Orb — a única moldura da tela. Na tela de
            início a linha de baixo some (nada de moldura no palco limpo) e o
            seletor ganha corpo.

            NO MODO ORB O TOPO SAI DO FLUXO (dono, 24/11/2026: "tira a barra
            escura atrás do toogle"). Enquanto ele era `relative`, o palco
            começava em y=51 e a faixa de cima mostrava o `bg-dash-bg` da
            moldura — uma barra chapada cortando o céu. Absoluto, o palco ocupa
            a tela inteira e o toggle flutua SOBRE o céu. */}
        <div
          className={`z-30 flex items-center justify-center border-b px-4 transition-all ${
            modo === "orb"
              ? // NO MODO ORB: o topo é FIXO na janela (não na moldura), e isso
                // resolve os dois pedidos do dono (24/11/2026):
                //  "deixa o toggle centralizado com a orb" — o orb vive num
                //     `.mirai-presence` fixo na janela (centro em 50vw); preso à
                //     moldura, o toggle centrava 42 px à direita dele;
                //  "abaixe a altura dele pra seguir a linha da foto de perfil" —
                //     mesma altura (top-5 / lg:top-8) e mesma caixa de 34 px do
                //     botão de perfil, então o toggle entra na MESMA linha dele.
                "fixed left-0 top-5 h-[34px] w-full border-transparent lg:top-8"
              : seletorGrande
                ? "relative shrink-0 border-transparent py-4"
                : "relative shrink-0 border-dash-hair/[0.07] py-2.5"
          }`}
        >
          <SeletorModo
            rotuloAria="Modo de conversa"
            grande={seletorGrande}
            semFundo={modo === "orb"}
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

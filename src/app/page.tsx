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
            seletor ganha corpo — ver `seletorGrande` abaixo, que hoje só muda o
            CORPO do seletor (o topo já não tem moldura nenhuma). */}
        <div
          className={
            // O TOPO SAI DO FLUXO NAS DUAS TELAS e não tem moldura nenhuma.
            // Nasceu no modo Orb (dono, 24/11/2026: "tira essa barra escura
            // atrás do toogle") e o chat veio atrás ("olha aqui no chat mesma
            // altura do orb e tira essas linhas e nome do chat aí"). Fixo na
            // JANELA, na mesma linha do botão de perfil (top-5 / lg:top-8,
            // caixa de 34px): mesma altura nos dois modos e no celular.
            "fixed left-0 top-5 z-30 flex h-[34px] w-full items-center justify-center px-4 transition-all lg:top-8"
          }
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
          {/* camada Chat (escrita). O `pt` reserva a faixa do seletor, que agora
              é fixo e flutua sobre a tela nos dois modos: sem ele a primeira
              mensagem nasceria embaixo do seletor. */}
          <div
            className={`absolute inset-0 z-10 bg-dash-bg pt-[62px] transition-opacity duration-300 ease-out lg:pt-[74px] ${
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

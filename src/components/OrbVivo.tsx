"use client";

// OrbVivo — o orb da Mirai em produção, rodando o MOTOR DO DONO.
//
// O motor (`components/orb/MiraiOrb.jsx`) é o arquivo do pacote `mirai-orb.zip`,
// byte a byte igual: 24.178 caracteres, sem uma linha alterada. Este arquivo é
// só a INSTALAÇÃO dele na tela.
//
// REGRA QUE FICOU (dono, 24/11/2026):
//   "Quero exatamente como o que eu te enviei."
// Nada de gosto meu por cima do motor — nem brilho, nem contorno, nem escala.
//
// O QUE JÁ ESTEVE AQUI E SAIU (registro, para não voltar por engano):
//   · um anel de neon em CSS (`.mirai-orb-neon`) — era meu, do orb WebGL antigo;
//   · um halo de luz em CSS (`.mirai-orb-halo`) — também meu;
//   · `glow: 0.62` e `bloom: 1.05` — números de quem desenhou o motor, que eu
//     havia subido por conta própria. São dele, não meus;
//   · um canvas 1,7× maior com `scale` compensado — era remédio para o brilho
//     ser fatiado na borda. Saía do desenho do pacote: fora.
//
// O que fica — e é do LEIAME, não de gosto:
//   · `space`, a cor de fundo do site. MEDIDA no pixel ao lado do canvas:
//     `--dash-bg` (18,20,22). Sem isso sobra um quadrado de 3 níveis na borda.
//
// PROTOCOLO DARK MATTER: ligado e INATIVO. O motor já sabe fazer a transição;
// quem decide ligar é `components/orb/protocoloDarkMatter.ts` — hoje com o
// interruptor em `false`, esperando o dono chamar.

import { useEffect, useState } from "react";
import MiraiOrb from "@/components/orb/MiraiOrb";
import type { EstadoMotor, ModoMotor, TemaMotor } from "@/components/orb/MiraiOrb";

export type EstadoOrb = "idle" | "listening" | "thinking" | "speaking" | "executing" | "done";

// O motor conhece quatro estados; o app fala seis. Os dois que sobram são
// dobrados no vizinho: "executing" é pensar trabalhando, "done" é o fim da fala.
const ESTADO: Record<EstadoOrb, EstadoMotor> = {
  idle: "idle",
  listening: "listening",
  thinking: "thinking",
  speaking: "speaking",
  executing: "thinking",
  done: "idle",
};

// Cor de fundo ATRÁS do orb — medida, não deduzida. A primeira tentativa usou o
// fundo do BackgroundCanvas (#03040d) e o canvas pintava (21,21,21) contra
// (18,20,22) da página: um quadradinho de 3 níveis aparecia na borda.
const FUNDO_ORB: [number, number, number] = [18, 20, 22];

// TAMANHO — calibrado CONTRA A REFERÊNCIA, não por impressão.
// (dono, 24/11/2026: "olha como ele fica grandão no meio e lindo. vc mando ele
// pequeno dentro de um circulo")
//
// Como calibrei — pelo CALOR DA COR (vermelho menos azul), que isola o laranja
// do fundo sem depender de limiar de brilho. O critério é "área acesa": o
// diâmetro onde o calor cai a 20% do máximo.
//   sua referência  → área acesa = 70% do menor lado
//   canvas 1,00×    → área acesa = 58%   (aparecia pequeno dentro do brilho)
//   canvas 1,20×    → área acesa ≈ 70%   ← é o que vale
// O motor NÃO foi tocado: quem mudou de tamanho foi a CAIXA onde ele desenha,
// escolha de instalação. O raio da esfera continua nos 27% do pacote.
const CANVAS_POR_TELA = 1.2;

export default function OrbVivo({
  status = "idle",
  audioLevel = 0,
  awake = false,
  mode = "normal",
  theme = "dark",
}: {
  status?: EstadoOrb;
  audioLevel?: number;
  awake?: boolean;
  mode?: ModoMotor;
  theme?: TemaMotor;
}) {
  const [tela, setTela] = useState(320);

  // A medida vem da JANELA. (24/11/2026: tentei medir o recipiente real com
  // ResizeObserver e o orb parou de renderizar no app — rollback imediato. A
  // lição ficou: mudança de medida do orb só entra com verificação de que o
  // componente continua montando, nunca "no escuro".)
  useEffect(() => {
    const update = () => {
      setTela(Math.max(200, Math.min(window.innerWidth, window.innerHeight)));
    };
    update();
    // REMEDIÇÃO (24/11/2026). O orb saía pequeno e não se corrigia: a medida
    // era lida UMA vez, no instante da montagem. Se a janela ainda não
    // estivesse assentada naquele instante (carregamento, troca de aba,
    // pré-visualização), o valor ficava congelado no padrão (`320`) e nenhum
    // evento voltava a corrigir — era exatamente o "orb pequeno dentro do
    // círculo" que o dono apontou. Agora remedimos logo depois de montar e
    // sempre que a aba volta ao foco. Sem observer: nada de laço de estado.
    const tempos = [120, 400, 1200, 3000].map((ms) => window.setTimeout(update, ms));
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    document.addEventListener("visibilitychange", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      tempos.forEach((t) => window.clearTimeout(t));
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      document.removeEventListener("visibilitychange", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  // A esfera é quem manda no tamanho; o canvas ganha a folga de 1,48× para ela
  // caber com 80% da tela. Com o canvas maior que a caixa, ele é posicionado de
  // forma absoluta no centro — `left/top 50% + translate` é o que centra de
  // verdade (grid com filho maior alinha no INÍCIO e a esfera sai de quadro).
  const canvas = Math.round(tela * CANVAS_POR_TELA * (awake ? 1.04 : 1));
  // A casca (área de clique e caixa do layout) fica menor que o canvas: o
  // "toque para despertar" cobre o miolo aceso, e a poeira pode passar das
  // bordas da caixa sem empurrar o resto da tela.
  const esfera = Math.round(canvas * 0.62);

  return (
    <div className="mirai-orb-shell" style={{ width: esfera, height: esfera }}>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      >
        <MiraiOrb
          // `key` para REMONTAR o motor quando o tamanho muda. O motor mede o
          // canvas uma vez, na criação (`resize()` no init) — se a caixa mudar
          // depois, ele segue desenhando na medida velha. MEDIDO no celular: com
          // canvas de 390px ele desenhou com 195 (metade), o conteúdo saiu no
          // canto superior esquerdo e a esfera virou um ponto de 107px. Com a
          // `key`, o motor nasce já com a medida certa.
          key={`orb-${canvas}`}
          size={canvas}
          state={ESTADO[status] ?? "idle"}
          level={audioLevel}
          mode={mode}
          theme={theme}
          options={{ space: FUNDO_ORB }}
        />
      </div>
    </div>
  );
}

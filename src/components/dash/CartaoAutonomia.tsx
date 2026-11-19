"use client";

/**
 * CARTÃO DE AUTONOMIA — o "agir sozinho" saiu do campo de escrita e veio
 * para a CONFIGURAÇÃO DA CONTA (dono, 19/11/2026, verbatim):
 *
 *   "ficou feio só coloca o agir sozinho em configuração da conta e n ali"
 *
 * ─── Por que aqui e não na caixa ────────────────────────────────────────────
 * O checkbox dentro do composer ficava no meio do campo de escrever, competindo
 * com o texto. Autonomia é preferência de CONTA, não um controle de digitação:
 * decide se a Mirai executa sem perguntar ou se propõe e espera aprovação. Uma
 * escolha desse peso mora na tela de configuração, não no caminho do Enter.
 *
 * ─── Onde o valor vive (e o que ele NÃO é) ─────────────────────────────────
 * O valor é a preferência `mirai:autonomia` deste navegador: "sozinho" ou
 * "aprovar". O chat lê a cada mensagem e envia no corpo do pedido (o servidor
 * aplica por requisição). Mudar aqui dispara o evento `mirai:autonomia`, então
 * a mudança vale na hora no chat e no console — sem recarregar a página.
 *
 * NÃO é uma permissão de plataforma: quem manda no que a IA pode fazer continua
 * sendo o servidor. Isto é só o padrão de comportamento desta pessoa.
 */

import { useEffect, useState } from "react";

import { Card, CardTitulo } from "@/components/dash/kit";

const CHAVE = "mirai:autonomia";

function ler(): boolean {
  try {
    return localStorage.getItem(CHAVE) === "sozinho";
  } catch {
    return false;
  }
}

export default function CartaoAutonomia() {
  const [sozinho, setSozinho] = useState(false);
  const [pronto, setPronto] = useState(false);

  // Lê só depois de montar: `localStorage` não existe no servidor e ler no
  // primeiro render causaria divergência de hidratação.
  useEffect(() => {
    setSozinho(ler());
    setPronto(true);
  }, []);

  function alternar(novo: boolean) {
    setSozinho(novo);
    try {
      localStorage.setItem(CHAVE, novo ? "sozinho" : "aprovar");
    } catch {
      /* navegador sem armazenamento: a escolha vale só nesta sessão */
    }
    window.dispatchEvent(
      new CustomEvent("mirai:autonomia", { detail: novo ? "sozinho" : "aprovar" }),
    );
  }

  return (
    <Card>
      <CardTitulo rotulo="Autonomia" titulo="Como a Mirai age" />

      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-dash-fg">Agir sozinho</p>
          <p className="mt-1 text-[13px] leading-relaxed text-dash-muted">
            {sozinho
              ? "Ligado: a Mirai executa as tarefas sem pedir aprovação a cada passo."
              : "Desligado: a Mirai propõe o plano e espera você aprovar antes de executar."}
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={sozinho}
          aria-label="Agir sozinho"
          disabled={!pronto}
          onClick={() => alternar(!sozinho)}
          className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors ${
            sozinho
              ? "border-dash-brand bg-dash-brand"
              : "border-dash-hair/25 bg-dash-raise"
          } ${pronto ? "" : "opacity-60"}`}
        >
          <span
            className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow transition-all ${
              sozinho ? "left-[26px]" : "left-[3px]"
            }`}
          />
        </button>
      </div>

      <p className="mt-4 border-t border-dash-hair/[0.07] pt-3 text-[11.5px] leading-relaxed text-dash-dim">
        Preferência salva <span className="text-dash-muted">neste navegador</span> e enviada
        junto com cada mensagem. Vale para o chat e para o console. Não altera permissões da
        plataforma — o servidor continua decidindo o que pode ser executado.
      </p>
    </Card>
  );
}

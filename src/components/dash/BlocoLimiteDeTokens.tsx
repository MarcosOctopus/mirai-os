"use client";

/**
 * O BLOCO "TOKENS DO MÊS ACABARAM" NA CONVERSA (dono, 27/11/2026).
 *
 * Antes, quando a franquia do plano estourava, a resposta na tela era
 * **"Não consegui falar com a Mirai agora (402). Tenta de novo."** — status de
 * HTTP na cara do cliente e um conselho falso ("tentar de novo" não resolve: o
 * mês é que virou).
 *
 * Este bloco entra no lugar do erro, como PEÇA da conversa — mesmo padrão dos
 * outros marcadores (`[[arquivo:...]]` vira card; `[[limite:tokens|usado|teto]]`
 * vira este bloco). Ele não é um alerta vermelho de falha: é um aviso de limite,
 * com o número na mão, a garantia de que o ACESSO continua, e os dois caminhos
 * que a pessoa tem (subir de plano ou usar a própria chave).
 *
 * O texto que vale é o mesmo do servidor (`mensagemDeTokensEsgotados`) — aqui só
 * ganha forma. Número inventado nunca: sem leitura do medidor, o bloco fala de
 * franquia sem citar valores.
 */

import { mensagemDeTokensEsgotados, TITULO_TOKENS_ESGOTADOS } from "@/lib/tokens-esgotados";

export function BlocoLimiteDeTokens({ usado, teto }: { usado: number | null; teto: number | null }) {
  const paragrafos = mensagemDeTokensEsgotados(usado, teto).split("\n\n");

  return (
    <div className="rounded-[14px] border border-dash-hair/15 bg-white/[0.04] px-4 py-3.5">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-dash-dim">
        Limite do plano
      </p>
      <p className="mt-1.5 text-[15.5px] font-semibold leading-[1.5] text-dash-fg">
        {TITULO_TOKENS_ESGOTADOS}
      </p>

      <div className="mt-3 space-y-[10px]">
        {paragrafos.map((p, i) => {
          const linhas = p.split("\n");
          const itens = linhas.filter((l) => /^\s*-\s+/.test(l));
          if (itens.length && itens.length === linhas.length) {
            return (
              <ul
                key={i}
                className="space-y-[5px] pl-[20px] text-[15px] leading-[1.7] text-dash-fg/[0.9] marker:text-dash-dim list-disc"
              >
                {itens.map((l, j) => (
                  <li key={j}>{l.replace(/^\s*-\s+/, "")}</li>
                ))}
              </ul>
            );
          }
          return (
            <p key={i} className="text-[15px] leading-[1.7] text-dash-fg/[0.9]">
              {linhas.map((l, j) => (
                <span key={j}>
                  {j > 0 && <br />}
                  {l}
                </span>
              ))}
            </p>
          );
        })}
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <a
          href="/planos"
          className="rounded-[9px] bg-dash-brand px-3 py-1.5 text-[12.5px] font-semibold text-white transition hover:bg-dash-brandHi"
        >
          Ver planos
        </a>
        <a
          href="/dashboard/chaves"
          className="rounded-[9px] border border-dash-hair/25 px-3 py-1.5 text-[12.5px] font-medium text-dash-fg/90 transition hover:border-dash-brand hover:text-dash-fg"
        >
          Usar minha própria chave
        </a>
      </div>
    </div>
  );
}

export default BlocoLimiteDeTokens;

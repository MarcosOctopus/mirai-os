"use client";

/**
 * CAIXA DE ENTRADA — a única caixa de escrever do chat.
 *
 * ─── Por que ela é assim (dono, 19/11/2026, verbatim) ────────────────────────
 *
 *   1) "EU ESTOU NO CHAT / E TA ERRADO. TENTA IMITAR ESSA CAIXA"
 *      (print do composer do ChatGPT: UM retângulo arredondado, controles
 *       DENTRO dele — "+" à esquerda, modelo/ditado/enviar à direita, e o
 *       rodapé de avisos FORA da caixa.)
 *
 *   2) "acho que ficou otimo assim só colocar a parte de leve e high do
 *      supernova aonde esta o leve ali hj e tentar deixar em uma linha igual
 *      era antes"
 *      → o seletor do Super Nova (níveis Leve / Avançado) pega o lugar que era
 *        do chip de MODO, e a caixa volta a ser UMA LINHA (anexo, campo e
 *        controles lado a lado), como era antes.
 *
 * Eram DOIS desenhos diferentes da mesma caixa (a tela de início de um jeito e
 * a conversa de outro); agora as duas telas usam ESTE componente.
 *
 * ─── O "agir sozinho" saiu da caixa (dono, 19/11/2026, verbatim) ─────────────
 *   "ficou feio só coloca o agir sozinho em configuração da conta e n ali"
 *   → a autonomia é preferência da CONTA, não um controle no meio do campo de
 *     escrita. Ela mora em /perfil (CartaoAutonomia) e chega aqui pelo evento
 *     `mirai:autonomia`; este componente não desenha mais o checkbox.
 *
 * Regras que não se negociam aqui:
 *  - o anexo consulta o caminho de arquivo real (o `<input type="file">` fica
 *    na tela e chega por `inputArquivo`);
 *  - o microfone só aparece LIGADO quando o navegador tem ditado de verdade
 *    (`temDitado`) — sem caminho, ele fica desabilitado com o motivo escrito;
 *  - o envio desabilita com a caixa vazia e sem anexo.
 */

import type { RefObject } from "react";
import { IconeMais, IconeMicrofone, IconeSeta } from "@/components/dash/icons";
import SeletorDeModelo from "@/components/dash/SeletorDeModelo";
import { MAX_UPLOAD_ROTULO } from "@/lib/upload-tipos";

type Props = {
  texto: string;
  setTexto: (v: string) => void;
  enviando: boolean;
  podeEnviar: boolean;
  enviar: () => void;
  subirArquivos: (files: File[]) => void;
  inputArquivo: RefObject<HTMLInputElement | null>;
  caixa?: RefObject<HTMLTextAreaElement | null>;
  setCaixaFocada?: (v: boolean) => void;

  modelo: string;
  setModelo: (id: string) => void;

  ouvindo: boolean;
  temDitado: boolean;
  alternarDitado: () => void;

  /** Rótulo já formatado do consumo ("44 kB de 3,00 GB") — quem formata é a tela. */
  usoTexto?: string | null;
};

export default function CaixaDeEntrada({
  texto,
  setTexto,
  enviando,
  podeEnviar,
  enviar,
  subirArquivos,
  inputArquivo,
  caixa,
  setCaixaFocada,
  modelo,
  setModelo,
  ouvindo,
  temDitado,
  alternarDitado,
  usoTexto,
}: Props) {
  const redondo =
    "grid h-11 w-11 shrink-0 place-items-center rounded-full transition";

  return (
    <>
      {/* A CAIXA — uma linha só: anexo, campo e controles lado a lado */}
      <div
        className="rounded-[26px] border border-dash-hair/10 bg-dash-card p-2 shadow-2xl transition focus-within:border-dash-brand/60"
        style={{ colorScheme: "dark" }}
      >
        <div className="flex items-end gap-1 sm:gap-1.5">
          <button
            type="button"
            onClick={() => inputArquivo.current?.click()}
            disabled={enviando}
            aria-label="Anexar arquivo"
            title={`Anexar arquivo (até ${MAX_UPLOAD_ROTULO} por arquivo)`}
            className={`${redondo} text-dash-muted hover:bg-dash-hair/[0.06] hover:text-dash-fg disabled:opacity-40`}
          >
            <IconeMais className="h-[19px] w-[19px]" />
          </button>

          
          <textarea
            ref={caixa}
            value={texto}
            rows={1}
            onFocus={() => setCaixaFocada?.(true)}
            onBlur={() => setCaixaFocada?.(false)}
            onChange={(e) => setTexto(e.target.value)}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData?.files || []);
              if (files.length) {
                e.preventDefault();
                void subirArquivos(files);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar();
              }
            }}
            placeholder="Escreve para a Mirai…"
            style={{ transition: "height 220ms cubic-bezier(.22,.61,.36,1)" }}
            className="min-h-[40px] max-h-[200px] min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-2 py-[9px] text-[15px] leading-[22px] text-dash-fg outline-none placeholder:text-dash-dim"
          />

          {/* AQUI ficam os Super Nova (dono, 19/11/2026: "deixa esses dois
              invocáveis como skill e coloca aqui os supernovas"). O seletor de
              MODO saiu da linha — Observador e Sr. Xi continuam vivos e são
              invocados pelo PEDIDO (o servidor escala pelo texto da mensagem),
              como skill: eles chamam `fontes_curadas` e `pesquisar_a_fundo`. */}

          {/* O Super Nova no lugar que era do "Leve" — níveis Leve / Avançado. */}
          <SeletorDeModelo modelo={modelo} aoTrocar={setModelo} desabilitado={enviando} />

          <button
            type="button"
            onClick={alternarDitado}
            disabled={!temDitado}
            aria-pressed={ouvindo}
            aria-label={temDitado ? (ouvindo ? "Parar ditado" : "Ditar") : "Ditado por voz indisponível"}
            title={
              temDitado
                ? ouvindo
                  ? "Parar ditado"
                  : "Ditar (voz, pt-BR)"
                : "Seu navegador não oferece ditado por voz"
            }
            className={`${redondo} ${
              !temDitado
                ? "cursor-not-allowed text-dash-dim opacity-50"
                : ouvindo
                  ? "bg-dash-bad/20 text-dash-bad ring-1 ring-dash-bad/50"
                  : "text-dash-muted hover:bg-dash-hair/[0.06] hover:text-dash-fg"
            }`}
          >
            <IconeMicrofone className="h-[19px] w-[19px]" />
          </button>

          <button
            type="button"
            onClick={() => void enviar()}
            disabled={enviando || !podeEnviar}
            aria-label="Enviar"
            title="Enviar (Enter)"
            className={`${redondo} bg-dash-brand text-white hover:bg-dash-brandHi disabled:opacity-40`}
          >
            <IconeSeta />
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 px-2 text-[10px] text-dash-dim">
        <span>Até {MAX_UPLOAD_ROTULO} por arquivo · documento, imagem ou áudio</span>
        {ouvindo ? (
          <span className="flex items-center gap-1.5 text-dash-brand">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-dash-brand" />
            Ouvindo…
          </span>
        ) : (
          usoTexto && <span>{usoTexto}</span>
        )}
      </div>
    </>
  );
}

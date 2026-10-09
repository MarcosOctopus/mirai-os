// CONVERSOR DE FONTE: formato de DESKTOP (TTF/OTF) → formato da WEB (WOFF2).
//
// Por que existe (dono, 09/10/2026): "no caso de mandar em ttf e otf converte
// entao ne?". Sim — e a conversão é feita AQUI, antes de guardar, para que o
// projeto (e o site publicado) fiquem sempre com o formato que o navegador usa:
// menor (66–83% em fontes reais) e sem depender de formato antigo.
//
// `wawoff2` é o conversor oficial do Google (woff2) compilado para WebAssembly.
// SÓ SERVIDOR — e declarado em `serverExternalPackages` no next.config.ts, senão
// o build tenta embalar o `.wasm` e quebra.
import woff2 from "wawoff2";

export type ResultadoConversao =
  | { ok: true; bytes: Buffer }
  | { ok: false; erro: string };

/**
 * Converte uma fonte de desktop em WOFF2. Nunca lança: qualquer problema volta
 * como recusa com recado (a rota transforma em 415). A saída é CONFERIDA (tem de
 * começar com `wOF2`) — conversor que devolve lixo não vira asset do projeto.
 */
export async function converterParaWoff2(entrada: Buffer): Promise<ResultadoConversao> {
  if (!entrada || entrada.length < 32) {
    return { ok: false, erro: "o arquivo é curto demais para ser uma fonte." };
  }
  try {
    const saida = Buffer.from(await woff2.compress(entrada));
    if (saida.length < 4 || saida.subarray(0, 4).toString("latin1") !== "wOF2") {
      return { ok: false, erro: "a conversão saiu inválida — a fonte não foi guardada." };
    }
    return { ok: true, bytes: saida };
  } catch {
    return {
      ok: false,
      erro: "este arquivo não é uma fonte válida (ou está corrompido) — não deu para converter para WOFF2.",
    };
  }
}

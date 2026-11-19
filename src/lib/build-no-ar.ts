import fs from "node:fs";
import path from "node:path";

/**
 * O SELO DA PUBLICAÇÃO (dono, 19/11/2026) — um valor só, para a aba saber se
 * está rodando código velho.
 *
 * POR QUE EXISTE, e não é o `.next/BUILD_ID` direto: o `meta x-build` era lido
 * de `.next/BUILD_ID` DURANTE o build — e nesse instante esse arquivo ainda é o
 * do build ANTERIOR, porque o novo build escreve em `.next-novo` e só no fim é
 * promovido. Resultado medido: o meta ficava SEMPRE um build atrás do `/version`,
 * o `AtualizadorAutomatico` via divergência permanente e recarregava a aba 3x em
 * toda publicação — matando dropdown aberto, texto digitado, tudo.
 *
 * O selo é cravado pelo `publica-mirai-app.sh` ANTES do build (arquivo
 * `.build-no-ar`, na raiz do app, FORA do `.next`, que é trocado inteiro). Layout
 * (pré-render) e `/version` (boot do processo) leem o MESMO arquivo — então
 * concordam por construção.
 *
 * Formato: `AAMMDDHHMMSS-<hash curto do src>` — o prefixo é ordenável, e é isso
 * que permite comparar "o servidor está ADIANTE de mim?" em vez de só "é
 * diferente?" (ver AtualizadorAutomatico).
 */
export function lerSelo(): string {
  const raiz = process.cwd();
  for (const rel of [".build-no-ar", path.join(".next", "BUILD_ID")]) {
    try {
      const v = fs.readFileSync(path.join(raiz, rel), "utf8").trim();
      if (v) return v;
    } catch {
      // sem o arquivo: tenta o próximo; nunca quebra a tela
    }
  }
  return "dev";
}

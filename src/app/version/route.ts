import { NextResponse } from "next/server";
import { lerSelo } from "@/lib/build-no-ar";

// O build que está NO AR, segundo o PROCESSO (não o disco).
//
// Serve para o navegador perceber que ele roda código velho: o JavaScript já
// carregado na aba/PWA não troca sozinho quando eu publico. Fica fora de /api de
// propósito: não é dado do usuário, não precisa de sessão.
//
// ─── LÊ UMA VEZ SÓ, NO BOOT (19/11/2026) ────────────────────────────────────
// Ler a cada requisição fazia esta rota anunciar um valor que o processo não
// servia, e combinado com o `meta x-build` defasado (ver lib/build-no-ar) o
// AtualizadorAutomatico recarregava a aba em ciclo — o dono viu isso como "clico
// e o menu não abre". Agora os dois lados nascem do mesmo boot.
const SELO_DO_PROCESSO = lerSelo();

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { build: SELO_DO_PROCESSO },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}

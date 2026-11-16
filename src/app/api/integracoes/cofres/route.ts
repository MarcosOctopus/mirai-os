import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { escopoPessoal, escoposDaConta } from "@/lib/escopos";
import { lerCofre } from "@/lib/cofre-escopo";
import { CATALOGO, estaLigada } from "@/lib/integracoes/catalogo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/integracoes/cofres — quais integrações estão ligadas em CADA espaço da
 * pessoa (13/11/2026).
 *
 * POR QUE existe: o cartão de integração só olhava o cofre PESSOAL. Uma caixa
 * de email (ou qualquer OAuth) conectada no espaço da ORGANIZAÇÃO aparecia como
 * "não conectada" — mentira ao contrário, do mesmo tipo que a fonte única
 * `estado-da-conta` nasceu para evitar.
 *
 * O QUE SAI DAQUI: apenas IDS do catálogo (`gmail`, `github`, …) e o nome do
 * espaço. Nenhum valor de cofre, nenhum token, nenhum blob — a decisão de "está
 * ligada" é tomada no servidor, com `estaLigada`, e o cliente recebe o veredito.
 * Isso é deliberado: mandar o cofre para o navegador para ele decidir seria
 * vazar credencial para resolver um problema de ícone.
 */
export async function GET(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const pessoal = escopoPessoal(g.conta);

  // Só os OUTROS espaços: o pessoal já chega ao cliente por /api/auth/me, e
  // repetir aqui daria duas fontes para o mesmo fato.
  const espacos = escoposDaConta(g.conta)
    .filter((e) => e.id !== pessoal.id)
    .map((e) => {
      const cofre = lerCofre(e);
      return {
        id: e.id,
        nome: e.nome,
        ligadas: CATALOGO.filter((i) => estaLigada(i, cofre)).map((i) => i.id),
      };
    });

  return NextResponse.json({ espacos });
}

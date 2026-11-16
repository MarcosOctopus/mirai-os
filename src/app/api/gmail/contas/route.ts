import { NextRequest, NextResponse } from "next/server";

import { exigirConta } from "@/lib/orgs";
import { escopoPessoal, escoposDaConta, resolverEscopo } from "@/lib/escopos";
import { listarContas, removerConta } from "@/lib/gmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/gmail/contas — TODAS as caixas Google de UM ESCOPO (13/11/2026).
 *
 * POR QUE existe: o cofre já guardava uma LISTA (`google_emails`), mas não
 * havia como a tela mostrar mais de uma conta nem desconectar uma específica.
 *
 * ISOLAMENTO E ESCOPO (modelo corrigido pelo dono, 13/11/2026):
 *   - os escopos válidos vêm de `escoposDaConta(conta)`: o PESSOAL (sempre,
 *     derivado do id) e, quando houver, o da organização — dois escopos do
 *     mesmo nível, e a escolha é de quem usa;
 *   - o padrão é o PESSOAL — nunca "org se existir, senão pessoal";
 *   - o `email` do DELETE é só um FILTRO dentro do cofre daquele escopo: um
 *     endereço de outra pessoa/empresa não existe ali e devolve 404 (404 e não
 *     403, porque até confirmar a existência seria vazamento);
 *   - o `blob` (token cifrado) NUNCA sai daqui — `listarContas` não o inclui.
 */

/**
 * GET — as caixas do espaço PESSOAL + as dos outros espaços alcançáveis.
 *
 * Não existe seletor permanente de organização (definição final do dono,
 * 13/11/2026): a org se ativa pelo PEDIDO no chat. A tela mostra o que existe,
 * com o nome do espaço em cada caixa, para nenhuma caixa ficar invisível.
 */
export async function GET(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const pessoal = escopoPessoal(g.conta);
  const outros = escoposDaConta(g.conta)
    .filter((e) => e.id !== pessoal.id)
    .map((e) => ({ escopo: { id: e.id, tipo: e.tipo, nome: e.nome }, contas: listarContas(e) }))
    .filter((x) => x.contas.length > 0);

  return NextResponse.json({
    escopo: { id: pessoal.id, tipo: pessoal.tipo, nome: pessoal.nome },
    total: listarContas(pessoal).length,
    contas: listarContas(pessoal),
    outrosEspacos: outros,
  });
}

/** DELETE ?email=<endereço>[&escopo=…] — desconecta UMA caixa do escopo. */
export async function DELETE(req: NextRequest) {
  const g = await exigirConta(req);
  if (!g.ok) return g.resposta;

  const q = new URL(req.url).searchParams;
  const email = (q.get("email") || "").trim();
  if (!email) {
    return NextResponse.json({ erro: "informe o email da caixa (parâmetro email)" }, { status: 400 });
  }

  const escopo = resolverEscopo(g.conta, q.get("escopo"));
  const removeu = removerConta(escopo, email);
  if (!removeu) {
    return NextResponse.json({ erro: "essa caixa não está conectada neste escopo" }, { status: 404 });
  }

  // Auditoria sem segredo: qual escopo perdeu uma caixa.
  console.log(`[email] caixa desconectada no escopo ${escopo.id}`);

  return NextResponse.json({ ok: true, contas: listarContas(escopo) });
}

import { NextRequest, NextResponse } from "next/server";

import { getUserById } from "@/lib/auth";
import { exigirConta, type Conta } from "@/lib/orgs";
import { basePlanoDeControle, cabecalhosPlanoDeControle } from "@/lib/plano-controle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A IA DA CONTA — a ponte entre a tela de perfil e o plano de controle.
 *
 * ─── O que este arquivo NÃO faz ─────────────────────────────────────────────
 *
 * Ele não guarda chave, não guarda banco e não fala com nenhum provedor de IA.
 * Quem guarda é o plano de controle, com a chave CIFRADA em repouso, e quem fala
 * com o provedor é o gateway interno. Aqui só passa.
 *
 * ─── Onde o segredo vive (e por que não é aqui) ─────────────────────────────
 *
 * A credencial de admin (`cabecalhosPlanoDeControle`) é lida do ambiente do
 * SERVIDOR e nunca é serializada para o cliente — mesma regra do painel de
 * planos (`docs/PLANOS-CONTRATO.md`): "o navegador NUNCA fala com o plano de
 * controle nem guarda o segredo".
 *
 * ─── De quem é a IA que está sendo cadastrada ───────────────────────────────
 *
 * O `tenant_id` vem SEMPRE da sessão (`getUserById`), nunca do corpo da
 * requisição. Se viesse do corpo, qualquer conta logada poderia cadastrar (ou
 * apagar) a IA de outra — a tela mandaria o id que quisesse. É a mesma trava do
 * "cada conta só vê o PRÓPRIO consumo" do /api/perfil/armazenamento.
 *
 * ─── A chave, depois de salva, não volta ────────────────────────────────────
 *
 * Nenhuma resposta daqui devolve a chave — nem para conferência. Ela só entra:
 * quem quiser trocar, escreve outra por cima.
 */

function tenantDaConta(conta: Conta): string {
  const usuario = getUserById(conta.id) as { tenant_id?: string | null } | null;
  return (usuario?.tenant_id || "").trim();
}

function urlBase(): string {
  return `${basePlanoDeControle().replace(/\/+$/, "")}/v1/ai/config`;
}

/** Erro do plano de controle -> recado curto para a tela (sem jargão, sem vazar nada). */
async function recadoDeErro(resposta: Response): Promise<string> {
  if (resposta.status === 503) {
    return "O cadastro de chaves está indisponível agora — avise o suporte.";
  }
  if (resposta.status === 403) {
    return "Sua conta não tem permissão para isso.";
  }
  if (resposta.status === 422) {
    return "Confira o provedor e a chave.";
  }
  return "Não foi possível falar com a Mirai agora. Tente de novo em instantes.";
}

// ─── GET /api/ia — o que a conta usa hoje ─────────────────────────────
export async function GET(req: NextRequest) {
  const auth = await exigirConta(req);
  if (!auth.ok) return auth.resposta;

  const tenant = tenantDaConta(auth.conta);
  if (!tenant) {
    // Conta sem vínculo com o plano de controle: vale o padrão do ecossistema.
    return NextResponse.json({ origem: "padrao", tem_chave: false, sem_vinculo: true });
  }

  const r = await fetch(`${urlBase()}?tenant_id=${encodeURIComponent(tenant)}`, {
    headers: cabecalhosPlanoDeControle(),
    cache: "no-store",
  });
  if (!r.ok) {
    return NextResponse.json({ origem: "padrao", tem_chave: false, erro: await recadoDeErro(r) });
  }
  return NextResponse.json(await r.json());
}

// ─── PUT /api/ia — cadastra/troca a IA da conta ───────────────────────
export async function PUT(req: NextRequest) {
  const auth = await exigirConta(req);
  if (!auth.ok) return auth.resposta;

  const tenant = tenantDaConta(auth.conta);
  if (!tenant) {
    return NextResponse.json({ erro: "Sua conta ainda não está ligada à Mirai." }, { status: 409 });
  }

  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const provider = String(corpo.provider || "").trim();
  const key = String(corpo.key || "").trim();
  if (!provider || !key) {
    return NextResponse.json({ erro: "Informe o provedor e a chave." }, { status: 422 });
  }

  const r = await fetch(urlBase(), {
    method: "PUT",
    headers: { ...cabecalhosPlanoDeControle(), "content-type": "application/json" },
    body: JSON.stringify({
      // o tenant é o da SESSÃO — o corpo não manda aqui
      tenant_id: tenant,
      provider,
      model: String(corpo.model || "").trim() || null,
      base_url: String(corpo.base_url || "").trim() || null,
      key,
    }),
  });
  if (!r.ok) return NextResponse.json({ erro: await recadoDeErro(r) }, { status: 502 });

  // A resposta do plano de controle é devolvida SEM a chave (ela nunca a tem).
  return NextResponse.json(await r.json());
}

// ─── DELETE /api/ia — tira a IA da conta (volta ao padrão) ────────────
export async function DELETE(req: NextRequest) {
  const auth = await exigirConta(req);
  if (!auth.ok) return auth.resposta;

  const tenant = tenantDaConta(auth.conta);
  if (!tenant) return NextResponse.json({ ok: true, origem: "padrao" });

  const r = await fetch(`${urlBase()}?tenant_id=${encodeURIComponent(tenant)}`, {
    method: "DELETE",
    headers: cabecalhosPlanoDeControle(),
  });
  if (!r.ok) return NextResponse.json({ erro: await recadoDeErro(r) }, { status: 502 });
  return NextResponse.json(await r.json());
}

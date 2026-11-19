/**
 * ESCOPO ATIVO DA REQUISIÇÃO — uma porta só para "de quem é este dado".
 *
 * Regra do dono (13/11/2026 e 18/11/2026): a chave do escopo é `pessoal-<userId>`
 * ou o slug da organização, e ela vale IGUAL em todas as ferramentas. Nenhuma
 * rota deduz escopo do e-mail; a escolha vem explícita (cookie do seletor) e é
 * VALIDADA contra os escopos da conta por `resolverEscopo` — que nunca aceita
 * escopo de terceiro e cai no pessoal quando o pedido não é de quem pediu.
 *
 * O cookie `mirai_escopo` não é segredo: guarda só a chave do espaço. Se alguém
 * trocar o valor à mão, `resolverEscopo` devolve o espaço PESSOAL da pessoa —
 * nunca o de outra conta.
 */
import type { NextRequest } from "next/server";

import { resolverEscopo, type ContaParaEscopo, type Escopo } from "./escopos";

export const COOKIE_ESCOPO = "mirai_escopo";

/** O escopo que esta requisição está usando (cookie > `?escopo=` > pessoal). */
export function escopoDaRequisicao(req: NextRequest, conta: ContaParaEscopo): Escopo {
  const doCookie = req.cookies.get(COOKIE_ESCOPO)?.value || "";
  const daUrl = req.nextUrl?.searchParams?.get("escopo") || "";
  return resolverEscopo(conta, daUrl || doCookie);
}
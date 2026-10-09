// TOKEN DA PONTE DAS INTEGRAÇÕES (só no servidor).
//
// POR QUE existe: o Arquiteto gera SITES ESTÁTICOS. Um site estático NÃO pode
// guardar chave — ela viraria pública no navegador. Então a chave fica no NOSSO
// servidor e o site publicado pede POR NÓS. O problema: quem chama a ponte é o
// site publicado, que NÃO tem cookie de sessão do app (a origem dele é outra, e
// o cookie SameSite=Lax não viaja). Sem este token, a rota não teria como saber
// de quem é a chamada.
//
// A saída NÃO é abrir a rota: é um token ASSINADO, escopado ao PAR
// (projeto, integração). Quem não tem o token (nem a sessão do dono) não passa;
// e o token só serve para AQUELE projeto usar AQUELA integração — tomar o token
// de um projeto não deixa falar por outro, nem puxar outra integração.
//
// ESPELHA `arquiteto-asset-token.ts`: mesmo segredo (JWT_SECRET), mesmo formato
// `payload.assinatura`, verificação com timingSafeEqual. Payload curto:
//   p = projetoId, i = integração, e = expiração (unix, segundos).
import { createHmac, timingSafeEqual } from "crypto";

const SEGREDO = process.env.JWT_SECRET || "dev-fallback-change-me";

// Vale 7 dias, como o token do asset: o site já está no ar e pede por conta
// própria; o TTL limita o dano de um token que vaze. Nunca é gravado em banco
// nem em log.
const TTL_SEGUNDOS = 7 * 24 * 60 * 60; // 7 dias

function assinar(payloadB64: string): string {
  return createHmac("sha256", SEGREDO).update(payloadB64).digest("base64url");
}

export type TokenPonte = { projetoId: string; integracao: string };

/** Emite o token da ponte para o PAR (projeto, integração). Nunca vai para log. */
export function emitirTokenPonte(alvo: { projetoId: string; integracao: string }): string {
  const exp = Math.floor(Date.now() / 1000) + TTL_SEGUNDOS;
  const payload = Buffer.from(
    JSON.stringify({ p: alvo.projetoId, i: alvo.integracao, e: exp }),
  ).toString("base64url");
  return `${payload}.${assinar(payload)}`;
}

/** Verifica o token. Devolve o par confiável ou null (assinatura/validade). */
export function conferirTokenPonte(token: string | null | undefined): TokenPonte | null {
  if (typeof token !== "string" || !token) return null;
  const partes = token.split(".");
  if (partes.length !== 2) return null;
  const [payload, sig] = partes;
  if (!payload || !sig) return null;
  const esperado = assinar(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(esperado);
  // timingSafeEqual: tamanhos diferentes nunca autenticam; nunca comparar
  // assinatura com `===` (vaza o tamanho do prefixo certo por tempo).
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const j = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      p?: unknown;
      i?: unknown;
      e?: unknown;
    };
    if (typeof j.p !== "string" || typeof j.i !== "string" || typeof j.e !== "number") {
      return null;
    }
    if (j.e * 1000 < Date.now()) return null;
    return { projetoId: j.p, integracao: j.i };
  } catch {
    return null;
  }
}

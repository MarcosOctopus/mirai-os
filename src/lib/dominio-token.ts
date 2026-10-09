// Token do LINK DE CONEXÃO DE DOMÍNIO (só no servidor).
//
// POR QUE existe (dono, 09/10/2026): "o do domínio tem que ter tudo para fazer
// essa integração — um processo rápido de explicar o que deve ser feito, ou de
// uma forma mais rápida… quando falo disso falo do domínio dele". O cliente não
// tem conta aqui: ele recebe UM LINK, abre e vê o registro exato a criar e o
// andamento ao vivo. Sem senha, sem login, sem textão.
//
// O que o token autoriza é POUCO de propósito: ver o domínio pedido, o registro a
// criar e se o DNS já aponta. Nada do projeto, nada do conteúdo do site, nada da
// conta. É assinado com o MESMO JWT_SECRET do app (nenhuma chave nova) e amarrado
// ao par (projeto, domínio): trocar o domínio no painel invalida o link antigo.
import { createHmac, timingSafeEqual } from "crypto";

const SEGREDO = process.env.JWT_SECRET || "dev-fallback-change-me";

// Vale 30 dias: é um link que o dono manda para o cliente e ele pode levar dias
// para mexer no DNS. Cada abertura do painel emite um novo.
const TTL_SEGUNDOS = 30 * 24 * 60 * 60;

function assinar(payloadB64: string): string {
  return createHmac("sha256", SEGREDO).update(payloadB64).digest("base64url");
}

export type TokenDominio = { projetoId: string; dominio: string };

/** Emite o token do link de conexão para (projeto, domínio). */
export function assinarDominio(projetoId: string, dominio: string): string {
  const exp = Math.floor(Date.now() / 1000) + TTL_SEGUNDOS;
  const payload = Buffer.from(
    JSON.stringify({ p: projetoId, d: dominio, e: exp }),
  ).toString("base64url");
  return `${payload}.${assinar(payload)}`;
}

/** Verifica o token. Devolve o par confiável ou null (assinatura/validade). */
export function verificarDominioToken(token: string | null | undefined): TokenDominio | null {
  if (typeof token !== "string" || !token) return null;
  const partes = token.split(".");
  if (partes.length !== 2) return null;
  const [payload, sig] = partes;
  if (!payload || !sig) return null;
  const esperado = assinar(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const j = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      p?: unknown;
      d?: unknown;
      e?: unknown;
    };
    if (typeof j.p !== "string" || typeof j.d !== "string" || typeof j.e !== "number") return null;
    if (j.e * 1000 < Date.now()) return null;
    return { projetoId: j.p, dominio: j.d };
  } catch {
    return null;
  }
}

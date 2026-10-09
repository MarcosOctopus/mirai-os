// Token de SERVIÇO de um asset do Arquiteto (só no servidor).
//
// POR QUE existe: o preview do Arquiteto roda num iframe `sandbox="allow-scripts"`
// SEM `allow-same-origin` — a origem dele é OPACA e, por isso, o navegador NÃO
// manda o cookie de sessão (SameSite=Lax) nas requisições de imagem que saem de
// dentro do sandbox. Sem isto, a imagem do projeto nunca apareceria na prévia.
//
// A saída NÃO é abrir o arquivo: é um token ASSINADO, de curta duração, amarrado
// ao TRIPLO (projeto, caminho, dono). Quem não tem o token continua precisando da
// sessão; e a rota de bytes só serve quando a assinatura casa com o id do projeto
// e o caminho pedidos. O token é emitido pelo servidor (a lista de assets) e vive
// só no documento do próprio dono — nunca no banco, nunca em log.
//
// O segredo é o MESMO JWT_SECRET que o resto do app já usa (nenhuma chave nova).
import { createHmac, timingSafeEqual } from "crypto";

const SEGREDO = process.env.JWT_SECRET || "dev-fallback-change-me";

// Validade do token de serviço (o cliente relê a lista ao abrir/subir imagem,
// então o token se renova sozinho).
const TTL_SEGUNDOS = 7 * 24 * 60 * 60; // 7 dias

function assinar(payloadB64: string): string {
  return createHmac("sha256", SEGREDO).update(payloadB64).digest("base64url");
}

export type TokenAsset = { projetoId: string; caminho: string; userId: number };

/** Emite o token de serviço para (projeto, caminho, dono). Nunca vai para log. */
export function assinarAsset(projetoId: string, caminho: string, userId: number): string {
  const exp = Math.floor(Date.now() / 1000) + TTL_SEGUNDOS;
  const payload = Buffer.from(
    JSON.stringify({ p: projetoId, c: caminho, u: userId, e: exp }),
  ).toString("base64url");
  return `${payload}.${assinar(payload)}`;
}

/** Verifica o token. Devolve o triplo confiável ou null (assinatura/validade). */
export function verificarAssetToken(token: string | null | undefined): TokenAsset | null {
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
      c?: unknown;
      u?: unknown;
      e?: unknown;
    };
    if (typeof j.p !== "string" || typeof j.c !== "string" || typeof j.u !== "number" || typeof j.e !== "number") {
      return null;
    }
    if (j.e * 1000 < Date.now()) return null;
    return { projetoId: j.p, caminho: j.c, userId: j.u };
  } catch {
    return null;
  }
}

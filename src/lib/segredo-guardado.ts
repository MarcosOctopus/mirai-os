// SEGREDOS GUARDADOS — cifra simétrica para o token que o OAuth devolve.
//
// POR QUE existe (dono, 09/10/2026): o "Conectar com Cloudflare" traz um
// `access_token` que dá acesso ao DNS do domínio do cliente. Isso é segredo de
// verdade e NÃO pode ficar em claro no banco nem em log.
//
// COMO: AES-256-GCM com chave derivada do `JWT_SECRET` que o app já tem (HKDF,
// com um rótulo próprio — a mesma chave nunca é usada para assinar e para cifrar).
// O texto guardado é `iv.tag.cifrado` em base64url: sem a chave, não é nada.
// Nenhuma chave nova para configurar, e nada de segredo em variável de ambiente
// nova que alguém esqueça de definir.
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";

const RAIZ = process.env.JWT_SECRET || "dev-fallback-change-me";

function chave(): Buffer {
  // HKDF-SHA256: chave de 32 bytes só para cifrar (rotulada, nunca reaproveitada).
  return Buffer.from(hkdfSync("sha256", RAIZ, "mirai-os", "segredo-guardado-v1", 32));
}

/** Cifra um texto. Devolve `iv.tag.cifrado` (base64url) — seguro para o banco. */
export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const cifrado = Buffer.concat([c.update(Buffer.from(texto, "utf8")), c.final()]);
  const tag = c.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), cifrado.toString("base64url")].join(".");
}

/** Decifra o que `cifrar` produziu. Devolve null se o conteúdo não bate (adulterado). */
export function decifrar(blob: string | null | undefined): string | null {
  if (typeof blob !== "string" || blob.split(".").length !== 3) return null;
  const [ivB, tagB, cifradoB] = blob.split(".");
  try {
    const d = createDecipheriv("aes-256-gcm", chave(), Buffer.from(ivB, "base64url"));
    d.setAuthTag(Buffer.from(tagB, "base64url"));
    return Buffer.concat([d.update(Buffer.from(cifradoB, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
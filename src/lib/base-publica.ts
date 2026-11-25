// 🌐 Endereço público do app — uma fonte só.
//
// O servidor roda atrás do túnel e enxerga a si mesmo como `localhost:3333`.
// Se a gente montar a URL de volta pelo host da REQUISIÇÃO, quem entrou por um
// túnel (ou por dentro da máquina) volta para um endereço que não existe no
// navegador dele: ERR_CONNECTION_REFUSED na cara do visitante.
//
// Ordem de confiança:
//   1. a origem da redirect_uri registrada (MIRAI_OIDC_REDIRECT) — é a verdade,
//      não depende de header nenhum;
//   2. o host encaminhado pelo túnel (x-forwarded-host), desde que não seja
//      endereço local;
//   3. a rede de segurança explícita.
//
// Nunca devolve localhost/127.0.0.1: endereço local nunca é o do visitante.
import { origemPublica } from "./mirai-oidc";

export const PUBLICO_PADRAO = "https://app.miraiassistant.com";

const LOCAL = /^(localhost|127\.|0\.0\.0\.0|\[::1\]|::1)/i;

export function basePublica(req: { headers: { get(n: string): string | null } }): string {
  const registrada = origemPublica();
  if (registrada) return registrada;

  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  if (host && !LOCAL.test(host)) {
    const proto = req.headers.get("x-forwarded-proto") || "https";
    return `${proto}://${host}`;
  }

  return PUBLICO_PADRAO;
}

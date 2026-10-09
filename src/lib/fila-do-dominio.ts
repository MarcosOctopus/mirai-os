// A PORTA DA FILA DO DOMÍNIO (só no servidor).
//
// Quem chama as rotas `/api/dominio/*` NÃO é um navegador: é o serviço da borda
// (`mirai-publica-dominio`, systemd, root) que pergunta quais domínios já podem
// ser publicados e devolve o veredito. Ele não tem sessão — então a porta é um
// SEGREDO COMPARTILHADO, conferido em TEMPO CONSTANTE, igual à ponte do CRM
// (`/api/integracoes/ponte`): se o segredo não bate, a rota não existe para quem
// chamou. Sem segredo configurado, a porta fica FECHADA (nunca aberta por omissão).
import { timingSafeEqual } from "crypto";

/** O chamador trouxe o segredo certo da fila? */
export function segredoDaFilaConfere(req: { headers: { get(n: string): string | null } }): boolean {
  const esperado = process.env.MIRAI_FILA_SECRET || "";
  const veio = req.headers.get("x-mirai-fila") || "";
  if (!esperado || !veio) return false;
  const a = Buffer.from(veio);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}
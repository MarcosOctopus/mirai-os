/**
 * ACERVO — rota da PESSOA (caminho não-dono).
 *
 * POR QUE ESTA ROTA EXISTE (10/11/2026): a tela do acervo chamava
 * `/api/admin/acervo`, e `/api/admin` está na lista SÓ-DONO do middleware
 * (`OWNER_ONLY_API` em `src/middleware.ts`). Consequência medida: o usuário comum
 * levava **403 no middleware** antes de chegar ao handler — mesmo com o handler já
 * resolvendo a org pela SESSÃO. O acervo da pessoa não é recurso de administração:
 * o namespace é que estava errado.
 *
 * A implementação vive em `/api/admin/acervo` (uma só, sem duplicar regra de
 * autorização) e é reexportada aqui. O middleware olha o caminho da REQUISIÇÃO
 * (`/api/acervo`), que é livre — e o handler, por sua vez, exige sessão
 * (`exigirConta`) e resolve o acervo por quem entrou.
 *
 * Não remover `/api/admin/acervo`: é por ele que o dono lê o acervo de outra org
 * (leitura cross-tenant, registrada em `/opt/data/arca/logs/acervo-cross-read.log`).
 */
export { GET, POST, PATCH } from "../admin/acervo/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

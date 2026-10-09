import { listarAssets, type ArquivoProjeto, type ProjetoCompleto } from "@/lib/arquiteto-projetos";
import { montarPrevia, type Asset } from "@/lib/arquiteto-preview";
import { assinarAsset } from "@/lib/arquiteto-asset-token";
import { sufixoDoAsset } from "@/lib/arquiteto-asset-tipos";

/**
 * A PÁGINA DE UM PROJETO PUBLICADO — **uma fonte só** para os dois caminhos que
 * levam ao mesmo lugar:
 *   • `/p/<token>` — o link com segredo (existe desde 08/10/2026);
 *   • `<slug>.miraitohope.com` — o ENDEREÇO com nome (09/10/2026, o que o dono
 *     pediu olhando o Figma Make).
 *
 * POR QUÊ junto: se cada caminho montasse a sua prévia, um conserto num nunca
 * chegaria no outro — e o site publicado passaria a mentir sobre o projeto. Aqui
 * o bundler, o isolamento e as URLs assinadas de asset são os MESMOS.
 *
 * O ISOLAMENTO (não afrouxar): o projeto roda dentro de um iframe
 * `sandbox="allow-scripts"` SEM `allow-same-origin` — origem opaca. O código do
 * projeto não enxerga cookie de sessão, DOM do app, localStorage nem rota
 * interna; e as IMAGENS carregam por URL assinada (projeto+caminho+dono), nunca
 * pela rota de bytes aberta.
 */
export function ProjetoPublico({
  projeto,
  donoId,
  arquivos,
}: {
  projeto: ProjetoCompleto;
  donoId: number;
  /** Página do projeto a renderizar. Sem isto, o bundler escolhe (index.html). */
  arquivos?: ArquivoProjeto[];
}) {
  const lista = arquivos?.length ? arquivos : projeto.arquivos;

  const baseAssets = `/api/arquiteto/projetos/${encodeURIComponent(projeto.id)}/assets`;
  const assets: Asset[] = (listarAssets(donoId, projeto.id) ?? []).map((a) => ({
    caminho: a.caminho,
    mime: a.mime,
    tamanho: a.tamanho,
    criado_em: a.criado_em,
    url: `${baseAssets}/${sufixoDoAsset(a.caminho)}?t=${assinarAsset(projeto.id, a.caminho, donoId)}`,
  }));

  const previa = montarPrevia(lista, assets, baseAssets, projeto.tokens, { comPonte: false });

  return (
    <main
      data-publico-arquiteto
      data-publico-titulo={projeto.titulo}
      style={{ position: "fixed", inset: 0, margin: 0, padding: 0, background: "#ffffff" }}
    >
      <iframe
        title={projeto.titulo}
        srcDoc={previa.html}
        sandbox="allow-scripts"
        data-publico-preview
        style={{ display: "block", width: "100%", height: "100%", border: "0" }}
      />
    </main>
  );
}

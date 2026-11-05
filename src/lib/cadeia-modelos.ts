/**
 * CADEIA DE MODELOS EM VIGOR — fonte única (dono, 22/10/2026).
 *
 * POR QUE ESTE MÓDULO EXISTE: o Intelligence Control mostrava um modelo fixo
 * escrito no próprio código (`deepseek-v4.1-flash / Verboo`) enquanto o
 * primário real era KPA (`aibee` → `api.kpalabz.com`). A tela lia a si mesma em
 * vez de ler a operação — uma tela de controle que não reflete o real é pior
 * que tela nenhuma, porque ela mente com confiança.
 *
 * O QUE FAZ: lê o `/opt/data/config.yaml` na hora da requisição. Sem cache e
 * sem valor fixo: trocar o primário no config aparece na tela no próximo F5.
 * Usado por `/api/admin/intelligence/config` E `/health`, para as duas rotas
 * nunca discordarem sobre qual é o modelo em vigor.
 *
 * POR QUE NÃO USAR O BANCO: o `postgres-control` (que guarda a política de
 * roteamento) fica na rede `mirai-control` (172.20.9.x) e o app roda na
 * `hermes-agent` (172.20.6.x) — redes diferentes, sem rota entre elas. Mesmo
 * que o banco respondesse, ele guardaria a política *pretendida*, não o que o
 * agente está usando agora. Quem sabe o que está em vigor é o config.
 */

const CONFIG_YAML = '/opt/data/config.yaml';

export type Cadeia = {
  /** Modelo que atende agora (bloco `model.default`). */
  primaryModel: string;
  /** Nome interno do provider (`aibee`, `verboo`, ...). */
  provider: string;
  /** Host real por trás do nome interno — o nome não diz o host. */
  baseUrl: string;
  status: string;
  /** Modelos de reserva, na ordem em que são tentados. */
  fallbacks: string[];
  origem: string;
  aviso?: string;
};

/**
 * Nome interno do provider → host real.
 *
 * NOTA: `aibee` é o nome interno; o host é `api.kpalabz.com` (KPA). Confundir
 * os dois já aconteceu — é o provider que responde, não o nome dele.
 */
const HOST_POR_PROVIDER: Record<string, string> = {
  aibee: 'api.kpalabz.com (KPA)',
  aiapiflow: 'aiapiflow.com',
  verboo: 'code.verboo.ai',
  codejato: 'api.tn1.top',
  oneprovider: 'api.oneprovider.dev',
  synterolink: 'api.synterolink.com',
  'vercel-gateway': 'gateway.vercel.ai',
  openrouter: 'openrouter.ai',
  edge: 'edge (local)',
};

/**
 * Lê a cadeia sem trazer um parser de YAML para dentro do bundle do servidor.
 *
 * A forma do `config.yaml` do Hermes é fixa e conhecida (medida):
 *
 *     model:                          <- bloco de topo, indentação 2
 *       default: claude-opus-5-5
 *       provider: aibee
 *     fallback_providers:             <- lista, indentação 2/4
 *       - provider: aibee
 *         model: claude-sonnet-5
 *
 * Só precisamos de três campos escalares. Um `yaml` completo por três campos
 * seria peso morto no bundle do servidor.
 */
export function lerCadeiaDoConfig(): Cadeia | null {
  try {
    const fs = require('fs') as typeof import('fs');
    const linhas = fs.readFileSync(CONFIG_YAML, 'utf8').split('\n');

    // 1) Bloco `model:` de topo → default + provider (indentação EXATA de 2).
    //    A âncora no `model:` sem indentação garante que é o bloco de topo e
    //    não uma lista `- model:` de fallback mais abaixo.
    const inicioModelo = linhas.findIndex((l) => l === 'model:');
    if (inicioModelo < 0) return null;

    let primaryModel: string | undefined;
    let provider: string | undefined;

    for (let i = inicioModelo + 1; i < linhas.length; i += 1) {
      const ln = linhas[i];
      // Fim do bloco: uma chave de topo (sem indentação) que não seja `model:`.
      if (ln.length > 0 && !/^\s/.test(ln)) break;

      const d = ln.match(/^\s{2}default:\s*['"]?([\w.\-]+)['"]?\s*$/);
      if (d) primaryModel = d[1];

      const p = ln.match(/^\s{2}provider:\s*['"]?([\w.\-]+)['"]?\s*$/);
      if (p) provider = p[1];

      if (primaryModel && provider) break;
    }

    if (!primaryModel || !provider) return null;

    // 2) `fallback_providers:` → pares na ordem em que são tentados.
    //    Cada item é `- provider: X` seguido de `model: Y` (4 espaços).
    const inicioFallback = linhas.findIndex((l) => l.startsWith('fallback_providers:'));
    const fallbacks: string[] = [];

    if (inicioFallback >= 0) {
      let dentroDaLista = false;
      for (let i = inicioFallback + 1; i < linhas.length; i += 1) {
        const ln = linhas[i];
        // Sai da lista quando aparece outra chave de topo.
        if (ln.length > 0 && !/^\s/.test(ln)) break;
        if (/^\s*-\s+provider:/.test(ln)) { dentroDaLista = true; continue; }
        if (!dentroDaLista) continue;
        const m = ln.match(/^\s+model:\s*['"]?([\w.\-]+)['"]?\s*$/);
        if (m) fallbacks.push(m[1]);
      }
    }

    return {
      primaryModel,
      provider,
      baseUrl: HOST_POR_PROVIDER[provider] || 'host não mapeado',
      status: 'EM VIGOR',
      fallbacks,
      origem: 'config.yaml',
    };
  } catch (e) {
    // Falhou de ler o config = não sabe o que está em vigor. Devolve null e
    // deixa a rota responder 503 com a verdade, em vez de chutar um modelo.
    console.error('lerCadeiaDoConfig falhou:', (e as Error)?.message);
    return null;
  }
}
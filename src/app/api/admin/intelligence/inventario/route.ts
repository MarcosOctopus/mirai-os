/**
 * API: inventário real do Intelligence Control
 * GET /api/admin/intelligence/inventario
 *
 * POR QUE EXISTE (dono, 22/10/2026): a tela mostrava quatro cards com números
 * ESCRITOS NO JSX — `Providers 5`, `Modelos 12`, `Credenciais 8`, `Aliases 8`.
 * Eram inventados. `Providers` era 5 quando o config tem 7. Num painel de
 * controle, número falso é pior que número ausente: a pessoa confia nele.
 *
 * O QUE FAZ: conta o que existe de fato, no momento da requisição.
 * - providers: blocos declarados em `config.yaml → providers:`
 * - modelos:   modelos citados na cadeia (primário + fallbacks) + aliases
 * - credenciais: variáveis de ambiente/API keys REFERENCIADAS pelo config
 *   (conta a referência, não a chave — o valor nunca sai daqui)
 * - aliases:   quantos `aliases:` o config declara
 *
 * NUNCA devolve valor de chave. Só conta e diz se a variável está definida no
 * ambiente — o suficiente para saber se está faltando alguma.
 */

import { NextResponse } from 'next/server';
import fs from 'fs';

const CONFIG_YAML = '/opt/data/config.yaml';

/**
 * CHAVES SÃO CONTADAS POR ARQUIVO, NUNCA POR `process.env`.
 *
 * O Hermes carrega as chaves de provider do `.env` DE CADA PERFIL
 * (`/opt/data/.files/<nome>/.env`, e `/opt/data/.env` para o `default`) — não do
 * ambiente do processo. Uma versão anterior deste endpoint contava `process.env`,
 * retornava `4/8 definidas` e a tela publicava esse número como se fosse o
 * estado real. Era falso: as chaves existem e estão nos `.env` dos perfis, e é
 * por isso que a KPA está respondendo. Medir no lugar errado produz um painel
 * que mente com confiança — pior do que painel sem número.
 *
 * Além disso, 10 linhas do `/opt/data/.env` usam prefixo `export `
 * (`export AIBEE_API_KEY=...`). Um parser de `.env` que não entenda o prefixo lê
 * o nome da variável como `export AIBEE_API_KEY` — a chave existe, mas chega
 * com o nome quebrado. Por isso o `export` é removido antes de contar.
 */

type Bloco = { providers: number; modelos: number; credenciais: number; aliases: number; detalhe: Record<string, unknown> };

/** Perfis que têm `.env` próprio; `default` usa o da raiz. */
const PERFIS_COM_ENV = ['darkmatter', 'mediafactory', 'mapapaper', 'arquiteto', 'pathfinder', 'observador'];

function lerEnv(path: string): Map<string, string> {
  const out = new Map<string, string>();
  let txt: string;
  try {
    txt = require('fs').readFileSync(path, 'utf8');
  } catch {
    return out;
  }
  for (const linha of txt.split('\n')) {
    let s = linha.trim();
    if (!s || s.startsWith('#')) continue;
    // `export NOME=valor` é válido em shell e QUEBRADO em parser de .env.
    s = s.replace(/^export\s+/, '');
    const i = s.indexOf('=');
    if (i < 0) continue;
    const k = s.slice(0, i).trim();
    const v = s.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (k) out.set(k, v);
  }
  return out;
}

/** Uma chave conta como presente se estiver no `.env` de ALGUM perfil. */
function chaveDefinidaEmAlgumPerfil(nome: string): { defined: boolean; perfis: string[] } {
  const perfis: string[] = [];
  for (const p of ['default', ...PERFIS_COM_ENV]) {
    const caminho = p === 'default' ? CONFIG_YAML.replace('config.yaml', '.env') : `/opt/data/profiles/${p}/.env`;
    const env = lerEnv(caminho);
    const v = env.get(nome);
    if (v && v.length > 0) perfis.push(p);
  }
  return { defined: perfis.length > 0, perfis };
}

export async function GET() {
  try {
    const raw = fs.readFileSync(CONFIG_YAML, 'utf8');
    const linhas = raw.split('\n');

    // --- providers: sub-blocos de 2 espaços dentro de `providers:`
    const iniProv = linhas.findIndex((l) => l === 'providers:');
    const providers: string[] = [];
    if (iniProv >= 0) {
      for (let i = iniProv + 1; i < linhas.length; i += 1) {
        const ln = linhas[i];
        if (ln.length > 0 && !/^\s/.test(ln)) break; // fim do bloco
        const m = ln.match(/^  ([\w-]+):\s*$/);
        if (m) providers.push(m[1]);
      }
    }

    // --- modelos: cadeia (primário + fallbacks) + aliases declarados
    const modelosCitados = new Set<string>();
    const blocoModel = linhas.slice(0, linhas.findIndex((l) => l === 'toolsets:') + 1);
    for (const ln of blocoModel) {
      const d = ln.match(/^\s+default:\s*([\w.\-]+)/);
      if (d) modelosCitados.add(d[1]);
      const m = ln.match(/^\s+-?\s*model:\s*([\w.\-]+)/);
      if (m) modelosCitados.add(m[1]);
    }

    // aliases: bloco `aliases:` (se houver) → chaves de 2 espaços
    let aliases: string[] = [];
    const iniAlias = linhas.findIndex((l) => l.startsWith('aliases:'));
    if (iniAlias >= 0) {
      for (let i = iniAlias + 1; i < linhas.length; i += 1) {
        const ln = linhas[i];
        if (ln.length > 0 && !/^\s/.test(ln)) break;
        const m = ln.match(/^  ([\w.\-]+):\s*(.*)$/);
        if (m) aliases.push(m[1]);
      }
    }
    // aliases também contam quando aparecem como `alias: <modelo>`
    const aliasesEmLinha = linhas
      .map((l) => l.match(/^\s+alias:\s*([\w.\-]+)/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => m[1]);
    aliases = [...new Set([...aliases, ...aliasesEmLinha])];

    // --- credenciais: variáveis REFERENCIADAS (api_key_env / api_key) + se
    //     estão definidas no ambiente. O VALOR nunca é lido.
    const chavesRef = new Set<string>();
    for (const ln of linhas) {
      const e = ln.match(/^\s+api_key_env:\s*([A-Z0-9_]+)/);
      if (e) chavesRef.add(e[1]);
      const a = ln.match(/^\s+api_key:\s*['\"]?([A-Z0-9_]+)['\"]?\s*$/);
      if (a && a[1] !== a[1].toLowerCase()) chavesRef.add(a[1]); //Placeholder em MAIUSCULA
    }
    const credenciais = [...chavesRef].map((k) => {
      const r = chaveDefinidaEmAlgumPerfil(k);
      return { variavel: k, definida: r.defined, perfis: r.perfis };
    });

    const payload: Bloco = {
      providers: providers.length,
      modelos: modelosCitados.size,
      credenciais: credenciais.length,
      aliases: aliases.length,
      detalhe: {
        provedores: providers,
        modelos: [...modelosCitados],
        credenciais,
        aliases,
      },
    };

    return NextResponse.json({ ...payload, origem: 'config.yaml' });
  } catch (e) {
    console.error('Inventario intelligence falhou:', (e as Error)?.message);
    return NextResponse.json(
      { error: 'Nao foi possivel ler o config.yaml — inventario indisponivel.' },
      { status: 503 },
    );
  }
}
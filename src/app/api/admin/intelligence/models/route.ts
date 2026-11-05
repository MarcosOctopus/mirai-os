/**
 * API: catálogo de modelos por provider
 * GET /api/admin/intelligence/models
 *
 * POR QUE EXISTE (dono, 22/10/2026): o seletor de modelo precisa oferecer o
 * que DÁ para usar, não o que está escrito no config. Sem esta rota o
 * dropdown só conheceria os 3 modelos da cadeia atual — e não daria para
 * adicionar nenhum.
 *
 * O QUE FAZ: lê `config.yaml → providers:`, e para cada provider diz:
 *   - a URL e a chave que ele precisa
 *   - se essa chave está DEFINIDA em algum `.env` de perfil (reaproveita a
 *     mesma leitura do `/inventario` — nunca `process.env`, que mente)
 *   - os modelos JÁ citados no config para esse provider
 *
 * REGRA IMPORTANTE: provider SEM chave entra na lista com `disponivel: false`
 * e o motivo. Não some da tela — some é esconder; mostrar cinza com o motivo é
 * informar. Offer um provider sem chave e deixar a pessoa escolher é oferecer
 * uma queda: o agente para de responder e o único sintoma é "tudo morreu".
 *
 * NÃO consulta a API de cada provider para listar modelos: são 7 chamadas
 * externas numa tela que abre a cada F5. Os modelos citados no config são a
 * fonte honesta; a verificação real acontece no PUT, com uma chamada de teste
 * ao provider escolhido antes de gravar.
 */

import { NextResponse } from 'next/server';
import { lerCadeiaDoConfig } from '@/lib/cadeia-modelos';

const CONFIG_YAML = '/opt/data/config.yaml';
const PERFIS_COM_ENV = ['darkmatter', 'mediafactory', 'mapapaper', 'arquiteto', 'pathfinder', 'observador'];

type Provider = {
  nome: string;
  baseUrl: string;
  apiMode: string;
  chave: string | null;
  disponivel: boolean;
  motivo: string | null;
  perfisComChave: string[];
  modelosNoConfig: string[];
};

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
    s = s.replace(/^export\s+/, '');
    const i = s.indexOf('=');
    if (i < 0) continue;
    const k = s.slice(0, i).trim();
    const v = s.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (k) out.set(k, v);
  }
  return out;
}

/** Em quais perfis a chave está de fato definida. */
function perfisComChave(nomeChave: string): string[] {
  const achados: string[] = [];
  for (const p of ['default', ...PERFIS_COM_ENV]) {
    const caminho = p === 'default' ? '/opt/data/.env' : `/opt/data/profiles/${p}/.env`;
    const v = lerEnv(caminho).get(nomeChave);
    if (v && v.length > 0) achados.push(p);
  }
  return achados;
}

export async function GET() {
  try {
    const fs = require('fs') as typeof import('fs');
    const linhas = fs.readFileSync(CONFIG_YAML, 'utf8').split('\n');

    // Bloco `providers:` → sub-blocos de 2 espaços
    const ini = linhas.findIndex((l) => l === 'providers:');
    if (ini < 0) {
      return NextResponse.json({ error: 'Bloco providers: nao encontrado no config.yaml.' }, { status: 503 });
    }

    const providers: Provider[] = [];
    let atual: Provider | null = null;

    const fechar = () => {
      if (atual) providers.push(atual);
      atual = null;
    };

    for (let i = ini + 1; i < linhas.length; i += 1) {
      const ln = linhas[i];
      if (ln.length > 0 && !/^\s/.test(ln)) break; // fim do bloco

      const cab = ln.match(/^  ([\w-]+):\s*$/);
      if (cab) {
        fechar();
        atual = {
          nome: cab[1],
          baseUrl: '',
          apiMode: '',
          chave: null,
          disponivel: false,
          motivo: null,
          perfisComChave: [],
          modelosNoConfig: [],
        };
        continue;
      }
      if (!atual) continue;

      const url = ln.match(/^\s+base_url:\s*['\"]?([^'\"\s]+)['\"]?/);
      if (url && !atual.baseUrl) atual.baseUrl = url[1];

      const modo = ln.match(/^\s+api_mode:\s*['\"]?([\w-]+)['\"]?/);
      if (modo && !atual.apiMode) atual.apiMode = modo[1];

      const chave = ln.match(/^\s+api_key_env:\s*['\"]?([A-Z0-9_]+)['\"]?/);
      if (chave && !atual.chave) atual.chave = chave[1];
    }
    fechar();

    // Associa os modelos citados no config a cada provider
    const cadeia = lerCadeiaDoConfig();
    const iniFallback = linhas.findIndex((l) => l.startsWith('fallback_providers:'));
    const pares: { provider: string; modelo: string }[] = [];
    if (iniFallback >= 0) {
      let provAtual = '';
      for (let i = iniFallback + 1; i < linhas.length; i += 1) {
        const ln = linhas[i];
        if (ln.length > 0 && !/^\s/.test(ln)) break;
        const p = ln.match(/^\s*-\s*provider:\s*['\"]?([\w-]+)/);
        if (p) { provAtual = p[1]; continue; }
        const m = ln.match(/^\s+model:\s*['\"]?([\w.\-]+)/);
        if (m && provAtual) pares.push({ provider: provAtual, modelo: m[1] });
      }
    }
    // O primário entra na lista do seu provider
    if (cadeia) pares.unshift({ provider: cadeia.provider, modelo: cadeia.primaryModel });

    // Decide disponibilidade pelo arquivo, nunca por `process.env`
    for (const p of providers) {
      if (!p.chave) {
        p.disponivel = false;
        p.motivo = 'sem chave declarada';
        continue;
      }
      p.perfisComChave = perfisComChave(p.chave);
      if (p.perfisComChave.length === 0) {
        p.disponivel = false;
        p.motivo = `chave ${p.chave} nao esta definida em nenhum perfil`;
      } else {
        p.disponivel = true;
      }
      p.modelosNoConfig = [...new Set(pares.filter((x) => x.provider === p.nome).map((x) => x.modelo))];
    }

    return NextResponse.json({
      providers,
      primaria: cadeia ? { provider: cadeia.provider, modelo: cadeia.primaryModel } : null,
      origem: 'config.yaml',
    });
  } catch (e) {
    console.error('Catalogo de modelos falhou:', (e as Error)?.message);
    return NextResponse.json({ error: 'Nao foi possivel ler o catalogo de modelos.' }, { status: 503 });
  }
}
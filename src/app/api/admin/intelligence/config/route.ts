/**
 * API: Get current Intelligence Control configuration
 * GET /api/admin/intelligence/config
 */

import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { lerCadeiaDoConfig } from '@/lib/cadeia-modelos';

const pool = new Pool({
  // O Postgres de controle roda como `postgres-control` na rede `mirai-run`
  // (host). Dentro do container do app o nome não resolve — por isso a conexão
  // é TENTADA com o que vier no env, e a falha é esperada num ambiente onde o
  // app e o banco não dividem rede. Nunca deixar a pool estourar no boot:
  // `connectionTimeoutMillis` baixo + `max: 1` (só uma consulta por vez).
  connectionString:
    process.env.MIRAI_INTELLIGENCE_DB ||
    process.env.DATABASE_URL ||
    'postgresql://arca@172.20.9.2:5432/mirai_intelligence',
  connectionTimeoutMillis: 2500,
  max: 1,
});

export async function GET() {
  // A CADEIA REAL PRIMEIRO: o config.yaml é a fonte da verdade. O banco de
  // roteamento entra só se ele responder — nunca o contrário. Ler o banco
  // primeiro faria a tela mostrar o que está no Postgres mesmo quando o agente
  // está atendendo por outro provider, que é exatamente o bug de ontem.
  const cadeia = lerCadeiaDoConfig();

  try {
    // Get active routing policy
    const policyResult = await pool.query(`
      SELECT config, version
      FROM ai_routing_policies
      WHERE is_active = true
      ORDER BY published_at DESC
      LIMIT 1
    `);

    if (cadeia) {
      // config.yaml manda; o banco só acrescenta a versão se houver.
      const versaoBanco = policyResult.rows[0]?.version;
      return NextResponse.json({
        ...cadeia,
        ...(versaoBanco ? { versaoBanco } : {}),
      });
    }

    // Sem config legível: nunca inventar. Devolve o que o banco tem.
    if (policyResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Nao foi possivel determinar o modelo em vigor (sem config.yaml e sem politica no banco).' },
        { status: 503 },
      );
    }

    const config = policyResult.rows[0].config;

    return NextResponse.json({
      primaryModel: config.primary_model,
      provider: config.primary_provider,
      credential: config.primary_credential,
      status: 'HEALTHY',
      fallbacks: config.fallbacks || [],
      version: policyResult.rows[0].version,
      origem: 'banco',
    });
  } catch (error) {
    // Banco de roteamento fora do alcance NÃO é erro de tela — o config.yaml
    // já respondeu qual é a cadeia real. Só o banco não foi consultado.
    console.error(
      'Intelligence config: banco de roteamento inacessivel (cadeia veio do config):',
      (error as Error)?.message,
    );
    if (cadeia) {
      return NextResponse.json({
        ...cadeia,
        aviso: 'Banco de roteamento inacessivel — cadeia exibida a partir do config.yaml em vigor.',
      });
    }
    // Nem config nem banco: dizer a verdade, nunca inventar modelo.
    return NextResponse.json(
      { error: 'Nao foi possivel determinar o modelo em vigor (config.yaml ilegivel e banco inacessivel).' },
      { status: 503 },
    );
  }
}

/**
 * PUT /api/admin/intelligence/config — troca o MODELO PRINCIPAL de verdade.
 *
 * POR QUE ISTO EXISTE (dono, 22/10/2026): havia um `PUT` que devolvia
 * `{success: true}` sem escrever NADA. Com um seletor em cima dele, a tela
 * mudaria, o modelo exibido mudaria, e o agente continuaria no modelo antigo —
 * e o próximo restart leria o config sem alteração. É o pior tipo de bug:
 * parece que funciona. Esta versão grava de verdade, ou falha honestamente.
 *
 * A SEQUÊNCIA É INEGOCIÁVEL, nesta ordem:
 *   1. valida o pedido (provider conhecido, com chave, modelo em formato)
 *   2. TESTE REAL — uma chamada ao provider escolhido. Se não responder em
 *      20 s, ABORTA sem gravar. Sem isto, escolher um modelo que o provider
 *      não tem derruba o agente, e o sintoma é "tudo parou de responder".
 *   3. backup do config.yaml com timestamp (o rollback sempre existe)
 *   4. escrita em `.tmp` + `rename` (atômica: nunca deixa config pela metade)
 *   5. re-lê e valida o YAML. Se ficou inválido → restaura o backup → ABORTA
 *
 * NÃO mexe na cadeia de fallback de propósito: fallback é o que sobe quando
 * TUDO cai, e mudar isso por um clique acidental é como se perde o chão.
 * O dono edita `fallback_providers:` no config à mão, se quiser.
 *
 * IMPORTANTE: o Hermes lê o config no BOOT. Trocar o primário muda o modelo
 * da sessão em curso; não é um toggle reversível sem restart. Por isso a
 * resposta traz `reiniciaAgente: true` — a tela diz isso ao usuário.
 */
export async function PUT(request: Request) {
  const startedAt = Date.now();
  let backup: string | null = null;

  try {
    const body = (await request.json()) as { provider?: string; modelo?: string };

    const provider = String(body.provider ?? '').trim();
    const modelo = String(body.modelo ?? '').trim();

    // --- 1. validação do pedido -------------------------------------------
    if (!provider || !modelo) {
      return NextResponse.json(
        { error: 'Informe provider e modelo.' },
        { status: 400 },
      );
    }
    // O nome do modelo vai para o YAML: se permitir espaço/quebra de linha,
    // um valor malicioso trunca o config e o agente não sobe.
    if (!/^[\w.\-]+$/.test(modelo)) {
      return NextResponse.json(
        { error: `Modelo invalido: "${modelo}". Use apenas letras, numeros, ponto e hifen.` },
        { status: 400 },
      );
    }
    if (!/^[\w-]+$/.test(provider)) {
      return NextResponse.json(
        { error: `Provider invalido: "${provider}".` },
        { status: 400 },
      );
    }

    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const CONFIG_YAML = '/opt/data/config.yaml';

    const atual = lerCadeiaDoConfig();
    if (atual && atual.provider === provider && atual.primaryModel === modelo) {
      return NextResponse.json({
        ok: true,
        alterado: false,
        motivo: 'O modelo principal ja e esse.',
        primaryModel: modelo,
        provider,
      });
    }

    // confere se o provider existe e TEM chave — antes de gastar o teste
    const cfgTexto = fs.readFileSync(CONFIG_YAML, 'utf8');
    const blocoProviders = cfgTexto.slice(
      cfgTexto.indexOf('providers:'),
      cfgTexto.indexOf('\ntoolsets:') > 0 ? cfgTexto.indexOf('\ntoolsets:') : undefined,
    );
    const reProv = new RegExp(`^  ${provider}:\\n((?:    .*\\n)*)`, 'm');
    const mProv = blocoProviders.match(reProv);
    if (!mProv) {
      return NextResponse.json(
        { error: `Provider "${provider}" nao existe no config.yaml.` },
        { status: 400 },
      );
    }
    const chaveDeclarada = mProv[1].match(/api_key_env:\s*['"]?([A-Z0-9_]+)/)?.[1] ?? null;
    const baseUrl = mProv[1].match(/base_url:\s*['"]?([^'"\s]+)/)?.[1] ?? null;
    if (!chaveDeclarada || !baseUrl) {
      return NextResponse.json(
        { error: `Provider "${provider}" nao tem chave declarada no config.` },
        { status: 400 },
      );
    }

    // --- 2. TESTE REAL — a única coisa que impede a queda -------------------
    const perfis = ['default', 'darkmatter', 'mediafactory', 'mapapaper', 'arquiteto', 'pathfinder', 'observador'];
    let chaveReal: string | null = null;
    let chaveDe: string | null = null;
    for (const p of perfis) {
      const caminho = p === 'default' ? '/opt/data/.env' : `/opt/data/profiles/${p}/.env`;
      let txt = '';
      try {
        txt = fs.readFileSync(caminho, 'utf8');
      } catch {
        continue;
      }
      for (const linha of txt.split('\n')) {
        const s = linha.trim().replace(/^export\s+/, '');
        if (!s || s.startsWith('#')) continue;
        const i2 = s.indexOf('=');
        if (i2 < 0) continue;
        if (s.slice(0, i2).trim() === chaveDeclarada) {
          const v = s.slice(i2 + 1).trim().replace(/^["']|["']$/g, '');
          if (v) { chaveReal = v; chaveDe = p; break; }
        }
      }
      if (chaveReal) break;
    }
    if (!chaveReal) {
      return NextResponse.json(
        { error: `A chave ${chaveDeclarada} do provider "${provider}" nao esta definida em nenhum perfil. Nada foi alterado.` },
        { status: 400 },
      );
    }

    const teste = await testarProvider(baseUrl, chaveReal, modelo, mProv[1]);
    if (!teste.ok) {
      return NextResponse.json(
        {
          error: `O provider ${provider} nao respondeu ao modelo ${modelo} (${teste.motivo}). Nada foi alterado — o modelo atual continua valendo.`,
          teste: { ok: false, motivo: teste.motivo, ms: Date.now() - startedAt },
        },
        { status: 400 },
      );
    }

    // --- 3. backup antes de tocar em qualquer coisa -------------------------
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    backup = `${CONFIG_YAML}.bak.intelligence.${stamp}`;
    fs.copyFileSync(CONFIG_YAML, backup);

    // --- 4. escrita atômica: .tmp + rename ---------------------------------
    const tmp = `${CONFIG_YAML}.tmp.${stamp}`;
    const novoTexto = cfgTexto
      // `model.default` — bloco de topo, indentação 2
      .replace(/^(model:\n(?:  .*\n)*?  default:\s*)[^\n]+/m, `$1${modelo}`)
      // `model.provider` — bloco de topo, indentação 2
      .replace(/^(model:\n(?:  .*\n)*?  provider:\s*)[^\n]+/m, `$1${provider}`);

    if (novoTexto === cfgTexto) {
      return NextResponse.json(
        { error: 'Nao foi possivel localizar model.default/model.provider no config.yaml — nada foi alterado.' },
        { status: 500 },
      );
    }
    fs.writeFileSync(tmp, novoTexto, { mode: 0o600 });
    fs.renameSync(tmp, CONFIG_YAML);

    // --- 5. re-lê e valida -----------------------------------------------
    const relido = lerCadeiaDoConfig();
    if (!relido || relido.primaryModel !== modelo || relido.provider !== provider) {
      // rollback: o config ficou ruim → devolve o backup
      try {
        fs.copyFileSync(backup, CONFIG_YAML);
      } catch (e) {
        console.error('ROLLBACK FALHOU — restaurar manualmente:', CONFIG_YAML, e);
      }
      return NextResponse.json(
        { error: 'A gravacao nao passou na validacao. O backup foi restaurado e nada mudou.', backup },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      alterado: true,
      primaryModel: relido.primaryModel,
      provider: relido.provider,
      backup,
      teste: { ok: true, ms: Date.now() - startedAt, chaveDe },
      reiniciaAgente: true,
      aviso: 'O Hermes le o config no boot. O modelo novo vale no proximo restart do agente.',
    });
  } catch (error) {
    // Se chegou aqui DEPOIS do backup, algo quebrou no meio — devolve tudo.
    if (backup) {
      try {
        require('fs').copyFileSync(backup, '/opt/data/config.yaml');
      } catch {
        /* nada a fazer */
      }
    }
    console.error('PUT intelligence/config falhou:', (error as Error)?.message);
    return NextResponse.json({ error: 'Falha ao trocar o modelo. Nada foi alterado.' }, { status: 500 });
  }
}

/**
 * Uma chamada real ao provider. Não é "checar se a URL existe": é ver se o
 * MODELO responde. É isso que separa "escrevi um nome bonito no config" de
 * "o agente vai conseguir falar depois do restart".
 */
async function testarProvider(
  baseUrl: string,
  chave: string,
  modelo: string,
  blocoConfig: string,
): Promise<{ ok: boolean; motivo: string }> {
  const modo = blocoConfig.match(/api_mode:\s*['"]?([\w-]+)/)?.[1] ?? 'chat_completions';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    // `/v1` é obrigatório e NÃO pode ser assumido: a KPA responde 200 em
    // `/v1/messages` e devolve 404 em `/messages`. Medido em 22/10/2026 — sem
    // isto o teste dizia "modelo inexistente" para o modelo que ESTAVA EM
    // VIGOR, e o seletor recusaria trocar para o modelo que estava funcionando.
    const raiz = baseUrl.replace(/\/$/, '');
    const base = raiz.endsWith('/v1') ? raiz : `${raiz}/v1`;
    const res = await fetch(modo === 'anthropic_messages' ? `${base}/messages` : `${base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        // Anthropic exige a versão; sem ela devolve 400 e o teste mente.
        ...(modo === 'anthropic_messages'
          ? { 'x-api-key': chave, 'anthropic-version': '2023-06-01' }
          : { authorization: `Bearer ${chave}` }),
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: 8,
        ...(modo === 'anthropic_messages'
          ? { messages: [{ role: 'user', content: 'ping' }] }
          : { messages: [{ role: 'user', content: 'ping' }] }),
      }),
    });

    clearTimeout(timer);
    if (res.ok) return { ok: true, motivo: 'respondeu' };

    const corpo = await res.text().catch(() => '');
    // 401/403 = chave errada; 404/400 = modelo não existe. Nenhum dos dois
    // melhora ao gravar, então aborta.
    if (res.status === 401 || res.status === 403) return { ok: false, motivo: 'chave recusada (401/403)' };
    if (res.status === 404) return { ok: false, motivo: 'modelo nao encontrado no provider (404)' };
    if (res.status === 400) return { ok: false, motivo: `provider recusou o modelo (400): ${corpo.slice(0, 160)}` };
    if (res.status === 429) return { ok: false, motivo: 'provider em rate limit (429) — tente de novo em instantes' };
    return { ok: false, motivo: `HTTP ${res.status}: ${corpo.slice(0, 160)}` };
  } catch (e) {
    clearTimeout(timer);
    const msg = (e as Error)?.name === 'AbortError' ? 'tempo esgotado (20s)' : (e as Error)?.message;
    return { ok: false, motivo: `nao respondeu: ${msg}` };
  }
}

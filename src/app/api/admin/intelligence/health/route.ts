/**
 * API: Get model health status
 * GET /api/admin/intelligence/health
 */

import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { lerCadeiaDoConfig } from '@/lib/cadeia-modelos';

const pool = new Pool({
  // Mesmo padrao do /config: tenta o env, e se o banco de roteamento nao for
  // alcancavel NAO e erro de tela — devolve o retrato em vigor. Ver o comentário
  // longo em ../config/route.ts.
  connectionString:
    process.env.MIRAI_INTELLIGENCE_DB ||
    process.env.DATABASE_URL ||
    'postgresql://arca@172.20.9.2:5432/mirai_intelligence',
  connectionTimeoutMillis: 2500,
  max: 1,
});


export async function GET() {
  // Saude por MODELO tem que sair da cadeia real (config.yaml), nao de lista
  // fixa: uma lista fixa mente assim que o primario muda. Sem config e sem
  // banco nao ha o que afirmar — 503 e honesto, 200 com modelo inventado nao.
  const cadeia = lerCadeiaDoConfig();

  try {
    const result = await pool.query(`
      WITH recent_events AS (
        SELECT
          m.model_identifier,
          p.display_name as provider,
          h.event_type,
          h.latency_ms,
          h.timestamp
        FROM ai_health_events h
        JOIN ai_models m ON h.model_id = m.id
        JOIN ai_providers p ON m.provider_id = p.id
        WHERE h.timestamp > NOW() - INTERVAL '1 hour'
      ),
      model_stats AS (
        SELECT
          provider,
          model_identifier,
          COUNT(*) as total_requests,
          SUM(CASE WHEN event_type = 'success' THEN 1 ELSE 0 END) as successes,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) as p95_latency
        FROM recent_events
        GROUP BY provider, model_identifier
      )
      SELECT
        provider,
        model_identifier as model,
        CASE
          WHEN successes::float / NULLIF(total_requests, 0) > 0.95 THEN 'healthy'
          WHEN successes::float / NULLIF(total_requests, 0) > 0.80 THEN 'degraded'
          ELSE 'unavailable'
        END as status,
        COALESCE(p95_latency, 0)::int as "latencyP95",
        COALESCE(ROUND(successes::numeric / NULLIF(total_requests, 0) * 100, 1), 100.0) as "successRate"
      FROM model_stats
      ORDER BY provider, model_identifier
    `);

    // Com medicoes reais: a tabela do banco manda.
    if (result.rows.length > 0) return NextResponse.json(result.rows);

    // Sem medicois mas com cadeia conhecida: mostra a cadeia, marcada como
    // SEM MEDICAO — `latencyP95: null` e nao 0, porque 0 ms seria mentira
    // (zero milissegundos nao existe; nao medido tambem nao e 0).
    if (cadeia) {
      return NextResponse.json([
        { provider: cadeia.provider, model: cadeia.primaryModel, status: 'sem-medicao', latencyP95: null, successRate: null, papel: 'primario' },
        ...cadeia.fallbacks.map((f: string, i: number) => ({
          provider: 'fallback', model: f, status: 'sem-medicao',
          latencyP95: null, successRate: null, papel: `fallback-${i + 1}`,
        })),
      ]);
    }

    return NextResponse.json(
      { error: 'Sem cadeia conhecida e sem medicoas — nada a afirmar sobre saude.' },
      { status: 503 },
    );
  } catch (error) {
    console.error('Health: banco inacessivel:', (error as Error)?.message);
    if (cadeia) {
      return NextResponse.json([
        { provider: cadeia.provider, model: cadeia.primaryModel, status: 'sem-medicao', latencyP95: null, successRate: null, papel: 'primario' },
        ...cadeia.fallbacks.map((f: string, i: number) => ({
          provider: 'fallback', model: f, status: 'sem-medicao',
          latencyP95: null, successRate: null, papel: `fallback-${i + 1}`,
        })),
      ]);
    }
    return NextResponse.json(
      { error: 'Banco inacessivel e cadeia desconhecida.' },
      { status: 503 },
    );
  }
}

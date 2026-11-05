/**
 * Intelligence Control — Overview (LEITURA)
 *
 * DECISÃO DO DONO (22/10/2026): esta tela é somente leitura. Não há edição de
 * modelo nem de fallback aqui.
 *
 * POR QUE (e o que esta tela NÃO vai repetir):
 * 1. Os botões "Alterar Modelo Principal" / "Editar Fallbacks" / "Testar
 *    Modelo" não tinham `onClick` — eram decoração. Um painel de controle com
 *    botão que não faz nada é pior que painel sem botão: a pessoa clica, não
 *    acontece nada, e perde a confiança na tela inteira. Até existir endpoint
 *    de escrita real, eles não aparecem.
 * 2. O `PUT /config` que existia devolvia `{success:true}` sem alterar nada —
 *    sucesso falso. Uma escrita que não escreve é pior que erro.
 * 3. Os 4 cards do rodapé mostravam números ESCRITOS NO JSX (`Providers 5`,
 *    `Modelos 12`, `Credenciais 8`, `Aliases 8`). Eram inventados; o config
 *    tem 7 providers, não 5. Agora vêm de `/inventario`, que conta o config.
 *
 * Para mudar o modelo em vigor: editar `/opt/data/config.yaml` (`model.default`
 * e `model.provider`). Esta tela reflete isso no próximo F5 ou em "Atualizar".
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Activity, Zap, AlertCircle, TrendingUp, Database, RefreshCw, Eye, Save, Loader2, ChevronDown } from 'lucide-react';

interface ModelStatus {
  provider: string;
  model: string;
  status: 'healthy' | 'degraded' | 'unavailable' | 'sem-medicao';
  papel?: string;
  latencyP95: number | null;
  successRate: number | null;
}

interface CurrentConfig {
  primaryModel: string;
  provider: string;
  /** Host real por trás do nome interno — `aibee` é KPA (api.kpalabz.com). */
  baseUrl?: string;
  status: string;
  fallbacks: string[];
  /** De onde veio o dado: `config.yaml` ou `banco`. Sem isso não há como conferir. */
  origem?: string;
  aviso?: string;
}

interface ProviderInfo {
  nome: string;
  baseUrl: string;
  chave: string | null;
  disponivel: boolean;
  motivo: string | null;
  perfisComChave: string[];
  modelosNoConfig: string[];
}

interface Catalogo {
  providers: ProviderInfo[];
  primaria: { provider: string; modelo: string } | null;
}

interface Inventario {
  providers: number;
  modelos: number;
  credenciais: number;
  aliases: number;
  detalhe?: {
    provedores?: string[];
    modelos?: string[];
    credenciais?: { variavel: string; definida: boolean }[];
    aliases?: string[];
  };
}

export default function IntelligenceOverview() {
  const [config, setConfig] = useState<CurrentConfig | null>(null);
  const [health, setHealth] = useState<ModelStatus[]>([]);
  const [inv, setInv] = useState<Inventario | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);

  // --- seletor de modelo (escrita real, com teste antes de gravar) ---------
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [provEscolhido, setProvEscolhido] = useState('');
  const [modeloDigitado, setModeloDigitado] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    setAtualizando(true);
    // As três leituras são independentes: uma falhar não pode derrubar as
    // outras duas. Por isso cada uma trata o próprio erro.
    const [c, h, i, cat] = await Promise.all([
      fetch('/api/admin/intelligence/config').then((r) => r.json()).catch(() => null),
      fetch('/api/admin/intelligence/health').then((r) => r.json()).catch(() => null),
      fetch('/api/admin/intelligence/inventario').then((r) => r.json()).catch(() => null),
      fetch('/api/admin/intelligence/models').then((r) => r.json()).catch(() => null),
    ]);

    if (cat && !cat.error) {
      setCatalogo(cat);
      // Pré-seleciona o que JÁ está em vigor: o seletor abre mostrando a
      // verdade, não um valor inicial inventado.
      if (cat.primaria) {
        setProvEscolhido(cat.primaria.provider);
        setModeloDigitado(cat.primaria.modelo);
      }
    }

    const configOk = c && !c.error ? c : null;
    const healthOk = Array.isArray(h) ? h : null;
    const invOk = i && !i.error ? i : null;

    setConfig(configOk);
    setHealth(healthOk ?? []);
    setInv(invOk);

    // Só há erro de TELA quando tudo falhou — se a cadeia voltou, o dono
    // consegue ver o que importa mesmo sem inventário.
    setErro(configOk || healthOk || invOk ? null : 'Nao foi possivel ler a configuracao nem a saude. Verifique se o app esta no ar.');
    setLoading(false);
    setAtualizando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);


  /**
   * Trocar o modelo principal. O backend FAZ o teste real antes de gravar e
   * responde se gravou ou não — esta tela não presume sucesso: se a resposta
   * não trouxer `ok:true`, mostra o motivo que veio do servidor.
   */
  const salvarModelo = async () => {
    if (!provEscolhido || !modeloDigitado) {
      setResultado({ tipo: 'erro', texto: 'Escolha o provider e escreva o modelo.' });
      return;
    }
    setSalvando(true);
    setResultado(null);
    try {
      const res = await fetch('/api/admin/intelligence/config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: provEscolhido, modelo: modeloDigitado }),
      });
      const d = await res.json();

      if (!res.ok || !d.ok) {
        setResultado({ tipo: 'erro', texto: d.error ?? 'Falha ao trocar o modelo.' });
        return;
      }
      if (d.alterado === false) {
        setResultado({ tipo: 'ok', texto: 'Esse ja e o modelo em vigor — nada a fazer.' });
        return;
      }
      setResultado({
        tipo: 'ok',
        texto: `Gravado: ${d.provider} / ${d.primaryModel}. ${d.aviso ?? ''} Backup: ${d.backup ?? '(sem backup)'}`.trim(),
      });
      await carregar();
    } catch (e) {
      setResultado({ tipo: 'erro', texto: `Erro de rede: ${(e as Error).message}` });
    } finally {
      setSalvando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-cyan-400">Carregando Intelligence Control...</div>
      </div>
    );
  }

  const credenciaisOk = (inv?.detalhe?.credenciais ?? []).filter((c) => c.definida).length;
  const credenciaisTotal = inv?.detalhe?.credenciais?.length ?? 0;
  const provedores = inv?.detalhe?.provedores ?? [];

  return (
    <div className="container mx-auto px-6 py-8 max-w-7xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
          <Activity className="w-8 h-8 text-cyan-400" />
          Intelligence Control
        </h1>
        <p className="text-gray-400">
          Gerenciamento universal de modelos de IA do ecossistema Mirai
        </p>
      </div>

      {/* Leitura + escrita do MODELO PRINCIPAL. A cadeia de fallback continua
          fora: é o que sobe quando TUDO cai, e isso não se muda por clique. */}
      <div className="mb-6 px-4 py-3 bg-gray-900/60 border border-gray-700 rounded-lg">
        <div className="flex items-start gap-3 text-sm text-gray-300">
          <Eye className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-white">Modelo principal: trocável aqui.</span>{' '}
            Antes de gravar, o servidor faz uma chamada real ao modelo escolhido — se ele não
            responder, nada é gravado e o modelo atual continua valendo.
            <div className="mt-1 text-xs text-gray-500">
              A cadeia de fallback se edita em{' '}
              <code className="text-cyan-300 font-mono">/opt/data/config.yaml</code>. Trocar o
              principal muda o modelo a partir do próximo restart do agente.
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={carregar}
            disabled={atualizando}
            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-xs transition-colors inline-flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3 h-3 ${atualizando ? 'animate-spin' : ''}`} />
            {atualizando ? 'Atualizando...' : 'Atualizar leitura'}
          </button>
        </div>
      </div>

      {erro && (
        <div className="mb-6 flex items-center gap-2 px-4 py-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300">
          <AlertCircle className="w-5 h-5" />
          {erro}
        </div>
      )}

      {/* Current Primary Model */}
      <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl border border-cyan-500/30 p-6 mb-6">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-cyan-400" />
          Modelo Principal Ativo
        </h2>

        {config ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="text-sm text-gray-400 mb-1">Provider</div>
                <div className="text-lg font-semibold text-white">{config.provider}</div>
                {/* O nome interno não diz o host: `aibee` é KPA (api.kpalabz.com).
                    Sem esta linha a tela escondia qual API está de fato em uso. */}
                {config.baseUrl && (
                  <div className="text-xs text-gray-500 font-mono">{config.baseUrl}</div>
                )}
              </div>
              <div>
                <div className="text-sm text-gray-400 mb-1">Modelo</div>
                <div className="text-lg font-semibold text-cyan-400">{config.primaryModel}</div>
              </div>
              <div>
                <div className="text-sm text-gray-400 mb-1">Status</div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-lg font-semibold text-green-400">{config.status}</span>
                </div>
              </div>
            </div>
            {/* De onde veio este número. Sem isso a tela não tem como ser conferida. */}
            {config.origem && (
              <div className="mt-4 text-xs text-gray-500 font-mono">
                origem: {config.origem}
                {config.aviso ? ` · ${config.aviso}` : ''}
              </div>
            )}

            {/* ---------------- SELETOR DE MODELO ---------------- */}
            <div className="mt-5 pt-5 border-t border-gray-700/70">
              <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                <ChevronDown className="w-4 h-4 text-cyan-400" />
                Trocar modelo principal
              </h3>

              {!catalogo ? (
                <p className="text-sm text-gray-500">Catalogo indisponivel — nao foi possivel ler os providers do config.</p>
              ) : (
                <div className="space-y-3">
                  {/* Provider: os sem chave aparecem DESABILITADOS e com o
                      motivo — esconder seria esconder um problema real. */}
                  <div>
                    <label htmlFor="sel-provider" className="block text-xs text-gray-400 mb-1">
                      Provider
                    </label>
                    <select
                      id="sel-provider"
                      value={provEscolhido}
                      onChange={(e) => {
                        setProvEscolhido(e.target.value);
                        const p = catalogo.providers.find((x) => x.nome === e.target.value);
                        // ao trocar de provider, sugere o primeiro modelo que ele ja usou
                        setModeloDigitado(p?.modelosNoConfig[0] ?? '');
                      }}
                      disabled={salvando}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                    >
                      <option value="">— escolhe um provider —</option>
                      {catalogo.providers.map((p) => (
                        <option key={p.nome} value={p.nome} disabled={!p.disponivel}>
                          {p.nome}
                          {p.disponivel ? '' : ` (indisponível: ${p.motivo})`}
                        </option>
                      ))}
                    </select>
                    {(() => {
                      const p = catalogo.providers.find((x) => x.nome === provEscolhido);
                      if (!p) return null;
                      return (
                        <p className="mt-1 text-xs text-gray-500 font-mono">
                          {p.baseUrl}
                          {p.disponivel
                            ? ` · chave OK em ${p.perfisComChave.length} perfil(is)`
                            : ` · ${p.motivo}`}
                        </p>
                      );
                    })()}
                  </div>

                  {/* Modelo: select com o que o provider já usou + campo livre
                      para digitar um novo. O campo livre é o que permite
                      ADICIONAR modelo novo sem editar arquivo. */}
                  <div>
                    <label htmlFor="sel-modelo" className="block text-xs text-gray-400 mb-1">
                      Modelo
                    </label>
                    {(() => {
                      const p = catalogo.providers.find((x) => x.nome === provEscolhido);
                      const conhecidos = p?.modelosNoConfig ?? [];
                      return (
                        <>
                          {conhecidos.length > 0 && (
                            <select
                              aria-label="Modelos já usados neste provider"
                              value={conhecidos.includes(modeloDigitado) ? modeloDigitado : ''}
                              onChange={(e) => setModeloDigitado(e.target.value)}
                              disabled={salvando}
                              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm mb-2 focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                            >
                              <option value="">— já usados neste provider —</option>
                              {conhecidos.map((m) => (
                                <option key={m} value={m}>{m}</option>
                              ))}
                            </select>
                          )}
                        </>
                      );
                    })()}
                    <input
                      id="sel-modelo"
                      type="text"
                      value={modeloDigitado}
                      onChange={(e) => setModeloDigitado(e.target.value)}
                      placeholder="nome-do-modelo (ex.: claude-opus-5-5)"
                      disabled={salvando}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-cyan-500 disabled:opacity-50"
                    />
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={salvarModelo}
                      disabled={salvando || !provEscolhido || !modeloDigitado}
                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors inline-flex items-center gap-2 text-sm"
                    >
                      {salvando ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      {salvando ? 'Testando e gravando...' : 'Salvar modelo'}
                    </button>
                    <span className="text-xs text-gray-500">
                      testa antes de gravar · faz backup · não mexe no fallback
                    </span>
                  </div>

                  {resultado && (
                    <div
                      role="status"
                      className={`text-sm px-3 py-2 rounded border ${
                        resultado.tipo === 'ok'
                          ? 'bg-green-900/25 border-green-700 text-green-300'
                          : 'bg-red-900/25 border-red-700 text-red-300'
                      }`}
                    >
                      {resultado.texto}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-yellow-400 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Nenhuma configuração global ativa
          </div>
        )}
      </div>

      {/* Fallback Chain */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-700 p-6 mb-6">
        <h2 className="text-xl font-semibold text-white mb-4">Cadeia de Fallback</h2>

        {config?.fallbacks && config.fallbacks.length > 0 ? (
          <ol className="space-y-3">
            {config.fallbacks.map((fallback, idx) => (
              <li key={idx} className="flex items-center gap-3 text-gray-300">
                <span className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center text-sm font-semibold">
                  {idx + 2}
                </span>
                <span>{fallback}</span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="text-gray-500">Nenhum fallback configurado</div>
        )}
      </div>

      {/* Health Monitor */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-700 p-6 mb-6">
        <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-cyan-400" />
          Status de Saúde dos Modelos
        </h2>

        {health.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="pb-3 text-sm font-semibold text-gray-400">Provider</th>
                  <th className="pb-3 text-sm font-semibold text-gray-400">Modelo</th>
                  <th className="pb-3 text-sm font-semibold text-gray-400">Papel</th>
                  <th className="pb-3 text-sm font-semibold text-gray-400">Status</th>
                  <th className="pb-3 text-sm font-semibold text-gray-400">Latência P95</th>
                  <th className="pb-3 text-sm font-semibold text-gray-400">Taxa de Sucesso</th>
                </tr>
              </thead>
              <tbody>
                {health.map((model, idx) => (
                  <tr key={idx} className="border-b border-gray-800">
                    <td className="py-3 text-gray-300">{model.provider}</td>
                    <td className="py-3 text-gray-300">{model.model}</td>
                    <td className="py-3 text-gray-400 text-sm">
                      {model.papel === 'primario' ? (
                        <span className="text-cyan-400">primario</span>
                      ) : (
                        (model.papel ?? '—')
                      )}
                    </td>
                    <td className="py-3">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          model.status === 'healthy'
                            ? 'bg-green-500/20 text-green-400'
                            : model.status === 'degraded'
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : model.status === 'sem-medicao'
                                ? 'bg-gray-500/20 text-gray-400'
                                : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {model.status}
                      </span>
                    </td>
                    <td className="py-3 text-gray-300">
                      {model.latencyP95 == null ? (
                        <span className="text-gray-500 italic">sem medicao</span>
                      ) : (
                        `${model.latencyP95}ms`
                      )}
                    </td>
                    <td className="py-3 text-gray-300">
                      {model.successRate == null ? (
                        <span className="text-gray-500 italic">sem medicao</span>
                      ) : (
                        `${model.successRate}%`
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-gray-500 flex items-start gap-2">
            <Database className="w-5 h-5 shrink-0 mt-0.5" />
            <span>
              Sem medicoes registradas. A tabela de saude e alimentada pelo Postgres de roteamento,
              que nao e alcancavel deste container — por isso a coluna aparece marcada como
              &quot;sem medicao&quot;, em vez de zero.
            </span>
          </div>
        )}
      </div>

      {/* Inventario real — números vindos de /api/admin/intelligence/inventario.
          NÃO são <button>: é leitura, e clique não levaria a lugar nenhum. */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
        {inv ? (
          <>
            <div className="p-4 bg-gray-900/50 rounded-xl border border-gray-700">
              <div className="text-sm text-gray-400 mb-1">Providers</div>
              <div className="text-2xl font-bold text-white">{inv.providers}</div>
              <div className="text-xs text-gray-500 font-mono mt-1 truncate">
                {provedores.slice(0, 2).join(', ')}
                {provedores.length > 2 ? ` +${provedores.length - 2}` : ''}
              </div>
            </div>
            <div className="p-4 bg-gray-900/50 rounded-xl border border-gray-700">
              <div className="text-sm text-gray-400 mb-1">Modelos na cadeia</div>
              <div className="text-2xl font-bold text-white">{inv.modelos}</div>
              <div className="text-xs text-gray-500 font-mono mt-1">citados no config</div>
            </div>
            <div className="p-4 bg-gray-900/50 rounded-xl border border-gray-700">
              <div className="text-sm text-gray-400 mb-1">Credenciais</div>
              <div className="text-2xl font-bold text-white">{inv.credenciais}</div>
              <div className="text-xs text-gray-500 font-mono mt-1">
                {credenciaisOk}/{credenciaisTotal} definidas
              </div>
            </div>
            <div className="p-4 bg-gray-900/50 rounded-xl border border-gray-700">
              <div className="text-sm text-gray-400 mb-1">Aliases</div>
              <div className="text-2xl font-bold text-cyan-400">{inv.aliases}</div>
              <div className="text-xs text-gray-500 font-mono mt-1">no config</div>
            </div>
          </>
        ) : (
          <div className="col-span-2 md:col-span-4 text-gray-500 flex items-center gap-2">
            <Database className="w-5 h-5" />
            Inventario indisponivel — leitura do config.yaml falhou.
          </div>
        )}
      </div>
    </div>
  );
}
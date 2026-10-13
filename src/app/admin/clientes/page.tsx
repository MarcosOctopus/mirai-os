"use client";

/* /admin/clientes — os CLIENTES do MIRAI OS (só o dono).
 *
 * Por que esta aba existe: a tela de Planos mostra ORGANIZAÇÃO. Quem entra pelo
 * Google podia nascer sem organização no plano de controle e simplesmente não
 * aparecer lá — o dono ficava sem ver a pessoa e sem ter onde pôr o plano. Aqui
 * a linha é a PESSOA: de onde veio (Google/senha), em que organização está, em
 * que produto, e qual plano — que é posto À MÃO, no seletor de cada linha.
 *
 * A fonte da verdade é o plano de controle; esta tela só mostra e pede. A
 * escrita passa por /api/admin/planos (ação `definir_plano_da_org`), que tem o
 * freio do e-mail autorizado no servidor.
 *
 * Padrão Dash: casca (Shell) + kit; Poppins; laranja #ff751f; raios 24/10px;
 * ícones de traço, nunca emoji. */

import { useCallback, useEffect, useMemo, useState } from "react";
import Shell from "@/components/dash/Shell";
import { Card, Secao, Selo, Vazio } from "@/components/dash/kit";
import { IconeUsuarios } from "@/components/dash/icons";

/* Escopo de agora: só MIRAI OS e CRM são vendidos. Os outros produtos continuam
 * no registry, guardados para quando chegarem na fila. */
const EM_ESCOPO = ["mirai", "saaso"];

const ROTULO_PRODUTO: Record<string, string> = {
  mirai: "MIRAI OS",
  saaso: "CRM",
  darkmatter: "Dark Matter",
  pathfinder: "Pathfinder",
  mediafactory: "Media Factory",
};

function rotuloProduto(id: string): string {
  return ROTULO_PRODUTO[id] || id || "—";
}

type OrganizacaoDoCliente = {
  tenant_id: string;
  organizacao: string;
  produto: string;
  plano: string;
  papel: string | null;
  extras: string[];
  desde: string | null;
};

type Cliente = {
  id: number;
  nome: string;
  email: string;
  entra_por: "Google" | "senha";
  tenant_local: string | null;
  vinculado: boolean;
  desde: string | null;
  organizacoes: OrganizacaoDoCliente[];
};

type Plano = {
  plan_id: string;
  product_id: string;
  nome: string;
  ativo: boolean;
};

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [orfaos, setOrfaos] = useState<OrganizacaoDoCliente[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState<string>("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [rc, rp] = await Promise.all([
        fetch("/api/admin/clientes"),
        fetch("/api/admin/planos?acao=planos"),
      ]);
      if (rc.status === 403) throw new Error("Esta área é do dono da plataforma.");
      if (!rc.ok) throw new Error(`HTTP ${rc.status}`);
      const dc = (await rc.json()) as {
        clientes?: Cliente[];
        orfaos?: OrganizacaoDoCliente[];
        aviso?: string;
      };
      setClientes(dc.clientes || []);
      setOrfaos(dc.orfaos || []);
      if (dc.aviso) setAviso(dc.aviso);

      if (rp.ok) {
        const dp = (await rp.json()) as { planos?: Plano[] };
        setPlanos(dp.planos || []);
      }
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao carregar");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /* Os planos que PODEM ser postos numa organização: os do produto dela, ativos,
   * com o escopo de venda na frente.
   *
   * Se o produto vier VAZIO (o plano de controle ainda não devolve `product_id`
   * — versão antiga do serviço), oferecemos o catálogo ativo inteiro em vez de
   * uma lista vazia: o seletor fica útil nos dois mundos, e nesse caso o rótulo
   * de cada opção diz de que produto ela é. O servidor recusa plano de outro
   * produto (422), então escolher errado falha com explicação — nunca em
   * silêncio. Se o plano ATUAL não estiver na lista (ex.: o free do catálogo
   * ainda não foi criado para aquele produto), ele entra assim mesmo: senão o
   * seletor apareceria vazio e pareceria que a conta não tem plano. */
  const planosDe = useCallback(
    (produto: string, atual: string): Plano[] => {
      const meus = planos.filter((p) => p.ativo !== false && (!produto || p.product_id === produto));
      const ordenados = [...meus].sort((a, b) => {
        const ea = EM_ESCOPO.indexOf(a.product_id) >= 0 ? 0 : 1;
        const eb = EM_ESCOPO.indexOf(b.product_id) >= 0 ? 0 : 1;
        if (ea !== eb) return ea - eb;
        return a.product_id.localeCompare(b.product_id) || a.plan_id.localeCompare(b.plan_id);
      });
      if (atual && !ordenados.some((p) => p.plan_id === atual)) {
        const conhecido = planos.find((p) => p.plan_id === atual);
        return [
          ...ordenados,
          conhecido || { plan_id: atual, product_id: produto, nome: atual, ativo: true },
        ];
      }
      return ordenados;
    },
    [planos],
  );

  const trocarPlano = useCallback(
    async (tenantId: string, planId: string, quem: string) => {
      setErro("");
      setNota("");
      setOcupado(tenantId);
      try {
        const res = await fetch("/api/admin/planos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "definir_plano_da_org", tenant_id: tenantId, plan_id: planId }),
        });
        const d = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
        if (!res.ok) throw new Error(d?.error || d?.detail || `HTTP ${res.status}`);
        setNota(`${quem} agora está no plano ${planId}.`);
        await carregar();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "falha ao trocar plano");
      } finally {
        setOcupado("");
      }
    },
    [carregar],
  );

  const resumo = useMemo(() => {
    const contas = new Set(clientes.map((c) => c.email)).size;
    const comOrg = clientes.filter((c) => c.organizacoes.length > 0).length;
    return { contas, linhas: clientes.length, comOrg, semOrg: clientes.length - comOrg };
  }, [clientes]);

  return (
    <Shell titulo="Clientes" usuario={{ ehDono: true }}>
      <p className="max-w-2xl text-[13px] leading-[1.65] text-dash-muted">
        Cada linha é uma <span className="text-dash-fg">pessoa</span> e onde ela está. O plano é posto{" "}
        <span className="text-dash-fg">à mão</span>, no seletor de cada linha — nada promove ninguém
        sozinho. O plano vale no produto na hora em que o serviço consulta a conta.
      </p>

      {erro && (
        <p className="mt-5 rounded-[16px] border border-dash-bad/30 bg-dash-bad/[0.07] px-5 py-4 text-[13px] text-dash-bad">
          {erro}
        </p>
      )}
      {nota && (
        <p className="mt-5 rounded-[16px] border border-dash-ok/30 bg-dash-ok/[0.07] px-5 py-4 text-[13px] text-dash-ok">
          {nota}
        </p>
      )}
      {aviso && (
        <p className="mt-5 rounded-[16px] border border-dash-warn/30 bg-dash-warn/[0.07] px-5 py-4 text-[13px] text-dash-warn">
          {aviso}
        </p>
      )}

      <Secao
        titulo="Clientes"
        contagem={
          carregando
            ? "carregando…"
            : `${resumo.contas} conta(s) · ${resumo.linhas} vínculo(s)${resumo.semOrg ? ` · ${resumo.semOrg} sem organização` : ""}`
        }
      >
        {carregando ? (
          <p className="text-[13px] text-dash-dim">Carregando…</p>
        ) : clientes.length === 0 ? (
          <Vazio
            icone={<IconeUsuarios />}
            titulo="Nenhum cliente ainda"
            texto="Quando alguém criar conta no MIRAI OS, aparece aqui — e o plano é posto à mão."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {clientes.map((c, i) => {
              const org = c.organizacoes[0];
              const chave = `${c.id}-${org?.tenant_id || `sem-${i}`}`;
              return (
                <Card key={chave}>
                  <div className="flex flex-wrap items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-[15px] font-semibold text-dash-fg">{c.nome}</p>
                        <Selo tom={c.entra_por === "Google" ? "info" : "ok"}>
                          entra por {c.entra_por}
                        </Selo>
                        {org && c.vinculado && <Selo tom="ok">vinculado</Selo>}
                        {org && !c.vinculado && <Selo tom="alerta">vínculo pendente</Selo>}
                      </div>
                      <p className="mt-1 break-all text-[12px] text-dash-muted">{c.email}</p>
                      <p className="mt-2 text-[12px] text-dash-dim">
                        {org ? (
                          <>
                            {org.organizacao} · {rotuloProduto(org.produto)}
                            {org.papel ? ` · ${org.papel}` : ""}
                          </>
                        ) : (
                          <>Sem organização no plano de controle — ainda não aparece para receber plano.</>
                        )}
                      </p>
                      {org && org.extras.length > 0 && (
                        <p className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] uppercase tracking-[0.14em] text-dash-dim">
                            add-ons
                          </span>
                          {org.extras.map((e) => (
                            <span
                              key={e}
                              className="rounded-[8px] bg-dash-side px-2 py-0.5 font-mono text-[11px] text-dash-muted"
                            >
                              {e}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>

                    {org && (
                      <label className="flex shrink-0 flex-col gap-1.5">
                        <span className="text-[11px] uppercase tracking-[0.14em] text-dash-dim">
                          Plano (à mão)
                        </span>
                        <select
                          value={org.plano || ""}
                          disabled={ocupado === org.tenant_id}
                          onChange={(e) => void trocarPlano(org.tenant_id, e.target.value, c.nome)}
                          className="min-w-[190px] rounded-[10px] border border-dash-hair/10 bg-dash-bg px-3.5 py-2 text-[12px] text-dash-fg outline-none focus:border-dash-brand/60 disabled:opacity-50"
                        >
                          {planosDe(org.produto, org.plano).map((p) => (
                            <option key={p.plan_id} value={p.plan_id}>
                              {org.produto
                                ? p.nome || p.plan_id
                                : `${p.nome || p.plan_id} · ${rotuloProduto(p.product_id)}`}
                            </option>
                          ))}
                        </select>
                        <span className="font-mono text-[10px] text-dash-dim">{org.tenant_id}</span>
                      </label>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </Secao>

      {orfaos.length > 0 && (
        <Secao
          titulo="Organizações sem conta no MIRAI OS"
          contagem={`${orfaos.length}`}
        >
          <p className="mb-3 max-w-2xl text-[12px] leading-[1.6] text-dash-dim">
            Existem no plano de controle, mas não têm conta aqui — dado de teste, ou conta de outro
            produto. Ficam visíveis para não sumirem do painel.
          </p>
          <div className="flex flex-col gap-2">
            {orfaos.map((o) => (
              <Card key={o.tenant_id}>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="text-[13px] font-semibold text-dash-fg">{o.organizacao}</p>
                  <span className="text-[12px] text-dash-muted">{rotuloProduto(o.produto)}</span>
                  <span className="ml-auto">
                    <select
                      value={o.plano || ""}
                      disabled={ocupado === o.tenant_id}
                      onChange={(e) => void trocarPlano(o.tenant_id, e.target.value, o.organizacao)}
                      className="min-w-[190px] rounded-[10px] border border-dash-hair/10 bg-dash-bg px-3.5 py-2 text-[12px] text-dash-fg outline-none focus:border-dash-brand/60 disabled:opacity-50"
                    >
                      {planosDe(o.produto, o.plano).map((p) => (
                        <option key={p.plan_id} value={p.plan_id}>
                          {o.produto
                            ? p.nome || p.plan_id
                            : `${p.nome || p.plan_id} · ${rotuloProduto(p.product_id)}`}
                        </option>
                      ))}
                    </select>
                  </span>
                </div>
                <p className="mt-2 font-mono text-[10px] text-dash-dim">{o.tenant_id}</p>
              </Card>
            ))}
          </div>
        </Secao>
      )}
    </Shell>
  );
}

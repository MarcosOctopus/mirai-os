"use client";

/* Perfil da conta — destino do item "Perfil" no menu do canto superior direito.
 *
 * NO PADRÃO DASH (mesma organização de /dashboard e /dashboard/connect):
 * StatCards de VÍNCULO no topo, UMA ÚNICA caixa de espaço (o bloco forte com a
 * barra neon), identificação e organização lado a lado, sessão e o rodapé de
 * transparência. Cartões de 24px, títulos com rótulo + título, ícones de traço
 * monocromáticos (nunca emoji).
 *
 * DECISÕES DO DONO (06/out/2026): o card de PLANO/LIMITES saiu ("esse lance de
 * limite aí, pode tirar") e o espaço passou a viver numa caixa só ("tem que ter
 * só uma caixa de espaço") — daí não existir StatCard de espaço nem teto
 * duplicado em dois lugares.
 *
 * Fontes (NADA inventado): /api/auth/me (conta), /api/minha-organizacao
 * (organização), /api/perfil/armazenamento ({usado_bytes, limite_bytes}) e
 * /api/ia (a IA da conta — ver CartaoIaDaConta).
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import CartaoAutonomia from "@/components/dash/CartaoAutonomia";
import CartaoIaDaConta from "@/components/dash/CartaoIaDaConta";
import Shell from "@/components/dash/Shell";
import { Botao, Card, CardTitulo, Secao, Selo, StatCard } from "@/components/dash/kit";
import {
  IconeCadeado,
  IconeOrganizacoes,
  IconeRobo,
  IconeSeta,
  IconeUsuarios,
} from "@/components/dash/icons";

/* ════════════════════════════════════════════════════════════════════
   A BARRA DE ESPAÇO USADO
   ────────────────────────────────────────────────────────────────────
   • ESCALA 0–10%: 0% de uso = barra vazia; 10% (ou mais) = barra cheia.
       largura = min(usado/limite, 0.10) / 0.10 * 100%.
   • ESPESSURA = 2px, copiada da BARRA LARANJA DO MENU. No código, a barra
     laranja do menu é o scrollbar da navegação lateral, em
     src/app/globals.css:
         ::-webkit-scrollbar { width: 2px; }
         ::-webkit-scrollbar-thumb { background: #ff751f; }
     Medido no DOM da casca: a navegação lateral tem scrollbar de 2px e polegar
     rgb(255,117,31). (O item ATIVO do menu não tem barra: fundo transparente,
     só ícone + texto laranja — logo, a única barra laranja do menu tem 2px.)
   • LARANJA NEON: no lugar do laranja chapado, o preenchimento ganha brilho em
     camadas (glow) — 0 0 6px / 0 0 14px / 0 0 26px de rgba(255,117,31,…).
   • NUNCA enganar: o número real (usado de limite) e o percentual REAL ficam ao
     lado da barra, e a escala 0–10% é declarada na tela.
   ════════════════════════════════════════════════════════════════════ */
const ESPESSURA_BARRA_PX = 2; // = espessura da barra laranja do menu (globals.css ::-webkit-scrollbar)
const ESCALA = 0.1; // a barra mede de 0 a 10% do usado
// Piso visual da barra. Sem ele, uso 0 B => largura 0% => o preenchimento neon
// simplesmente NÃO aparece (a barra some e sobra só o risco cinza de 2px). O piso
// desenha um toco de 2% (~9px) para a barra EXISTIR na tela. NÃO é engano: o número
// grande, o selo e a linha "de X GB · Y% real" continuam com o valor REAL (0 B / 0%),
// e a escala 0–10% segue declarada logo abaixo.
const PISO_BARRA_PCT = 2;
const NEON = "linear-gradient(90deg, #ff6a14 0%, #ff8a3d 45%, #ffc27f 100%)";
const GLOW =
  "0 0 7px rgba(255,117,31,0.95), 0 0 16px rgba(255,117,31,0.7), 0 0 30px rgba(255,117,31,0.45), 0 0 48px rgba(255,117,31,0.22)";

/* ── tipos das fontes reais ─────────────────────────────────────────── */

interface Conta {
  id?: number;
  name?: string;
  email?: string;
  tenant_id?: string;
  ehDono?: boolean;
  papel?: string;
  organizacao?: { id?: string; nome?: string; slug?: string } | null;
}

interface DadosOrg {
  organizacao?: { id?: string; nome?: string; slug?: string; crm?: boolean } | null;
  membros?: { email: string; papel: string }[];
  papel?: string | null;
  podeGerir?: boolean;
}

interface DadosArm {
  usado_bytes: number;
  limite_bytes: number;
}

/* ── util ───────────────────────────────────────────────────────────── */

function bytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  if (n >= 1024) return `${(n / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} KB`;
  return `${n.toLocaleString("pt-BR")} B`;
}

function percentual(n: number): string {
  if (n <= 0) return "0%";
  if (n < 0.01) return "<0,01%";
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function rotuloPapel(p?: string | null): string {
  if (p === "dono") return "Dono da plataforma";
  if (p === "admin") return "Admin da organização";
  if (p === "cliente" || p === "membro") return "Funcionário";
  return "—";
}

/* ── a barra neon (o miolo do pedido) ───────────────────────────────── */

function BarraEspaco({
  usado,
  limite,
  estado,
}: {
  usado: number;
  limite: number;
  estado: "lendo" | "ok" | "off";
}) {
  const razao = limite > 0 ? usado / limite : 0;
  const pctBarra = limite > 0 ? (Math.min(razao, ESCALA) / ESCALA) * 100 : 0;
  // o piso só vale quando o dado é REAL (estado "ok"); nos estados lendo/off a barra fica vazia
  const larguraPct = estado === "ok" ? Math.max(pctBarra, PISO_BARRA_PCT) : 0;

  return (
    <div>
      {/* A barra tem EXATAMENTE a espessura da barra laranja do menu (2px).
          O brilho neon vem de DUAS camadas: um halo borrado (blur) + o núcleo
          com box-shadow em cascata — no lugar do laranja chapado. */}
      <div className="relative w-full" style={{ height: ESPESSURA_BARRA_PX }}>
        <div className="absolute inset-0 overflow-hidden rounded-full bg-dash-raise" />
        {estado === "ok" && (
          <>
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out"
              style={{ width: `${larguraPct}%`, background: NEON, filter: "blur(4px)", opacity: 0.95 }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out"
              style={{ width: `${larguraPct}%`, background: NEON, boxShadow: GLOW }}
            />
          </>
        )}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[11px] uppercase tracking-[0.16em] text-dash-dim">
          Escala 0–10%
        </span>
        {estado === "ok" ? (
          <span className="text-[12px] text-dash-muted">
            {bytes(usado)} de {bytes(limite)} · {percentual(razao * 100)} real
          </span>
        ) : estado === "lendo" ? (
          <span className="text-[12px] text-dash-muted">lendo o uso…</span>
        ) : (
          <span className="text-[12px] text-dash-warn">uso indisponível agora</span>
        )}
      </div>
    </div>
  );
}

/* ── bloco de ESPAÇO DE TRABALHO (o card forte) ─────────────────────── */

function CartaoEspaco({
  dados,
  estado,
  recarregar,
}: {
  dados: DadosArm | null;
  estado: "lendo" | "ok" | "off";
  recarregar: () => void;
}) {
  const usado = dados?.usado_bytes ?? 0;
  const limite = dados?.limite_bytes ?? 0;
  const razao = limite > 0 ? usado / limite : 0;
  const livre = Math.max(0, limite - usado);

  const tom = estado !== "ok" ? "info" : razao >= 0.9 ? "erro" : razao >= 0.8 ? "alerta" : "ok";
  const rotuloSelo =
    estado === "lendo" ? "lendo…" : estado === "off" ? "indisponível" : percentual(razao * 100);

  return (
    <Card>
      <CardTitulo
        rotulo="Espaço de trabalho"
        titulo="Armazenamento usado"
        acao={
          <Selo tom={tom}>{rotuloSelo}</Selo>
        }
      />

      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[1.5fr_1fr]">
        {/* coluna esquerda: o número grande + a barra */}
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-dash-dim">Usado</p>
          <p className="mt-1.5 font-public text-[34px] font-semibold leading-none text-dash-fg">
            {estado === "ok" ? bytes(usado) : estado === "lendo" ? "…" : "—"}
          </p>
          <p className="mt-2 text-[13px] text-dash-muted">
            {estado === "ok" ? `de ${bytes(limite)} disponíveis` : "teto do seu espaço de trabalho"}
          </p>

          <div className="mt-6">
            <BarraEspaco usado={usado} limite={limite} estado={estado} />
          </div>

          <p className="mt-4 text-[12px] leading-[1.6] text-dash-dim">
            A barra vai de 0 a 10%: ela fica cheia quando 10% do espaço é usado (ou mais). O número
            acima é o uso <span className="text-dash-muted">real</span> — a barra só realça o começo.
          </p>

          {estado === "off" && (
            <p className="mt-3 text-[12px] text-dash-bad">
              Não consegui ler o seu uso agora. Nada aqui é estimado —{" "}
              <button onClick={recarregar} className="underline">
                tentar de novo
              </button>
              .
            </p>
          )}
        </div>

        {/* coluna direita: os números crus, lado a lado */}
        <dl className="grid grid-cols-1 content-start gap-y-4 sm:grid-cols-2 lg:grid-cols-1">
          <div className="rounded-[16px] bg-dash-side/60 px-4 py-3.5">
            <dt className="text-[11px] uppercase tracking-[0.18em] text-dash-dim">Livre</dt>
            <dd className="mt-1 font-public text-[15px] text-dash-fg">
              {estado === "ok" ? bytes(livre) : "—"}
            </dd>
          </div>
          <div className="rounded-[16px] bg-dash-side/60 px-4 py-3.5">
            <dt className="text-[11px] uppercase tracking-[0.18em] text-dash-dim">Teto do espaço</dt>
            <dd className="mt-1 font-public text-[15px] text-dash-fg">
              {estado === "ok" ? bytes(limite) : "—"}
            </dd>
          </div>
          <div className="rounded-[16px] bg-dash-side/60 px-4 py-3.5">
            <dt className="text-[11px] uppercase tracking-[0.18em] text-dash-dim">Uso real</dt>
            <dd className="mt-1 font-public text-[15px] text-dash-fg">
              {estado === "ok" ? percentual(razao * 100) : "—"}
            </dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}

/* ── página ─────────────────────────────────────────────────────────── */

export default function PerfilPage() {
  const [conta, setConta] = useState<Conta | null>(null);
  const [org, setOrg] = useState<DadosOrg | null>(null);
  const [arm, setArm] = useState<DadosArm | null>(null);
  const [estadoArm, setEstadoArm] = useState<"lendo" | "ok" | "off">("lendo");
  const [carregando, setCarregando] = useState(true);
  const [saindo, setSaindo] = useState(false);

  const lerArmazenamento = useCallback(async () => {
    setEstadoArm("lendo");
    try {
      const r = await fetch("/api/perfil/armazenamento", { cache: "no-store" });
      if (!r.ok) {
        setEstadoArm("off");
        return;
      }
      const d = (await r.json()) as { usado_bytes?: unknown; limite_bytes?: unknown };
      if (typeof d?.usado_bytes === "number" && typeof d?.limite_bytes === "number" && d.limite_bytes > 0) {
        setArm({ usado_bytes: d.usado_bytes, limite_bytes: d.limite_bytes });
        setEstadoArm("ok");
      } else {
        setEstadoArm("off");
      }
    } catch {
      setEstadoArm("off");
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/auth/me", { cache: "no-store" });
        if (r.ok) {
          const d = (await r.json()) as { user?: Conta };
          if (vivo) setConta(d?.user ?? null);
        }
      } catch {
        /* segue com o que tiver */
      }
      try {
        const r = await fetch("/api/minha-organizacao", { cache: "no-store" });
        if (r.ok) {
          const d = (await r.json()) as DadosOrg;
          if (vivo) setOrg(d ?? null);
        }
      } catch {
        /* segue com o que tiver */
      }
      if (vivo) setCarregando(false);
    })();
    lerArmazenamento();
    return () => {
      vivo = false;
    };
  }, [lerArmazenamento]);

  async function sair() {
    setSaindo(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }

  const inicial = (conta?.name || conta?.email || "?").trim().charAt(0).toUpperCase();
  const papel = org?.papel ?? conta?.papel ?? (conta?.ehDono ? "dono" : null);
  const organizacao = org?.organizacao ?? conta?.organizacao ?? null;
  const membros = org?.membros ?? [];

  const vazio = useMemo(() => estadoArm !== "ok", [estadoArm]);

  return (
    <Shell titulo="Perfil" usuario={{ nome: conta?.name, email: conta?.email, ehDono: conta?.ehDono }}>
      {/* ── linha de números do topo: só o VÍNCULO (o espaço tem caixa própria) ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          rotulo="Sua organização"
          valor={carregando ? "–" : organizacao?.nome || "—"}
          tamanho="medio"
          nota={conta?.ehDono ? "dono da plataforma" : organizacao ? "você só vê a sua" : "conta sem vínculo"}
          tom="marca"
          icone={<IconeOrganizacoes className="h-4 w-4" />}
        />
        <StatCard
          rotulo="Seu papel"
          valor={carregando ? "–" : rotuloPapel(papel)}
          nota={conta?.ehDono ? "acesso total à plataforma" : "acesso à sua organização"}
          tom="neutro"
          icone={<IconeRobo className="h-4 w-4" />}
        />
      </div>

      {/* ── o bloco de ESPAÇO DE TRABALHO: a barra neon ──────────────── */}
      <div className="mt-6">
        <CartaoEspaco dados={arm} estado={estadoArm} recarregar={lerArmazenamento} />
      </div>

      {/* ── identificação + organização, lado a lado ─────────────────── */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitulo
            rotulo="Identificação"
            titulo="Sua conta"
            acao={
              <Selo tom={vazio ? "info" : "ok"}>{conta?.ehDono ? "dono" : "membro"}</Selo>
            }
          />
          <div className="flex items-center gap-4">
            <span className="grid h-[54px] w-[54px] shrink-0 place-items-center rounded-full border border-dash-hair/15 bg-dash-raise text-[19px] font-semibold text-dash-fg">
              {carregando ? "" : inicial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-dash-fg">
                {carregando ? "Carregando…" : conta?.name || "Sua conta"}
              </p>
              <p className="truncate text-[12.5px] text-dash-muted">{conta?.email || "—"}</p>
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            <div>
              <dt className="text-[11px] uppercase tracking-[0.18em] text-dash-dim">Identificador</dt>
              <dd className="mt-1 font-public text-[13px] text-dash-muted">
                {conta?.id != null ? `#${conta.id}` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.18em] text-dash-dim">Conta (tenant)</dt>
              <dd className="mt-1 truncate font-public text-[13px] text-dash-muted" title={conta?.tenant_id}>
                {conta?.tenant_id || "—"}
              </dd>
            </div>
          </dl>

          <div className="mt-6 flex flex-wrap gap-3">
            <Botao href="https://id.miraitohope.com/login" externo variante="linha">
              Gerenciar identidade
            </Botao>
            <Botao href="/chat">
              Abrir o chat
              <IconeSeta className="h-3.5 w-3.5" />
            </Botao>
          </div>
        </Card>

        <Card>
          <CardTitulo
            rotulo="Vínculo"
            titulo="Sua organização"
            acao={
              organizacao ? (
                <Selo tom={org?.organizacao?.crm ? "ok" : "alerta"}>
                  {org?.organizacao?.crm ? "CRM ligado" : "CRM não ligado"}
                </Selo>
              ) : undefined
            }
          />
          {organizacao ? (
            <>
              <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.18em] text-dash-dim">Nome</dt>
                  <dd className="mt-1 truncate text-[13.5px] text-dash-fg">{organizacao.nome || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.18em] text-dash-dim">Seu papel</dt>
                  <dd className="mt-1 text-[13.5px] text-dash-fg">{rotuloPapel(papel)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.18em] text-dash-dim">Slug</dt>
                  <dd className="mt-1 truncate font-public text-[13px] text-dash-muted">
                    {organizacao.slug || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.18em] text-dash-dim">Quem entra</dt>
                  <dd className="mt-1 font-public text-[13px] text-dash-fg">
                    {membros.length} {membros.length === 1 ? "pessoa" : "pessoas"}
                  </dd>
                </div>
              </dl>

              {membros.length > 0 && (
                <ul className="mt-5 space-y-2 border-t border-dash-hair/[0.07] pt-5">
                  {membros.slice(0, 6).map((m) => (
                    <li key={m.email} className="flex flex-wrap items-center gap-3 text-[13px]">
                      <IconeUsuarios className="h-4 w-4 text-dash-dim" />
                      <span className="break-all text-dash-fg">{m.email}</span>
                      <span className="ml-auto rounded-full bg-dash-raise px-2.5 py-[3px] text-[10px] uppercase tracking-[0.14em] text-dash-muted">
                        {rotuloPapel(m.papel)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {org?.podeGerir && (
                <div className="mt-5">
                  <Botao href="/admin/organizacoes" variante="linha" className="justify-start">
                    <IconeOrganizacoes /> Gerir a organização
                  </Botao>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className="text-[13px] leading-[1.6] text-dash-muted">
                Esta conta ainda não está vinculada a nenhuma organização. Quando estiver, o CRM e o
                pessoal da empresa aparecem aqui.
              </p>
              <Botao href="/admin/organizacoes" variante="linha" className="justify-start">
                <IconeOrganizacoes /> Ver organizações
              </Botao>
            </div>
          )}
        </Card>
      </div>

      {/* ── IA da conta: onde o cliente cadastra a IA dele (item novo) ─── */}
      <div className="mt-6 grid gap-4">
        <CartaoIaDaConta />
      </div>

      {/* ── AUTONOMIA: o "agir sozinho" saiu do campo de escrita e veio para
             cá (dono, 19/11/2026: "só coloca o agir sozinho em configuração
             da conta e n ali"). Preferência de conta, não controle de digitação. */}
      <div className="mt-6 grid gap-4">
        <CartaoAutonomia />
      </div>

      {/* ── sessão (o card de PLANO/LIMITES saiu: decisão do dono) ───── */}
      <div className="mt-6 grid gap-4">
        <Card>
          <CardTitulo
            rotulo="Sessão"
            titulo="Encerrar neste navegador"
            acao={
              <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-dash-raise text-dash-muted">
                <IconeCadeado className="h-4 w-4" />
              </span>
            }
          />
          <p className="text-[13px] leading-[1.6] text-dash-muted">
            Sair encerra a sessão <span className="text-dash-fg">neste navegador</span> e volta para a
            tela de entrada. Sua conta, sua organização e seus arquivos continuam intactos.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={sair}
              disabled={saindo}
              className="rounded-[10px] border border-dash-bad/40 bg-dash-bad/10 px-5 py-2.5 text-[13px] font-semibold text-dash-bad transition hover:bg-dash-bad/20 disabled:opacity-60"
            >
              {saindo ? "Saindo…" : "Sair da conta"}
            </button>
          </div>
        </Card>
      </div>

      <Secao titulo="Transparência">
        <p className="text-[12px] leading-[1.7] text-dash-dim">
          Cada número desta tela vem de uma fonte que existe: a conta (<span className="text-dash-muted">/api/auth/me</span>),
          a organização (<span className="text-dash-muted">/api/minha-organizacao</span>) e o espaço
          (<span className="text-dash-muted">/api/perfil/armazenamento</span>). A barra de espaço usa a
          escala 0–10% — declarada na tela — para o uso baixo ficar legível, mas o valor mostrado é sempre o real.
        </p>
      </Secao>
    </Shell>
  );
}

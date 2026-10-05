"use client";

/* Painel do MIRAI OS — a porta de entrada de quem está logado.
   Padrão Dash: casca (Shell) + kit. Regra que não muda: nada inventado.
   Conta e organização vêm de /api/auth/me e /api/minha-organizacao; o CRM vem
   do MCP do Saaso (/api/integracoes/saaso); o build vem de /version. */

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/dash/Shell";
import { Botao, Card, CardTitulo, Secao, Selo, StatCard } from "@/components/dash/kit";
import {
  IconeAgentes,
  IconeBackup,
  IconeChat,
  IconeInfra,
  IconeOrb,
  IconeOrganizacoes,
  IconePlug,
  IconeProdutos,
  IconeRobo,
  IconeSeta,
} from "@/components/dash/icons";

interface User {
  id: string | number;
  name: string;
  email: string;
  tenant_id?: string;
  platform_config?: Record<string, unknown>;
  ehDono?: boolean;
  papel?: string;
  organizacao?: { id: string; nome: string; slug: string } | null;
}

interface Organizacao {
  organizacao: { id: string; nome: string; slug: string; crm: boolean } | null;
  membros: { email: string; papel: string }[];
  papel: string | null;
  podeGerir: boolean;
}

interface Crm {
  configurado?: boolean;
  conectado?: boolean;
  ferramentas?: number;
  erro?: string;
  vinculado?: boolean;
  funil?: string;
  fila?: string;
}

/* Mesma leitura de status usada em /dashboard/connect — uma fonte, uma regra. */
const INTEGRACOES: { id: string; nome: string; conectado: (c: Record<string, unknown>) => boolean }[] = [
  { id: "drive", nome: "Google Drive", conectado: (c) => Boolean(c.drive) },
  { id: "youtube", nome: "YouTube", conectado: (c) => Boolean((c.youtube as Record<string, unknown> | undefined)?.channel) },
  { id: "higgsfield", nome: "Higgsfield", conectado: (c) => Boolean(c.higgsfield) },
  { id: "suno", nome: "Suno", conectado: (c) => Boolean(c.suno) },
  { id: "telegram", nome: "Telegram", conectado: (c) => Boolean(c.telegram) },
  { id: "magnific", nome: "Magnific", conectado: (c) => Boolean(c.magnific) },
  { id: "instagram", nome: "Instagram", conectado: (c) => Boolean(c.instagram) },
  { id: "kling", nome: "Kling", conectado: (c) => Boolean(c.kling) },
];

const ESPACOS = [
  { nome: "Agentes", texto: "Os 8 agentes do ecossistema, com estado e o que cada um toca.", icone: <IconeAgentes /> },
  { nome: "Produtos", texto: "Saaso, Media Factory, Mapa Paper, Pathfinder, Dark Matter, campanha.", icone: <IconeProdutos /> },
  { nome: "Infra", texto: "Serviços, portas, certificados, disco e backups num só lugar.", icone: <IconeInfra /> },
  { nome: "Backups", texto: "Local, Drive e snapshot — com data e tamanho de cada um.", icone: <IconeBackup /> },
];

/* A empresa desta conta: o CRM dela, o pessoal dela. Só ela — nunca outra. */
function CartaoOrganizacao() {
  const [dados, setDados] = useState<Organizacao | null>(null);
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<"membro" | "admin">("membro");
  const [recado, setRecado] = useState("");
  const [erro, setErro] = useState("");

  const ler = useCallback(async () => {
    try {
      const r = await fetch("/api/minha-organizacao", { cache: "no-store" });
      if (r.ok) setDados((await r.json()) as Organizacao);
    } catch {
      /* sem organização a tela apenas não aparece */
    }
  }, []);

  useEffect(() => {
    ler();
  }, [ler]);

  if (!dados?.organizacao) return null;

  async function adicionar() {
    setErro("");
    setRecado("");
    const r = await fetch("/api/minha-organizacao", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, papel }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErro(d?.error || `falha (HTTP ${r.status})`);
      return;
    }
    setRecado(`${d.membro.email} entrou como ${d.membro.papel === "admin" ? "admin" : "funcionário"}.`);
    setEmail("");
    ler();
  }

  async function tirar(alvo: string) {
    setErro("");
    setRecado("");
    const r = await fetch(`/api/minha-organizacao?email=${encodeURIComponent(alvo)}`, { method: "DELETE" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setErro(d?.error || `falha (HTTP ${r.status})`);
      return;
    }
    setRecado(`${alvo} saiu da organização.`);
    ler();
  }

  const org = dados.organizacao;
  return (
    <Card className="md:col-span-2">
      <CardTitulo
        rotulo="Sua organização"
        titulo={org.nome}
        acao={
          <Selo tom={org.crm ? "ok" : "alerta"}>
            {org.crm ? "CRM ligado" : "CRM não ligado"}
          </Selo>
        }
      />

      <div className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-dash-dim">Seu papel</p>
          <p className="mt-1 text-[13px] text-white">
            {dados.papel === "admin" ? "Admin da organização" : dados.papel === "dono" ? "Dono da plataforma" : "Funcionário"}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-dash-dim">Como o CRM chega</p>
          <p className="mt-1 text-[13px] text-dash-muted">
            {org.crm ? "pelo MCP do produto, com a credencial desta empresa" : "vincule a credencial do CRM desta empresa"}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-dash-dim">Quem entra</p>
          <p className="mt-1 font-public text-[13px] text-white">
            {dados.membros.length} {dados.membros.length === 1 ? "pessoa" : "pessoas"}
          </p>
        </div>
      </div>

      <ul className="mt-5 space-y-2 border-t border-white/[0.07] pt-5">
        {dados.membros.map((m) => (
          <li key={m.email} className="flex flex-wrap items-center gap-3 text-[13px]">
            <span className="break-all text-white">{m.email}</span>
            <span className="rounded-full bg-dash-raise px-2.5 py-[3px] text-[10px] uppercase tracking-[0.14em] text-dash-muted">
              {m.papel === "admin" ? "admin" : m.papel === "dono" ? "dono" : "funcionário"}
            </span>
            {dados.podeGerir && m.papel !== "dono" && (
              <button
                onClick={() => tirar(m.email)}
                className="text-[11px] text-dash-bad/80 transition hover:text-dash-bad"
              >
                tirar
              </button>
            )}
          </li>
        ))}
      </ul>

      {dados.podeGerir && (
        <div className="mt-5 border-t border-white/[0.07] pt-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-dash-dim">Adicionar gente da empresa</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="funcionario@empresa.com"
              className="min-w-[200px] flex-1 rounded-[10px] border border-white/10 bg-dash-bg px-4 py-2.5 text-[13px] text-white outline-none placeholder:text-dash-dim focus:border-dash-brand/60"
            />
            <select
              value={papel}
              onChange={(e) => setPapel(e.target.value === "admin" ? "admin" : "membro")}
              className="rounded-[10px] border border-white/10 bg-dash-bg px-4 py-2.5 text-[13px] text-dash-muted outline-none"
            >
              <option value="membro">funcionário</option>
              <option value="admin">admin</option>
            </select>
            <button
              onClick={adicionar}
              className="rounded-[10px] bg-dash-brand px-5 py-2.5 text-[12px] font-semibold text-white transition hover:bg-dash-brandHi"
            >
              adicionar
            </button>
          </div>
          {recado && <p className="mt-3 text-[12px] text-dash-ok">{recado}</p>}
          {erro && <p className="mt-3 text-[12px] text-dash-bad">{erro}</p>}
        </div>
      )}
    </Card>
  );
}

export default function PainelPage() {
  const [user, setUser] = useState<User | null>(null);
  const [crm, setCrm] = useState<Crm | null>(null);
  const [build, setBuild] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await fetch("/api/auth/me", { cache: "no-store" });
      if (!r.ok) throw new Error(`não consegui ler a conta (HTTP ${r.status})`);
      const d = (await r.json()) as { user: User };
      setUser(d.user);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro desconhecido");
    } finally {
      setCarregando(false);
    }
    try {
      const v = await fetch("/version", { cache: "no-store" });
      const d = (await v.json()) as { build?: string };
      if (d.build) setBuild(d.build);
    } catch {
      /* o build é enfeite: se não vier, a tela não pode ficar pior por isso */
    }
    try {
      const c = await fetch("/api/integracoes/saaso", { cache: "no-store" });
      if (c.ok) setCrm((await c.json()) as Crm);
    } catch {
      /* o CRM só aparece se responder */
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const cfg = user?.platform_config ?? {};
  const ligadas = INTEGRACOES.filter((i) => i.conectado(cfg));
  const primeiroNome = (user?.name || "").split(" ")[0];

  return (
    <Shell
      titulo={carregando ? "Painel" : primeiroNome ? `Painel · ${primeiroNome}` : "Painel"}
      usuario={user}
    >
      {erro && (
        <p className="mb-5 rounded-[16px] border border-dash-bad/30 bg-dash-bad/[0.07] px-5 py-4 text-[13px] text-dash-bad">
          {erro} —{" "}
          <button onClick={carregar} className="underline">
            tentar de novo
          </button>
        </p>
      )}

      {/* Números do topo — todos vindos de alguma fonte real */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          rotulo="Integrações ligadas"
          valor={carregando ? "–" : `${ligadas.length}/${INTEGRACOES.length}`}
          nota={ligadas.length ? ligadas.map((i) => i.nome).join(" · ") : "nenhuma ligada ainda"}
          tom={ligadas.length ? "ok" : "neutro"}
          icone={<IconePlug className="h-4 w-4" />}
        />
        <StatCard
          rotulo="CRM (Saaso)"
          valor={carregando ? "–" : crm?.conectado ? `${crm.ferramentas ?? 0}` : "off"}
          nota={
            crm?.conectado
              ? "ferramentas disponíveis pelo MCP"
              : crm?.erro || "sem credencial vinculada"
          }
          tom={crm?.conectado ? "ok" : "alerta"}
          icone={<IconeOrganizacoes className="h-4 w-4" />}
        />
        <StatCard
          rotulo="Sua organização"
          valor={user?.organizacao?.nome || "—"}
          tamanho="medio"
          nota={
            user?.ehDono
              ? "dono da plataforma: enxerga todas"
              : user?.organizacao
                ? "você só vê a sua"
                : "conta ainda sem vínculo"
          }
          tom="marca"
          icone={<IconeRobo className="h-4 w-4" />}
        />
        <StatCard
          rotulo="Build no ar"
          valor={build ? build.slice(0, 7) : "–"}
          nota="recarrego sozinho quando publico algo novo"
          icone={<IconeInfra className="h-4 w-4" />}
        />
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <CartaoOrganizacao />

        <Card>
          <CardTitulo rotulo="Identidade" titulo="Sua conta" />
          <dl className="space-y-4">
            <div>
              <dt className="text-[11px] uppercase tracking-[0.18em] text-dash-dim">Nome</dt>
              <dd className="mt-1 text-[13px] text-white">{user?.name || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.18em] text-dash-dim">E-mail</dt>
              <dd className="mt-1 break-all text-[13px] text-white">{user?.email || "—"}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-[0.18em] text-dash-dim">Conta</dt>
              <dd className="mt-1 font-public text-[13px] text-dash-muted">
                #{user?.id ?? "—"}
                {user?.tenant_id ? ` · ${user.tenant_id}` : ""}
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
          <CardTitulo rotulo="Ações rápidas" titulo="Por onde seguir" />
          <div className="grid gap-3">
            <Botao href="/dashboard/connect" variante="linha" className="justify-start">
              <IconePlug /> Integrações (Drive, YouTube, Instagram…)
            </Botao>
            <Botao href="/chat" variante="linha" className="justify-start">
              <IconeChat /> Chat escrito com a Mirai
            </Botao>
            <Botao href="/" variante="linha" className="justify-start">
              <IconeOrb /> Orb — conversa por voz
            </Botao>
          </div>
        </Card>
      </div>

      {/* O que o CRM desta conta devolve hoje (dado bruto do MCP, sem enfeite) */}
      {(crm?.funil || crm?.fila) && (
        <Secao titulo="CRM desta organização" contagem="lido agora pelo MCP do Saaso">
          <div className="grid gap-4 md:grid-cols-2">
            {crm?.funil && (
              <Card>
                <CardTitulo rotulo="Funil" titulo="Pipelines" />
                <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.6] text-dash-muted">
                  {crm.funil}
                </pre>
              </Card>
            )}
            {crm?.fila && (
              <Card>
                <CardTitulo rotulo="Atendimento" titulo="Fila" />
                <pre className="max-h-52 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-[1.6] text-dash-muted">
                  {crm.fila}
                </pre>
              </Card>
            )}
          </div>
        </Secao>
      )}

      <Secao titulo="Espaços" contagem="nesta mesma base — vou abrindo um por um">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {ESPACOS.map((e) => (
            <Card key={e.nome} className="flex flex-col">
              <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-dash-raise text-dash-brand">
                {e.icone}
              </span>
              <p className="mt-4 text-[15px] font-semibold text-white">{e.nome}</p>
              <p className="mt-1.5 text-[12px] leading-[1.55] text-dash-muted">{e.texto}</p>
              <span className="mt-4 w-fit rounded-full bg-dash-raise px-2.5 py-[3px] text-[10px] text-dash-dim">
                em breve
              </span>
            </Card>
          ))}
        </div>
      </Secao>

      <p className="mt-8 text-[12px] text-dash-dim">
        Sem números inventados: cada número desta tela vem de uma fonte que existe (conta, organização, MCP do
        CRM, build). O que ainda não existe aparece marcado como <span className="text-dash-muted">em breve</span>.
      </p>
    </Shell>
  );
}

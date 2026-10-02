"use client";

/* Painel do MIRAI OS — a porta de entrada de quem está logado.
   Regra desta tela: nada inventado. Conta e integrações vêm de /api/auth/me;
   o build vem de /version (rota pública de propósito). */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Nav from "@/components/mirai/Nav";

interface User {
  id: string | number;
  name: string;
  email: string;
  avatar_url?: string;
  tenant_id?: string;
  platform_config?: Record<string, unknown>;
  ehDono?: boolean;
  papel?: string;
  organizacao?: { id: string; nome: string; slug: string } | null;
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

function Cartao({ titulo, rotulo, children }: { titulo: string; rotulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-cyan-300/15 bg-cyan-950/10 p-6 shadow-[inset_0_0_45px_rgba(10,239,255,0.04)]">
      <div>
        <p className="text-xs uppercase tracking-[0.35em] text-cyan-300/45">{rotulo}</p>
        <h2 className="mt-2 text-xl font-semibold tracking-wide text-cyan-50">{titulo}</h2>
      </div>
      <div className="flex flex-1 flex-col gap-4">{children}</div>
    </section>
  );
}

function Botao({ href, externo, children }: { href: string; externo?: boolean; children: React.ReactNode }) {
  const classe =
    "mt-auto inline-flex items-center justify-center rounded-full border border-cyan-300/25 px-5 py-3 text-xs uppercase tracking-[0.22em] text-cyan-100/85 transition-colors hover:border-cyan-300/50 hover:text-cyan-50";
  return externo ? (
    <a href={href} target="_blank" rel="noreferrer" className={classe}>{children}</a>
  ) : (
    <Link href={href} className={classe}>{children}</Link>
  );
}

/* A empresa desta conta: o CRM dela, o pessoal dela. Só ela — nunca outra. */
function CartaoOrganizacao() {
  const [dados, setDados] = useState<{
    organizacao: { id: string; nome: string; slug: string; crm: boolean } | null;
    membros: { email: string; papel: string }[];
    papel: string | null;
    podeGerir: boolean;
  } | null>(null);
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<"membro" | "admin">("membro");
  const [recado, setRecado] = useState("");
  const [erro, setErro] = useState("");

  const ler = useCallback(async () => {
    try {
      const r = await fetch("/api/minha-organizacao", { cache: "no-store" });
      if (r.ok) setDados(await r.json());
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
    <Cartao titulo={org.nome} rotulo="Sua organização">
      <dl className="flex flex-col gap-3 text-sm">
        <div>
          <dt className="text-xs uppercase tracking-[0.28em] text-cyan-300/45">Seu papel</dt>
          <dd className="mt-1 text-cyan-50">{dados.papel === "admin" ? "Admin da organização" : "Funcionário"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.28em] text-cyan-300/45">CRM desta empresa</dt>
          <dd className="mt-1 text-cyan-100/70">{org.crm ? "ligado (dado vem pelo MCP do produto)" : "ainda não ligado"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-[0.28em] text-cyan-300/45">Quem entra</dt>
          <dd className="mt-1 flex flex-col gap-1">
            {dados.membros.map((m) => (
              <span key={m.email} className="flex items-center gap-2 break-all text-cyan-100/80">
                {m.email}
                <span className="rounded-full border border-cyan-300/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-cyan-200/60">
                  {m.papel === "admin" ? "admin" : m.papel === "dono" ? "dono" : "funcionário"}
                </span>
                {dados.podeGerir && m.papel !== "dono" && (
                  <button onClick={() => tirar(m.email)} className="text-[10px] uppercase tracking-[0.2em] text-rose-300/70 hover:text-rose-200">
                    tirar
                  </button>
                )}
              </span>
            ))}
          </dd>
        </div>
      </dl>

      {dados.podeGerir && (
        <div className="mt-auto flex flex-col gap-2 border-t border-cyan-300/10 pt-4">
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/45">Adicionar gente da empresa</p>
          <div className="flex flex-wrap gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="funcionario@empresa.com"
              className="min-w-[190px] flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-cyan-50 outline-none focus:border-cyan-400/40"
            />
            <select
              value={papel}
              onChange={(e) => setPapel(e.target.value === "admin" ? "admin" : "membro")}
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-cyan-50 outline-none"
            >
              <option value="membro">funcionário</option>
              <option value="admin">admin</option>
            </select>
            <button
              onClick={adicionar}
              className="rounded-lg bg-cyan-500/20 px-4 py-2 text-xs uppercase tracking-[0.2em] text-cyan-300 hover:bg-cyan-500/30"
            >
              adicionar
            </button>
          </div>
          {recado && <p className="text-xs text-emerald-300/80">{recado}</p>}
          {erro && <p className="text-xs text-rose-300/80">{erro}</p>}
        </div>
      )}
    </Cartao>
  );
}

export default function PainelPage() {
  const [user, setUser] = useState<User | null>(null);
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
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const cfg = user?.platform_config ?? {};
  const ligadas = INTEGRACOES.filter((i) => i.conectado(cfg));
  const primeiraLetra = (user?.name || user?.email || "?").trim().charAt(0).toUpperCase();

  return (
    <main className="min-h-dvh overflow-y-auto bg-[#03040d] text-cyan-100">
      <Nav atual="/dashboard" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(176,38,255,0.16),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(10,239,255,0.14),transparent_32%)]" />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-8 px-5 py-8">
        <header className="flex flex-col gap-5 border-b border-cyan-300/15 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.5em] text-cyan-300/45">MIRAI OS // Painel</p>
            <h1 className="mt-3 text-3xl font-semibold uppercase tracking-[0.2em] text-cyan-50 md:text-5xl">
              {carregando ? "Carregando…" : user?.name ? `Olá, ${user.name.split(" ")[0]}` : "Bem-vindo"}
            </h1>
            <p className="mt-3 text-sm text-cyan-100/55">
              Tudo do seu ecossistema num lugar: conta, integrações e conversa.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/30 text-sm text-cyan-100/80">
              {primeiraLetra}
            </span>
            <span className="rounded-full border border-cyan-300/25 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-cyan-200/70">
              Conta Mirai
            </span>
          </div>
        </header>

        {erro && (
          <p className="rounded-2xl border border-rose-400/30 bg-rose-950/20 px-5 py-4 text-sm text-rose-200/90">
            {erro} — <button onClick={carregar} className="underline">tentar de novo</button>
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {user?.organizacao && <CartaoOrganizacao />}

          <Cartao titulo="Sua conta" rotulo="Identidade">
            {carregando ? (
              <p className="text-sm text-cyan-100/50">lendo…</p>
            ) : (
              <dl className="flex flex-col gap-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-[0.28em] text-cyan-300/45">Nome</dt>
                  <dd className="mt-1 text-cyan-50">{user?.name || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.28em] text-cyan-300/45">E-mail</dt>
                  <dd className="mt-1 break-all text-cyan-50">{user?.email || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.28em] text-cyan-300/45">Conta</dt>
                  <dd className="mt-1 text-cyan-100/70">
                    #{user?.id ?? "—"}
                    {user?.tenant_id ? ` · ${user.tenant_id}` : ""}
                  </dd>
                </div>
              </dl>
            )}
            <Botao href="https://id.miraitohope.com/login" externo>Gerenciar identidade</Botao>
          </Cartao>

          <Cartao titulo="Integrações" rotulo="Conexões">
            <p className="text-3xl font-semibold text-cyan-50">
              {carregando ? "–" : `${ligadas.length} de ${INTEGRACOES.length}`}
            </p>
            <p className="text-sm text-cyan-100/55">
              {carregando
                ? "conferindo…"
                : ligadas.length
                  ? `Conectadas: ${ligadas.map((i) => i.nome).join(", ")}.`
                  : "Nenhuma conectada ainda — é aqui que você liga Drive, YouTube, Instagram e o resto."}
            </p>
            <Botao href="/dashboard/connect">Abrir integrações</Botao>
          </Cartao>

          <Cartao titulo="Chat" rotulo="Escrito">
            <p className="text-sm text-cyan-100/60">
              Converse com a Mirai por escrito, no modo Conversa ou no modo Arquiteto.
            </p>
            <Botao href="/chat">Abrir o chat</Botao>
          </Cartao>

          <Cartao titulo="Conversa" rotulo="Voz">
            <p className="text-sm text-cyan-100/60">
              Para falar, é no Orb: toque, desperte e converse com a voz.
            </p>
            <Botao href="/">Ir para o Orb</Botao>
          </Cartao>

          {user?.ehDono && (
            <Cartao titulo="Sistema" rotulo="Estado">
              <dl className="flex flex-col gap-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-[0.28em] text-cyan-300/45">Build</dt>
                  <dd className="mt-1 font-mono text-xs text-cyan-100/70">{build || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.28em] text-cyan-300/45">Modelo</dt>
                  <dd className="mt-1 text-cyan-100/70">DeepSeek V4.1 (reserva V4.0)</dd>
                </div>
              </dl>
              <Botao href="/system">Ver o sistema</Botao>
            </Cartao>
          )}

          <Cartao titulo="Como este painel é" rotulo="Regra">
            <p className="text-sm text-cyan-100/60">
              Este é o painel normal. A conversa por voz vive no Orb — aqui ficam as ligações e o
              escrito.
            </p>
            <p className="mt-auto text-xs text-cyan-100/40">
              Sem números inventados: só o que existe de verdade.
            </p>
          </Cartao>
        </div>
      </div>
    </main>
  );
}

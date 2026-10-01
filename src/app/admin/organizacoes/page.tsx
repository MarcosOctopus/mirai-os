"use client";

import { useCallback, useEffect, useState } from "react";
import Nav from "@/components/mirai/Nav";

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */

interface Membro {
  email: string;
  papel: string;
}

interface Organizacao {
  id: string;
  nome: string;
  slug: string;
  cliente_email: string | null;
  saaso_org_id: string | null;
  saaso_token: string | null;
  membros: Membro[];
}

/* ------------------------------------------------------------------ */
/*  Tela: Organizações (só o dono)                                     */
/* ------------------------------------------------------------------ */

export default function OrganizacoesPage() {
  const [orgs, setOrgs] = useState<Organizacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  // formulário
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [saasoOrgId, setSaasoOrgId] = useState("");
  const [saasoToken, setSaasoToken] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch("/api/admin/organizacoes");
      if (res.status === 403) throw new Error("Esta área é do dono da plataforma.");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as { organizacoes: Organizacao[] };
      setOrgs(d.organizacoes || []);
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao carregar");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const criar = useCallback(async () => {
    if (!nome.trim()) {
      setErro("Dê um nome à organização (é o nome que o cliente vê).");
      return;
    }
    setSalvando(true);
    setErro("");
    setAviso("");
    try {
      const res = await fetch("/api/admin/organizacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, clienteEmail: email, saasoOrgId, saasoToken }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.error || `HTTP ${res.status}`);
      setAviso(
        email.trim()
          ? `Organização "${d.organizacao.nome}" criada e vinculada a ${email.trim()}. Essa conta só vê ela.`
          : `Organização "${d.organizacao.nome}" criada. Agora amarre o e-mail do cliente.`,
      );
      setNome("");
      setEmail("");
      setSaasoOrgId("");
      setSaasoToken("");
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao criar");
    } finally {
      setSalvando(false);
    }
  }, [nome, email, saasoOrgId, saasoToken, carregar]);

  const addMembro = useCallback(
    async (org: Organizacao, email: string, papel: string) => {
      setErro("");
      setAviso("");
      try {
        const res = await fetch("/api/admin/organizacoes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: org.id, membro: { email, papel } }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d?.error || `HTTP ${res.status}`);
        setAviso(`${email} entrou em ${org.nome} como ${papel}.`);
        carregar();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "falha ao adicionar");
      }
    },
    [carregar],
  );

  const tirarMembro = useCallback(
    async (org: Organizacao, email: string) => {
      setErro("");
      setAviso("");
      try {
        const res = await fetch(
          `/api/admin/organizacoes?email=${encodeURIComponent(email)}&orgId=${encodeURIComponent(org.id)}`,
          { method: "DELETE" },
        );
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d?.error || `HTTP ${res.status}`);
        setAviso(`${email} saiu de ${org.nome}.`);
        carregar();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "falha ao remover");
      }
    },
    [carregar],
  );

  const salvarCredencial = useCallback(
    async (org: Organizacao, campo: "clienteEmail" | "saasoOrgId" | "saasoToken", valor: string) => {
      try {
        const res = await fetch("/api/admin/organizacoes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: org.id, [campo]: valor }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setAviso("Atualizado.");
        carregar();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "falha ao salvar");
      }
    },
    [carregar],
  );

  return (
    <main className="min-h-dvh overflow-y-auto bg-[#03040d] text-cyan-100">
      <Nav atual="/admin/organizacoes" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(176,38,255,0.16),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(10,239,255,0.14),transparent_32%)]" />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-8 px-5 py-8">
        <header className="border-b border-cyan-300/15 pb-6">
          <h1 className="text-lg font-semibold text-cyan-50">Organizações</h1>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-cyan-100/50">
            Cada organização é um cliente (white-label). O e-mail que você amarrar aqui entra
            <span className="text-cyan-200"> só nela</span> — não vê as outras organizações, nem as
            áreas internas da plataforma.
          </p>
        </header>

        {erro && (
          <div className="rounded-xl border border-red-400/20 bg-red-950/20 p-4 text-sm text-red-300">
            {erro}
          </div>
        )}
        {aviso && (
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-950/20 p-4 text-sm text-emerald-300">
            {aviso}
          </div>
        )}

        {/* ─── Nova organização ─────────────────────────────────────── */}
        <section className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
          <h2 className="text-xs uppercase tracking-[0.28em] text-cyan-100/50">Nova organização</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-cyan-100/60">
              Nome da organização
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Clínica Vida"
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-cyan-50 outline-none focus:border-cyan-400/40"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-cyan-100/60">
              E-mail do cliente (só ele entra aqui)
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cliente@dominio.com"
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-cyan-50 outline-none focus:border-cyan-400/40"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-cyan-100/60">
              Organização no CRM (opcional)
              <input
                value={saasoOrgId}
                onChange={(e) => setSaasoOrgId(e.target.value)}
                placeholder="id/uuid da organização no Saaso"
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-cyan-50 outline-none focus:border-cyan-400/40"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-cyan-100/60">
              Credencial de CRM do cliente (opcional)
              <input
                value={saasoToken}
                onChange={(e) => setSaasoToken(e.target.value)}
                placeholder="token dsk_... do CRM daquele cliente"
                className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-cyan-50 outline-none focus:border-cyan-400/40"
              />
            </label>
          </div>
          <button
            onClick={criar}
            disabled={salvando}
            className="mt-4 rounded-lg bg-cyan-500/20 px-5 py-2.5 text-sm font-medium text-cyan-300 transition-all hover:bg-cyan-500/30 disabled:opacity-40"
          >
            {salvando ? "Criando..." : "Criar organização"}
          </button>
        </section>

        {/* ─── Lista ────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-4">
          <h2 className="text-xs uppercase tracking-[0.28em] text-cyan-100/50">
            Organizações criadas
          </h2>

          {carregando && <p className="text-xs text-cyan-100/40">Carregando...</p>}
          {!carregando && orgs.length === 0 && (
            <p className="text-xs text-cyan-100/40">
              Nenhuma organização ainda. Crie a primeira acima e amarre o e-mail do cliente.
            </p>
          )}

          {orgs.map((org) => (
            <article
              key={org.id}
              className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm"
            >
              <div className="flex flex-wrap items-center gap-3">
                <p className="font-semibold text-cyan-50">{org.nome}</p>
                <span className="rounded-full border border-cyan-300/20 px-2.5 py-0.5 text-[11px] text-cyan-200/70">
                  {org.slug}
                </span>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                    org.saaso_token
                      ? "border-emerald-400/25 text-emerald-300/80"
                      : "border-white/15 text-cyan-100/40"
                  }`}
                >
                  {org.saaso_token ? "CRM vinculado" : "sem CRM vinculado"}
                </span>
              </div>

              <div className="mt-3 flex flex-col gap-2 text-xs text-cyan-100/60">
                <div>
                  <p className="text-cyan-100/50">Quem entra (só esta empresa):</p>
                  {org.membros.length === 0 ? (
                    <p className="mt-1 text-amber-300/70">ninguém ainda — amarre um e-mail</p>
                  ) : (
                    <ul className="mt-1 flex flex-col gap-1">
                      {org.membros.map((m) => (
                        <li key={m.email} className="flex flex-wrap items-center gap-2">
                          <span className="text-cyan-100/90">{m.email}</span>
                          <span className="rounded-full border border-cyan-300/20 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-cyan-200/60">
                            {m.papel === "admin" ? "admin da empresa" : m.papel === "dono" ? "dono (você)" : "funcionário"}
                          </span>
                          {m.papel !== "dono" && (
                            <button
                              onClick={() => tirarMembro(org, m.email)}
                              className="text-[10px] uppercase tracking-[0.2em] text-rose-300/70 hover:text-rose-200"
                            >
                              tirar
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <p>
                  Organização no CRM:{" "}
                  <span className="text-cyan-100/90">{org.saaso_org_id || "—"}</span>
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <input
                  placeholder="+ e-mail de quem entra (dono ou funcionário)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const alvo = (e.target as HTMLInputElement).value;
                      const sel = (e.target as HTMLInputElement).parentElement?.querySelector("select");
                      addMembro(org, alvo, sel?.value || "membro");
                      (e.target as HTMLInputElement).value = "";
                    }
                  }}
                  className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-cyan-50 outline-none focus:border-cyan-400/40"
                />
                <select
                  defaultValue="membro"
                  className="rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-cyan-50 outline-none"
                >
                  <option value="membro">funcionário</option>
                  <option value="admin">admin da empresa</option>
                </select>
                <input
                  placeholder="token dsk_... do CRM desta organização"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      salvarCredencial(org, "saasoToken", (e.target as HTMLInputElement).value);
                      (e.target as HTMLInputElement).value = "";
                    }
                  }}
                  className="min-w-[280px] flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-cyan-50 outline-none focus:border-cyan-400/40"
                />
              </div>
              <p className="mt-2 text-[11px] text-cyan-100/35">
                Digite e aperte Enter para salvar. O token do CRM só existe em nome daquela
                organização.
              </p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

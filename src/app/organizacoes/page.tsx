"use client";

import { useCallback, useEffect, useState } from "react";
import Shell from "@/components/dash/Shell";

/* ------------------------------------------------------------------ */
/*  Organizações — a porta de TODO MUNDO (dono, 20/11/2026)            */
/* ------------------------------------------------------------------ */
/*
 * Por que esta tela existe separada da `/admin/organizacoes`:
 * a do admin é a régua do dono (todas as empresas, credencial Saaso,
 * vínculos). Esta é a da pessoa: "as minhas organizações" e o botão de
 * criar uma nova — que antes não existia em lugar nenhum fora do painel
 * do dono ("meus colaboradores não estão conseguindo adicionar").
 *
 * O escopo continua o do produto: quem cria é admin DA PRÓPRIA org e não
 * enxerga as dos outros (o filtro é no servidor, em /api/organizacoes).
 */

type Org = { id: string; nome: string; slug: string };

export default function OrganizacoesPage() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [nome, setNome] = useState("");
  const [criando, setCriando] = useState(false);
  const [membroEmail, setMembroEmail] = useState("");
  const [orgDoConvite, setOrgDoConvite] = useState<string>("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      const r = await fetch("/api/organizacoes", { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setOrgs(Array.isArray(d?.organizacoes) ? d.organizacoes : []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não consegui carregar suas organizações");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const criar = useCallback(async () => {
    setErro("");
    setAviso("");
    const limpo = nome.trim();
    if (limpo.length < 2) {
      setErro("Dê um nome à organização (pelo menos 2 letras).");
      return;
    }
    setCriando(true);
    try {
      const r = await fetch("/api/organizacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: limpo }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      setNome("");
      setAviso(`"${d?.organizacao?.nome ?? limpo}" criada. Você é admin dela.`);
      carregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não consegui criar agora");
    } finally {
      setCriando(false);
    }
  }, [nome, carregar]);

  const convidar = useCallback(
    async (orgId: string) => {
      setErro("");
      setAviso("");
      const email = membroEmail.trim();
      if (!email.includes("@")) {
        setErro("E-mail do convidado está incompleto.");
        return;
      }
      try {
        const r = await fetch("/api/organizacoes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: orgId, membro: { email, papel: "membro" } }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
        setMembroEmail("");
        setOrgDoConvite("");
        setAviso(`${email} entrou na organização.`);
        carregar();
      } catch (e) {
        setErro(e instanceof Error ? e.message : "não consegui convidar");
      }
    },
    [membroEmail, carregar],
  );

  return (
    <Shell titulo="Organizações">
      <div className="max-w-3xl">
        <p className="text-[13px] leading-[1.65] text-dash-muted">
          Uma organização é um espaço separado do seu pessoal: acervo próprio, membros próprios e a
          escolha de qual escopo usar em cada conversa. Você é{" "}
          <span className="text-dash-fg">admin</span> da que criar.
        </p>

        {erro && (
          <p className="mt-5 rounded-[16px] border border-dash-bad/30 bg-dash-bad/[0.07] px-5 py-4 text-[13px] text-dash-bad">
            {erro}
          </p>
        )}
        {aviso && (
          <p className="mt-5 rounded-[16px] border border-dash-ok/30 bg-dash-ok/[0.06] px-5 py-4 text-[13px] text-dash-ok">
            {aviso}
          </p>
        )}

        {/* criar */}
        <div className="mt-7 rounded-[18px] border border-dash-line/60 bg-dash-panel/[0.55] p-5">
          <h2 className="text-[13px] font-medium tracking-wide text-dash-fg">Criar organização</h2>
          <p className="mt-1 text-[12px] leading-[1.6] text-dash-muted">
            O nome aparece para os membros. O endereço interno sai dele automaticamente.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") criar();
              }}
              placeholder="Ex.: Speach"
              maxLength={60}
              className="w-full rounded-[12px] border border-dash-line/60 bg-dash-bg/60 px-4 py-3 text-[13px] text-dash-fg outline-none placeholder:text-dash-muted/60 focus:border-dash-accent/50"
            />
            <button
              onClick={criar}
              disabled={criando}
              className="shrink-0 rounded-[12px] border border-dash-accent/40 bg-dash-accent/10 px-5 py-3 text-[13px] text-dash-fg transition hover:bg-dash-accent/20 disabled:opacity-50"
            >
              {criando ? "criando…" : "Criar"}
            </button>
          </div>
        </div>

        {/* lista */}
        <h2 className="mt-9 text-[13px] font-medium tracking-wide text-dash-fg">
          {orgs.length === 1 ? "Sua organização" : "Suas organizações"}
        </h2>

        {carregando ? (
          <p className="mt-3 text-[13px] text-dash-muted">carregando…</p>
        ) : orgs.length === 0 ? (
          <p className="mt-3 text-[13px] text-dash-muted">
            Nenhuma ainda. Crie a primeira acima — ela nasce só sua, sem herdar nada do seu espaço
            pessoal.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {orgs.map((o) => (
              <li
                key={o.id}
                className="rounded-[16px] border border-dash-line/50 bg-dash-panel/[0.35] px-5 py-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[14px] text-dash-fg">{o.nome}</span>
                  <span className="font-mono text-[11px] text-dash-muted">{o.slug}</span>
                </div>
                {orgDoConvite === o.id ? (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={membroEmail}
                      onChange={(e) => setMembroEmail(e.target.value)}
                      placeholder="email@da-pessoa.com"
                      className="w-full rounded-[10px] border border-dash-line/60 bg-dash-bg/60 px-3 py-2 text-[12px] text-dash-fg outline-none placeholder:text-dash-muted/60"
                    />
                    <button
                      onClick={() => convidar(o.id)}
                      className="rounded-[10px] border border-dash-line/60 px-3 py-2 text-[12px] text-dash-fg hover:bg-dash-panel"
                    >
                      convidar
                    </button>
                    <button
                      onClick={() => {
                        setOrgDoConvite("");
                        setMembroEmail("");
                      }}
                      className="rounded-[10px] px-2 py-2 text-[12px] text-dash-muted hover:text-dash-fg"
                    >
                      cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setOrgDoConvite(o.id)}
                    className="mt-3 text-[12px] text-dash-muted underline-offset-4 hover:text-dash-fg hover:underline"
                  >
                    adicionar membro por e-mail
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Shell>
  );
}
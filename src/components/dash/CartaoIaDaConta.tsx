"use client";

/**
 * IA DA CONTA — onde o cliente põe a IA dele.
 *
 * Regra da casa, e é toda a regra:
 *   1. a conta tem IA cadastrada?  -> usa a DELA
 *   2. não tem                     -> usa o PADRÃO DA MIRAI
 *
 * É por isso que esta tela não empurra nada: sem chave própria a conta funciona
 * igual, no padrão. Quem traz a sua passa a valer a sua.
 *
 * ─── O que a tela diz de propósito (e o que ela esconde) ────────────────────
 *
 * • Quando a conta usa o PADRÃO, a tela NÃO nomeia provedor nem modelo: é
 *   informação interna da Mirai. Para quem pergunta, a resposta é "padrão da
 *   Mirai", e é só isso que aparece.
 * • Quando a IA é DA CONTA, o nome aparece — é escolha dela, e ela tem o
 *   direito de saber o que escolheu.
 * • A CHAVE, depois de salva, nunca volta para a tela. Nem para conferência.
 *   Quem quiser trocar, escreve outra por cima. (Quem guarda é o servidor, e
 *   guarda cifrada; o navegador nunca vê.)
 *
 * Fontes (NADA inventado): /api/ia (GET o estado, PUT cadastra, DELETE volta ao
 * padrão) — que por sua vez fala com o plano de controle pelo servidor.
 */

import { useCallback, useEffect, useState } from "react";

import { Card, CardTitulo, Selo } from "@/components/dash/kit";
import { IconeRobo } from "@/components/dash/icons";

type Config = {
  origem?: "conta" | "padrao";
  tem_chave?: boolean;
  provider?: string | null;
  model?: string | null;
  base_url?: string | null;
  sem_vinculo?: boolean;
  erro?: string;
};

const PROVEDORES: { id: string; nome: string }[] = [
  { id: "openai", nome: "OpenAI (GPT)" },
  { id: "anthropic", nome: "Anthropic (Claude)" },
  { id: "google", nome: "Google (Gemini)" },
  { id: "deepseek", nome: "DeepSeek" },
  { id: "openrouter", nome: "OpenRouter" },
  { id: "custom", nome: "Outro (compatível com OpenAI)" },
];

const CAMPO =
  "w-full rounded-[10px] border border-white/10 bg-dash-raise px-3 py-2.5 text-[13px] text-white outline-none transition placeholder:text-dash-dim focus:border-dash-brand/70";
const ROTULO = "text-[11px] uppercase tracking-[0.18em] text-dash-dim";

export default function CartaoIaDaConta() {
  const [config, setConfig] = useState<Config | null>(null);
  const [lendo, setLendo] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [recado, setRecado] = useState("");

  const [provedor, setProvedor] = useState("openai");
  const [modelo, setModelo] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [chave, setChave] = useState("");

  const ler = useCallback(async () => {
    setLendo(true);
    try {
      const r = await fetch("/api/ia", { cache: "no-store" });
      const d = (await r.json().catch(() => ({}))) as Config;
      setConfig(d);
      if (d.erro) setRecado(d.erro);
    } catch {
      setConfig({ origem: "padrao" });
    } finally {
      setLendo(false);
    }
  }, []);

  useEffect(() => {
    void ler();
  }, [ler]);

  async function salvar() {
    setRecado("");
    if (!chave.trim()) {
      setRecado("Cole a chave que a empresa da IA te deu.");
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch("/api/ia", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: provedor,
          model: modelo,
          base_url: baseUrl,
          key: chave,
        }),
      });
      const d = (await r.json().catch(() => ({}))) as { erro?: string };
      if (!r.ok) {
        setRecado(d.erro || "Não foi possível salvar agora.");
        return;
      }
      setChave(""); // a chave não fica na tela depois de salva
      setModelo("");
      setBaseUrl("");
      setRecado("Salvo. Sua conta já usa esta IA.");
      await ler();
    } catch {
      setRecado("Não foi possível salvar agora.");
    } finally {
      setSalvando(false);
    }
  }

  async function voltarAoPadrao() {
    setRecado("");
    setSalvando(true);
    try {
      const r = await fetch("/api/ia", { method: "DELETE" });
      if (!r.ok) {
        setRecado("Não foi possível remover agora.");
        return;
      }
      setRecado("Pronto: sua conta voltou ao padrão da Mirai.");
      await ler();
    } catch {
      setRecado("Não foi possível remover agora.");
    } finally {
      setSalvando(false);
    }
  }

  const usandoPropria = config?.origem === "conta";

  return (
    <Card>
      <CardTitulo
        rotulo="Inteligência"
        titulo="IA da sua conta"
        acao={
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-dash-raise text-dash-muted">
            <IconeRobo className="h-4 w-4" />
          </span>
        }
      />

      {lendo ? (
        <p className="text-[13px] text-dash-muted">Lendo…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Selo tom={usandoPropria ? "ok" : "info"}>
              {usandoPropria ? "usando a IA que você cadastrou" : "usando o padrão da Mirai"}
            </Selo>
            {usandoPropria && (
              <span className="text-[12px] text-dash-muted">
                {config?.provider}
                {config?.model ? ` · ${config.model}` : ""}
              </span>
            )}
          </div>

          <p className="mt-4 text-[13px] leading-[1.6] text-dash-muted">
            {usandoPropria ? (
              <>
                Sua conta usa a IA que <span className="text-white">você</span> cadastrou. A chave
                fica só no servidor da Mirai — os produtos que você usa passam a chamar a sua IA sem
                nunca ver a sua chave.
              </>
            ) : (
              <>
                Sua conta ainda não tem IA própria, e funciona assim mesmo: usa o{" "}
                <span className="text-white">padrão da Mirai</span>. Se você já tem a sua chave,
                cadastre abaixo — a partir daí passa a valer a sua.
              </>
            )}
          </p>

          <div className="mt-6 grid gap-4">
            <div className="grid gap-2">
              <label className={ROTULO} htmlFor="ia-provedor">
                Provedor
              </label>
              <select
                id="ia-provedor"
                className={CAMPO}
                value={provedor}
                onChange={(e) => setProvedor(e.target.value)}
              >
                {PROVEDORES.map((p) => (
                  <option key={p.id} value={p.id} className="bg-dash-card">
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
              <div className="grid gap-2">
                <label className={ROTULO} htmlFor="ia-modelo">
                  Modelo (opcional)
                </label>
                <input
                  id="ia-modelo"
                  className={CAMPO}
                  value={modelo}
                  onChange={(e) => setModelo(e.target.value)}
                  placeholder="o que o provedor te deu"
                />
              </div>
              <div className="grid gap-2">
                <label className={ROTULO} htmlFor="ia-chave">
                  A chave
                </label>
                <input
                  id="ia-chave"
                  type="password"
                  autoComplete="off"
                  className={CAMPO}
                  value={chave}
                  onChange={(e) => setChave(e.target.value)}
                  placeholder="cola aqui — não aparece depois"
                />
              </div>
            </div>

            {provedor === "custom" && (
              <div className="grid gap-2">
                <label className={ROTULO} htmlFor="ia-base">
                  Endereço (compatível com OpenAI)
                </label>
                <input
                  id="ia-base"
                  className={CAMPO}
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://…"
                />
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={salvar}
              disabled={salvando}
              className="rounded-[10px] bg-dash-brand px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-dash-brandHi disabled:opacity-60"
            >
              {salvando ? "Salvando…" : usandoPropria ? "Trocar minha IA" : "Salvar minha IA"}
            </button>
            {usandoPropria && (
              <button
                onClick={voltarAoPadrao}
                disabled={salvando}
                className="rounded-[10px] border border-white/12 px-5 py-2.5 text-[13px] font-semibold text-dash-muted transition hover:text-white disabled:opacity-60"
              >
                Voltar ao padrão da Mirai
              </button>
            )}
          </div>

          {recado && <p className="mt-3 text-[12px] text-dash-muted">{recado}</p>}

          <p className="mt-4 text-[11.5px] leading-[1.7] text-dash-dim">
            A chave vai <span className="text-dash-muted">cifrada</span> para o servidor da Mirai e
            não aparece de novo aqui — nem para conferência. O nome do provedor e do modelo do
            padrão é interno e não é mostrado.
          </p>
        </>
      )}
    </Card>
  );
}

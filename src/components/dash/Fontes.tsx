"use client";

import { useCallback, useEffect, useState } from "react";

import DrivesConectados from "@/components/dash/DrivesConectados";
import FonteDriveCard from "@/components/dash/FonteDriveCard";

/**
 * FONTES — a parte de fontes da Arca, na forma que o dono aprovou (18/11/2026), construída em cima
 * da prévia dele: título + uma linha do que a tela faz + "Atualizar status" à direita, e cada fonte
 * como UM CARTÃO com a marca OFICIAL à esquerda (branca por filtro) e a ação em laranja com letra
 * branca.
 *
 * O QUE NÃO APARECE AQUI (decisão do dono, 18/11/2026): *"drive do ecossistema nem tem que aparecer
 * aí porque não vai ter aparição em outros usuários"*. A coleta do ecossistema é trabalho interno —
 * a fonte continua rodando pelo agendador, mas esta tela é de GENTE: mostra o Drive que a pessoa
 * ligou e o que ela pode ligar. Bloco de coletor interno em superfície de usuário é ruído.
 *
 * O que o dono reprovou e não volta: zeros repetidos, botão descendo em diagonal, o MESMO Drive em
 * dois blocos com nomes iguais, e parágrafo explicativo duplicado no pé.
 */

type Fonte = {
  id: string;
  nome: string;
  configurada?: boolean;
  guia?: string;
};

/** Marca OFICIAL de cada fonte (arquivos em public/integracoes/), pintada de branco por filtro. */
const LOGO: Record<string, string> = {
  sharepoint: "/integracoes/sharepoint.svg",
};

export default function Fontes({
  onAbrirNota: _onAbrirNota,
}: {
  /** Mantido na assinatura: a página da Arca passa isto; esta aba não abre nota hoje. */
  onAbrirNota?: (caminho: string) => void;
}) {
  const [fontes, setFontes] = useState<Fonte[]>([]);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/acervo/fontes", { cache: "no-store" });
      const d = await r.json().catch(() => null);
      if (!r.ok) {
        setErro((d?.error as string) || `não consegui ler as fontes (HTTP ${r.status})`);
        return;
      }
      setErro("");
      setFontes((d?.fontes as Fonte[]) || []);
    } catch (e) {
      setErro(`falha de rede: ${e instanceof Error ? e.message : "?"}`);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (carregando) {
    return <p className="px-5 py-6 text-[12.5px] text-dash-fg/55">lendo as fontes…</p>;
  }

  const paradas = fontes.filter((f) => f.configurada === false);

  return (
    <div className="mx-auto w-full max-w-[820px] px-5 pb-10 pt-5">
      <div className="flex flex-wrap items-start gap-2.5">
        <div>
          <h2 className="text-[15px] font-medium text-dash-fg">Fontes conectadas</h2>
          <p className="mt-1 text-[11.5px] text-dash-fg/50">
            Gerencie o que a Mirai lê e cataloga na Arca.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void carregar()}
          className="ml-auto flex items-center gap-1.5 rounded-[10px] border border-dash-hair/[0.20] px-3 py-2 text-[11.5px] text-dash-fg/85 transition hover:border-dash-brand/40 hover:text-dash-fg"
        >
          <span aria-hidden>&#8635;</span> Atualizar status
        </button>
      </div>

      {erro ? <p className="mt-3 text-[11.5px] text-dash-bad">{erro}</p> : null}

      {/* O Drive da PESSOA — a MESMA peça montada na Synapse: ligar num lado aparece no outro. */}
      <DrivesConectados origem="fontes" />

      {/* O que ainda não está ligado — discreto, no fim. */}
      {paradas.map((fonte) => (
        <FonteDriveCard
          key={fonte.id}
          logo={LOGO[fonte.id] || "/integracoes/sharepoint.svg"}
          alt={fonte.nome}
          nome={fonte.nome}
          chip="Configuração pendente"
          tom="neutro"
          linha1="Somente leitura · o acesso é dado por um administrador do tenant"
          nota={`Passo a passo na Arca em ${fonte.guia || "03_PROJETOS/arca/"}`}
        >
          <div className="mt-2 flex items-center gap-2">
            <img
              src="/integracoes/onedrive.svg"
              alt="OneDrive"
              className="h-4 w-4 shrink-0 self-start object-contain"
              style={{ filter: "brightness(0) invert(1)" }}
            />
            <span className="text-[10.5px] text-dash-fg/50">
              OneDrive usa o mesmo aplicativo — ligando um, o outro vem junto.
            </span>
          </div>
        </FonteDriveCard>
      ))}

      <p className="mt-6 text-[10.5px] leading-[1.5] text-dash-fg/35">
        A Mirai lê só estas fontes, com o token que cada pessoa autorizou. O que entra vira nota
        catalogada pela Arca.
      </p>
    </div>
  );
}

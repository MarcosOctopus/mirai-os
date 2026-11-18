"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * DRIVES CONECTADOS — a MESMA peça na Synapse (`/dashboard/connect`, item "Google Drive") e na
 * aba Fontes da Arca. Pedido do dono, 18/11/2026: *"se fizer ficar on pelo Synapse já apareça no
 * Fontes e vice-versa"*.
 *
 * COMO ISSO É GARANTIDO (e não por promessa):
 *  - existe UM só estado — as conexões da pessoa no cofre (`google_drive`, por escopo), servidas
 *    por `GET /api/acervo/fontes`;
 *  - existe UMA só porta de entrada — `/api/oauth/gdrive/iniciar` (leitura do Drive);
 *  - as duas telas montam ESTE componente, então não existe "desenho parecido" em um lado e
 *    diferente no outro: é o mesmo arquivo, o mesmo desenho, os mesmos dados.
 *
 * O desenho segue o vocabulário da Synapse (`dash-hair`, `dash-ok`, `dash-fg/…`), que é o padrão
 * que o dono pediu para a aba Fontes também.
 */

type DriveConectado = {
  dono: string;
  email: string;
  desde: string;
  ultima: string;
  resumo: string;
  arquivos: number;
};

function quando(ms: number): string {
  if (!ms) return "";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `há ${s}s`;
  if (s < 3600) return `há ${Math.round(s / 60)}min`;
  if (s < 86400) return `há ${Math.round(s / 3600)}h`;
  return `há ${Math.round(s / 86400)}d`;
}

export default function DrivesConectados({
  origem = "fontes",
}: {
  /**
   * Onde a peça está montada. Na Synapse o botão "Integrar" do TOPO já é a porta de conexão
   * (abre o `oauthPath` do produto) — então aqui o bloco NÃO repete esse botão: mostrar dois
   * botões para a mesma ação é ruído, e o dono apontou isso na hora (18/11/2026). O que o bloco
   * entrega nos dois lugares é o que o topo não dá: QUEM conectou, quanto entrou e a rodada na hora.
   */
  origem?: "synapse" | "fontes";
}) {
  const noSynapse = origem === "synapse";
  const [drives, setDrives] = useState<DriveConectado[]>([]);
  const [conectar, setConectar] = useState("/api/oauth/gdrive/iniciar");
  const [carregando, setCarregando] = useState(true);
  const [disparando, setDisparando] = useState("");
  const [recado, setRecado] = useState("");

  const ler = useCallback(async () => {
    try {
      const r = await fetch("/api/acervo/fontes", { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as {
        drivesConectados?: DriveConectado[];
        conectarDrive?: string;
      };
      setDrives(d.drivesConectados || []);
      if (typeof d.conectarDrive === "string") setConectar(d.conectarDrive);
    } catch {
      /* silêncio: a tela não pode quebrar por leitura de status */
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void ler();
    // o retorno do Google acontece em OUTRA aba: quando a pessoa volta, o componente relê.
    const aoVoltar = () => void ler();
    window.addEventListener("focus", aoVoltar);
    return () => window.removeEventListener("focus", aoVoltar);
  }, [ler]);

  async function sincronizar() {
    setDisparando("drives");
    setRecado("");
    try {
      const r = await fetch("/api/acervo/fontes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "sincronizar", fonte: "drives" }),
      });
      const d = (await r.json().catch(() => ({}))) as { mensagem?: string; error?: string };
      setRecado(d.mensagem || d.error || (r.ok ? "sincronizei." : "não consegui sincronizar."));
      await ler();
    } catch {
      setRecado("não consegui sincronizar agora.");
    } finally {
      setDisparando("");
    }
  }

  // NA SYNAPSE, sem conexão nenhuma, este bloco não tem o que dizer: o "Integrar" do topo já é a
  // ação e uma lista vazia só empurra a tela para baixo. Ele nasce quando existe Drive conectado —
  // aí mostra o que o topo não mostra (quem conectou, quanto entrou, a rodada na hora).
  // Na aba Fontes ele SEMPRE aparece: lá ele é a única porta e precisa explicar o vazio.
  if (noSynapse && !carregando && !drives.length) return null;

  return (
    <div className="mt-6 border-t border-dash-hair/[0.12] pt-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <p className="text-[12.5px] font-medium text-dash-fg">Drives conectados</p>
        <span className="rounded-full bg-dash-hair/[0.12] px-2.5 py-[3px] text-[10.5px] text-dash-fg/70">
          {carregando ? "lendo…" : `${drives.length} ${drives.length === 1 ? "drive" : "drives"}`}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!!drives.length && (
            <button
              type="button"
              data-drives-sincronizar="sim"
              onClick={() => void sincronizar()}
              disabled={!!disparando}
              className="rounded-[10px] border border-dash-hair/[0.20] px-3 py-2 text-[11.5px] text-dash-fg/85 transition hover:border-dash-brand/40 hover:text-dash-fg disabled:opacity-45"
            >
              {disparando ? "sincronizando…" : "sincronizar agora"}
            </button>
          )}
          {!noSynapse && (
            <a
              href={conectar}
              data-drives-conectar="sim"
              className="rounded-[10px] border border-dash-hair/[0.20] px-3 py-2 text-[11.5px] text-dash-fg/85 transition hover:border-dash-brand/40 hover:text-dash-fg"
            >
              + conectar meu Drive
            </a>
          )}
        </div>
      </div>

      {recado ? <p className="mt-2.5 text-[11.5px] text-dash-fg/70">{recado}</p> : null}

      {!carregando && !drives.length ? (
        <p className="mt-3 text-[11.5px] leading-[1.55] text-dash-fg/60">
          {noSynapse
            ? "Nenhum Drive conectado ainda — “Integrar” aqui em cima liga o seu. A leitura é só de ida: a Mirai nunca escreve de volta no Drive de ninguém."
            : "Nenhum Drive conectado ainda. “+ conectar meu Drive” liga o seu — a leitura é só de ida: a Mirai nunca escreve de volta no Drive de ninguém."}
        </p>
      ) : null}

      {drives.length ? (
        <ul className="mt-3 space-y-2">
          {drives.map((d) => (
            <li
              key={d.email || d.dono}
              className="flex items-center gap-3 rounded-[14px] bg-dash-hair/[0.06] px-3.5 py-2.5"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-dash-ok" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[12px] text-dash-fg" title={d.email}>
                {d.email || d.dono}
              </span>
              <span className="shrink-0 text-[10.5px] text-dash-fg/50">
                {d.arquivos} arquivo(s)
                {d.resumo ? ` · ${d.resumo}` : ""}
                {d.ultima
                  ? ` · ${quando(Date.parse(d.ultima) || 0)}`
                  : " · ainda não sincronizou"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-3 text-[10.5px] leading-[1.5] text-dash-fg/50">
        Cada pessoa conecta o próprio Drive e o conteúdo entra no acervo DELA — o token da Arca é
        por conta, então o Drive de um cliente nunca cai no acervo de outro. Ligado aqui ou na
        Arca → Fontes é a MESMA conexão: aparece nos dois lugares.
      </p>
    </div>
  );
}

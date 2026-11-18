"use client";

import { useCallback, useEffect, useState } from "react";

import FonteDriveCard from "@/components/dash/FonteDriveCard";

/**
 * MEU DRIVE — a MESMA peça na Synapse (`/dashboard/connect`, item "Google Drive") e na aba Fontes
 * da Arca. Pedido do dono, 18/11/2026: *"se fizer ficar on pelo Synapse já apareça no Fontes e
 * vice-versa"*. A forma do cartão é a prévia que ele aprovou no mesmo dia: marca oficial branca,
 * nome, estado, números na linha e as ações no mesmo lugar.
 *
 * COMO O ESTADO ÚNICO É GARANTIDO (e não por promessa):
 *  - existe UM só estado — as conexões da pessoa no cofre (`google_drive`, por escopo), servidas
 *    por `GET /api/acervo/fontes`;
 *  - existe UMA só porta de entrada — `/api/oauth/gdrive/iniciar` (leitura do Drive);
 *  - as duas telas montam ESTE componente: mesmo arquivo, mesmo desenho, mesmos dados.
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
   * Onde a peça está montada. Na Synapse o botão "Integrar" do TOPO já é a porta de conexão —
   * então aqui o cartão NÃO repete esse botão: dois botões para a mesma ação é ruído, e o dono
   * apontou isso na hora (18/11/2026).
   */
  origem?: "synapse" | "fontes";
}) {
  const noSynapse = origem === "synapse";
  const [drives, setDrives] = useState<DriveConectado[]>([]);
  const [conectar, setConectar] = useState("/api/oauth/gdrive/iniciar");
  const [carregando, setCarregando] = useState(true);
  const [disparando, setDisparando] = useState(false);
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
    setDisparando(true);
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
      setDisparando(false);
    }
  }

  // NA SYNAPSE, sem conexão nenhuma, este cartão não tem o que dizer: o "Integrar" do topo já é a
  // ação e um vazio ali só empurra a tela para baixo. Ele nasce quando existe Drive conectado.
  // Na aba Fontes ele SEMPRE aparece: lá ele é a única porta e precisa explicar o vazio.
  if (noSynapse && !carregando && !drives.length) return null;

  const vazio = !carregando && !drives.length;

  return (
    <>
      {recado ? <p className="mt-3 text-[11.5px] text-dash-fg/70">{recado}</p> : null}

      {vazio ? (
        <FonteDriveCard
          logo="/integracoes/drive.svg"
          alt="Google Drive"
          nome="Meu Drive"
          chip="nenhum conectado"
          tom="neutro"
          linha1="A leitura é só de ida: a Mirai nunca escreve de volta no Drive de ninguém."
          acoes={
            noSynapse
              ? []
              : [
                  {
                    rotulo: "+ conectar meu Drive",
                    href: conectar,
                    principal: true,
                    dataAttr: "drives-conectar=sim",
                  },
                ]
          }
        />
      ) : null}

      {drives.map((d) => (
        <FonteDriveCard
          key={d.email || d.dono}
          logo="/integracoes/drive.svg"
          alt="Google Drive"
          nome="Meu Drive"
          chip="Conectado"
          tom="ok"
          linha1={d.email || d.dono}
          nota={d.resumo ? d.resumo : undefined}
          acoes={[
            {
              rotulo: disparando ? "sincronizando…" : "Sincronizar Meu Drive",
              onClick: () => void sincronizar(),
              principal: true,
              desabilitado: disparando,
              dataAttr: "drives-sincronizar=sim",
            },
            ...(noSynapse
              ? []
              : [
                  {
                    rotulo: "Conectar outra conta",
                    href: conectar,
                    dataAttr: "drives-conectar=sim",
                  },
                ]),
          ]}
          numeros={[
            { valor: d.arquivos, rotulo: "arquivos no Drive" },
          ]}
          rodape={{
            esquerda: "Destino · acervo pessoal",
            direita: d.ultima
              ? `Última sincronização ${quando(Date.parse(d.ultima) || 0)}`
              : "Ainda não sincronizou",
          }}
        />
      ))}
    </>
  );
}

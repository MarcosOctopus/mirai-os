import Database from "better-sqlite3";
import path from "path";

import { NextRequest, NextResponse } from "next/server";

import { pedirTokenNaArca } from "@/lib/arca-conta";
import { lerCofre, gravarCofre } from "@/lib/cofre-escopo";
import type { Escopo } from "@/lib/escopos";
import { renovarAcesso } from "@/lib/gdrive-oauth";
import { exigirConta } from "@/lib/orgs";
import { decifrar } from "@/lib/segredo-guardado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Sincronizador do DRIVE DE TODO MUNDO → acervo de cada um.
 *
 * POR QUE EXISTE (18/11/2026): o dono pediu que o Drive de todo mundo entre na Arca pelo MIRAI OS.
 * Cada pessoa conecta o próprio Drive (fluxo /api/oauth/gdrive/*) e ESTA rota percorre as conexões
 * ativas: pega só o que mudou (delta do Google), sobe para a Arca e cria a NOTA CATALOGADA.
 *
 * ISOLAMENTO (a parte que não se negocia): cada arquivo é escrito com o token da Arca DAQUELA
 * pessoa (`pedirTokenNaArca(email)`). A organização na Arca vem DO TOKEN — então o conteúdo de um
 * cliente nunca cai no acervo de outro. Não existe caminho aqui que escreva com token de outro.
 *
 * POR QUE "DELTA" E NÃO VARREDURA: a API de changes do Google devolve só o que mudou desde o
 * último cursor. Guardamos o cursor (+ contadores) no próprio cofre daquela conexão.
 *
 * QUEM CHAMA: o botão "sincronizar agora" (com sessão) ou o agendador, com a chave de serviço
 * interna no header `x-mirai-servico`.
 */

const ARCA = (process.env.ARCA_API_URL || "https://arca.miraitohope.com").replace(/\/+$/, "");
const DB_PATH = path.join(process.cwd(), "data", "auth.db");

/** Teto por chamada: rodada de rota não pode virar meia hora de request. O resto sai na próxima. */
const MAX_ARQUIVOS = Number(process.env.MIRAI_FONTE_MAX_ARQUIVOS || 40);

const TIPOS_TEXTO = new Set([
  "pdf", "txt", "md", "csv", "json", "xml", "html", "sql",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods",
]);
const EXCLUIR_PASTAS = new Set([
  "08_backups", "backups", "backup", "_lixeira", "lixeira", "trash",
  "node_modules", ".git", "cache", "tmp", "temp", "dist", "build",
]);

type ItemDrive = {
  id: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  size?: string;
  file?: unknown;
  folder?: unknown;
  trashed?: boolean;
  parents?: string[];
};

function ext(nome: string): string {
  return nome.includes(".") ? nome.split(".").pop()!.toLowerCase() : "";
}

function autorizado(req: NextRequest): boolean {
  const chave = process.env.MIRAI_FONTE_SECRET || "";
  const veio = req.headers.get("x-mirai-servico") || "";
  return Boolean(chave) && veio === chave;
}

/** Todas as conexões de Drive existentes, por escopo PESSOAL (o Drive da pessoa → o acervo dela). */
function conexoesDeDrive(): { escopo: Escopo; userId: number; email: string; entradas: Record<string, unknown>[] }[] {
  const db = new Database(DB_PATH, { readonly: true });
  const achadas: ReturnType<typeof conexoesDeDrive> = [];
  try {
    const pessoas = db.prepare("SELECT id, email FROM users").all() as { id: number; email: string }[];
    for (const p of pessoas) {
      const escopo: Escopo = {
        tipo: "pessoal",
        id: `pessoal-${p.id}`,
        nome: "Meu espaço",
        usuarioId: p.id,
      };
      const cfg = lerCofre(escopo);
      const lista = Array.isArray(cfg?.google_drive)
        ? (cfg.google_drive as Record<string, unknown>[])
        : [];
      if (lista.length) achadas.push({ escopo, userId: p.id, email: p.email, entradas: lista });
    }
  } finally {
    db.close();
  }
  return achadas;
}

async function baixar(token: string, item: ItemDrive): Promise<{ bytes: ArrayBuffer | null; nome: string }> {
  const mime = item.mimeType || "";
  const nome = item.name || `${item.id}`;
  // Google nativo não tem byte: tem de EXPORTAR (Docs/Sheets/Slides → texto/csv).
  const exportar: Record<string, [string, string]> = {
    "application/vnd.google-apps.document": ["text/plain", ".txt"],
    "application/vnd.google-apps.spreadsheet": ["text/csv", ".csv"],
    "application/vnd.google-apps.presentation": ["text/plain", ".txt"],
  };
  if (exportar[mime]) {
    const [tipo, sufixo] = exportar[mime];
    const r = await fetch(
      `https://www.googleapis.com/drive/v3/files/${item.id}/export?mimeType=${encodeURIComponent(tipo)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!r.ok) throw new Error(`export ${r.status}`);
    return { bytes: await r.arrayBuffer(), nome: nome.toLowerCase().endsWith(sufixo) ? nome : nome + sufixo };
  }
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${item.id}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`download ${r.status}`);
  return { bytes: await r.arrayBuffer(), nome };
}

async function subirParaArca(
  token: string,
  nome: string,
  bytes: ArrayBuffer,
  mime: string,
): Promise<string> {
  const fd = new FormData();
  fd.append("arquivo", new Blob([bytes], { type: mime || "application/octet-stream" }), nome);
  const r = await fetch(`${ARCA}/arquivos/upload`, {
    method: "POST",
    headers: { "X-Arca-Token": token, "user-agent": "MIRAI-OS/1.0" },
    body: fd,
    cache: "no-store",
  });
  const d = (await r.json().catch(() => ({}))) as { id?: string; detail?: string };
  if (!r.ok || !d.id) throw new Error(`upload ${r.status}`);
  return d.id;
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) {
    const g = await exigirConta(req);
    if (!g.ok) return g.resposta;
  }

  const conexoes = conexoesDeDrive();
  if (!conexoes.length) {
    return NextResponse.json({
      ok: true,
      conexoes: 0,
      mensagem: "ninguém conectou o Drive ainda — cada pessoa conecta em Arca → Fontes.",
    });
  }

  const relatorio: Record<string, unknown>[] = [];
  let orcamento = MAX_ARQUIVOS;

  for (const conexao of conexoes) {
    const resumo = { email: conexao.email, novos: 0, atualizados: 0, fora: 0, pulados: 0, erro: "" };
    const listaAtualizada: Record<string, unknown>[] = [];
    for (const entrada of conexao.entradas) {
      const emailConexao = String(entrada.email || "");
      const estado = (entrada.estado || {}) as Record<string, unknown>;
      try {
        const segredo = decifrar(String(entrada.blob || ""));
        if (!segredo) throw new Error("credencial ilegível (cifra não bate)");
        const pacote = JSON.parse(segredo) as { refresh_token?: string; email?: string };
        if (!pacote.refresh_token) throw new Error("sem refresh token");
        const novo = await renovarAcesso(pacote.refresh_token);
        if (!novo.ok || !novo.token) throw new Error(`renovação falhou (${novo.erro})`);

        const cred = await pedirTokenNaArca(emailConexao || conexao.email);
        if (!cred.ok || !cred.token) throw new Error("sem credencial da Arca para esta conta");

        // DELTA: a primeira rodada não tem cursor e precisa listar o histórico; depois o Google
        // só devolve o que mudou desde o cursor guardado.
        const cursor = typeof estado.delta === "string" ? estado.delta : "";
        const url: string = cursor
          ? `https://www.googleapis.com/drive/v3/changes?pageToken=${encodeURIComponent(cursor)}&fields=nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,modifiedTime,size,trashed,parents))&pageSize=200`
          : "https://www.googleapis.com/drive/v3/changes/startPageToken";

        let mudancas: ItemDrive[] = [];
        let novoCursor = cursor;
        if (!cursor) {
          const r = await fetch(url, { headers: { Authorization: `Bearer ${novo.token}` } });
          const d = (await r.json().catch(() => ({}))) as { startPageToken?: string };
          if (!d.startPageToken) throw new Error("não consegui o cursor inicial do Drive");
          // Sem cursor, a primeira rodada lista TUDO: usamos `files` (não `changes`) para trazer o histórico.
          novoCursor = d.startPageToken;
          const lista = await fetch(
            "https://www.googleapis.com/drive/v3/files?q=" +
              encodeURIComponent("trashed = false") +
              "&fields=files(id,name,mimeType,modifiedTime,size,parents)&pageSize=200",
            { headers: { Authorization: `Bearer ${novo.token}` } },
          );
          const ld = (await lista.json().catch(() => ({}))) as { files?: ItemDrive[] };
          mudancas = ld.files || [];
        } else {
          const r = await fetch(url, { headers: { Authorization: `Bearer ${novo.token}` } });
          const d = (await r.json().catch(() => ({}))) as {
            changes?: { fileId: string; removed?: boolean; file?: ItemDrive }[];
            newStartPageToken?: string;
          };
          if (!r.ok) throw new Error(`changes ${r.status}`);
          mudancas = (d.changes || [])
            .filter((c) => !c.removed && c.file && !c.file.trashed)
            .map((c) => c.file as ItemDrive);
          novoCursor = d.newStartPageToken || cursor;
        }

        const vistos = new Set<string>();
        const itens = mudancas.filter((f) => {
          if (!f || !f.id || f.folder !== undefined || vistos.has(f.id)) return false;
          vistos.add(f.id);
          if (EXCLUIR_PASTAS.has((f.name || "").trim().toLowerCase())) return false;
          return TIPOS_TEXTO.has(ext(f.name || ""));
        });
        resumo.pulados += mudancas.length - itens.length;

        const feitos = (estado.feitos || {}) as Record<string, string>;
        for (const item of itens) {
          if (orcamento <= 0) break;
          const anterior = feitos[item.id];
          if (anterior && anterior === item.modifiedTime) continue;
          orcamento--;
          try {
            const { bytes, nome } = await baixar(novo.token, item);
            if (!bytes) throw new Error("sem conteúdo");
            const idArca = await subirParaArca(cred.token, nome.replace(/\//g, "-"), bytes, item.mimeType || "");
            const nota = await fetch(`${ARCA}/arquivos/${idArca}/nota`, {
              method: "POST",
              headers: { "X-Arca-Token": cred.token, "user-agent": "MIRAI-OS/1.0" },
              cache: "no-store",
            });
            const nd = (await nota.json().catch(() => ({}))) as {
              acervo?: { nota?: string };
              detail?: string;
            };
            if (!nota.ok) throw new Error(nd.detail || `nota ${nota.status}`);
            const caminho = nd.acervo?.nota || "";
            if (caminho) {
              await fetch(`${ARCA}/acervo/catalogar`, {
                method: "POST",
                headers: {
                  "X-Arca-Token": cred.token,
                  "Content-Type": "application/json",
                  "user-agent": "MIRAI-OS/1.0",
                },
                body: JSON.stringify({
                  caminho,
                  campos: {
                    origem: "gdrive",
                    drive_file_id: item.id,
                    drive_alterado: (item.modifiedTime || "").slice(0, 19).replace("T", " "),
                    drive_dono: emailConexao || conexao.email,
                  },
                }),
                cache: "no-store",
              });
            }
            feitos[item.id] = item.modifiedTime || "";
            if (anterior) resumo.atualizados += 1;
            else resumo.novos += 1;
          } catch (e) {
            resumo.fora += 1;
            resumo.erro = e instanceof Error ? e.message.slice(0, 90) : "?";
          }
        }

        estado.delta = novoCursor;
        estado.feitos = feitos;
        estado.ultima = new Date().toISOString();
        estado.resumo = `${resumo.novos} novo(s) · ${resumo.atualizados} atualizado(s) · ${resumo.fora} fora`;
        entrada.estado = estado;
      } catch (e) {
        resumo.erro = e instanceof Error ? e.message.slice(0, 120) : "?";
      }
      listaAtualizada.push(entrada);
    }
    try {
      gravarCofre(conexao.escopo, { google_drive: listaAtualizada });
    } catch {
      /* se o cofre não gravar, a rodada ainda foi útil: a próxima repete */
    }
    relatorio.push(resumo);
    if (orcamento <= 0) break;
  }

  return NextResponse.json({ ok: true, conexoes: conexoes.length, relatorio });
}

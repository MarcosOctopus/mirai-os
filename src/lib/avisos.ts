/**
 * AVISOS — o que foi compartilhado com você e ainda não foi visto.
 *
 * POR QUE ESTA TABELA EXISTE: a concessão mora na ARCA (org, pasta, nível, quem
 * compartilhou, quando). O que a Arca não guarda é o que a PESSOA já viu — e sem
 * isso o sininho não tem contagem nem some quando o aviso é lido. Então aqui fica
 * só o "visto": (e-mail, espaço, pasta) → quando foi visto.
 *
 * REGRA: pasta compartilhada depois do último "visto" volta a ser NOVA. Assim,
 * quando o nível muda (ver → editar), o dono está avisando de novo — e o aviso
 * reaparece. `CREATE TABLE IF NOT EXISTS` no banco que o auth já abre: nenhuma
 * biblioteca nova, mesmo padrão das outras tabelas do app.
 */
import { db } from "./auth";

export type Visto = { org: string; alvo: string; visto_em: string };

function garantir(): void {
  db()
    .prepare(
      `CREATE TABLE IF NOT EXISTS avisos_vistos (
         email TEXT NOT NULL,
         org TEXT NOT NULL,
         alvo TEXT NOT NULL,
         visto_em TEXT NOT NULL,
         PRIMARY KEY (email, org, alvo)
       )`,
    )
    .run();
}

export function vistos(email: string): Map<string, string> {
  const quem = (email || "").trim().toLowerCase();
  const mapa = new Map<string, string>();
  if (!quem) return mapa;
  try {
    garantir();
    const linhas = db()
      .prepare("SELECT org, alvo, visto_em FROM avisos_vistos WHERE email = ?")
      .all(quem) as Visto[];
    for (const l of linhas) mapa.set(`${l.org}|${l.alvo}`, l.visto_em);
  } catch {
    /* sem banco: tudo aparece como novo, e nada quebra */
  }
  return mapa;
}

export function marcarVisto(email: string, org: string, alvo: string): void {
  const quem = (email || "").trim().toLowerCase();
  const e = (org || "").trim().toLowerCase();
  const a = (alvo || "").trim();
  if (!quem || !e || !a) return;
  try {
    garantir();
    db()
      .prepare(
        `INSERT INTO avisos_vistos (email, org, alvo, visto_em) VALUES (?, ?, ?, ?)
         ON CONFLICT(email, org, alvo) DO UPDATE SET visto_em = excluded.visto_em`,
      )
      .run(quem, e, a, new Date().toISOString());
  } catch {
    /* visto que não gravou não pode derrubar a leitura */
  }
}

export function marcarTudoVisto(email: string, pastas: { org: string; alvo: string }[]): number {
  let n = 0;
  for (const p of pastas) {
    marcarVisto(email, p.org, p.alvo);
    n += 1;
  }
  return n;
}

/** "há 3 min", "há 2 h", "há 4 d" — curto, porque vive num painel pequeno. */
export function desde(iso?: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "agora";
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 2592000) return `há ${Math.floor(s / 86400)} d`;
  return new Date(t).toLocaleDateString("pt-BR");
}

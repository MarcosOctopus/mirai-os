/**
 * LIMITES EFETIVOS de uma conta do MIRAI OS — o que o PLANO dela manda.
 *
 * Regra da casa (a mesma das capacidades): a lista mora SÓ no plano de controle.
 * Este arquivo pergunta e obedece; nunca guarda cópia própria.
 *
 * Decisão do dono (15/10/2026), literal:
 *   "Projetos aqui dentro do Mirai OS ele pode ter quanto quiser ate bater os 3gb
 *    dele, porem de fora como git e server coloca um limite por plano. No Pro
 *    comeca por 3 projetos."
 * Ou seja: projeto NATIVO não tem teto de QUANTIDADE (quem manda é o espaço);
 * o teto de quantidade é só para o que vem de FORA (git/servidor).
 *
 * Chaves lidas do JSONB `limits` do plano:
 *   storage_gb           espaço total da conta, em GB
 *   projetos_externos    quantos projetos trazidos de fora (git/servidor)
 *   bancos               quantos bancos de dados
 *   acessos_simultaneos  teto base de acessos simultâneos
 *
 * ── QUANDO NÃO DÁ PARA PERGUNTAR ──────────────────────────────────────────────
 * Campo `null` significa SEM TETO. Isso é deliberado e é a regra de CONTINUIDADE:
 * antes desta camada não havia teto nenhum, então "não deu para ler o plano" não
 * pode virar bloqueio de quem já estava trabalhando. O caso fica no log
 * (`[limites] ...`) para ser visto, e nunca derruba a operação.
 *
 * Já a conta SEM vínculo no plano de controle recebe o degrau mais baixo
 * (`SEM_PLANO`) — ela nem passa pela porteira do Arquiteto, então não é caminho
 * de ninguém hoje; se um dia for, o padrão é o conservador.
 */
import type { Conta } from "@/lib/orgs";
import { contaPorId } from "@/lib/orgs";
import { lerVinculo } from "@/lib/vinculo-conta-mirai";
import { limitesDoTenant } from "@/lib/plano-controle";

const GB = 1024 * 1024 * 1024;

/** Degrau mais baixo: sem plano, sem vínculo, ou plano que não declarou a chave. */
const SEM_PLANO = {
  espacoBytes: 1 * GB,
  projetosExternos: 0,
  bancos: 0,
  acessosSimultaneos: 1,
} as const;

/**
 * O dono da plataforma não é limitado por plano — ele é quem CRIA os planos.
 * Sem isto, a conta dele (hoje em `mirai_free`) ficaria presa em 1 GB.
 */
const DONO = {
  espacoBytes: 500 * GB,
  projetosExternos: 10_000,
  bancos: 10_000,
  acessosSimultaneos: 10_000,
} as const;

export type LimitesEfetivos = {
  /** false quando não deu para ler o plano (e aí os tetos vêm `null` = sem teto). */
  ok: boolean;
  /** plano vigente (ex.: "mirai_pro"), quando deu para ler. */
  plano?: string;
  /** bytes. `null` = SEM TETO. */
  espacoBytes: number | null;
  /** quantos projetos de fora. `null` = SEM TETO. */
  projetosExternos: number | null;
  bancos: number | null;
  acessosSimultaneos: number | null;
  erro?: string;
};

/** Chave DECLARADA pelo plano → número; chave ausente → `null` (SEM TETO). */
function opcional(v: number | undefined): number | null {
  if (v === undefined || !Number.isFinite(v)) return null;
  return Math.max(0, Math.floor(v));
}

/** `storage_gb` do plano, em bytes. Ausente/inválido → `null` (sem teto). */
function gbDoPlano(gb: number | undefined): number | null {
  if (gb === undefined || !Number.isFinite(gb) || gb <= 0) return null;
  return gb * GB;
}

/**
 * Traduz o JSONB do plano para os limites que o app aplica.
 *
 * REGRA: o plano manda — e o que ele NÃO declarar, NÃO limita.
 * Motivo (medido em 15/10/2026, antes de publicar): os planos que já existem
 * declaram `storage_gb` e `requests_day`, mas ainda NÃO declaram
 * `projetos_externos`. Se a chave ausente virasse 0, todo cliente de plano pago
 * ficaria de uma hora para outra sem poder trazer NENHUM projeto de fora — uma
 * regressão que eu teria causado ao publicar. Ausente = `null` = sem teto, e o
 * dono liga o limite quando cadastrar o número. Quem quer o padrão conservador
 * é a conta SEM plano/vínculo, abaixo.
 */
function doPlano(limites: Record<string, number>): {
  espacoBytes: number | null;
  projetosExternos: number | null;
  bancos: number | null;
  acessosSimultaneos: number | null;
} {
  return {
    espacoBytes: gbDoPlano(limites.storage_gb),
    projetosExternos: opcional(limites.projetos_externos),
    bancos: opcional(limites.bancos),
    acessosSimultaneos: opcional(limites.acessos_simultaneos),
  };
}

/** Limites efetivos desta conta. Nunca lança. */
export async function limitesDaConta(conta: Conta): Promise<LimitesEfetivos> {
  if (conta.ehDono) {
    return { ok: true, plano: "dono", ...DONO };
  }

  const vinculo = lerVinculo(conta.id);
  if (!vinculo?.tenant_id) {
    return { ok: true, ...SEM_PLANO };
  }

  try {
    const r = await limitesDoTenant(vinculo.tenant_id);
    if (!r.ok) {
      // Não deu para perguntar: SEM TETO (continuidade) — mas fica no log.
      console.warn(`[limites] conta ${conta.id}: plano ilegível (${r.erro}) — sem teto`);
      return {
        ok: false,
        espacoBytes: null,
        projetosExternos: null,
        bancos: null,
        acessosSimultaneos: null,
        erro: r.erro,
      };
    }
    return { ok: true, plano: r.plano, ...doPlano(r.limites) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "falha ao consultar o plano de controle";
    console.warn(`[limites] conta ${conta.id}: ${msg} — sem teto`);
    return {
      ok: false,
      espacoBytes: null,
      projetosExternos: null,
      bancos: null,
      acessosSimultaneos: null,
      erro: msg,
    };
  }
}

/** Texto humano do teto de espaço, para a mensagem de recusa. */
export function espacoLegivel(bytes: number): string {
  if (bytes >= GB) {
    const gb = bytes / GB;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Mesmos limites, a partir do ID — para as ferramentas do chat, que só têm o
 * número da conta. Se o ID não existir, trata como sem plano (conservador).
 */
export async function limitesDoUsuario(userId: number): Promise<LimitesEfetivos> {
  const conta = contaPorId(userId);
  if (!conta) {
    return { ok: true, ...SEM_PLANO };
  }
  return limitesDaConta(conta);
}

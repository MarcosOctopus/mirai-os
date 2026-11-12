/**
 * ENVIO DE E-MAIL — Resend, com degradação que NUNCA derruba o compartilhar.
 *
 * REGRA DA CASA (API POLICY): toda API tem reserva. Aqui o e-mail é o último
 * passo de uma ação que já valeu (a concessão na Arca já aconteceu). Se o Resend
 * estiver sem chave, sem cota ou com o domínio não verificado, a função devolve
 * o motivo — e quem chamou continua com o link na mão para mandar do jeito que
 * der. Perder o aviso é aceitável; perder o acesso não é.
 *
 * REMETENTE: `EMAIL_FROM`. Hoje só `omapapaper.com.br` está verificado no Resend
 * (medido 11/11/2026: `arca@miraitohope.com` devolve 403 "domain is not verified").
 * Ao verificar `miraitohope.com` (registros SPF/DKIM no DNS), basta trocar a env —
 * nada de código muda.
 */

const RESEND_URL = "https://api.resend.com/emails";

export type EnvioEmail = {
  ok: boolean;
  /** true = nem tentou (sem chave configurada) — não é erro, é ausência */
  pulado?: boolean;
  id?: string;
  para?: string;
  remetente?: string;
  motivo?: string;
};

export const REMETENTE_PADRAO = "A Arca <arca@omapapaper.com.br>";

export async function enviarEmail({
  para,
  assunto,
  html,
  texto,
  responderPara,
}: {
  para: string;
  assunto: string;
  html: string;
  texto: string;
  responderPara?: string;
}): Promise<EnvioEmail> {
  const chave = (process.env.RESEND_API_KEY || "").trim();
  const remetente = (process.env.EMAIL_FROM || REMETENTE_PADRAO).trim();
  const destino = (para || "").trim().toLowerCase();

  if (!destino.includes("@")) {
    return { ok: false, para: destino, motivo: "destino inválido" };
  }
  if (!chave) {
    return { ok: false, pulado: true, para: destino, remetente, motivo: "RESEND_API_KEY ausente" };
  }

  try {
    const r = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: remetente,
        to: [destino],
        subject: assunto,
        html,
        text: texto,
        ...(responderPara ? { reply_to: responderPara } : {}),
      }),
      cache: "no-store",
    });
    const dados = (await r.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!r.ok) {
      return {
        ok: false,
        para: destino,
        remetente,
        motivo: (dados.message || dados.name || `Resend HTTP ${r.status}`).slice(0, 220),
      };
    }
    return { ok: true, id: dados.id, para: destino, remetente };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, para: destino, remetente, motivo: `falha de rede: ${msg.slice(0, 160)}` };
  }
}

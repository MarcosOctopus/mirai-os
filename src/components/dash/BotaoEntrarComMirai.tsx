/* Botão "Entrar com Mirai" — peça de identidade do ecossistema.
 *
 * REGRA DE USO: este botão é para os OUTROS PRODUTOS, não para o MIRAI OS.
 * Dentro do MIRAI OS ele é redundante (você já está na Mirai); aqui a entrada é
 * e-mail/senha + Google. Lá no produto, é este botão que manda a pessoa para a
 * Conta Mirai — e a Conta Mirai é quem oferece Google, e-mail/senha, e o que
 * vier depois (Apple, passkey, SMS). O produto nunca precisa saber o "como".
 *
 * O desenho: botão de altura 48, raio 10, borda clara sobre superfície escura,
 * a MARCA da Mirai à esquerda do rótulo (nunca emoji, nunca esticada — sempre
 * object-contain), rótulo em Poppins 13-14 semibold.
 *
 * Para produtos que não são React, a versão em HTML/CSS puro está na skill
 * `design-system-conformance` em `references/botao-entrar-com-mirai.md`.
 */
import type { CSSProperties, ReactNode } from "react"

type Props = {
  /** Para onde o botão leva (a entrada do OIDC no produto). */
  href: string
  /** Texto do botão. Padrão: "Entrar com Mirai". */
  rotulo?: string
  /** URL ou caminho da marca laranja. */
  marca?: string
  /** Claro = superfície clara (fundo branco). Padrão: escuro (nosso padrão Dash). */
  claro?: boolean
  /** Bloco ocupa a largura toda (padrão) ou fica no tamanho do conteúdo. */
  larguraTotal?: boolean
  /** Conteúdo extra opcional (ex.: um selo "recomendado"). */
  extra?: ReactNode
  style?: CSSProperties
  className?: string
}

export default function BotaoEntrarComMirai({
  href,
  rotulo = "Entrar com Mirai",
  marca = "/logo-mirai-marca.png",
  claro = false,
  larguraTotal = true,
  extra,
  style,
  className = "",
}: Props) {
  const base: CSSProperties = claro
    ? {
        background: "#ffffff",
        border: "1px solid rgba(0,0,0,0.10)",
        color: "#16171a",
        fontFamily: "Poppins, system-ui, sans-serif",
      }
    : {
        background: "rgba(255,255,255,0.07)",
        border: "1px solid rgba(255,255,255,0.16)",
        color: "#ffffff",
        fontFamily: "Poppins, system-ui, sans-serif",
      }

  return (
    <a
      href={href}
      className={`inline-flex items-center justify-center gap-3 rounded-[10px] px-4 text-[13px] font-semibold transition ${className}`}
      style={{
        height: 48,
        width: larguraTotal ? "100%" : undefined,
        textDecoration: "none",
        ...base,
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = claro ? "#f2f2f2" : "rgba(255,255,255,0.14)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = claro ? "#ffffff" : "rgba(255,255,255,0.07)"
      }}
    >
      {/* a marca: altura fixa, largura automática — nunca amassa */}
      <img
        src={marca}
        alt=""
        className="shrink-0 object-contain"
        style={{ height: 26, width: "auto", maxWidth: "none" }}
      />
      <span>{rotulo}</span>
      {extra}
    </a>
  )
}

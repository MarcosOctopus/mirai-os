"use client"

// Tela de entrada do MIRAI OS — referência: Digixcel (replicada item por item).
// Pedido do dono por cima da referência:
//   DIREITA: a caixa do formulário de cima até embaixo, em vidro translúcido
//            (glass do iOS novo): Entrar, e-mail, senha, lembrar de mim,
//            esqueci, botão, divisor e as duas entradas (Google e Mirai).
//   ESQUERDA: só a frase do heading e os ícones das redes — mais nada escrito.
// Fundo: a foto da capa em opacidade CHEIA (sem véu). Tipografia: Poppins do
// padrão Dash. A logo é pequena e nunca estica (self-start + object-contain).
import { useState, FormEvent } from "react"

const FONTE = "var(--fonte-poppins), Poppins, system-ui, sans-serif"

// Vidro do iOS: desfoque forte + saturação + véu claro translúcido + aresta viva
const VIDRO = {
  background:
    "linear-gradient(165deg, rgba(255,255,255,0.20) 0%, rgba(255,255,255,0.11) 30%, rgba(255,255,255,0.07) 62%, rgba(255,255,255,0.10) 100%)",
  backdropFilter: "blur(42px) saturate(185%)",
  WebkitBackdropFilter: "blur(42px) saturate(185%)",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(255,255,255,0.10), inset 0 0 0 1px rgba(255,255,255,0.10), 0 24px 70px rgba(0,0,0,0.40)",
} as const

const REDES = [
  { nome: "Instagram", d: "M12 2.2c3.2 0 3.6 0 4.9.07 1.2.06 1.8.25 2.2.42.6.23 1 .5 1.4.94.44.44.71.84.94 1.4.17.4.36 1 .42 2.2.06 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.06 1.2-.25 1.8-.42 2.2-.23.6-.5 1-.94 1.4-.44.44-.84.71-1.4.94-.4.17-1 .36-2.2.42-1.3.06-1.7.07-4.9.07s-3.6 0-4.9-.07c-1.2-.06-1.8-.25-2.2-.42-.6-.23-1-.5-1.4-.94-.44-.44-.71-.84-.94-1.4-.17-.4-.36-1-.42-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.06-1.2.25-1.8.42-2.2.23-.6.5-1 .94-1.4.44-.44.84-.71 1.4-.94.4-.17 1-.36 2.2-.42C8.4 2.2 8.8 2.2 12 2.2Zm0 5.1a4.7 4.7 0 1 0 0 9.4 4.7 4.7 0 0 0 0-9.4Zm0 7.75a3.05 3.05 0 1 1 0-6.1 3.05 3.05 0 0 1 0 6.1Zm6-7.94a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0Z" },
  { nome: "YouTube", d: "M23 12s0-3.3-.42-4.9a2.53 2.53 0 0 0-1.78-1.79C19.2 4.9 12 4.9 12 4.9s-7.2 0-8.8.42a2.53 2.53 0 0 0-1.78 1.79C1 8.7 1 12 1 12s0 3.3.42 4.9c.23.85.9 1.52 1.78 1.75 1.6.42 8.8.42 8.8.42s7.2 0 8.8-.42a2.53 2.53 0 0 0 1.78-1.75C23 15.3 23 12 23 12ZM9.75 15.5v-7L15.5 12l-5.75 3.5Z" },
  { nome: "LinkedIn", d: "M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5ZM3 9h4v12H3V9Zm7 0h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05C21.2 8.65 22 10.9 22 14.1V21h-4v-6.1c0-1.46-.03-3.34-2.04-3.34-2.04 0-2.35 1.59-2.35 3.24V21h-4V9Z" },
  { nome: "X", d: "M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.96 6.82H1.68l7.73-8.83L1.25 2.25h6.82l4.71 6.23 5.46-6.23Zm-1.16 17.52h1.83L7.02 4.12H5.05l12.03 15.65Z" },
]

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [senha, setSenha] = useState("")
  const [lembrar, setLembrar] = useState(true)
  const [erro, setErro] = useState("")
  const [carregando, setCarregando] = useState(false)

  async function entrar(e: FormEvent) {
    e.preventDefault()
    setErro("")
    setCarregando(true)
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: senha }),
      })
      if (!r.ok) {
        const d = await r.json().catch(() => null)
        throw new Error(d?.error || d?.message || "Não foi possível entrar")
      }
      window.location.href = "/dashboard"
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Ocorreu um erro inesperado")
    } finally {
      setCarregando(false)
    }
  }

  const botaoSocial =
    "flex w-full items-center justify-center gap-3 rounded-[10px] border border-white/[0.24] bg-white/[0.10] px-4 py-3 text-[13px] font-semibold text-white transition hover:bg-white/[0.18]"
  const campo =
    "w-full rounded-[10px] border border-white/[0.20] bg-black/20 px-4 py-3 text-[13.5px] text-white outline-none transition placeholder:text-white/60 focus:border-dash-brand/70"

  return (
    <main
      className="relative flex min-h-[100dvh] flex-col"
      style={{
        fontFamily: FONTE,
        backgroundImage: "url('/login-capa.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* a foto fica em opacidade CHEIA — nenhum véu por cima */}

      <div className="relative grid flex-1 grid-cols-1 lg:grid-cols-[1fr_minmax(380px,480px)]">
        {/* ── ESQUERDA: só a frase e as redes — mais nada escrito ──── */}
        <section className="order-2 flex flex-col justify-center px-7 py-10 sm:px-10 lg:order-1 lg:px-14">
          <h1 className="max-w-[18ch] text-[34px] font-semibold leading-[1.15] text-white sm:text-[46px]">
            Confie nos especialistas em tecnologia e IA
          </h1>

          <div className="mt-10 flex items-center gap-3">
            {REDES.map((r) => (
              <span
                key={r.nome}
                title={r.nome}
                aria-label={r.nome}
                className="grid h-10 w-10 place-items-center rounded-full border border-white/[0.22] bg-black/25 text-white/85 backdrop-blur-md"
              >
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
                  <path d={r.d} />
                </svg>
              </span>
            ))}
          </div>
        </section>

        {/* ── DIREITA: a caixa do formulário, de cima até embaixo ──── */}
        <section
          className="order-1 flex flex-col justify-center border-white/[0.18] px-7 py-10 sm:px-10 lg:order-2 lg:border-l"
          style={VIDRO}
        >
          {/* a marca da Mirai, maior */}
          <img
            src="/logo-mirai.png"
            alt="MIRAI"
            className="h-[32px] w-auto max-w-none shrink-0 self-start object-contain"
          />

          <div className="mt-9">
            <h2 className="text-[22px] font-semibold text-white">Entrar</h2>
            <p className="mt-1.5 text-[12.5px] text-white/70">
              Ainda não tem conta?{" "}
              <a
                href="/api/auth/mirai/start?next=%2Fdashboard"
                className="font-semibold text-dash-brand hover:text-dash-brandHi"
              >
                Criar conta
              </a>
            </p>
          </div>

          <form onSubmit={entrar} className="mt-6 flex flex-col gap-4">
            <input
              type="email"
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={campo}
            />
            <input
              type="password"
              placeholder="Senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              className={campo}
            />

            <div className="flex items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-white/80">
                <input
                  type="checkbox"
                  checked={lembrar}
                  onChange={(e) => setLembrar(e.target.checked)}
                  className="h-4 w-4 accent-dash-brand"
                />
                Lembrar de mim
              </label>
              <a
                href="/api/auth/mirai/start?next=%2Fdashboard"
                className="text-[12.5px] text-white/80 hover:text-white"
              >
                Esqueci minha senha
              </a>
            </div>

            {erro && <p className="text-[12.5px] text-dash-bad">{erro}</p>}

            <button
              type="submit"
              disabled={carregando}
              className="mt-1 w-full rounded-[10px] bg-dash-brand px-4 py-3.5 text-[13.5px] font-semibold text-white transition hover:bg-dash-brandHi disabled:opacity-60"
            >
              {carregando ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-white/[0.22]" />
            <span className="text-[11px] uppercase tracking-[0.16em] text-white/55">ou</span>
            <span className="h-px flex-1 bg-white/[0.22]" />
          </div>

          <div className="flex flex-col gap-3">
            <a href="/api/auth/google" className={botaoSocial}>
              <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] shrink-0" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Entrar com Google
            </a>

            <a href="/api/auth/mirai/start?next=%2Fdashboard" className={botaoSocial}>
              <img
                src="/logo-mirai-marca.png"
                alt=""
                className="h-[26px] w-[26px] shrink-0 object-contain"
              />
              Entrar com Mirai
            </a>
          </div>
        </section>
      </div>
    </main>
  )
}

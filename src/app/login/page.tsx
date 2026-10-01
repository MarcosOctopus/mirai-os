"use client"

import { useState, FormEvent } from "react"

type TabMode = "login" | "register"

export default function LoginPage() {
  const [tab, setTab] = useState<TabMode>("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      const endpoint =
        tab === "login" ? "/api/auth/login" : "/api/auth/register"

      const body: Record<string, string> = { email, password }
      if (tab === "register") body.name = name

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || data?.message || "Erro ao autenticar")
      }

      window.location.href = "/dashboard/connect"
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Ocorreu um erro inesperado"
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main
      className="h-[100dvh] overflow-y-auto flex px-4 py-6"
      style={{
        background:
          "#03040d radial-gradient(ellipse at 50% 30%, rgba(120, 80, 255, 0.25) 0%, rgba(0, 200, 255, 0.15) 50%, transparent 70%)",
      }}
    >
      {/* Card */}
      <div className="w-full max-w-md m-auto rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 sm:p-10 shadow-2xl">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold tracking-widest bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
            MIRAI OS
          </h1>
          <p className="mt-2 text-sm text-white/50">
            Sua fábrica de conteúdo inteligente
          </p>
        </div>

        {/* Conta Mirai — a porta de entrada do ecossistema (identidade única) */}
        <a
          href="/api/auth/mirai/start?next=%2Fdashboard%2Fconnect"
          className="flex items-center justify-center gap-3 w-full rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-4 py-3 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20 transition-colors"
        >
          Entrar com a Conta Mirai
        </a>
        <p className="mt-2 text-center text-xs text-white/35">
          Uma conta para todo o ecossistema.
        </p>

        <div className="flex items-center gap-3 my-6">
          <span className="flex-1 h-px bg-white/10" />
          <span className="text-xs text-white/30 uppercase tracking-wider">
            ou direto pelo app
          </span>
          <span className="flex-1 h-px bg-white/10" />
        </div>

        {/* Google Button */}
        <a
          href="/api/auth/google"
          className="flex items-center justify-center gap-3 w-full rounded-xl border border-white/20 px-4 py-3 text-sm font-medium text-white hover:bg-white/10 transition-colors"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Entrar com Google
        </a>

        {/* Divider */}
        <div className="flex items-center gap-3 my-6">
          <span className="flex-1 h-px bg-white/10" />
          <span className="text-xs text-white/30 uppercase tracking-wider">
            ou
          </span>
          <span className="flex-1 h-px bg-white/10" />
        </div>

        {/* Tab Toggle */}
        <div className="flex rounded-xl bg-white/5 p-1 mb-6">
          <button
            type="button"
            onClick={() => { setTab("login"); setError("") }}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              tab === "login"
                ? "bg-cyan-500 text-black"
                : "text-white/50 hover:text-white"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => { setTab("register"); setError("") }}
            className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
              tab === "register"
                ? "bg-cyan-500 text-black"
                : "text-white/50 hover:text-white"
            }`}
          >
            Cadastro
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {tab === "register" && (
            <input
              type="text"
              placeholder="Nome"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 outline-none focus:border-cyan-400/50 transition-colors"
            />
          )}

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 outline-none focus:border-cyan-400/50 transition-colors"
          />

          <input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-white/30 outline-none focus:border-cyan-400/50 transition-colors"
          />

          {/* Error */}
          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading && (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle
                  className="opacity-25"
                  cx="12" cy="12" r="10"
                  stroke="currentColor" strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
            {loading
              ? "Aguarde..."
              : tab === "login"
              ? "Entrar"
              : "Criar conta"}
          </button>
        </form>
      </div>
    </main>
  )
}

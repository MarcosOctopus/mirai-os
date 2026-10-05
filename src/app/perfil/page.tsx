"use client"

// Perfil da conta — destino do item "Perfil" no menu do canto superior direito.
// Lê quem está logado (/api/auth/me) e a organização dele (/api/minha-organizacao)
// e oferece a saída pelo mesmo /api/auth/logout que o app já usa.
import { useEffect, useState } from "react"
import Shell from "@/components/dash/Shell"
import { Card, Secao } from "@/components/dash/kit"

type Conta = { nome?: string; email?: string; ehDono?: boolean; criadoEm?: string }
type Org = { organizacao?: { nome?: string; papel?: string; crmOrgId?: string } | null }

export default function PerfilPage() {
  const [conta, setConta] = useState<Conta | null>(null)
  const [org, setOrg] = useState<Org["organizacao"]>(null)
  const [carregando, setCarregando] = useState(true)
  const [saindo, setSaindo] = useState(false)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch("/api/auth/me")
        if (r.ok) {
          const d = await r.json()
          if (vivo) setConta(d?.usuario ?? d ?? null)
        }
      } catch {
        /* segue com o que tiver */
      }
      try {
        const r = await fetch("/api/minha-organizacao")
        if (r.ok) {
          const d = await r.json()
          if (vivo) setOrg(d?.organizacao ?? d ?? null)
        }
      } catch {
        /* segue com o que tiver */
      }
      if (vivo) setCarregando(false)
    })()
    return () => {
      vivo = false
    }
  }, [])

  async function sair() {
    setSaindo(true)
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } finally {
      window.location.href = "/login"
    }
  }

  const inicial = (conta?.nome || conta?.email || "?").trim().charAt(0).toUpperCase()
  const papel = org?.papel || (conta?.ehDono ? "dono" : null)

  return (
    <Shell
      titulo="Perfil"
      usuario={{ nome: conta?.nome, email: conta?.email, ehDono: conta?.ehDono }}
    >
      <div className="flex flex-col gap-6">
        <Secao titulo="Sua conta">
          <Card>
            <div className="flex items-center gap-4">
              <span className="grid h-[54px] w-[54px] shrink-0 place-items-center rounded-full border border-white/15 bg-dash-raise text-[19px] text-white">
                {inicial}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-white">
                  {carregando ? "Carregando..." : conta?.nome || "Sua conta"}
                </p>
                <p className="truncate text-[12.5px] text-dash-muted">
                  {conta?.email || "—"}
                </p>
              </div>
            </div>

            <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-[11px] uppercase tracking-[0.14em] text-dash-muted">
                  Papel
                </dt>
                <dd className="mt-1 text-[13.5px] text-white">
                  {papel ? papel.charAt(0).toUpperCase() + papel.slice(1) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] uppercase tracking-[0.14em] text-dash-muted">
                  Organização
                </dt>
                <dd className="mt-1 truncate text-[13.5px] text-white">
                  {org?.nome || "—"}
                </dd>
              </div>
              {org?.crmOrgId && (
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.14em] text-dash-muted">
                    ID no CRM
                  </dt>
                  <dd className="mt-1 truncate text-[13.5px] text-white">{org.crmOrgId}</dd>
                </div>
              )}
            </dl>
          </Card>
        </Secao>

        <Secao titulo="Sessão">
          <Card>
            <p className="text-[13px] leading-[1.6] text-dash-muted">
              Encerrar a sessão neste navegador. Você volta para a tela de entrada.
            </p>
            <button
              onClick={sair}
              disabled={saindo}
              className="mt-4 rounded-[10px] border border-dash-bad/40 bg-dash-bad/10 px-5 py-2.5 text-[13px] font-semibold text-dash-bad transition hover:bg-dash-bad/20 disabled:opacity-60"
            >
              {saindo ? "Saindo..." : "Sair da conta"}
            </button>
          </Card>
        </Secao>
      </div>
    </Shell>
  )
}

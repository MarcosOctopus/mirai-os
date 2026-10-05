"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Shell from "@/components/dash/Shell";
import { Card, Secao, Selo, StatCard } from "@/components/dash/kit";
import {
  IconeBusca,
  IconeCamera,
  IconeEnviar,
  IconeFilme,
  IconeImagem,
  IconeMusica,
  IconeNuvem,
  IconeOrganizacoes,
  IconePlay,
  IconePlug,
  IconeRobo,
} from "@/components/dash/icons";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface User {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
  tenant_id?: string;
  platform_config?: Record<string, unknown>;
}

type PlatformId =
  | "drive"
  | "youtube"
  | "higgsfield"
  | "suno"
  | "telegram"
  | "magnific"
  | "instagram"
  | "kling";

type ConnectionMethod = "oauth" | "apikey" | "token";

interface PlatformDef {
  id: PlatformId;
  name: string;
  icon: string;
  method: ConnectionMethod;
  oauthPath?: string;
  // how to read platform_config to decide status
  statusCheck: (cfg: Record<string, unknown>) => "connected" | "pending" | "disconnected";
}

/* ------------------------------------------------------------------ */
/*  Produtos ligados a Mirai por MCP (regra "MCP por produto")         */
/* ------------------------------------------------------------------ */

interface ProdutoMcp {
  nome: string;
  descricao: string;
  configurado: boolean;
  conectado: boolean;
  ferramentas: number;
  endpoint: string;
  erro?: string;
  funil?: string;
  fila?: string;
  vinculado?: boolean;
  ehDono?: boolean;
  papel?: string;
  organizacao?: { id: string; nome: string; slug: string } | null;
}

/* ------------------------------------------------------------------ */
/*  Platform definitions                                                */
/* ------------------------------------------------------------------ */

const PLATFORMS: PlatformDef[] = [
  {
    id: "drive",
    name: "Google Drive",
    icon: "🗂️",
    method: "oauth",
    oauthPath: "/api/auth/drive",
    statusCheck: (cfg) => (cfg.drive ? "connected" : "disconnected"),
  },
  {
    id: "youtube",
    name: "YouTube",
    icon: "📺",
    method: "oauth",
    oauthPath: "/api/auth/youtube",
    statusCheck: (cfg) => {
      const yt = cfg.youtube as Record<string, unknown> | undefined;
      return yt?.channel ? "connected" : "disconnected";
    },
  },
  {
    id: "higgsfield",
    name: "Higgsfield",
    icon: "🎨",
    method: "apikey",
    statusCheck: (cfg) => (cfg.higgsfield ? "connected" : "disconnected"),
  },
  {
    id: "suno",
    name: "Suno",
    icon: "🎵",
    method: "apikey",
    statusCheck: (cfg) => (cfg.suno ? "connected" : "disconnected"),
  },
  {
    id: "telegram",
    name: "Telegram",
    icon: "✈️",
    method: "token",
    statusCheck: (cfg) => (cfg.telegram ? "connected" : "disconnected"),
  },
  {
    id: "magnific",
    name: "Magnific",
    icon: "🔍",
    method: "apikey",
    statusCheck: (cfg) => (cfg.magnific ? "connected" : "disconnected"),
  },
  {
    id: "instagram",
    name: "Instagram",
    icon: "📱",
    method: "oauth",
    oauthPath: "/api/auth/instagram",
    statusCheck: (cfg) => (cfg.instagram ? "connected" : "disconnected"),
  },
  {
    id: "kling",
    name: "Kling",
    icon: "🤖",
    method: "apikey",
    statusCheck: (cfg) => (cfg.kling ? "connected" : "disconnected"),
  },
];

/* Um traço só, sem cor própria (herda currentColor): o ícone de cada canal. */
const ICONE_CANAL: Record<PlatformId, React.ReactNode> = {
  drive: <IconeNuvem />,
  youtube: <IconePlay />,
  higgsfield: <IconeImagem />,
  suno: <IconeMusica />,
  telegram: <IconeEnviar />,
  magnific: <IconeBusca />,
  instagram: <IconeCamera />,
  kling: <IconeFilme />,
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function getStatusLabel(
  status: "connected" | "pending" | "disconnected",
): string {
  switch (status) {
    case "connected":
      return "🟢 Connected";
    case "pending":
      return "🟡 Pending";
    case "disconnected":
      return "⚪ Not connected";
  }
}

function getStatusClass(status: "connected" | "pending" | "disconnected"): string {
  switch (status) {
    case "connected":
      return "text-green-400";
    case "pending":
      return "text-yellow-400";
    case "disconnected":
      return "text-gray-500";
  }
}

/* ------------------------------------------------------------------ */
/*  API Key Modal                                                       */
/* ------------------------------------------------------------------ */

interface ApiKeyModalProps {
  platform: PlatformDef;
  onClose: () => void;
  onSaved: () => void;
}

function ApiKeyModal({ platform, onClose, onSaved }: ApiKeyModalProps) {
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose],
  );

  const handleSave = useCallback(async () => {
    if (!key.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/auth/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: platform.id, key: key.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to save");
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }, [key, platform.id, onSaved, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSave();
      if (e.key === "Escape") onClose();
    },
    [handleSave, onClose],
  );

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-sm rounded-xl border border-white/10 bg-[#0a0b1a] p-6 shadow-2xl">
        {/* Close X */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-500 transition-colors hover:text-white"
          aria-label="Close"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-dash-raise text-dash-muted">
            {ICONE_CANAL[platform.id]}
          </span>
          <h2 className="text-[16px] font-semibold text-white">
            {platform.name}
          </h2>
        </div>

        {/* Input */}
        <label className="mb-1 block text-xs uppercase tracking-[0.2em] text-gray-400">
          API Key
        </label>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste your API key here..."
          className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-cyan-100 placeholder-gray-500 outline-none transition-colors focus:border-cyan-400/50 focus:ring-1 focus:ring-cyan-400/30"
          autoFocus
        />

        {/* Error */}
        {error && (
          <p className="mt-2 text-xs text-red-400">{error}</p>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={!key.trim() || saving}
          className="mt-4 w-full rounded-lg bg-cyan-500/20 py-2.5 text-sm font-medium text-cyan-300 transition-all hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Connect Dashboard Page                                              */
/* ------------------------------------------------------------------ */

export default function ConnectDashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [apiKeyPlatform, setApiKeyPlatform] = useState<PlatformDef | null>(null);
  const [saaso, setSaaso] = useState<ProdutoMcp | null>(null);
  const [saasoErro, setSaasoErro] = useState("");

  /* Fetch user on mount */
  const fetchUser = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) throw new Error("Failed to fetch user");
      const data = (await res.json()) as { user: User };
      setUser(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  /* Produto Saaso: estado lido ao vivo pelo MCP dele */
  const fetchSaaso = useCallback(async () => {
    try {
      const res = await fetch("/api/integracoes/saaso");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = (await res.json()) as Omit<ProdutoMcp, "nome" | "descricao">;
      setSaaso({
        nome: "Saaso",
        descricao: d.organizacao
          ? `CRM de ${d.organizacao.nome} — o dado vem pelo MCP do produto`
          : "CRM multi-whitelabel (WhatsApp) — o dado vem pelo MCP do produto",
        ...d,
      });
      setSaasoErro("");
    } catch (err) {
      setSaasoErro(err instanceof Error ? err.message : "falha ao ler o MCP do Saaso");
    }
  }, []);

  useEffect(() => {
    fetchSaaso();
  }, [fetchSaaso]);

  /* Logout */
  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login";
    } catch {
      window.location.href = "/login";
    }
  }, []);

  /* Connect action per platform */
  const handleConnect = useCallback((platform: PlatformDef) => {
    if (platform.method === "oauth" && platform.oauthPath) {
      window.open(platform.oauthPath, "_blank");
    } else if (platform.method === "apikey" || platform.method === "token") {
      setApiKeyPlatform(platform);
    }
  }, []);

  /* Disconnect */
  const handleDisconnect = useCallback(
    async (platform: PlatformDef) => {
      try {
        await fetch("/api/auth/connect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ platform: platform.id, disconnect: true }),
        });
        fetchUser();
      } catch {
        // ignore
      }
    },
    [fetchUser],
  );

  /* Derive platform statuses */
  const platformConfig = user?.platform_config ?? {};
  const ligadas = PLATFORMS.filter((p) => p.statusCheck(platformConfig) === "connected");

  /* -------- Render -------- */

  return (
    <Shell titulo="Integrações" usuario={user}>
      {error && (
        <p className="mb-5 rounded-[16px] border border-dash-bad/30 bg-dash-bad/[0.07] px-5 py-4 text-[13px] text-dash-bad">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          rotulo="Canais ligados"
          valor={loading ? "–" : `${ligadas.length}/${PLATFORMS.length}`}
          nota={ligadas.length ? ligadas.map((p) => p.name).join(" · ") : "nenhum ainda"}
          tom={ligadas.length ? "ok" : "neutro"}
          icone={<IconePlug className="h-4 w-4" />}
        />
        <StatCard
          rotulo="CRM (Saaso)"
          valor={saaso?.conectado ? `${saaso.ferramentas ?? 0}` : "off"}
          nota={saaso?.conectado ? "ferramentas pelo MCP do produto" : saaso?.erro || "sem credencial vinculada"}
          tom={saaso?.conectado ? "ok" : "alerta"}
          icone={<IconeOrganizacoes className="h-4 w-4" />}
        />
        <StatCard
          rotulo="Sua organização"
          valor={saaso?.organizacao?.nome || "—"}
          tamanho="medio"
          nota={saaso?.ehDono ? "dono da plataforma" : saaso?.organizacao ? "só a sua empresa" : "conta sem vínculo"}
          tom="marca"
          icone={<IconeRobo className="h-4 w-4" />}
        />
        <StatCard
          rotulo="Produto por MCP"
          valor={saaso?.conectado ? "ligado" : "–"}
          tamanho="medio"
          nota={saaso?.endpoint || "aguardando leitura"}
          icone={<IconePlug className="h-4 w-4" />}
        />
      </div>

      <Secao
        titulo="Canais da conta"
        contagem={`${PLATFORMS.filter((p) => p.statusCheck(platformConfig) === "connected").length} de ${PLATFORMS.length} ligados`}
        acao={
          <button
            onClick={fetchUser}
            className="rounded-[10px] border border-white/12 px-4 py-2 text-[12px] text-dash-muted transition hover:text-white"
          >
            atualizar
          </button>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          {PLATFORMS.map((platform) => {
            const status = platform.statusCheck(platformConfig);
            const on = status === "connected";
            return (
              <Card key={platform.id} interativo className="flex items-center gap-4 p-5">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-dash-raise text-dash-muted">
                  {ICONE_CANAL[platform.id]}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-white">{platform.name}</p>
                  <div className="mt-1.5">
                    <Selo tom={on ? "ok" : status === "pending" ? "alerta" : "info"}>
                      {on ? "ligado" : status === "pending" ? "pendente" : "não ligado"}
                    </Selo>
                  </div>
                </div>
                {on ? (
                  <button
                    onClick={() => handleDisconnect(platform)}
                    className="shrink-0 rounded-[10px] border border-dash-bad/30 px-4 py-2 text-[12px] text-dash-bad transition hover:bg-dash-bad/10"
                  >
                    desligar
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(platform)}
                    className="shrink-0 rounded-[10px] bg-dash-brand px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-dash-brandHi"
                  >
                    ligar
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      </Secao>

        {/* ================================================================ */}
        {/*  Produtos ligados a Mirai (MCP)                                   */}
        {/* ================================================================ */}
        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xs uppercase tracking-[0.28em] text-cyan-100/50">
              Produtos ligados a Mirai
            </h2>
            <button
              onClick={fetchSaaso}
              className="text-[11px] uppercase tracking-[0.18em] text-cyan-300/60 transition-colors hover:text-cyan-200"
            >
              Atualizar
            </button>
          </div>

          {saasoErro && (
            <p className="text-xs text-amber-300/80">Nao consegui ler o MCP: {saasoErro}</p>
          )}

          {saaso ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition-all hover:border-white/20">
              <div className="flex items-center gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-dash-raise text-dash-muted">
                  <IconeOrganizacoes className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-cyan-50">{saaso.nome}</p>
                  <p className="mt-0.5 text-xs text-cyan-100/50">{saaso.descricao}</p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.18em] ${
                    saaso.conectado
                      ? "border-emerald-400/30 text-emerald-300/90"
                      : "border-red-400/30 text-red-300/90"
                  }`}
                >
                  {saaso.conectado ? "Conectado" : "Sem conexao"}
                </span>
              </div>

              <dl className="mt-4 grid grid-cols-1 gap-2 text-xs text-cyan-100/70 sm:grid-cols-2">
                <div>
                  <dt className="text-cyan-100/40">Ferramentas no MCP</dt>
                  <dd>{saaso.ferramentas}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-cyan-100/40">Endpoint (MCP do produto)</dt>
                  <dd className="truncate">{saaso.endpoint}</dd>
                </div>
              </dl>

              {saaso.organizacao && (
                <p className="mt-3 text-xs text-cyan-100/60">
                  Organização desta conta:{" "}
                  <span className="text-cyan-100/90">{saaso.organizacao.nome}</span>
                  {saaso.ehDono ? " (dono)" : ""}
                </p>
              )}
              {!saaso.vinculado && (
                <p className="mt-2 text-xs text-amber-300/80">
                  Sem CRM vinculado a esta conta — nada do CRM é consultado.
                </p>
              )}
              {saaso.erro && (
                <p className="mt-3 text-xs text-amber-300/80">{saaso.erro}</p>
              )}
              {saaso.funil && (
                <p className="mt-3 break-words text-xs text-cyan-100/60">
                  Leitura ao vivo do CRM: {saaso.funil.slice(0, 260)}
                </p>
              )}
            </div>
          ) : (
            !saasoErro && (
              <p className="text-xs text-cyan-100/40">Lendo o MCP do CRM...</p>
            )
          )}
        </section>

        {/* ================================================================ */}
        {/*  API Key Modal                                                    */}
        {/* ================================================================ */}
        {apiKeyPlatform && (
          <ApiKeyModal
            platform={apiKeyPlatform}
            onClose={() => setApiKeyPlatform(null)}
            onSaved={fetchUser}
          />
        )}
    </Shell>
  );
}

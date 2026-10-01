"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Nav from "@/components/mirai/Nav";

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
          <span className="text-3xl">{platform.icon}</span>
          <h2 className="text-lg font-semibold text-cyan-50">
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

  /* -------- Render -------- */

  return (
    <main className="min-h-dvh overflow-y-auto bg-[#03040d] text-cyan-100">
      <Nav atual="/dashboard/connect" />
      {/* Radial gradient overlays */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(176,38,255,0.16),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(10,239,255,0.14),transparent_32%)]" />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-8 px-5 py-8">
        {/* ================================================================ */}
        {/*  Top Bar                                                          */}
        {/* ================================================================ */}
        <header className="flex items-center justify-between border-b border-cyan-300/15 pb-6">
          <div className="flex items-center gap-4">
            {/* Avatar circle */}
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-purple-500 text-base font-bold uppercase text-white shadow-lg">
              {user ? user.name.charAt(0).toUpperCase() : "?"}
            </div>

            <div>
              {loading ? (
                <>
                  <div className="h-4 w-28 animate-pulse rounded bg-white/10" />
                  <div className="mt-1 h-3 w-40 animate-pulse rounded bg-white/5" />
                </>
              ) : user ? (
                <>
                  <p className="text-sm font-semibold text-cyan-50">{user.name}</p>
                  <p className="text-xs text-cyan-100/50">{user.email}</p>
                </>
              ) : null}
            </div>
          </div>

          {user && (
            <button
              onClick={handleLogout}
              className="rounded-full border border-red-400/25 px-5 py-2 text-xs uppercase tracking-[0.22em] text-red-300/80 transition-colors hover:border-red-400/40 hover:text-red-200"
            >
              Logout
            </button>
          )}
        </header>

        {/* ================================================================ */}
        {/*  Error                                                            */}
        {/* ================================================================ */}
        {error && (
          <div className="rounded-xl border border-red-400/20 bg-red-950/20 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* ================================================================ */}
        {/*  Platform Grid                                                    */}
        {/* ================================================================ */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {PLATFORMS.map((platform) => {
            const status = platform.statusCheck(platformConfig);
            return (
              <div
                key={platform.id}
                className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition-all hover:border-white/20"
              >
                {/* Icon */}
                <span className="flex h-12 w-12 shrink-0 items-center justify-center text-3xl">
                  {platform.icon}
                </span>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="truncate font-semibold text-cyan-50">
                    {platform.name}
                  </p>
                  <p
                    className={`mt-0.5 text-xs ${getStatusClass(status)}`}
                  >
                    {getStatusLabel(status)}
                  </p>
                </div>

                {/* Action button */}
                {status === "connected" ? (
                  <button
                    onClick={() => handleDisconnect(platform)}
                    className="shrink-0 rounded-lg border border-red-400/20 px-3.5 py-1.5 text-xs font-medium text-red-300/80 transition-colors hover:border-red-400/40 hover:text-red-200"
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={() => handleConnect(platform)}
                    className="shrink-0 rounded-lg border border-cyan-400/25 px-3.5 py-1.5 text-xs font-medium text-cyan-300/80 transition-colors hover:border-cyan-400/50 hover:text-cyan-200"
                  >
                    Connect
                  </button>
                )}
              </div>
            );
          })}
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
      </div>
    </main>
  );
}

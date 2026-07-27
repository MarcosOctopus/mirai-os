"use client";

import { useState } from "react";

export function PipelineControl() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const runPipeline = async () => {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/pipeline/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: "atomic-news",
          skipUpload: true,
          skipApproval: true,
        }),
      });
      const data = await res.json();
      setResult({
        ok: res.ok,
        message: res.ok
          ? `Pipeline disparado!`
          : data.error || "Falha ao disparar pipeline",
      });
    } catch (err: any) {
      setResult({ ok: false, message: err.message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-3xl border border-cyan-300/15 bg-cyan-950/10 p-6 shadow-[inset_0_0_45px_rgba(10,239,255,0.04)]">
      <h2 className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-50">
        Produção // Pipeline
      </h2>
      <p className="mt-2 text-xs text-cyan-100/45">
        Dispara o pipeline completo: Observador → Suno → Kling → Montagem → YouTube
      </p>
      <button
        onClick={runPipeline}
        disabled={running}
        className="mt-5 w-full rounded-xl border border-cyan-300/30 bg-cyan-950/20 px-5 py-3 text-xs uppercase tracking-[0.22em] text-cyan-100 transition-all hover:bg-cyan-950/40 hover:shadow-[0_0_24px_rgba(10,239,255,0.18)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {running ? (
          <span className="flex items-center justify-center gap-2">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
            Rodando…
          </span>
        ) : (
          "▶ Rodar Pipeline"
        )}
      </button>
      {result && (
        <div
          className={`mt-4 rounded-xl border p-3 text-xs leading-5 ${
            result.ok
              ? "border-emerald-300/30 bg-emerald-950/20 text-emerald-200"
              : "border-red-300/30 bg-red-950/20 text-red-200"
          }`}
        >
          {result.message}
        </div>
      )}
    </div>
  );
}

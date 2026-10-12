"use client";

import { useEffect, useState } from "react";
import Nav from "@/components/mirai/Nav";

type SysData = {
  status: string;
  services: Record<string, string>;
  last_backup: string;
  atomic_news_videos: number;
  youtube_token: string;
  crons?: any[];
  services_list?: any[];
  arca?: any;
  hermes?: any;
  atomic_news?: any;
  logs?: any[];
};

export default function SystemPage() {
  const [data, setData] = useState<SysData | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/system?type=all")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-dash-scrim flex items-center justify-center">
        <div className="text-cyan-400 text-xl font-mono animate-pulse">
          [INICIANDO TELEMETRIA...]
        </div>
      </div>
    );
  }

  const svc = data?.services || {};
  const st = (name: string) => {
    const s = svc[name] || "offline";
    return s === "online" ? "text-green-400" : "text-red-400";
  };

  const tabs = [
    { id: "overview", label: "OVERVIEW" },
    { id: "services", label: "SERVICES" },
    { id: "crons", label: "CRONS" },
    { id: "arca", label: "ARCA" },
    { id: "hermes", label: "AGENTE" },
    { id: "atomic", label: "ATOMIC NEWS" },
    { id: "logs", label: "LOGS" },
  ];

  return (
    <div className="min-h-dvh overflow-y-auto bg-dash-scrim text-dash-fg font-mono">
      <Nav atual="/system" />
      {/* Header */}
      <div className="border-b border-cyan-900/50 px-6 py-4 flex items-center justify-between">
        <div>
          <span className="text-pink-400 font-bold text-lg">MIRAI</span>
          <span className="text-cyan-400 ml-2">CONTROL CENTER</span>
        </div>
        <div className="text-xs text-gray-500">
          {new Date().toISOString()} UTC
        </div>
      </div>

      {/* Status bar */}
      <div className="px-6 py-2 border-b border-gray-900 flex gap-6 text-xs flex-wrap">
        <span>MIRAI OS: <span className={st("mirai_os")}>● {svc.mirai_os}</span></span>
        <span>ARCA: <span className={st("arca")}>● {svc.arca}</span></span>
        <span>WHISPER: <span className={st("whisper_stt")}>● {svc.whisper_stt}</span></span>
        <span>CADDY: <span className={st("caddy")}>● {svc.caddy}</span></span>
        <span>YOUTUBE: <span className="text-yellow-400">● expirado</span></span>
      </div>

      {/* Tabs */}
      <div className="px-6 py-3 border-b border-gray-900 flex gap-4 text-xs overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1 rounded transition-colors ${
              activeTab === tab.id
                ? "bg-cyan-900/50 text-cyan-300 border border-cyan-700"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            [{tab.label}]
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === "overview" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card title="STATUS DO SISTEMA">
              <Line label="Mirai OS" value={svc.mirai_os || "offline"} color={st("mirai_os")} />
              <Line label="Arca" value={svc.arca || "offline"} color={st("arca")} />
              <Line label="Whisper STT" value={svc.whisper_stt || "offline"} color={st("whisper_stt")} />
              <Line label="Agente Mirai" value={svc.hermes || "offline"} color={st("hermes")} />
              <Line label="Caddy" value={svc.caddy || "offline"} color={st("caddy")} />
            </Card>

            <Card title="ULTIMOS EVENTOS">
              <Line label="Backup" value={data?.last_backup || "---"} color="text-gray-400" />
              <Line label="Videos Atomic" value={`${data?.atomic_news_videos || 0} noticias`} color="text-cyan-400" />
              <Line label="YouTube Token" value="expirado" color="text-yellow-400" />
              <div className="mt-3 pt-3 border-t border-gray-800 text-xs text-gray-500">
                {new Date().toLocaleString("pt-BR")}
              </div>
            </Card>

            <Card title="ARQUITETURA">
              <div className="text-xs text-gray-400 space-y-1">
                <p className="text-cyan-400">USUARIO</p>
                <p className="text-gray-600">↓ Telegram / Web</p>
                <p className="text-pink-400">MIRAI OS</p>
                <p className="text-gray-600">↓ Chat API</p>
                <p className="text-purple-400">MYAPI (claude-opus-4-8)</p>
                <p className="text-gray-600">↓ Contexto</p>
                <p className="text-green-400">ARCA</p>
                <p className="text-gray-600">↓ TTS / STT</p>
                <p className="text-blue-400">ELEVENLABS / WHISPER</p>
              </div>
            </Card>
          </div>
        )}

        {activeTab === "services" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data?.services_list?.map((s: any, i: number) => (
              <Card key={i} title={s.name.toUpperCase()}>
                <Line label="Endpoint" value={s.endpoint} color="text-cyan-400" />
                <Line label="Status" value={s.online ? "online" : "offline"} color={s.online ? "text-green-400" : "text-red-400"} />
                <Line label="Tipo" value={s.type} color="text-gray-400" />
              </Card>
            ))}
            {(!data?.services_list || data.services_list.length === 0) && (
              <div className="col-span-full text-center text-gray-500 py-8">
                [CARREGANDO DADOS DOS SERVICOS...]
              </div>
            )}
          </div>
        )}

        {activeTab === "crons" && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left py-2 pr-4">CRON</th>
                  <th className="text-left py-2 pr-4">SCHEDULE</th>
                  <th className="text-left py-2 pr-4">ULTIMO</th>
                  <th className="text-left py-2 pr-4">PROXIMO</th>
                  <th className="text-left py-2">STATUS</th>
                </tr>
              </thead>
              <tbody>
                {data?.crons?.map((c: any, i: number) => (
                  <tr key={i} className="border-b border-gray-900 hover:bg-gray-900/30">
                    <td className="py-2 pr-4 text-cyan-300">{c.name}</td>
                    <td className="py-2 pr-4 text-gray-400">{c.schedule}</td>
                    <td className="py-2 pr-4 text-gray-500">{c.last}</td>
                    <td className="py-2 pr-4 text-gray-500">{c.next}</td>
                    <td className="py-2">
                      <span className={c.status === "ativo" ? "text-green-400" : "text-yellow-400"}>
                        ● {c.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === "arca" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card title="ARCA DATABASE">
              <Line label="Banco" value="PostgreSQL" color="text-cyan-400" />
              <Line label="Fallback" value="SQLite" color="text-gray-400" />
              <Line label="Status" value="online" color="text-green-400" />
              <Line label="Porta" value="5433" color="text-gray-400" />
            </Card>
            <Card title="ARCA ENDPOINTS">
              {["/health", "/context?q=", "/memory/search?q=", "/project/{name}", "/timeline/{project}", "/executive-brief"].map((ep, i) => (
                <div key={i} className="text-xs text-gray-400 py-0.5">
                  <span className="text-green-400">GET</span> {ep}
                </div>
              ))}
            </Card>
          </div>
        )}

        {activeTab === "hermes" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card title="PROVIDERS">
              {["verboo (deepseek-v4-flash)", "oneprovider (claude-opus-4-7)", "myapi (claude-opus-4-8)", "openrouter (gpt-4o vision)"].map((p, i) => (
                <div key={i} className="text-xs text-gray-400 py-0.5">● {p}</div>
              ))}
              <div className="mt-2 pt-2 border-t border-gray-800 text-xs">
                <span className="text-cyan-400">Ativo:</span> deepseek-v4.1-flash (V4.1) via Verboo — reserva: deepseek-v4-flash (V4.0)
              </div>
            </Card>
            <Card title="MCPS">
              <Line label="Higgsfield" value="imagem/video" color="text-green-400" />
              <Line label="YouTube" value="API - expirado" color="text-yellow-400" />
              <div className="mt-2 pt-2 border-t border-gray-800 text-xs text-gray-500">
                Skills: devops, github, media, pesquisa, software-dev, creative, mirai
              </div>
              <div className="text-xs text-gray-500">
                Gateways: telegram, local
              </div>
            </Card>
          </div>
        )}

        {activeTab === "atomic" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card title="ATOMIC NEWS">
              <Line label="Canal" value="otomic-news" color="text-pink-400" />
              <Line label="Videos" value={`${data?.atomic_news_videos || 0} noticias`} color="text-cyan-400" />
              <Line label="Pipeline" value="3 noticias/dia, tom satirico" color="text-gray-400" />
              <Line label="Cron" value="21:00 UTC" color="text-gray-400" />
            </Card>
            <Card title="STATUS YOUTUBE">
              <Line label="Token" value="expirado" color="text-yellow-400" />
              <Line label="Upload" value="precisa renovar" color="text-yellow-400" />
              <div className="mt-3 text-xs text-gray-500">
                Renovar OAuth para reativar upload automatico
              </div>
            </Card>
          </div>
        )}

        {activeTab === "logs" && (
          <div className="space-y-1">
            {data?.logs?.map((l: any, i: number) => (
              <div key={i} className="text-xs border-b border-gray-900 py-1 flex gap-3">
                <span className="text-gray-600 w-32 shrink-0">{l.timestamp?.substring(0, 19) || "---"}</span>
                <span className={l.nivel === "erro" ? "text-red-400" : "text-gray-400"}>{l.evento}</span>
              </div>
            ))}
            {(!data?.logs || data.logs.length === 0) && (
              <div className="text-center text-gray-500 py-8">[SEM LOGS]</div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-900 px-6 py-3 text-xs text-gray-600 flex justify-between">
        <span>MIRAI OS v3.0 | System Map</span>
        <span className="text-gray-700">[conexao estavel]</span>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-800 rounded-lg p-4 bg-dash-scrim/50">
      <div className="text-xs text-gray-500 mb-3 tracking-wider">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Line({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex justify-between text-xs py-0.5">
      <span className="text-gray-500">{label}</span>
      <span className={color}>{value}</span>
    </div>
  );
}

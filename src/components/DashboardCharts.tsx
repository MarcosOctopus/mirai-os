"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface StageData {
  id: number;
  channel_id: number;
  stage_order: number;
  stage_name: string;
  status: string;
  updated_at: string;
  video_count: number;
}

interface DashboardChartsProps {
  stages: StageData[];
  totalVideos: number;
}

const STAGE_ORDER = ["BUSCA", "THUMB", "MUSICA", "ANIMACAO", "VIDEO_PRONTO", "REVISAO", "POSTADO"];

const STAGE_COLORS: Record<string, string> = {
  BUSCA: "#06b6d4",
  THUMB: "#8b5cf6",
  MUSICA: "#f59e0b",
  ANIMACAO: "#ef4444",
  VIDEO_PRONTO: "#10b981",
  REVISAO: "#f97316",
  POSTADO: "#22c55e",
};

export function DashboardCharts({ stages, totalVideos }: DashboardChartsProps) {
  const chartData = STAGE_ORDER.map((name) => {
    const stage = stages.find((s) => s.stage_name === name);
    return {
      name: name.charAt(0) + name.slice(1).toLowerCase(),
      stage_name: name,
      videos: stage?.video_count ?? 0,
      fill: STAGE_COLORS[name] ?? "#06b6d4",
    };
  });

  return (
    <section className="rounded-3xl border border-cyan-300/15 bg-black/20 p-6">
      <h2 className="text-sm font-semibold uppercase tracking-[0.28em] text-cyan-50">
        Distribuição visual
      </h2>
      <div className="mt-6 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(10,239,255,0.08)" />
            <XAxis
              dataKey="name"
              tick={{ fill: "rgba(10,239,255,0.5)", fontSize: 11 }}
              axisLine={{ stroke: "rgba(10,239,255,0.1)" }}
            />
            <YAxis
              tick={{ fill: "rgba(10,239,255,0.5)", fontSize: 11 }}
              axisLine={{ stroke: "rgba(10,239,255,0.1)" }}
            />
            <Tooltip
              contentStyle={{
                background: "#06101c",
                border: "1px solid rgba(10,239,255,0.2)",
                borderRadius: "12px",
                color: "#e0f2fe",
              }}
              formatter={(value: number, name: string) => [`${value} vídeos`, ""]}
            />
            <Bar
              dataKey="videos"
              radius={[4, 4, 0, 0]}
              maxBarSize={48}
            >
              {chartData.map((entry, index) => (
                <rect key={index} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

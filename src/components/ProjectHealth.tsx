"use client";

/* ── Project Health — barras de progresso dos projetos ── */

interface Project {
  name: string;
  progress: number;
  color: string;
  status: "stable" | "warning" | "critical";
}

const PROJECTS: Project[] = [
  { name: "SPEACH", progress: 68, color: "#0aefff", status: "stable" },
  { name: "ATOMIC NEWS", progress: 34, color: "#ff6b35", status: "warning" },
  { name: "MIRAI OS", progress: 92, color: "#00ff87", status: "stable" },
  { name: "TIME DO FUTURO", progress: 55, color: "#b026ff", status: "warning" },
];

const STATUS_MAP = {
  stable: { dot: "#00ff87" },
  warning: { dot: "#ff6b35" },
  critical: { dot: "#ff2d78" },
};

export default function ProjectHealth({ projects }: { projects?: Project[] }) {
  const data = projects ?? PROJECTS;

  return (
    <div className="mirai-panel rounded-lg p-3 h-full" style={{ background: "rgba(4,5,16,0.7)", border: "1px solid rgba(0,255,135,0.1)" }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1.5 h-1.5 rounded-full dot-pulse" style={{ background: "#00ff87", boxShadow: "0 0 6px #00ff87", animationDelay: "1s" }} />
        <h3 className="text-[10px] font-semibold tracking-[0.2em] uppercase" style={{ color: "rgba(0,255,135,0.7)" }}>
          Project Health
        </h3>
      </div>
      <div className="space-y-3">
        {data.map((p, i) => (
          <div key={i}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: STATUS_MAP[p.status].dot, boxShadow: `0 0 4px ${STATUS_MAP[p.status].dot}` }}
                />
                <span className="text-[9px] tracking-wider uppercase opacity-60">{p.name}</span>
              </div>
              <span className="text-[9px] font-mono" style={{ color: p.color }}>{p.progress}%</span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <div
                className="h-full rounded-full progress-animate"
                style={{
                  width: `${p.progress}%`,
                  background: p.color,
                  boxShadow: `0 0 8px ${p.color}44`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

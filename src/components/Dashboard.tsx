import React from 'react';

interface SummaryCard {
  label: string;
  value: string;
  change?: string;
  trend?: 'up' | 'down';
}

interface ChartDataItem {
  label: string;
  value: number;
  color?: string;
}

interface TableData {
  headers: string[];
  rows: string[][];
}

export interface DashboardProps {
  title: string;
  summaryCards?: SummaryCard[];
  chartData?: ChartDataItem[];
  tableData?: TableData;
  insights?: string[];
}

/* ------------------------------------------------------------------ */
/*  Summary Cards Grid                                                */
/* ------------------------------------------------------------------ */

const SummaryCardsGrid: React.FC<{ cards: SummaryCard[] }> = ({ cards }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {cards.map((card, idx) => (
        <div
          key={idx}
          className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4 transition-all duration-200 hover:bg-gray-800/70 hover:border-gray-600/50"
        >
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            {card.label}
          </p>
          <p className="text-2xl font-bold text-gray-100 mt-1">{card.value}</p>
          {card.change && (
            <span
              className={`inline-flex items-center gap-1 mt-1 text-sm font-medium ${
                card.trend === 'up'
                  ? 'text-emerald-400'
                  : card.trend === 'down'
                  ? 'text-red-400'
                  : 'text-gray-400'
              }`}
            >
              {card.trend === 'up' && '↑'}
              {card.trend === 'down' && '↓'}
              {card.change}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  SVG Bar Chart                                                     */
/* ------------------------------------------------------------------ */

const BarChart: React.FC<{ data: ChartDataItem[] }> = ({ data }) => {
  const WIDTH = 400;
  const HEIGHT = 200;
  const PADDING = { top: 10, right: 10, bottom: 40, left: 10 };
  const chartW = WIDTH - PADDING.left - PADDING.right;
  const chartH = HEIGHT - PADDING.top - PADDING.bottom;

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const barGap = 4;
  const barWidth = Math.max(8, (chartW - barGap * (data.length - 1)) / data.length);
  const totalWidth = data.length * barWidth + (data.length - 1) * barGap;
  const offsetX = PADDING.left + (chartW - totalWidth) / 2;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full h-auto max-h-48"
      xmlns="http://www.w3.org/2000/svg"
    >
      {data.map((item, idx) => {
        const barH = (item.value / maxValue) * chartH;
        const x = offsetX + idx * (barWidth + barGap);
        const y = PADDING.top + chartH - barH;
        const fill = item.color || '#818cf8'; // indigo-400 default

        return (
          <g key={idx}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barH}
              rx={3}
              ry={3}
              fill={fill}
              className="transition-all duration-300 hover:opacity-80"
            />
            {/* Label */}
            <text
              x={x + barWidth / 2}
              y={HEIGHT - 4}
              textAnchor="end"
              transform={`rotate(-35, ${x + barWidth / 2}, ${HEIGHT - 4})`}
              className="fill-gray-400 text-[8px]"
              fontSize="8"
            >
              {item.label}
            </text>
            {/* Value badge on hover — show above bar */}
            <title>{item.label}: {item.value}</title>
          </g>
        );
      })}
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/*  HTML Table                                                        */
/* ------------------------------------------------------------------ */

const DataTable: React.FC<{ data: TableData }> = ({ data }) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left border-collapse">
        <thead>
          <tr className="border-b border-gray-700/50">
            {data.headers.map((header, idx) => (
              <th
                key={idx}
                className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wider"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, rowIdx) => (
            <tr
              key={rowIdx}
              className="border-b border-gray-700/30 transition-colors duration-150 hover:bg-gray-700/20"
            >
              {row.map((cell, cellIdx) => (
                <td key={cellIdx} className="px-4 py-3 text-gray-300 whitespace-nowrap">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Insights List                                                     */
/* ------------------------------------------------------------------ */

const InsightsList: React.FC<{ items: string[] }> = ({ items }) => {
  return (
    <ul className="space-y-2">
      {items.map((item, idx) => (
        <li key={idx} className="flex items-start gap-3">
          <span className="flex-shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-indigo-400" />
          <span className="text-sm text-gray-300 leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
};

/* ------------------------------------------------------------------ */
/*  Dashboard Component                                               */
/* ------------------------------------------------------------------ */

const Dashboard: React.FC<DashboardProps> = ({
  title,
  summaryCards,
  chartData,
  tableData,
  insights,
}) => {
  return (
    <div className="space-y-6">
      {/* Title */}
      <h2 className="text-xl font-bold text-gray-100">{title}</h2>

      {/* Summary Cards */}
      {summaryCards && summaryCards.length > 0 && (
        <SummaryCardsGrid cards={summaryCards} />
      )}

      {/* Chart */}
      {chartData && chartData.length > 0 && (
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Gráfico
          </h3>
          <BarChart data={chartData} />
        </div>
      )}

      {/* Table */}
      {tableData && tableData.headers.length > 0 && (
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Dados
          </h3>
          <DataTable data={tableData} />
        </div>
      )}

      {/* Insights */}
      {insights && insights.length > 0 && (
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Insights
          </h3>
          <InsightsList items={insights} />
        </div>
      )}
    </div>
  );
};

export default Dashboard;

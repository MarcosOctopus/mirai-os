import React from 'react';

export type CardType = 'backup' | 'task' | 'memory' | 'project' | 'dashboard' | 'risk';
export type CardStatus = 'success' | 'warning' | 'error' | 'info';

export interface SmartCardProps {
  type: CardType;
  title: string;
  description: string;
  status: CardStatus;
  timestamp?: number;
  actionLabel?: string;
}

const EMOJI_MAP: Record<CardType, string> = {
  backup: '📦',
  task: '✅',
  memory: '💾',
  project: '🚀',
  dashboard: '📊',
  risk: '⚠️',
};

const STATUS_STYLES: Record<CardStatus, string> = {
  success: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  warning: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  error: 'bg-red-500/20 text-red-400 border-red-500/30',
  info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
};

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffSec < 60) return 'agora há pouco';
  if (diffMin < 60) return `há ${diffMin} min`;
  if (diffHour < 24) return `há ${diffHour}h`;
  if (diffDay < 7) return `há ${diffDay}d`;
  if (diffWeek < 5) return `há ${diffWeek} sem`;
  if (diffMonth < 12) return `há ${diffMonth} meses`;
  return `há ${diffYear} anos`;
}

const SmartCard: React.FC<SmartCardProps> = ({
  type,
  title,
  description,
  status,
  timestamp,
  actionLabel,
}) => {
  return (
    <div className="group bg-gray-800/50 backdrop-blur-sm rounded-xl border border-gray-700/50 p-4 transition-all duration-200 hover:bg-gray-800/70 hover:border-gray-600/50 hover:shadow-lg hover:shadow-black/20 cursor-default">
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-lg bg-gray-700/40 text-2xl">
          {EMOJI_MAP[type]}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          <h3 className="font-bold text-gray-100 text-base truncate">{title}</h3>

          {/* Description */}
          <p className="text-sm text-gray-400 mt-1 leading-relaxed line-clamp-2">
            {description}
          </p>

          {/* Footer */}
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            {/* Status badge */}
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[status]}`}
            >
              {status === 'success' && '✓ '}
              {status === 'warning' && '⚠ '}
              {status === 'error' && '✗ '}
              {status === 'info' && 'ℹ '}
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>

            {/* Timestamp */}
            {timestamp !== undefined && (
              <span className="text-xs text-gray-500">
                {formatRelativeTime(timestamp)}
              </span>
            )}
          </div>
        </div>

        {/* Action button */}
        {actionLabel && (
          <button className="flex-shrink-0 px-3 py-1.5 text-sm font-medium text-gray-300 bg-gray-700/50 rounded-lg border border-gray-600/50 transition-all duration-200 hover:bg-indigo-600/30 hover:text-indigo-300 hover:border-indigo-500/40 active:scale-95">
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
};

export default SmartCard;

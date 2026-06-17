import Link from 'next/link';

interface StreamCardProps {
  title: string;
  views: number;
  channelName: string;
  thumbnailUrl?: string | null;
  channelId: number;
}

function formatViews(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(count % 1_000_000 === 0 ? 0 : 1)}M`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(count % 1_000 === 0 ? 0 : 1)}K`;
  }
  return String(count);
}

export default function StreamCard({
  title,
  views,
  channelName,
  thumbnailUrl,
  channelId,
}: StreamCardProps) {
  return (
    <Link
      href={`/?channel=${channelId}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '346px',
        height: '300px',
        backgroundColor: '#0D0C0F',
        borderRadius: '12px',
        overflow: 'hidden',
        textDecoration: 'none',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* Thumbnail area - top 195px */}
      <div
        style={{
          width: '100%',
          height: '195px',
          position: 'relative',
          backgroundColor: thumbnailUrl ? 'transparent' : '#D9D9D9',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={title}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ) : null}

        {/* Overlay */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(0,0,0,0.6) 100%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '10px 12px',
          }}
        >
          {/* Top: Live badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              alignSelf: 'flex-start',
              backgroundColor: '#F23529',
              color: '#FFFFFF',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 700,
              fontSize: '11px',
              lineHeight: '1',
              padding: '4px 8px',
              borderRadius: '4px',
              textTransform: 'uppercase',
              letterSpacing: '0.3px',
            }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
              <circle cx="4" cy="4" r="3" fill="currentColor" />
            </svg>
            Live
          </div>

          {/* Bottom: View count */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              alignSelf: 'flex-end',
              backgroundColor: 'rgba(0,0,0,0.65)',
              color: '#FFFFFF',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 500,
              fontSize: '12px',
              lineHeight: '1',
              padding: '4px 8px',
              borderRadius: '4px',
            }}
          >
            {/* Eye icon inline SVG */}
            <svg
              width="14"
              height="10"
              viewBox="0 0 16 11"
              fill="none"
              style={{ display: 'block' }}
            >
              <path
                d="M8 0C4.36364 0 1.25818 2.218 0 5.5C1.25818 8.782 4.36364 11 8 11C11.6364 11 14.7418 8.782 16 5.5C14.7418 2.218 11.6364 0 8 0ZM8 9.16667C5.97818 9.16667 4.36364 7.522 4.36364 5.5C4.36364 3.478 5.97818 1.83333 8 1.83333C10.0218 1.83333 11.6364 3.478 11.6364 5.5C11.6364 7.522 10.0218 9.16667 8 9.16667ZM8 3.3C6.78545 3.3 5.81818 4.284 5.81818 5.5C5.81818 6.716 6.78545 7.7 8 7.7C9.21455 7.7 10.1818 6.716 10.1818 5.5C10.1818 4.284 9.21455 3.3 8 3.3Z"
                fill="white"
              />
            </svg>
            {formatViews(views)}
          </div>
        </div>
      </div>

      {/* Bottom info area - from y=213 */}
      <div
        style={{
          flex: 1,
          padding: '16px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {/* Title */}
        <h3
          style={{
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            fontSize: '18px',
            lineHeight: '1.25',
            color: '#FFFFFF',
            margin: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </h3>

        {/* Streamer info */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          {/* Avatar circle */}
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: '#2A2A2A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              overflow: 'hidden',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              style={{ display: 'block', color: '#929292' }}
            >
              <path
                d="M8 8C10.2091 8 12 6.20914 12 4C12 1.79086 10.2091 0 8 0C5.79086 0 4 1.79086 4 4C4 6.20914 5.79086 8 8 8ZM8 10C4.68629 10 2 12.6863 2 16H14C14 12.6863 11.3137 10 8 10Z"
                fill="currentColor"
              />
            </svg>
          </div>

          {/* Channel name */}
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontWeight: 400,
              fontSize: '13px',
              lineHeight: '1',
              color: '#929292',
            }}
          >
            {channelName}
          </span>
        </div>
      </div>
    </Link>
  );
}

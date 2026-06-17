'use client';

interface Video {
  id: number;
  title: string;
  views: number;
  thumbnail_url: string | null;
  posted_at: string | null;
}

interface VideoFeedProps {
  videos: Video[];
}

function formatViews(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(count % 1_000_000 === 0 ? 0 : 1)}M views`;
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(count % 1_000 === 0 ? 0 : 1)}K views`;
  }
  return `${count} views`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

export default function VideoFeed({ videos }: VideoFeedProps) {
  return (
    <div
      style={{
        width: '100%',
        backgroundColor: '#131313',
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    >
      {videos.map((video, index) => (
        <div key={video.id}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: '14px',
              padding: '14px 16px',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            {/* Thumbnail */}
            <div
              style={{
                width: '120px',
                height: '68px',
                borderRadius: '8px',
                backgroundColor: video.thumbnail_url ? 'transparent' : '#2A2A2A',
                flexShrink: 0,
                overflow: 'hidden',
              }}
            >
              {video.thumbnail_url ? (
                <img
                  src={video.thumbnail_url}
                  alt={video.title}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                    borderRadius: '8px',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#2A2A2A',
                    borderRadius: '8px',
                  }}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    style={{ color: '#555' }}
                  >
                    <path
                      d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM10 16.5V7.5L17 12L10 16.5Z"
                      fill="currentColor"
                    />
                  </svg>
                </div>
              )}
            </div>

            {/* Info */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                minWidth: 0,
              }}
            >
              {/* Title */}
              <h4
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 600,
                  fontSize: '14px',
                  lineHeight: '1.3',
                  color: '#FFFFFF',
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {video.title}
              </h4>

              {/* Views + date */}
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontWeight: 400,
                  fontSize: '12px',
                  lineHeight: '1.4',
                  color: '#929292',
                  margin: 0,
                }}
              >
                {formatViews(video.views)}
                {video.posted_at ? ` · ${formatDate(video.posted_at)}` : ''}
              </p>
            </div>
          </div>

          {/* Divider — not after the last item */}
          {index < videos.length - 1 && (
            <div
              style={{
                height: '1px',
                backgroundColor: 'rgba(255,255,255,0.06)',
                marginLeft: '16px',
                marginRight: '16px',
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}

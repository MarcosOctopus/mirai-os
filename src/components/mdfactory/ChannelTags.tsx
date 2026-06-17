import Link from 'next/link';

interface ChannelTag {
  id: number;
  name: string;
  slug: string;
}

interface ChannelTagsProps {
  channels: ChannelTag[];
  selectedChannelId?: number;
}

export default function ChannelTags({ channels, selectedChannelId }: ChannelTagsProps) {
  return (
    <nav
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: '10px',
        overflowX: 'auto',
        whiteSpace: 'nowrap',
        scrollBehavior: 'smooth',
        paddingBottom: '4px',
        maxWidth: '100%',
      }}
    >
      {channels.map((channel) => {
        const isSelected = channel.id === selectedChannelId;

        return (
          <Link
            key={channel.id}
            href={`/?channel=${channel.id}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 600,
              fontSize: '14px',
              lineHeight: '1',
              color: '#FFFFFF',
              textDecoration: 'none',
              padding: '10px 20px',
              borderRadius: '9999px',
              backgroundColor: isSelected ? '#F23529' : '#19171C',
              border: isSelected ? 'none' : '1px solid rgba(255,255,255,0.08)',
              transition: 'background-color 0.2s ease, border-color 0.2s ease',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {channel.name}
          </Link>
        );
      })}
    </nav>
  );
}

'use client';

import Link from 'next/link';

interface BannerHeroProps {
  title: string;
  description: string;
}

export default function BannerHero({ title, description }: BannerHeroProps) {
  return (
    <section
      style={{
        backgroundColor: '#19171C',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '16px',
        padding: '48px 40px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        maxWidth: '100%',
      }}
    >
      <h2
        style={{
          fontFamily: "'Inter', sans-serif",
          fontWeight: 600,
          fontSize: '44px',
          lineHeight: '1.15',
          color: '#FFFFFF',
          margin: 0,
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          textOverflow: 'ellipsis',
        }}
      >
        {title}
      </h2>

      <p
        style={{
          fontFamily: "'Inter', sans-serif",
          fontWeight: 400,
          fontSize: '12px',
          lineHeight: '1.5',
          color: '#C2C2C2',
          margin: 0,
          maxWidth: '600px',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          textOverflow: 'ellipsis',
        }}
      >
        {description}
      </p>

      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '20px',
          marginTop: '12px',
        }}
      >
        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '12px 32px',
            borderRadius: '8px',
            backgroundColor: '#F23529',
            color: '#FFFFFF',
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            fontSize: '14px',
            lineHeight: '1',
            textDecoration: 'none',
            border: 'none',
            cursor: 'pointer',
            transition: 'background-color 0.2s ease',
          }}
        >
          Play Now
        </Link>

        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '12px 32px',
            borderRadius: '8px',
            backgroundColor: '#19171C',
            color: '#FFFFFF',
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            fontSize: '14px',
            lineHeight: '1',
            textDecoration: 'none',
            border: '1px solid rgba(255,255,255,0.15)',
            cursor: 'pointer',
            transition: 'border-color 0.2s ease, background-color 0.2s ease',
          }}
        >
          Play Demo
        </Link>
      </div>
    </section>
  );
}

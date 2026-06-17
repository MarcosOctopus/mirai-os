'use client';

interface TopBarProps {
  onSearch?: (query: string) => void;
}

export default function TopBar({ onSearch }: TopBarProps) {
  return (
    <header
      className="flex items-center gap-4 shrink-0"
      style={{
        height: '101px',
        padding: '0 36px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        backgroundColor: '#131313',
      }}
    >
      {/* Search */}
      <div
        className="flex items-center gap-2 flex-1 rounded-lg px-4"
        style={{
          backgroundColor: '#0D0C0F',
          border: '1px solid rgba(255,255,255,0.08)',
          height: '44px',
          maxWidth: '480px',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="7.5" cy="7.5" r="5.75" stroke="#616775" strokeWidth="1.5" fill="none" />
          <path d="M12 12L16 16" stroke="#616775" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </svg>
        <input
          type="text"
          placeholder="Search.."
          onChange={(e) => onSearch?.(e.target.value)}
          className="bg-transparent border-none outline-none text-sm w-full"
          style={{
            fontFamily: "'Inter', sans-serif",
            color: '#FFFFFF',
          }}
        />
      </div>

      <div className="flex-1" />

      {/* Message Icon */}
      <button className="flex items-center justify-center w-10 h-10 rounded-lg transition-colors hover:bg-white/5" style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M19 15.1667C19 15.6087 18.8244 16.0326 18.5118 16.3452C18.1993 16.6577 17.7754 16.8333 17.3333 16.8333H6L3 19.8333V4.66667C3 4.22464 3.17559 3.80072 3.48816 3.48816C3.80072 3.17559 4.22464 3 4.66667 3H17.3333C17.7754 3 18.1993 3.17559 18.5118 3.48816C18.8244 3.80072 19 4.22464 19 4.66667V15.1667Z" stroke="#929292" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </button>

      {/* Notification Bell */}
      <div className="relative flex items-center justify-center w-10 h-10 rounded-lg transition-colors hover:bg-white/5" style={{ cursor: 'pointer' }}>
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M16.5 7.33333C16.5 5.787 15.8854 4.30197 14.7917 3.20821C13.698 2.11444 12.2129 1.5 10.6667 1.5C9.12038 1.5 7.63572 2.11444 6.54153 3.20821C5.44734 4.30197 4.83337 5.787 4.83337 7.33333C4.83337 10.25 3.9825 12.1667 2.83337 13.6667H18.5C17.3509 12.1667 16.5 10.25 16.5 7.33333Z" stroke="#929292" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M9.33337 17.5C9.50849 17.7578 9.74838 17.9645 10.0287 18.0997C10.3091 18.2349 10.6201 18.2939 10.93 18.2709C11.24 18.2479 11.5376 18.1438 11.7924 17.9697C12.0472 17.7957 12.2493 17.5578 12.381 17.2792" stroke="#929292" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
        {/* Red dot */}
        <span
          className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
          style={{ backgroundColor: '#F23529' }}
        />
      </div>

      {/* Avatar */}
      <div
        className="flex items-center justify-center w-10 h-10 rounded-full font-semibold text-sm uppercase select-none"
        style={{
          backgroundColor: '#19171C',
          color: '#C2C2C2',
          border: '2px solid rgba(255,255,255,0.1)',
        }}
      >
        M
      </div>
    </header>
  );
}

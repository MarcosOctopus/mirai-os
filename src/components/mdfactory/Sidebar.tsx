import Link from 'next/link';

interface Channel {
  id: number;
  name: string;
  slug: string;
}

interface SidebarProps {
  channels: Channel[];
  activeHref?: string;
}

// --- Inline SVG Icons ---

function DashboardIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="7.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <rect x="11.5" y="1" width="7.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <rect x="1" y="11.5" width="7.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <rect x="11.5" y="11.5" width="7.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
    </svg>
  );
}

function StreamIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 2L16 10L4 18V2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M10 1.5V4M10 16V18.5M18.5 10H16M4 10H1.5M16.01 3.99L14.24 5.76M5.76 14.24L3.99 16.01M16.01 16.01L14.24 14.24M5.76 5.76L3.99 3.99" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function HeartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 17C10 17 3 12.5 3 7.5C3 5.5 4.5 4 6.5 4C8 4 9.25 5 10 6.5C10.75 5 12 4 13.5 4C15.5 4 17 5.5 17 7.5C17 12.5 10 17 10 17Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 1.5L12.45 7.1L18.5 7.72L13.9 12.02L15.3 18L10 14.9L4.7 18L6.1 12.02L1.5 7.72L7.55 7.1L10 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7.5 17.5H4.16667C3.72464 17.5 3.30072 17.3244 2.98816 17.0118C2.67559 16.6993 2.5 16.2754 2.5 15.8333V4.16667C2.5 3.72464 2.67559 3.30072 2.98816 2.98816C3.30072 2.67559 3.72464 2.5 4.16667 2.5H7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M13.3333 14.1667L17.5 10L13.3333 5.83333" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M17.5 10H7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function getInitial(name: string): string {
  return name.charAt(0).toUpperCase();
}

// --- Reusable nav item ---

interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
}

function NavItem({ href, icon, label, isActive }: NavItemProps) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-5 py-2.5 rounded-lg text-sm font-[450] leading-none no-underline transition-colors duration-150"
      style={{
        color: isActive ? '#FFFFFF' : '#929292',
        backgroundColor: isActive ? '#F23529' : 'transparent',
      }}
    >
      <span className="shrink-0 flex items-center justify-center w-5 h-5">
        {icon}
      </span>
      <span>{label}</span>
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="block px-5 text-xs font-semibold tracking-[0.08em] leading-none uppercase"
      style={{ color: '#616775' }}
    >
      {children}
    </span>
  );
}

// --- Main Sidebar ---

export default function Sidebar({ channels, activeHref }: SidebarProps) {
  return (
    <aside
      className="flex flex-col h-full shrink-0 overflow-y-auto"
      style={{
        width: '292px',
        backgroundColor: '#0D0C0F',
      }}
    >
      {/* ── Logo ── */}
      <div className="flex items-center px-5 pt-8 pb-7">
        <span
          className="text-2xl font-semibold leading-none tracking-tight"
          style={{
            fontFamily: "'Inter', sans-serif",
            color: '#FFFFFF',
          }}
        >
          MDFactory
        </span>
      </div>

      {/* ── General Section ── */}
      <div className="flex flex-col gap-1.5 px-3 pb-6">
        <SectionLabel>General</SectionLabel>

        <NavItem
          href="/"
          icon={<DashboardIcon />}
          label="Dashboard"
          isActive={activeHref === "/"}
        />
        <NavItem
          href="/canais"
          icon={<StreamIcon />}
          label="Meus Vídeos"
          isActive={activeHref === "/canais"}
        />
        <NavItem
          href="/system"
          icon={<SettingsIcon />}
          label="Settings"
        />
        <NavItem
          href="#"
          icon={<HeartIcon />}
          label="Subscriptions"
        />
        <NavItem
          href="#"
          icon={<StarIcon />}
          label="Favorite"
        />
      </div>

      {/* ── Subscriptions Section ── */}
      <div className="flex flex-col gap-1.5 px-3 pb-6">
        <SectionLabel>Subscription</SectionLabel>

        {channels.map((channel) => (
          <Link
            key={channel.id}
            href={`/?channel=${channel.slug}`}
            className="flex items-center gap-3 px-5 py-2 rounded-lg text-sm font-[450] leading-none no-underline transition-colors duration-150 hover:text-white"
            style={{ color: '#929292' }}
          >
            <span
              className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold uppercase select-none"
              style={{
                backgroundColor: '#19171C',
                color: '#C2C2C2',
              }}
            >
              {getInitial(channel.name)}
            </span>
            <span className="truncate">{channel.name}</span>
          </Link>
        ))}
      </div>

      {/* ── Spacer ── */}
      <div className="flex-1 min-h-0" />

      {/* ── Logout ── */}
      <div className="px-3 pb-6">
        <Link
          href="#"
          className="flex items-center gap-3 px-5 py-2.5 rounded-lg text-sm font-[450] leading-none no-underline transition-colors duration-150 hover:opacity-80"
          style={{ color: '#F23529' }}
        >
          <span className="shrink-0 flex items-center justify-center w-5 h-5">
            <LogoutIcon />
          </span>
          <span>Logout</span>
        </Link>
      </div>
    </aside>
  );
}

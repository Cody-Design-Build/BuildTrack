import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  House, Wrench, SquareCheck, Calendar, MessageCircle, FileText, Users, Truck, Book, Folder, ChartPie,
  Settings, LifeBuoy, Store, LogOut, PanelLeftClose, PanelLeftOpen, ReceiptText, Bell, MessageCircleQuestion,
  Search, Ellipsis, Menu, X,
} from 'lucide-react';
import { useStore } from '../store';

export const NAV = [
  { to: '/', label: 'Home', icon: House },
  { to: '/jobs', label: 'Jobs', icon: Wrench },
  { to: '/to-dos', label: 'To-Dos', icon: SquareCheck },
  { to: '/schedule', label: 'Schedule', icon: Calendar },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/vendors', label: 'Vendors', icon: Truck },
  { to: '/catalog', label: 'Catalog', icon: Book },
  { to: '/files', label: 'Files', icon: Folder },
  { to: '/reports', label: 'Reports', icon: ChartPie },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const LOWER = [
  { to: '/help', label: 'Help Desk', icon: LifeBuoy },
  { to: '/marketplace', label: 'Marketplace', icon: Store },
];

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="BuildTrack home">
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="0" y="0" width="13" height="6" rx="1.5" fill="#ff5600" />
        <rect x="0" y="9" width="6" height="23" rx="1.5" fill="#ff5600" />
        <rect x="9" y="9" width="23" height="6" rx="1.5" fill="#ff5600" />
        <rect x="16" y="0" width="16" height="6" rx="1.5" fill="#ff5600" />
        <rect x="17.5" y="18" width="6" height="14" rx="1.5" fill="#ff5600" />
        <rect x="9" y="18" width="5.5" height="14" rx="1.5" fill="#ff5600" />
      </svg>
      <span className="wordmark">
        <span className="wm-light">BUILD</span>
        <span className="wm-bold">TRACK</span>
      </span>
    </Link>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { db } = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const unread = db.messages.filter((m) => !m.read).length + db.todos.filter((t) => !t.done).length;
  return (
    <header className="topbar">
      <Logo />
      <form
        className="global-search"
        onSubmit={(e) => {
          e.preventDefault();
          nav(`/jobs?q=${encodeURIComponent(q)}`);
        }}
      >
        <Search size={20} className="gs-icon" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${db.companyName}`} aria-label="Search" />
      </form>
      <div className="top-icons">
        <button type="button" className="top-icon top-menu" aria-label="Open menu" title="Menu" onClick={onMenu}>
          <Menu size={26} strokeWidth={1.5} />
        </button>
        <Link to="/documents" className="top-icon" aria-label="Documents">
          <ReceiptText size={30} strokeWidth={1.5} />
        </Link>
        <Link to="/messages" className="top-icon" aria-label="Notifications">
          <Bell size={30} strokeWidth={1.5} />
          {unread > 0 && <span className="badge">{unread}</span>}
        </Link>
        <Link to="/help" className="top-icon" aria-label="Help">
          <MessageCircleQuestion size={30} strokeWidth={1.5} />
          <svg className="sparkle" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 0c.6 4.2 1.8 5.4 6 6-4.2.6-5.4 1.8-6 6-.6-4.2-1.8-5.4-6-6 4.2-.6 5.4-1.8 6-6z" fill="#ad46ff" />
          </svg>
        </Link>
      </div>
    </header>
  );
}

function Sidebar({ collapsed, onCollapse }: { collapsed: boolean; onCollapse: () => void }) {
  const { db } = useStore();
  const me = db.team[0];
  return (
    <nav className={'sidebar' + (collapsed ? ' collapsed' : '')} aria-label="Main">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} end={to === '/'} className="side-link" title={label}>
          <Icon size={20} strokeWidth={1.75} />
          <span>{label}</span>
        </NavLink>
      ))}
      <div className="side-gap" />
      <NavLink to="/profile" className="side-link profile" title="Profile">
        <span className="me-avatar" style={{ background: me?.color }}>{me?.initials}</span>
        <span>Profile</span>
      </NavLink>
      {LOWER.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} className="side-link" title={label}>
          <Icon size={20} strokeWidth={1.75} />
          <span>{label}</span>
        </NavLink>
      ))}
      <button className="side-link" type="button" title="Sign Out" onClick={() => alert('Signed out (demo).')}>
        <LogOut size={20} strokeWidth={1.75} />
        <span>Sign Out</span>
      </button>
      <button className="side-link" type="button" title="Collapse" onClick={onCollapse}>
        {collapsed ? <PanelLeftOpen size={20} strokeWidth={1.75} /> : <PanelLeftClose size={20} strokeWidth={1.75} />}
        <span>Collapse</span>
      </button>
    </nav>
  );
}

function BottomTabs() {
  const [more, setMore] = useState(false);
  const loc = useLocation();
  useEffect(() => setMore(false), [loc.pathname]);
  return (
    <>
      {more && (
        <div className="more-sheet" role="menu">
          {NAV.slice(5).concat(LOWER).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className="more-link">
              <Icon size={20} strokeWidth={1.75} /> {label}
            </NavLink>
          ))}
        </div>
      )}
      <nav className="bottom-tabs" aria-label="Main (phone)">
        {NAV.slice(0, 5).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className="tab">
            <Icon size={20} strokeWidth={1.5} />
            <span>{label}</span>
          </NavLink>
        ))}
        <button type="button" className={'tab' + (more ? ' active' : '')} onClick={() => setMore((m) => !m)}>
          <Ellipsis size={20} strokeWidth={1.5} />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [loc.pathname]);
  const isHome = loc.pathname === '/';
  return (
    <div className={'shell' + (isHome ? ' is-home' : ' is-app') + (collapsed ? ' side-collapsed' : '') + (drawer ? ' drawer-open' : '')}>
      <TopBar onMenu={() => setDrawer((d) => !d)} />
      {drawer && <div className="drawer-backdrop" onClick={() => setDrawer(false)} />}
      <Sidebar collapsed={collapsed} onCollapse={() => setCollapsed((c) => !c)} />
      <main className="main">{children}</main>
      <BottomTabs />
    </div>
  );
}

/** Page title block with company breadcrumb and action buttons (which fold into a menu on phones). */
export function PageHeader({ crumb, title, actions, home }: { crumb?: string; title: string; actions?: ReactNode; home?: boolean }) {
  const { db } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);
  return (
    <div className={'page-header' + (home ? ' home-header' : '')}>
      <div className="ph-text">
        <div className="crumb">{crumb ?? `${db.companyName} - Lic# 1118207`}</div>
        <h1 className="ph-title">{title}</h1>
      </div>
      {actions && (
        <div className="ph-actions" ref={ref}>
          <div className="btn-group ph-actions-wide">{actions}</div>
          <button type="button" className="btn ph-menu" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
            {open ? <X size={14} /> : <Menu size={14} />}
          </button>
          {open && (
            <div className="ph-dropdown" onClick={() => setOpen(false)}>
              {actions}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-label={title}>
        <div className="modal-head">
          <span>{title}</span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Avatar({ text, color, size = 24 }: { text: string; color: string; size?: number }) {
  return (
    <span className="avatar" style={{ background: color, width: size, height: size, fontSize: Math.round(text.length > 2 ? size * 0.26 : size * 0.6) }}>
      {text}
    </span>
  );
}

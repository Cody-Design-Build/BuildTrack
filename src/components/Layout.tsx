import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  House, Wrench, SquareCheck, Calendar, FileText, Users, Building2, Book, Folder, ChartPie,
  Settings, LogOut, PanelLeftClose, PanelLeftOpen, ReceiptText, Bell,
  Search, Ellipsis, Menu, ChevronsUpDown, User, type LucideIcon,
} from 'lucide-react';
import { useStore } from '../store';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Work',
    items: [
      { to: '/', label: 'Home', icon: House },
      { to: '/jobs', label: 'Jobs', icon: Wrench },
      { to: '/to-dos', label: 'To-Dos', icon: SquareCheck },
      { to: '/schedule', label: 'Schedule', icon: Calendar },
    ],
  },
  {
    label: 'Records',
    items: [
      { to: '/documents', label: 'Documents', icon: FileText },
      { to: '/people', label: 'People', icon: Users },
      { to: '/accounts', label: 'Accounts', icon: Building2 },
      { to: '/catalog', label: 'Catalog', icon: Book },
      { to: '/files', label: 'Files', icon: Folder },
    ],
  },
  {
    label: 'Insights',
    items: [{ to: '/reports', label: 'Reports', icon: ChartPie }],
  },
];

const LOWER: NavItem[] = [{ to: '/settings', label: 'Settings', icon: Settings }];

export const NAV: NavItem[] = [...GROUPS.flatMap((g) => g.items), ...LOWER];

export function Logo() {
  return (
    <Link
      to="/"
      className="rounded-md text-lg font-semibold leading-none tracking-[-0.02em] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label="BuildTrack home"
    >
      BuildTrack
    </Link>
  );
}

function SideLink({ item, collapsed, end }: { item: NavItem; collapsed: boolean; end?: boolean }) {
  const { to, label, icon: Icon } = item;
  const link = (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'group flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium text-sidebar-foreground outline-none transition-colors',
          'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
          isActive && 'bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary',
          collapsed && 'justify-center px-0',
        )
      }
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={1.9} />
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { db } = useStore();
  const me = db.team[0];
  const nav = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring',
            collapsed && 'justify-center',
          )}
        >
          <Avatar text={me?.initials ?? '?'} color={me?.color ?? '#71717a'} size={32} square />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-foreground">{me?.name ?? 'You'}</span>
                <span className="block truncate text-xs text-muted-foreground">{db.companyName}</span>
              </span>
              <ChevronsUpDown className="size-4 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={collapsed ? 'right' : 'top'} align="start" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-semibold">{me?.name}</div>
          <div className="text-xs text-muted-foreground">{db.companyName}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => nav('/profile')}>
          <User /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => nav('/settings')}>
          <Settings /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => alert('Signed out (demo).')}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarBody({ collapsed, onCollapse }: { collapsed: boolean; onCollapse?: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-14 shrink-0 items-center border-b border-sidebar-border px-4', collapsed && 'justify-center px-0')}>
        {!collapsed && <Logo />}
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3">
        {GROUPS.map((g) => (
          <div key={g.label} className="mb-4">
            {collapsed ? (
              <div className="mx-auto mb-2 h-px w-6 bg-sidebar-border first:hidden" />
            ) : (
              <div className="mb-1 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">{g.label}</div>
            )}
            <div className="flex flex-col gap-0.5">
              {g.items.map((item) => (
                <SideLink key={item.to} item={item} collapsed={collapsed} end={item.to === '/'} />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="flex shrink-0 flex-col gap-0.5 border-t border-sidebar-border px-3 py-3">
        {LOWER.map((item) => (
          <SideLink key={item.to} item={item} collapsed={collapsed} />
        ))}
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className={cn(
              'flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring',
              collapsed && 'justify-center px-0',
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen className="size-[18px]" /> : <PanelLeftClose className="size-[18px]" />}
            {!collapsed && <span>Collapse</span>}
          </button>
        )}
        <div className="mt-2">
          <UserMenu collapsed={collapsed} />
        </div>
      </div>
    </div>
  );
}

function IconLink({ to, label, children, badge }: { to: string; label: string; children: ReactNode; badge?: number }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" asChild className="relative text-muted-foreground hover:text-foreground">
          <Link to={to} aria-label={label}>
            {children}
            {!!badge && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground ring-2 ring-background">
                {badge}
              </span>
            )}
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { db } = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const openTodos = db.todos.filter((t) => !t.done && t.assignees.includes(db.team[0]?.id)).length;

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/70 sm:px-4">
      <Button variant="ghost" size="icon" className="hidden sm:inline-flex lg:hidden" aria-label="Open menu" onClick={onMenu}>
        <Menu />
      </Button>
      <form
        className="relative flex-1 max-w-xl"
        onSubmit={(e) => {
          e.preventDefault();
          nav(`/jobs?q=${encodeURIComponent(q)}`);
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={`Search ${db.companyName}…`}
          aria-label="Search"
          className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-14 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:inline-flex">
          ⌘K
        </kbd>
      </form>
      <div className="ml-auto flex items-center gap-0.5">
        <IconLink to="/documents" label="Documents">
          <ReceiptText className="size-5" />
        </IconLink>
        <IconLink to="/to-dos" label={`My to-dos (${openTodos} open)`} badge={openTodos}>
          <Bell className="size-5" />
        </IconLink>
      </div>
    </header>
  );
}

function BottomTabs() {
  const [more, setMore] = useState(false);
  const loc = useLocation();
  useEffect(() => setMore(false), [loc.pathname]);
  const primary = NAV.slice(0, 4);
  const rest = NAV.slice(4).concat([{ to: '/profile', label: 'Profile', icon: User }]);
  const tab = 'flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors';
  return (
    <>
      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[calc(var(--tabs-h)+12px)]">
          <SheetTitle className="px-5 pt-5 text-base">More</SheetTitle>
          <div className="grid grid-cols-2 gap-1 px-3 pb-2">
            {rest.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn('flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium', isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted')
                }
              >
                <Icon className="size-[18px]" /> {label}
              </NavLink>
            ))}
          </div>
        </SheetContent>
      </Sheet>
      <nav
        className="fixed inset-x-0 bottom-0 z-[60] flex h-[var(--tabs-h)] border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
        aria-label="Main (phone)"
      >
        {primary.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => cn(tab, isActive && !more && 'text-primary')}>
            <Icon className="size-5" strokeWidth={1.8} />
            <span>{label}</span>
          </NavLink>
        ))}
        <button type="button" className={cn(tab, more && 'text-primary')} onClick={() => setMore((m) => !m)}>
          <Ellipsis className="size-5" strokeWidth={1.8} />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}

function readCollapsed() {
  try {
    return localStorage.getItem('bt-sidebar-collapsed') === '1';
  } catch {
    return false;
  }
}

export function Shell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawer, setDrawer] = useState(false);
  useEffect(() => setDrawer(false), [loc.pathname]);
  useEffect(() => {
    try {
      localStorage.setItem('bt-sidebar-collapsed', collapsed ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  }, [collapsed]);

  return (
    <div className="min-h-svh bg-background">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:block',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <SidebarBody collapsed={collapsed} onCollapse={() => setCollapsed((c) => !c)} />
      </aside>
      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" className="w-64 bg-sidebar p-0 [&>button]:hidden">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarBody collapsed={false} />
        </SheetContent>
      </Sheet>
      <div className={cn('flex min-h-svh flex-col transition-[padding] duration-200', collapsed ? 'lg:pl-16' : 'lg:pl-60')}>
        <TopBar onMenu={() => setDrawer(true)} />
        <main className="main flex-1 pb-[var(--tabs-h)] sm:pb-0">{children}</main>
      </div>
      <BottomTabs />
    </div>
  );
}

/** Page title block with breadcrumb and action buttons (which fold into a menu on phones). */
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
    <div className={cn('page-header', home && 'home-header')}>
      <div className="ph-text">
        <div className="crumb">{crumb ?? db.companyName}</div>
        <h1 className="ph-title">{title}</h1>
      </div>
      {actions && (
        <div className="ph-actions" ref={ref}>
          <div className="btn-group ph-actions-wide">{actions}</div>
          <Button variant="outline" size="icon" className="ph-menu sm:hidden" aria-label="Menu" onClick={() => setOpen((o) => !o)}>
            <Ellipsis />
          </Button>
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
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn('max-h-[calc(100svh-2rem)] gap-0 overflow-y-auto p-0 [&>button:last-child]:z-20', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <DialogHeader className="sticky top-0 z-10 border-b bg-background/95 px-6 py-4 backdrop-blur">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 px-6 py-5">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export function Avatar({ text, color, size = 24, square }: { text: string; color: string; size?: number; square?: boolean }) {
  return (
    <span
      className={cn('avatar', square && '!rounded-md')}
      style={{ background: color, width: size, height: size, fontSize: Math.round(text.length > 2 ? size * 0.3 : size * 0.4) }}
    >
      {text}
    </span>
  );
}

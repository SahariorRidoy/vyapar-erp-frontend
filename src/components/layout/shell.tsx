'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Popover from '@radix-ui/react-popover';
import { Bell, Building2, CheckCheck, ChevronDown, ClipboardList, LogOut, Menu, Plus, Search, ShieldCheck, UserCircle2, X } from 'lucide-react';
import { api, fileUrl } from '@/lib/api';
import { cn, fmtDateTime } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { useSession } from '@/providers/session';
import { useResetOn } from '@/hooks/use-reset-on';
import { Avatar } from '@/components/ui/misc';
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { activeNavHref, useNav, useQuickCreate } from './nav';
import { CommandPalette, useCommandShortcut } from './command-palette';

interface NotificationRow {
  _id: string;
  title: string;
  message?: string;
  link?: string;
  read: boolean;
  type: string;
  createdAt: string;
}

function Sidebar({ onNavigate, approvals, emails }: { onNavigate?: () => void; approvals: number; emails: number }) {
  const { company, can, href } = useCompany();
  const { session } = useSession();
  const pathname = usePathname();
  const nav = useNav();
  const allowed = (perm?: string[]) => !perm || can(...perm);
  // The group that holds the current page opens by itself; the others keep what the user chose.
  const active = activeNavHref(nav, pathname, href);
  const current = nav.find((g) => g.children?.some((c) => c.href === active))?.label;
  const [open, setOpen] = useState<Record<string, boolean>>(() => (current ? { [current]: true } : {}));
  useResetOn(current, () => current && setOpen((o) => ({ ...o, [current]: true })));

  return (
    <aside className="flex h-full w-64 flex-col bg-slate-900 text-slate-300">
      <div className="flex h-14 items-center gap-2.5 border-b border-white/5 px-4">
        {company?.logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated file served by the API
          <img src={fileUrl(company.logo)} alt="" className="h-8 w-8 shrink-0 rounded-lg bg-white object-contain p-0.5" />
        ) : (
          <span className="shrink-0 bg-linear-to-r from-sky-400 to-blue-500 bg-clip-text pr-0.5 text-lg font-black tracking-tighter text-transparent italic">STC</span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{company?.name ?? '…'}</p>
          <p className="truncate text-[11px] text-slate-400">{session?.user.isSuperAdmin ? 'Super admin' : (session?.user.role?.name ?? '')}</p>
        </div>
      </div>
      <nav className="scroll-thin flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {nav.map((g) => {
          if (g.children) {
            const kids = g.children.filter((c) => c.show !== false && allowed(c.perm));
            if (!kids.length) return null;
            const isOpen = open[g.label];
            const holdsPage = g.label === current;
            return (
              <div key={g.label}>
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [g.label]: !o[g.label] }))}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-white/5 hover:text-white', holdsPage && 'text-white')}
                >
                  {g.icon}
                  <span className="flex-1 text-left">{g.label}</span>
                  <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
                </button>
                {isOpen && (
                  <div className="mt-0.5 mb-1 ml-5 space-y-0.5 border-l border-white/10 pl-3">
                    {kids.map((c) => {
                      const on = c.href === active;
                      return (
                        <Link key={c.href} href={href(c.href)} onClick={onNavigate} aria-current={on ? 'page' : undefined} className={cn('block rounded-md px-3 py-1.5 text-[13px] transition hover:text-white', on ? 'bg-blue-600/90 font-medium text-white' : 'text-slate-400 hover:bg-white/5')}>
                          {c.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }
          if (!allowed(g.perm)) return null;
          // A page listed in a group (Items ▸ Import is under Utilities) highlights only that entry
          const on = g.href === active;
          const badge = g.label === 'Approvals' ? approvals : g.label === 'Email' ? emails : 0;
          return (
            <Link key={g.label} href={href(g.href!)} onClick={onNavigate} aria-current={on ? 'page' : undefined} className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition', on ? 'bg-blue-600 text-white shadow-sm' : 'hover:bg-white/5 hover:text-white')}>
              {g.icon}
              <span className="flex-1">{g.label}</span>
              {badge > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold text-white">{badge}</span>}
            </Link>
          );
        })}
      </nav>
      <Link href="/companies" className="m-2 flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5 hover:text-white">
        <Building2 className="h-4 w-4" /> {session?.user.isSuperAdmin ? 'All companies' : 'Switch company'}
      </Link>
    </aside>
  );
}

function NotificationBell({ unread, onOpenChange }: { unread: number; onOpenChange?: () => void }) {
  const { cid, href } = useCompany();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const list = useQuery({
    queryKey: [cid, 'notifications', 'bell'],
    queryFn: async () => (await api.get<NotificationRow[]>('/system/notifications', { limit: 12 })).data,
    enabled: open,
  });
  const readAll = useMutation({
    mutationFn: () => api.post('/system/notifications/read', {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [cid, 'notifications'] });
      onOpenChange?.();
    },
  });
  const go = async (n: NotificationRow) => {
    setOpen(false);
    if (!n.read) await api.post('/system/notifications/read', { ids: [n._id] }).catch(() => undefined);
    qc.invalidateQueries({ queryKey: [cid, 'notifications'] });
    if (n.link) router.push(href(n.link));
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 && <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">{unread > 99 ? '99+' : unread}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-50 w-[360px] max-w-[94vw] rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            <button onClick={() => readAll.mutate()} className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline">
              <CheckCheck className="h-3.5 w-3.5" /> Mark all read
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {list.data?.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">You are all caught up</p>}
            {list.data?.map((n) => (
              <button key={n._id} onClick={() => go(n)} className={cn('flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50', !n.read && 'bg-blue-50/50')}>
                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-blue-500')} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-800">{n.title}</span>
                  {n.message && <span className="block text-xs text-slate-500">{n.message}</span>}
                  <span className="mt-0.5 block text-[11px] text-slate-400">{fmtDateTime(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
          <Link href={href('/notifications')} onClick={() => setOpen(false)} className="block border-t border-slate-100 px-4 py-2.5 text-center text-xs font-medium text-blue-600 hover:bg-slate-50">
            View all notifications
          </Link>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Topbar({ onMenu, onSearch, unread, approvals, refetchCounts }: { onMenu: () => void; onSearch: () => void; unread: number; approvals: number; refetchCounts: () => void }) {
  const { session, logout } = useSession();
  const { href, company } = useCompany();
  const router = useRouter();
  const quick = useQuickCreate();
  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/90 px-3 backdrop-blur sm:px-5">
      <button onClick={onMenu} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <Link href="/companies" className="inline-flex max-w-full items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100">
          <Building2 className="h-4 w-4 text-blue-600" />
          <span className="truncate">{company?.name}</span>
          <span className="hidden text-xs text-slate-400 sm:inline">· switch company</span>
        </Link>
      </div>
      <button
        type="button"
        onClick={onSearch}
        className="flex h-9 items-center gap-2 rounded-lg p-2 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800 md:w-72 md:border md:border-slate-200 md:bg-slate-50 md:px-3 md:hover:bg-white"
        aria-label="Search (Ctrl + K)"
        title="Search (Ctrl + K)"
      >
        <Search className="h-5 w-5 shrink-0 md:h-4 md:w-4" />
        <span className="hidden flex-1 truncate text-left md:block">Search parties, items, invoices…</span>
        <kbd className="hidden rounded border border-slate-200 bg-white px-1.5 text-[11px] text-slate-400 md:block">Ctrl K</kbd>
      </button>
      {quick.length > 0 && (
        <Dropdown>
          <DropdownTrigger asChild>
            <button className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-3 text-sm font-medium text-white shadow-sm hover:bg-rose-700">
              <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Create</span>
            </button>
          </DropdownTrigger>
          <DropdownContent>
            <DropdownLabel>Quick create</DropdownLabel>
            {quick.map((q) => (
              <DropdownItem key={q.href} onSelect={() => router.push(href(q.href))} icon={<Plus className="h-3.5 w-3.5" />}>
                {q.label}
              </DropdownItem>
            ))}
          </DropdownContent>
        </Dropdown>
      )}
      <Link href={href('/approvals')} className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label="Approvals" title="Approvals">
        <ShieldCheck className="h-5 w-5" />
        {approvals > 0 && <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-semibold text-white">{approvals}</span>}
      </Link>
      <NotificationBell unread={unread} onOpenChange={refetchCounts} />
      <Dropdown>
        <DropdownTrigger asChild>
          <button className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-slate-100">
            <Avatar name={session?.user.name} />
            <span className="hidden text-left md:block">
              <span className="block text-sm leading-tight font-medium text-slate-800">{session?.user.name}</span>
              <span className="block text-[11px] leading-tight text-slate-500">{session?.user.isSuperAdmin ? 'Super admin' : session?.user.role?.name}</span>
            </span>
          </button>
        </DropdownTrigger>
        <DropdownContent>
          <DropdownLabel>{session?.user.email ?? session?.user.phone}</DropdownLabel>
          <DropdownItem icon={<UserCircle2 className="h-4 w-4" />} onSelect={() => router.push('/profile')}>
            My profile
          </DropdownItem>
          <DropdownItem icon={<ClipboardList className="h-4 w-4" />} onSelect={() => router.push(href('/hr/me'))}>
            My attendance & pay
          </DropdownItem>
          <DropdownItem icon={<Building2 className="h-4 w-4" />} onSelect={() => router.push('/companies')}>
            {session?.user.isSuperAdmin ? 'All companies' : 'Switch company'}
          </DropdownItem>
          <DropdownSeparator />
          <DropdownItem icon={<LogOut className="h-4 w-4" />} danger onSelect={logout}>
            Sign out
          </DropdownItem>
        </DropdownContent>
      </Dropdown>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  useCommandShortcut(openSearch);
  const { cid } = useCompany();
  const counts = useQuery({
    queryKey: [cid, 'notifications', 'counts'],
    queryFn: async () => (await api.get<NotificationRow[], { unread: number; pendingApprovals: number; unreadEmail: number }>('/system/notifications', { limit: 1 })).meta ?? null,
    refetchInterval: 45_000,
  });
  const unread = counts.data?.unread ?? 0;
  const approvals = counts.data?.pendingApprovals ?? 0;
  const emails = counts.data?.unreadEmail ?? 0;
  return (
    <div className="flex h-screen overflow-hidden print:block print:h-auto print:overflow-visible">
      <div className="no-print hidden lg:block">
        <Sidebar approvals={approvals} emails={emails} />
      </div>
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-40 flex lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full">
            <Sidebar approvals={approvals} emails={emails} onNavigate={() => setMobileOpen(false)} />
            <button onClick={() => setMobileOpen(false)} className="absolute top-3 -right-11 rounded-lg bg-white p-2 text-slate-700" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setMobileOpen(true)} onSearch={openSearch} unread={unread} approvals={approvals} refetchCounts={() => void counts.refetch()} />
        <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
        <main className="min-h-0 flex-1 overflow-y-auto print:overflow-visible">
          <div className="mx-auto max-w-[1600px] p-3 sm:p-5 print:max-w-none print:p-0">{children}</div>
        </main>
      </div>
    </div>
  );
}

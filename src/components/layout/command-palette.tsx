'use client';
import * as Dialog from '@radix-ui/react-dialog';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Boxes, CornerDownLeft, FileText, Loader2, Plus, Search, User, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import type { TxnType } from '@/lib/types';
import { TXN, balanceText, statusLabel, txnHref } from '@/lib/txn';
import { cn, fmtDate, money, qty } from '@/lib/utils';
import { useDebounce } from '@/hooks/use-debounce';
import { useCompany } from '@/providers/company';
import { useNav, useQuickCreate } from './nav';

interface SearchResult {
  parties: { _id: string; name: string; phone?: string; balance: number; isActive?: boolean }[];
  items: { _id: string; name: string; code?: string; type: 'product' | 'service'; stock: number; salePrice: number }[];
  documents: { _id: string; type: TxnType; number: string; partyName?: string; date: string; total: number; status: string }[];
  employees: { _id: string; name: string; designation?: string; phone?: string }[];
}

interface Hit {
  key: string;
  group: string;
  label: ReactNode;
  hint?: ReactNode;
  right?: ReactNode;
  icon: ReactNode;
  href: string;
}

/** Opens with Ctrl + K (⌘ K on a Mac) from anywhere in a company. */
export function useCommandShortcut(open: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
}

/**
 * Quick search: pages and quick create entries the role allows, then parties, items, documents and employees
 * from the API (which applies the same permissions). Arrow keys move, Enter opens, Esc closes.
 */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed top-[10vh] left-1/2 z-50 flex max-h-[75vh] w-[calc(100vw-1.5rem)] max-w-2xl -translate-x-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl outline-none" aria-describedby={undefined}>
          <Dialog.Title className="sr-only">Quick search</Dialog.Title>
          {open && <Palette onClose={() => onOpenChange(false)} />}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Palette({ onClose }: { onClose: () => void }) {
  const { cid, can, href } = useCompany();
  const router = useRouter();
  const nav = useNav();
  const quick = useQuickCreate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const term = useDebounce(q.trim(), 200);
  const needle = q.trim().toLowerCase();

  const search = useQuery({
    queryKey: [cid, 'search', term],
    queryFn: async () => (await api.get<SearchResult>('/system/search', { q: term })).data,
    enabled: term.length > 0,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });

  const allowed = (perm?: string[]) => !perm || can(...perm);
  const pages: Hit[] = nav.flatMap((g) =>
    g.children
      ? g.children
          .filter((c) => c.show !== false && allowed(c.perm))
          .map((c) => ({ key: `page:${c.href}`, group: 'Go to', label: c.label, hint: g.label, icon: <ArrowRight className="h-4 w-4" />, href: c.href }))
      : allowed(g.perm) && g.href
        ? [{ key: `page:${g.href}`, group: 'Go to', label: g.label, icon: <ArrowRight className="h-4 w-4" />, href: g.href }]
        : [],
  );
  const creates: Hit[] = quick.map((c) => ({ key: `new:${c.href}`, group: 'Create', label: `New ${c.label.toLowerCase()}`, icon: <Plus className="h-4 w-4" />, href: c.href }));
  const match = (h: Hit) => !needle || `${h.label} ${typeof h.hint === 'string' ? h.hint : ''}`.toLowerCase().includes(needle);

  const r = term ? search.data : undefined;
  // A name finds the party or item first; its documents follow
  const hits: Hit[] = [
    ...(r?.parties ?? []).map((p) => ({
      key: `party:${p._id}`,
      group: 'Parties',
      label: p.name,
      hint: [p.phone, p.isActive === false ? 'Inactive' : null].filter(Boolean).join(' · ') || undefined,
      right: Math.abs(p.balance) >= 0.005 ? <span className={p.balance > 0 ? 'text-emerald-600' : 'text-rose-600'}>{money(Math.abs(p.balance))} {balanceText(p.balance).label.toLowerCase()}</span> : undefined,
      icon: <User className="h-4 w-4" />,
      href: `/parties?party=${p._id}`,
    })),
    ...(r?.items ?? []).map((i) => ({
      key: `item:${i._id}`,
      group: 'Items',
      label: i.name,
      hint: [i.code, i.type === 'service' ? 'Service' : `Stock ${qty(i.stock)}`].filter(Boolean).join(' · '),
      right: money(i.salePrice),
      icon: <Boxes className="h-4 w-4" />,
      href: `/items?item=${i._id}`,
    })),
    ...(r?.employees ?? []).map((e) => ({
      key: `emp:${e._id}`,
      group: 'Employees',
      label: e.name,
      hint: [e.designation, e.phone].filter(Boolean).join(' · ') || undefined,
      icon: <UserRound className="h-4 w-4" />,
      href: `/hr/employees?employee=${e._id}`,
    })),
    ...(r?.documents ?? []).map((d) => ({
      key: `doc:${d._id}`,
      group: 'Documents',
      label: `${TXN[d.type]?.label ?? d.type} ${d.number}`,
      hint: [d.partyName, fmtDate(d.date), statusLabel({ status: d.status, type: d.type })].filter(Boolean).join(' · '),
      right: money(d.total),
      icon: <FileText className="h-4 w-4" />,
      href: txnHref(d.type, d._id),
    })),
    ...pages.filter(match).slice(0, needle ? 6 : 40),
    ...creates.filter(match),
  ];
  // With a search, record matches come first; without one the palette is a menu of pages and quick create
  const ordered = needle ? hits : [...creates, ...pages];
  const current = Math.min(active, Math.max(0, ordered.length - 1));

  const go = (h: Hit) => {
    onClose();
    router.push(href(h.href));
  };

  useEffect(() => {
    list.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  let lastGroup = '';
  const searching = term.length > 0 && search.isFetching;
  const nothing = needle && !searching && search.isFetched && !ordered.length;

  return (
    <>
      <div className="flex items-center gap-3 border-b border-slate-100 px-4">
        {searching ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-500" /> : <Search className="h-5 w-5 shrink-0 text-slate-400" />}
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive(Math.min(current + 1, ordered.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive(Math.max(current - 1, 0));
            } else if (e.key === 'Enter' && ordered[current]) {
              e.preventDefault();
              go(ordered[current]);
            }
          }}
          placeholder="Search parties, items, invoice numbers or pages…"
          className="h-14 min-w-0 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400"
          aria-label="Search"
          aria-controls="quick-search-results"
          aria-activedescendant={ordered[current] ? `qs-${current}` : undefined}
          role="combobox"
          aria-expanded
        />
        <kbd className="hidden rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-400 sm:block">Esc</kbd>
      </div>
      <div ref={list} id="quick-search-results" role="listbox" className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
        {nothing ? (
          <p className="px-3 py-10 text-center text-sm text-slate-500">Nothing matches “{q.trim()}”.</p>
        ) : (
          ordered.map((h, i) => {
            const header = h.group !== lastGroup ? h.group : null;
            lastGroup = h.group;
            return (
              <div key={h.key}>
                {header && <p className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">{header}</p>}
                <button
                  type="button"
                  id={`qs-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === current}
                  onMouseMove={() => i !== current && setActive(i)}
                  onClick={() => go(h)}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left', i === current ? 'bg-blue-50 text-blue-900' : 'text-slate-700')}
                >
                  <span className={cn('shrink-0', i === current ? 'text-blue-600' : 'text-slate-400')}>{h.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{h.label}</span>
                    {h.hint && <span className="block truncate text-xs text-slate-500">{h.hint}</span>}
                  </span>
                  {h.right && <span className="shrink-0 text-xs font-medium text-slate-600 tabular-nums">{h.right}</span>}
                  {i === current && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-blue-500" aria-hidden />}
                </button>
              </div>
            );
          })
        )}
      </div>
      <div className="hidden items-center gap-4 border-t border-slate-100 bg-slate-50/70 px-4 py-2 text-[11px] text-slate-500 sm:flex">
        <span>
          <kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> to move
        </span>
        <span>
          <kbd className="font-sans">Enter</kbd> to open
        </span>
        <span className="ml-auto">Search by name, phone, BIN, item code or document number</span>
      </div>
    </>
  );
}

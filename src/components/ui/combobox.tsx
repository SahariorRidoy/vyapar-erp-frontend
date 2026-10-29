'use client';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFieldControl } from './input';
import { cn } from '@/lib/utils';

export interface ComboOption {
  value: string;
  label: string;
  hint?: ReactNode;
  right?: ReactNode;
  keywords?: string;
}

/**
 * Searchable select with keyboard navigation and an optional "Add new" action.
 * Used for party, item, category, unit, employee pickers.
 */
export function Combobox({
  value, onChange, options, placeholder = 'Select…', searchPlaceholder = 'Search…', onCreate, createLabel = 'Add new', disabled, className, clearable, emptyText = 'No matches', invalid, triggerClassName,
}: {
  value?: string | null;
  onChange: (value: string | null, option?: ComboOption) => void;
  options: ComboOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  onCreate?: (search: string) => void;
  createLabel?: string;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  clearable?: boolean;
  emptyText?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((o) => o.value === value);
  const a11y = useFieldControl({});

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options.slice(0, 300);
    return options.filter((o) => `${o.label} ${o.keywords ?? ''}`.toLowerCase().includes(q)).slice(0, 300);
  }, [options, search]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (o: ComboOption) => {
    onChange(o.value, o);
    setOpen(false);
    setSearch('');
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        if (disabled) return;
        setOpen(o);
        setActive(0);
      }}
    >
      <div className={cn('relative', className)}>
        <Popover.Trigger asChild disabled={disabled}>
          <button
            type="button"
            {...a11y}
            data-invalid={invalid || undefined}
            className={cn(
              'flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 text-left text-sm shadow-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-50 data-invalid:border-rose-500',
              triggerClassName,
            )}
          >
            <span className={cn('truncate', !selected && 'text-slate-400')}>{selected?.label ?? placeholder}</span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
          </button>
        </Popover.Trigger>
        {clearable && selected && !disabled && (
          <button type="button" onClick={() => onChange(null)} className="absolute top-1/2 right-7 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700" aria-label="Clear">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={4} collisionPadding={8} className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[260px] rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 p-2">
            <input
              autoFocus
              role="combobox"
              aria-controls={listId}
              aria-expanded={filtered.length > 0}
              aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
              aria-autocomplete="list"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setActive(0);
              }}
              placeholder={searchPlaceholder}
              className="h-8 w-full rounded-md border border-slate-200 px-2.5 text-sm outline-none focus:border-blue-500"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(a + 1, filtered.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(a - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (filtered[active]) choose(filtered[active]);
                  else if (onCreate && search.trim()) {
                    onCreate(search.trim());
                    setOpen(false);
                  }
                }
              }}
            />
          </div>
          <div ref={listRef} className="max-h-64 overflow-y-auto p-1">
            {onCreate && (
              <button
                type="button"
                onClick={() => {
                  onCreate(search.trim());
                  setOpen(false);
                  setSearch('');
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
              >
                <Plus className="h-4 w-4" /> {createLabel}
                {search.trim() && <span className="truncate text-slate-500">“{search.trim()}”</span>}
              </button>
            )}
            {filtered.length === 0 && <p className="px-2.5 py-3 text-center text-sm text-slate-400">{emptyText}</p>}
            <div id={listId} role="listbox">
              {filtered.map((o, i) => (
                <button
                  key={o.value}
                  id={`${listId}-${i}`}
                  type="button"
                  role="option"
                  aria-selected={o.value === value}
                  tabIndex={-1}
                  data-index={i}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(o)}
                  className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm', i === active ? 'bg-slate-100' : '')}
                >
                  <Check className={cn('h-4 w-4 shrink-0 text-blue-600', o.value === value ? 'opacity-100' : 'opacity-0')} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-slate-800">{o.label}</span>
                    {o.hint && <span className="block truncate text-xs text-slate-500">{o.hint}</span>}
                  </span>
                  {o.right && <span className="shrink-0 text-xs text-slate-500">{o.right}</span>}
                </button>
              ))}
            </div>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

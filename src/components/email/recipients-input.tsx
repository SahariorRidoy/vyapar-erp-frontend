'use client';
import { useId, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFieldControl } from '@/components/ui/input';

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface Contact {
  name: string;
  email: string;
}

/** Splits `"Ravi Kumar" <ravi@x.com>` into its display name and address. */
export function parseAddress(raw?: string): Contact {
  const s = (raw ?? '').trim();
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(s);
  if (m) return { name: m[1]!.trim() || m[2]!.trim(), email: m[2]!.trim() };
  return { name: s, email: s };
}

const split = (s: string) =>
  s
    .split(/[,;\s]+/)
    .map((x) => x.trim().replace(/^<|>$/g, ''))
    .filter(Boolean);

/** Email address field that turns each address into a chip, with suggestions from saved contacts. */
export function RecipientsInput({ value, onChange, contacts = [], placeholder, invalid, autoFocus, id }: {
  value: string[];
  onChange: (v: string[]) => void;
  contacts?: Contact[];
  placeholder?: string;
  invalid?: boolean;
  autoFocus?: boolean;
  id?: string;
}) {
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const a11y = useFieldControl({ id });
  const listId = useId();

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    const taken = new Set(value.map((v) => v.toLowerCase()));
    return contacts.filter((c) => !taken.has(c.email.toLowerCase()) && (c.email.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))).slice(0, 6);
  }, [text, contacts, value]);

  const add = (raw: string[]) => {
    const next = [...value];
    for (const e of raw) if (!next.some((x) => x.toLowerCase() === e.toLowerCase())) next.push(e);
    onChange(next);
    setText('');
    setActive(0);
  };
  const commit = () => text.trim() && add(split(text));

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const open = focused && suggestions.length > 0;
    if (open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length);
    } else if (e.key === 'Enter' || e.key === ',' || e.key === ';' || (e.key === 'Tab' && text.trim())) {
      if (!text.trim()) return;
      e.preventDefault();
      if (open && e.key !== ',' && e.key !== ';') add([suggestions[active]!.email]);
      else commit();
    } else if (e.key === 'Backspace' && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (/[,;\s]/.test(pasted.trim())) {
      e.preventDefault();
      add(split(`${text} ${pasted}`));
    }
  };

  return (
    <div className="relative">
      <div
        onClick={() => input.current?.focus()}
        className={cn(
          'flex min-h-9 w-full cursor-text flex-wrap items-center gap-1 rounded-lg border bg-white px-2 py-1 text-sm shadow-sm transition-colors focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20',
          invalid ? 'border-rose-400' : 'border-slate-300',
        )}
      >
        {value.map((v) => {
          const ok = EMAIL_RE.test(v);
          const contact = contacts.find((c) => c.email.toLowerCase() === v.toLowerCase());
          return (
            <span
              key={v}
              title={ok ? (contact ? `${contact.name} <${v}>` : v) : 'Not a valid email address'}
              className={cn('inline-flex max-w-full items-center gap-1 rounded-md py-0.5 pr-0.5 pl-2 text-xs', ok ? 'bg-slate-100 text-slate-700' : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200')}
            >
              <span className="truncate">{contact ? contact.name : v}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(value.filter((x) => x !== v));
                }}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                aria-label={`Remove ${v}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        <input
          ref={input}
          {...a11y}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            commit();
          }}
          placeholder={value.length ? '' : placeholder}
          autoFocus={autoFocus}
          data-autofocus={autoFocus || undefined}
          autoComplete="off"
          inputMode="email"
          className="h-7 min-w-[140px] flex-1 border-0 bg-transparent px-1 text-sm outline-none placeholder:text-slate-400"
          role="combobox"
          aria-controls={listId}
          aria-expanded={focused && suggestions.length > 0}
          aria-activedescendant={focused && suggestions.length > 0 ? `${listId}-${active}` : undefined}
          aria-autocomplete="list"
        />
      </div>
      {focused && suggestions.length > 0 && (
        <ul id={listId} role="listbox" className="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {suggestions.map((c, i) => (
            <li
              key={c.email}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown keeps focus in the input so blur does not commit the half typed text first
              onMouseDown={(e) => {
                e.preventDefault();
                add([c.email]);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn('flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-sm', i === active ? 'bg-blue-50' : 'hover:bg-slate-50')}
            >
              <span className="truncate font-medium text-slate-800">{c.name}</span>
              <span className="truncate text-xs text-slate-500">{c.email}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

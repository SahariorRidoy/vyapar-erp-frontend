'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import type { Company, CompanySettings } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useCompany } from '@/providers/company';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/input';

export type SectionKey = keyof CompanySettings;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Local draft of one settings section. Saving sends the whole section and refreshes the company settings
 * every page reads, so prefixes, toggles and print options apply at once.
 */
export function useSection<K extends SectionKey>(key: K, onDirtyChange?: (dirty: boolean) => void) {
  const { cid, settings } = useCompany();
  const qc = useQueryClient();
  const saved = settings?.[key];
  const [draft, setDraft] = useState<CompanySettings[K] | undefined>(saved);
  // Follow the saved value when it changes (first load, another tab saved), but never wipe edits in progress.
  const prev = useRef(saved);
  useEffect(() => {
    setDraft((d) => (d === undefined || same(d, prev.current) ? saved : d));
    prev.current = saved;
  }, [saved]);
  const dirty = !!draft && !!saved && !same(draft, saved);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const save = useMutation({
    mutationFn: async (value?: CompanySettings[K]) => (await api.put<CompanySettings>(`/settings/section/${key}`, value ?? draft)).data,
    onSuccess: (next) => {
      // The server may normalise values (ranges, blank prefixes), so show exactly what was stored.
      setDraft(next[key]);
      prev.current = next[key];
      qc.setQueryData<{ company: Company; settings: CompanySettings }>([cid, 'settings'], (old) => (old ? { ...old, settings: next } : old));
      qc.invalidateQueries({ queryKey: [cid, 'settings'] });
      toast.success('Settings saved');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const set = useCallback(<F extends keyof CompanySettings[K]>(field: F, value: CompanySettings[K][F]) => setDraft((d) => (d ? { ...d, [field]: value } : d)), []);
  const reset = useCallback(() => setDraft(saved), [saved]);
  return useMemo(() => ({ draft, set, setDraft, dirty, save, reset, saved }), [draft, set, dirty, save, reset, saved]);
}

export function SettingsCard({ title, description, children, actions, className }: { title: ReactNode; description?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-slate-200 bg-white', className)}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
        </div>
        {actions}
      </header>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

/** A list of switches with a divider between each, the way the Vyapar settings screens look. */
export function ToggleList({ children }: { children: ReactNode }) {
  return <div className="-my-2 divide-y divide-slate-100">{children}</div>;
}

export function Toggle({ label, description, checked, onChange, disabled }: { label: ReactNode; description?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <Switch label={label} description={description} checked={checked} onCheckedChange={onChange} disabled={disabled} />;
}

/** Sticky bar shown while a section has unsaved changes. */
export function SaveBar({ dirty, saving, onSave, onDiscard }: { dirty: boolean; saving: boolean; onSave: () => void; onDiscard: () => void }) {
  if (!dirty && !saving) return null;
  return (
    <div className="sticky bottom-0 z-10 -mx-1 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/95 px-4 py-3 shadow-lg backdrop-blur">
      <p className="text-sm font-medium text-blue-900">You have unsaved changes</p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onDiscard} disabled={saving}>
          Discard
        </Button>
        <Button onClick={onSave} loading={saving}>
          Save changes
        </Button>
      </div>
    </div>
  );
}

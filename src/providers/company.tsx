'use client';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { api, setActiveCompany } from '@/lib/api';
import type { Company, CompanySettings } from '@/lib/types';
import { setFormatting } from '@/lib/utils';
import { useSession } from './session';

interface CompanyCtx {
  cid: string;
  company: Company | null;
  settings: CompanySettings | null;
  loading: boolean;
  can: (...perms: string[]) => boolean;
  /** Prefix a company relative path: href('/parties') → /c/<id>/parties */
  href: (path: string) => string;
  refetch: () => void;
}

const Ctx = createContext<CompanyCtx | null>(null);

export function CompanyProvider({ cid, children }: { cid: string; children: ReactNode }) {
  // Set synchronously so the very first request of every child carries the company header.
  useState(() => setActiveCompany(cid));
  if (typeof window !== 'undefined') setActiveCompany(cid);
  const { session } = useSession();
  const { data, isLoading, refetch } = useQuery({
    queryKey: [cid, 'settings'],
    queryFn: async () => (await api.get<{ company: Company; settings: CompanySettings }>('/settings')).data,
    staleTime: 5 * 60_000,
  });
  if (data) {
    const g = data.settings.general;
    setFormatting({ currencySymbol: g.currencySymbol, dateFormat: g.dateFormat, decimalPlaces: g.decimalPlaces, fyStartMonth: g.financialYearStartMonth });
  }

  const value = useMemo<CompanyCtx>(() => {
    const perms = new Set(session?.permissions ?? []);
    return {
      cid,
      company: data?.company ?? null,
      settings: data?.settings ?? null,
      loading: isLoading,
      can: (...p: string[]) => !!session?.user.isSuperAdmin || p.some((x) => perms.has(x)),
      href: (path: string) => `/c/${cid}${path.startsWith('/') ? path : `/${path}`}`,
      refetch: () => void refetch(),
    };
  }, [cid, data, isLoading, refetch, session]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCompany() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCompany must be used inside /c/[cid]');
  return v;
}

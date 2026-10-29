'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { api } from '@/lib/api';
import type { Session } from '@/lib/types';

interface SessionCtx {
  session: Session | null;
  loading: boolean;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
}

const Ctx = createContext<SessionCtx>({ session: null, loading: true, refresh: async () => undefined, logout: async () => undefined });

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const router = useRouter();
  const q = useQuery({
    queryKey: ['session'],
    queryFn: async () => (await api.get<Session>('/auth/me')).data,
    staleTime: 60_000,
    retry: false,
  });
  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    qc.clear();
    router.replace('/login');
  }, [qc, router]);
  return <Ctx.Provider value={{ session: q.data ?? null, loading: q.isLoading, refresh: q.refetch, logout }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);

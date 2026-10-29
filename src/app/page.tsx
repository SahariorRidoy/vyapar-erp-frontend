'use client';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import type { Session } from '@/lib/types';
import { PageLoader } from '@/components/ui/misc';

/** Entry point: send the user to their home (company list for super admin, dashboard for staff). */
export default function Home() {
  const router = useRouter();
  const q = useQuery({ queryKey: ['session'], queryFn: async () => (await api.get<Session>('/auth/me')).data, retry: false });
  useEffect(() => {
    if (q.data) router.replace(q.data.home);
    else if (q.isError) router.replace('/login');
  }, [q.data, q.isError, router]);
  return <PageLoader label="Opening your workspace…" />;
}

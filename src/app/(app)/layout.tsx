'use client';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect, type ReactNode } from 'react';
import { SessionProvider, useSession } from '@/providers/session';
import { PageLoader } from '@/components/ui/misc';

/** Every page behind login: loads the session once and bounces anonymous visitors to /login. */
function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !session) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, session, router, pathname]);

  if (loading || !session) return <PageLoader label="Checking your session…" />;
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <AuthGate>{children}</AuthGate>
    </SessionProvider>
  );
}

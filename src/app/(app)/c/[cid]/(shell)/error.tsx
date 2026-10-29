'use client';
import { useCompany } from '@/providers/company';
import { ErrorView } from '@/components/ui/fallback';

export default function CompanyError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { href } = useCompany();
  return <ErrorView error={error} reset={reset} home={href('/dashboard')} homeLabel="Go to dashboard" />;
}

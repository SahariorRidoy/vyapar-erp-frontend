'use client';
import { useCompany } from '@/providers/company';
import { NotFoundView } from '@/components/ui/fallback';

export default function CompanyNotFound() {
  const { href } = useCompany();
  return <NotFoundView home={href('/dashboard')} homeLabel="Go to dashboard" />;
}

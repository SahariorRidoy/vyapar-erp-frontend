'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { FileX2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { Txn } from '@/lib/types';
import { txnHref } from '@/lib/txn';
import { useCompany } from '@/providers/company';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, PageLoader } from '@/components/ui/misc';

/** Opens any document by id (used by notifications, approvals and the activity log). */
export default function OpenTxnPage() {
  const { id } = useParams<{ id: string }>();
  const { cid, href } = useCompany();
  const router = useRouter();
  const q = useQuery({ queryKey: [cid, 'transactions', 'detail', id], queryFn: async () => (await api.get<Txn>(`/transactions/${id}`)).data, retry: false });
  useEffect(() => {
    if (q.data) router.replace(href(txnHref(q.data.type, q.data._id)));
  }, [q.data, router, href]);
  if (q.isError)
    return (
      <Card>
        <EmptyState
          icon={<FileX2 className="h-6 w-6" />}
          title="Document not found"
          description="It may have been deleted, or you do not have access to it."
          action={
            <Link href={href('/dashboard')} className={buttonClass({ variant: 'outline' })}>
              Go to dashboard
            </Link>
          }
        />
      </Card>
    );
  return <PageLoader label="Opening document…" />;
}

'use client';
import { notFound, useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { TXN, newTxnHref, txnHref, typeFromPath } from '@/lib/txn';
import { useCompany } from '@/providers/company';
import { PageLoader } from '@/components/ui/misc';
import { TxnListPage } from './list-page';
import { TxnForm } from './txn-form';
import { ExpensesPage } from './expenses-page';

type Section = 'sale' | 'purchase';

/** /sale/<slug> and /purchase/<slug>: the list page of one document type. */
export function DocListRoute({ section }: { section: Section }) {
  const { doc } = useParams<{ doc: string }>();
  const type = typeFromPath(section, doc);
  if (!type) notFound();
  if (type === 'EXPENSE') return <ExpensesPage />;
  return <TxnListPage key={type} type={type} />;
}

/** /<section>/<slug>/new and /<section>/<slug>/<id>: the document form. Payments open as a modal on their list page instead. */
export function DocFormRoute({ section }: { section: Section }) {
  const { doc, id } = useParams<{ doc: string; id?: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { href } = useCompany();
  const type = typeFromPath(section, doc);
  const isPayment = !!type && !!TXN[type].isPayment;

  useEffect(() => {
    if (!type || !isPayment) return;
    router.replace(href(id ? txnHref(type, id) : newTxnHref(type, { party: search.get('party') ?? undefined, duplicate: search.get('duplicate') ?? undefined })));
  }, [type, isPayment, id, router, href, search]);

  if (!type) notFound();
  if (isPayment) return <PageLoader />;
  // The key remounts the form when the same route is reused for another document or another conversion source.
  return <TxnForm key={`${type}:${id ?? 'new'}:${search.toString()}`} type={type} id={id} />;
}

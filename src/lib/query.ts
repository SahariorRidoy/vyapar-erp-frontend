import type { QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { ApiResult } from './api';

/**
 * Refetch everything that belongs to a company except its (rarely changing) settings. After a delete,
 * pass the deleted record's id as `goneId`: queries keyed by it are left alone, so a panel that still
 * shows the record while the page moves on does not refetch it into a 404.
 */
export function invalidateCompany(qc: QueryClient, cid: string, goneId?: string) {
  return qc.invalidateQueries({
    predicate: (q) => q.queryKey[0] === cid && q.queryKey[1] !== 'settings' && !(goneId && q.queryKey.includes(goneId)),
  });
}

export interface PendingApproval {
  pendingApproval: true;
  approval: { _id: string; label: string };
}

export function isPending(res: ApiResult<unknown> | unknown): res is ApiResult<PendingApproval> {
  const r = res as ApiResult<PendingApproval> | undefined;
  return !!r && r.status === 202 && !!r.data && (r.data as PendingApproval).pendingApproval === true;
}

/** Toasts the right message for a write that may have been routed to the approval queue. Returns true if it was applied. */
export function reportWrite(res: ApiResult<unknown>, success: string) {
  if (isPending(res)) {
    toast.info('Sent for approval', { description: `${res.data.approval.label}. It will apply once an approver accepts it.` });
    return false;
  }
  toast.success(success);
  return true;
}

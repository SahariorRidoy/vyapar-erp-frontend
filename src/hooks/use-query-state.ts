'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/** Reads and patches the page's URL search params (keeps filters/selection shareable and back-button friendly). */
export function useQueryState() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const set = useCallback(
    (patch: Record<string, string | null>) => {
      const p = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') p.delete(k);
        else p.set(k, v);
      }
      const s = p.toString();
      router.replace(`${pathname}${s ? `?${s}` : ''}`, { scroll: false });
    },
    [params, pathname, router],
  );
  return { params, set };
}

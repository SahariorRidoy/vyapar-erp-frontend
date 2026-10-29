'use client';
import { useCallback, useSyncExternalStore } from 'react';

/** Live result of a CSS media query, e.g. `useMediaQuery('(min-width: 640px)')`. The server render uses `fallback`. */
export function useMediaQuery(query: string, fallback = true) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => fallback);
}

'use client';
import { useEffect, useState } from 'react';
import { useQueryState } from './use-query-state';

/**
 * Handles a one-shot URL flag such as `?new=1` (the "Party" link of the quick-create menu): runs `onOpen`
 * once when the flag appears, then drops the flag from the URL so a refresh or Back does not repeat it.
 * `onOpen` runs while rendering, so it may only set state of the component that calls this hook.
 */
export function useUrlFlag(name: string, allowed: boolean, onOpen: () => void) {
  const { params, set } = useQueryState();
  const on = allowed && params.get(name) === '1';
  const [handled, setHandled] = useState(false);
  if (on !== handled) {
    setHandled(on);
    if (on) onOpen();
  }
  useEffect(() => {
    if (on) set({ [name]: null });
  }, [on, name, set]);
}

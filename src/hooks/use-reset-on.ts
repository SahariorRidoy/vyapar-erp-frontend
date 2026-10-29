import { useState } from 'react';

/**
 * Runs `reset` while rendering whenever `key` changes, e.g. to fill a form each time its modal opens
 * or another record is picked. This is React's recommended replacement for an effect that copies
 * props into state: the new values show in the same render instead of one render later.
 * https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
 */
export function useResetOn(key: unknown, reset: () => void) {
  const [prev, setPrev] = useState(key);
  if (!Object.is(prev, key)) {
    setPrev(key);
    reset();
  }
}

import { useCallback, useEffect, useState } from 'react';
import { getStudioRoot, forgetStudioRoot } from '../utils/studioRoot';

/** The studios' shared folder, for showing where work is saved. Empty until it has been resolved. */
export function useStudioRoot(): { path: string; error: string | null; retry: () => void } {
  const [state, setState] = useState<{ path: string; error: string | null }>({ path: '', error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    getStudioRoot().then(
      (path) => { if (!disposed) setState({ path, error: null }); },
      (error: unknown) => { if (!disposed) setState({ path: '', error: error instanceof Error ? error.message : String(error) }); },
    );
    return () => { disposed = true; };
  }, [attempt]);

  const retry = useCallback(() => {
    forgetStudioRoot();
    setState({ path: '', error: null });
    setAttempt((value) => value + 1);
  }, []);

  return { ...state, retry };
}

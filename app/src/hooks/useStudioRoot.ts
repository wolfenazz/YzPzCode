import { useEffect, useState } from 'react';
import { getStudioRoot } from '../utils/studioRoot';

/** The studios' shared folder, for showing where work is saved. Empty until it has been resolved. */
export function useStudioRoot(): { path: string; error: string | null } {
  const [state, setState] = useState<{ path: string; error: string | null }>({ path: '', error: null });

  useEffect(() => {
    let disposed = false;
    getStudioRoot().then(
      (path) => { if (!disposed) setState({ path, error: null }); },
      (error: unknown) => { if (!disposed) setState({ path: '', error: error instanceof Error ? error.message : String(error) }); },
    );
    return () => { disposed = true; };
  }, []);

  return state;
}

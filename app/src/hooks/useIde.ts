import { useState, useCallback, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { IdeType, IdeInfo } from '../types';

export const useIde = () => {
  const [ideStatuses, setIdeStatuses] = useState<Record<IdeType, IdeInfo | null>>({
    vsCode: null,
    visualStudio: null,
    cursor: null,
    zed: null,
    webStorm: null,
    intelliJ: null,
    sublimeText: null,
    windsurf: null,
    perplexity: null,
    antigravity: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detectAllIdes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const statuses = await invoke<Record<IdeType, IdeInfo>>('detect_all_ides_cmd');
      setIdeStatuses(statuses);
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  }, []);

  const launchIde = useCallback(async (ide: IdeType, directory: string): Promise<boolean> => {
    try {
      await invoke('launch_ide_cmd', { ide, directory });
      return true;
    } catch (err) {
      console.error(`Failed to launch ${ide}:`, err);
      return false;
    }
  }, []);

  useEffect(() => {
    detectAllIdes();
  }, [detectAllIdes]);

  return {
    ideStatuses,
    loading,
    error,
    detectAllIdes,
    launchIde,
  };
};

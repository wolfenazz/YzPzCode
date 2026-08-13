import { useState, useMemo, useCallback } from 'react';
import { CliType, AgentType, ToolCliType, AgentFleet, AgentCliInfo } from '../types';

const STORAGE_KEY = 'yzpzcode-agent-allocation';

const AGENT_TYPES: AgentType[] = ['claude', 'codex', 'gemini', 'opencode', 'cursor', 'kilo', 'hermes', 'pi'];
const TOOL_TYPES: ToolCliType[] = ['gh', 'stripe', 'supabase', 'valyu', 'posthog', 'elevenlabs', 'ramp', 'gws', 'agentmail', 'vercel'];
const ALL_CLI_TYPES: CliType[] = [...AGENT_TYPES, ...TOOL_TYPES];

const loadPersistedAllocation = (): Record<CliType, number> | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed === 'object' && parsed !== null) {
        const sanitized: any = {};
        let hasValidData = false;

        ALL_CLI_TYPES.forEach(cli => {
          if (typeof parsed[cli] === 'number') {
            sanitized[cli] = parsed[cli];
            hasValidData = true;
          } else {
            sanitized[cli] = 0;
          }
        });

        return hasValidData ? sanitized : null;
      }
    }
  } catch (error) {
    console.warn('Failed to load persisted agent allocation:', error);
  }
  return null;
};

const persistAllocation = (allocation: Record<CliType, number>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allocation));
  } catch {
    console.warn('Failed to persist agent allocation');
  }
};

const DEFAULT_ALLOCATION: Record<CliType, number> = {
  claude: 0,
  codex: 0,
  gemini: 0,
  opencode: 0,
  cursor: 0,
  kilo: 0,
  hermes: 0,
  pi: 0,
  gh: 0,
  stripe: 0,
  supabase: 0,
  valyu: 0,
  posthog: 0,
  elevenlabs: 0,
  ramp: 0,
  gws: 0,
  agentmail: 0,
  vercel: 0,
};

export const useAgentAllocation = (totalSlots: number) => {
  const [allocation, setAllocation] = useState<Record<CliType, number>>(() => {
    const persisted = loadPersistedAllocation();
    return persisted || DEFAULT_ALLOCATION;
  });

  const [enabledAgents, setEnabledAgents] = useState<Set<CliType>>(() => {
    const persisted = loadPersistedAllocation();
    if (!persisted) return new Set(AGENT_TYPES);
    return new Set(
      (Object.entries(persisted) as [CliType, number][])
        .filter(([, count]) => count > 0)
        .map(([cli]) => cli)
    );
  });

  const allocatedSlots = useMemo(() => {
    return Object.values(allocation).reduce((sum, count) => sum + count, 0);
  }, [allocation]);

  const remainingSlots = useMemo(() => {
    return Math.max(0, totalSlots - allocatedSlots);
  }, [totalSlots, allocatedSlots]);

  const utilizationPercentage = useMemo(() => {
    return totalSlots > 0 ? (allocatedSlots / totalSlots) * 100 : 0;
  }, [allocatedSlots, totalSlots]);

  const updateAllocation = useCallback((cli: CliType, count: number) => {
    if (count < 0) return;

    setAllocation((prev) => {
      if (Object.values(prev).reduce((s, c) => s + c, 0) - prev[cli] + count > totalSlots) {
        return prev;
      }
      const newAllocation = { ...prev, [cli]: count };
      persistAllocation(newAllocation);
      return newAllocation;
    });
  }, [totalSlots]);

  const toggleAgent = useCallback((cli: CliType) => {
    setEnabledAgents((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(cli)) {
        newSet.delete(cli);
        updateAllocation(cli, 0);
      } else {
        newSet.add(cli);
      }
      return newSet;
    });
  }, [updateAllocation]);

  const isValid = useMemo(() => allocatedSlots <= totalSlots, [allocatedSlots, totalSlots]);
  const isOverAllocated = useMemo(() => allocatedSlots > totalSlots, [allocatedSlots, totalSlots]);

  const getAgentFleet = useCallback((): AgentFleet => ({
    totalSlots,
    allocation,
  }), [totalSlots, allocation]);

  const setAllocationFromTemplate = useCallback((newAllocation: Record<CliType, number>) => {
    setAllocation({ ...DEFAULT_ALLOCATION, ...newAllocation });
    const allZero = (Object.values(newAllocation) as number[]).every((count) => count === 0);
    const enabled = allZero
      ? new Set<CliType>(AGENT_TYPES)
      : new Set<CliType>(
          (Object.entries(newAllocation) as [CliType, number][])
            .filter(([, count]) => count > 0)
            .map(([cli]) => cli)
        );
    setEnabledAgents(enabled);
    persistAllocation({ ...DEFAULT_ALLOCATION, ...newAllocation });
  }, []);

  const resetAllocation = useCallback(() => {
    setAllocation(DEFAULT_ALLOCATION);
    setEnabledAgents(new Set(AGENT_TYPES));
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const autoFillFromInstalled = useCallback((cliStatuses: Record<AgentType, AgentCliInfo | null>) => {
    const newAllocation: Record<CliType, number> = { ...DEFAULT_ALLOCATION };
    const newEnabledAgents = new Set<CliType>();

    const installedAgents = AGENT_TYPES.filter(
      agent => cliStatuses[agent]?.status === 'Installed'
    );

    let slotsUsed = 0;
    for (const agent of installedAgents) {
      if (slotsUsed < totalSlots) {
        newAllocation[agent] = 1;
        newEnabledAgents.add(agent);
        slotsUsed++;
      }
    }

    setAllocation(newAllocation);
    setEnabledAgents(newEnabledAgents);
    persistAllocation(newAllocation);
  }, [totalSlots]);

  const distributeEvenly = useCallback(() => {
    const enabled = Array.from(enabledAgents);
    if (enabled.length === 0) return;

    const newAllocation: Record<CliType, number> = { ...DEFAULT_ALLOCATION };
    const base = Math.floor(totalSlots / enabled.length);
    const remainder = totalSlots % enabled.length;

    enabled.forEach((cli, i) => {
      newAllocation[cli] = base + (i < remainder ? 1 : 0);
    });

    setAllocation(newAllocation);
    persistAllocation(newAllocation);
  }, [totalSlots, enabledAgents]);

  return {
    allocation,
    enabledAgents,
    allocatedSlots,
    remainingSlots,
    utilizationPercentage,
    isValid,
    isOverAllocated,
    updateAllocation,
    toggleAgent,
    getAgentFleet,
    resetAllocation,
    autoFillFromInstalled,
    distributeEvenly,
    setAllocationFromTemplate,
  };
};

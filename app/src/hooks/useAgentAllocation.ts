import { useState, useMemo, useCallback } from 'react';
import { AgentType, AgentFleet, AgentCliInfo } from '../types';

const STORAGE_KEY = 'yzpzcode-agent-allocation';

const VALID_AGENTS: AgentType[] = ['claude', 'codex', 'gemini', 'opencode', 'cursor', 'kilo', 'hermes'];

const loadPersistedAllocation = (): Record<AgentType, number> | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (typeof parsed === 'object' && parsed !== null) {
        // Sanity check: ensure only valid agents are in the record
        const sanitized: any = {};
        let hasValidData = false;

        VALID_AGENTS.forEach(agent => {
          if (typeof parsed[agent] === 'number') {
            sanitized[agent] = parsed[agent];
            hasValidData = true;
          } else {
            sanitized[agent] = 0;
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

const persistAllocation = (allocation: Record<AgentType, number>) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allocation));
  } catch {
    console.warn('Failed to persist agent allocation');
  }
};

const DEFAULT_ALLOCATION: Record<AgentType, number> = {
  claude: 0,
  codex: 0,
  gemini: 0,
  opencode: 0,
  cursor: 0,
  kilo: 0,
  hermes: 0,
};

export const useAgentAllocation = (totalSlots: number) => {
  const [allocation, setAllocation] = useState<Record<AgentType, number>>(() => {
    const persisted = loadPersistedAllocation();
    return persisted || DEFAULT_ALLOCATION;
  });

  const [enabledAgents, setEnabledAgents] = useState<Set<AgentType>>(() => {
    const persisted = loadPersistedAllocation();
    if (!persisted) return new Set(VALID_AGENTS);
    return new Set(
      (Object.entries(persisted) as [AgentType, number][])
        .filter(([, count]) => count > 0)
        .map(([agent]) => agent)
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

  const updateAllocation = useCallback((agent: AgentType, count: number) => {
    if (count < 0) return;

    setAllocation((prev) => {
      if (Object.values(prev).reduce((s, c) => s + c, 0) - prev[agent] + count > totalSlots) {
        return prev;
      }
      const newAllocation = { ...prev, [agent]: count };
      persistAllocation(newAllocation);
      return newAllocation;
    });
  }, [totalSlots]);

  const toggleAgent = useCallback((agent: AgentType) => {
    setEnabledAgents((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(agent)) {
        newSet.delete(agent);
        updateAllocation(agent, 0);
      } else {
        newSet.add(agent);
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

  const setAllocationFromTemplate = useCallback((newAllocation: Record<AgentType, number>) => {
    setAllocation(newAllocation);
    const allZero = (Object.values(newAllocation) as number[]).every((count) => count === 0);
    const enabled = allZero
      ? new Set<AgentType>(VALID_AGENTS)
      : new Set<AgentType>(
          (Object.entries(newAllocation) as [AgentType, number][])
            .filter(([, count]) => count > 0)
            .map(([agent]) => agent)
        );
    setEnabledAgents(enabled);
    persistAllocation(newAllocation);
  }, []);

  const resetAllocation = useCallback(() => {
    setAllocation(DEFAULT_ALLOCATION);
    setEnabledAgents(new Set(VALID_AGENTS));
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const autoFillFromInstalled = useCallback((cliStatuses: Record<AgentType, AgentCliInfo | null>) => {
    const newAllocation: Record<AgentType, number> = { ...DEFAULT_ALLOCATION };
    const newEnabledAgents = new Set<AgentType>();
    
    const installedAgents = VALID_AGENTS.filter(
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

    const newAllocation: Record<AgentType, number> = { ...DEFAULT_ALLOCATION };
    const base = Math.floor(totalSlots / enabled.length);
    const remainder = totalSlots % enabled.length;

    enabled.forEach((agent, i) => {
      newAllocation[agent] = base + (i < remainder ? 1 : 0);
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

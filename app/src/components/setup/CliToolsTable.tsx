import React, { useState, useEffect } from 'react';
import { useAgentCli } from '../../hooks/useAgentCli';
import { AgentCliInfo } from '../../types';

export const CliToolsTable: React.FC = () => {
  const { cliStatuses, detectAllClis, loading, error } = useAgentCli();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    detectAllClis();
  }, [detectAllClis]);

  const cliTools = Object.values(cliStatuses).filter((tool): tool is AgentCliInfo => tool !== null);
  const installedCount = cliTools.filter(t => t.status === 'Installed').length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Installed':
        return 'text-emerald-400/80';
      case 'NotInstalled':
        return 'text-zinc-500';
      case 'Checking':
        return 'text-zinc-400';
      case 'Error':
        return 'text-rose-400/80';
      default:
        return 'text-zinc-400';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Installed':
        return '+';
      case 'NotInstalled':
        return '-';
      case 'Checking':
        return '~';
      case 'Error':
        return '!';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 font-mono text-xs">
        <span className="animate-pulse">Detecting CLI tools...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-rose-400/80 font-mono">
        Error: {error}
      </div>
    );
  }

  return (
    <div className="w-full">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-zinc-500 hover:text-zinc-300 font-mono text-xs transition-colors duration-150 cursor-pointer group"
      >
        <svg 
          className={`w-3 h-3 transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
        </svg>
        <span className="uppercase tracking-[0.1em]">CLI Tools</span>
        <span className="text-zinc-700">[{installedCount}/{cliTools.length} installed]</span>
      </button>

      {isOpen && (
        <div className="mt-3 overflow-hidden border border-theme rounded-md bg-theme-card">
          <table className="w-full">
            <thead className="border-b border-theme">
              <tr>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-zinc-500 font-mono uppercase tracking-[0.1em]">
                  Name
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-zinc-500 font-mono uppercase tracking-[0.1em]">
                  Provider
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-zinc-500 font-mono uppercase tracking-[0.1em]">
                  Status
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-medium text-zinc-500 font-mono uppercase tracking-[0.1em]">
                  Version
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {cliTools.map((tool) => (
                <tr
                  key={tool.agent}
                  className="hover:bg-zinc-800/20 transition-colors duration-100"
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="font-medium text-zinc-300 font-mono text-xs">
                      {tool.displayName}
                    </div>
                    <div className="text-[10px] text-zinc-600 font-mono">
                      {tool.binaryName}
                    </div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {tool.provider}
                    </span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`text-xs font-mono ${getStatusColor(tool.status)}`}>
                      {getStatusBadge(tool.status)} {tool.status === 'Installed' ? 'Installed' : tool.status === 'NotInstalled' ? 'Not Installed' : tool.status}
                    </span>
                    {tool.error && (
                      <div className="text-[10px] text-rose-400/60 font-mono mt-0.5">
                        {tool.error}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-zinc-500 font-mono">
                    {tool.version || 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {cliTools.length === 0 && (
            <div className="p-4 text-center text-zinc-500 font-mono text-xs">
              No CLI tools detected
            </div>
          )}
        </div>
      )}
    </div>
  );
};

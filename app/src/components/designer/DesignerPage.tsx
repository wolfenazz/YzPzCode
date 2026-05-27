import React, { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';
import { minimizeWindow, maximizeWindow, closeWindow } from '../../utils/window';
import { useAppStore } from '../../stores/appStore';
import { CustomizationPanel } from './CustomizationPanel';
import { DesignHistory } from './DesignHistory';
import { DesignPreview } from './DesignPreview';
import { DesignerPromptInput } from './DesignerPromptInput';
import { ElementInspector } from './ElementInspector';
import { ExportControls } from './ExportControls';
import { GeneratedCodePanel } from './GeneratedCodePanel';
import { ResponsivePreviewControls } from './ResponsivePreviewControls';
import { SkillsManager } from './SkillsManager';
import { ThemeSelector } from './ThemeSelector';
import {
  DEFAULT_BREAKPOINTS,
  createDefaultDesignerSkills,
  createInitialDesignerForm,
  generateDesign,
  refreshDesignCode,
  regenerateLayer,
} from './designerGenerator';
import type {
  DesignerBreakpoints,
  DesignerCodeTab,
  DesignerFormState,
  DesignerHistoryEntry,
  DesignerLayer,
  DesignerLayerStyle,
  DesignerDevice,
  DesignerSkill,
  GeneratedDesign,
} from './types';

interface DesignerPageProps {
  isWindows: boolean;
  onBack: () => void;
}

const SKILLS_STORAGE_KEY = 'yzpzcode-designer-skills';

const loadStoredSkills = (): DesignerSkill[] => {
  try {
    const stored = window.localStorage.getItem(SKILLS_STORAGE_KEY);
    if (!stored) return createDefaultDesignerSkills();
    const parsed = JSON.parse(stored) as DesignerSkill[];
    return Array.isArray(parsed) ? parsed : createDefaultDesignerSkills();
  } catch {
    return createDefaultDesignerSkills();
  }
};

const sanitizeFolderName = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 58) || 'designer-page';

const normalizePath = (path: string): string => path.replace(/[\\/]+$/g, '').replace(/\\/g, '/');

const exportStamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join('');
};

const buildExportDocument = (design: GeneratedDesign): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${design.title}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
${design.html}
  </body>
</html>
`;

export const DesignerPage: React.FC<DesignerPageProps> = ({ isWindows, onBack }) => {
  const currentWorkspace = useAppStore((state) => state.currentWorkspace);
  const openWorkspaces = useAppStore((state) => state.openWorkspaces);
  const theme = useAppStore((state) => state.theme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);

  const workspacePath = currentWorkspace?.path ?? openWorkspaces[0]?.path ?? null;
  const [form, setForm] = useState<DesignerFormState>(() => createInitialDesignerForm());
  const [skills, setSkills] = useState<DesignerSkill[]>(() => loadStoredSkills());
  const [breakpoints, setBreakpoints] = useState<DesignerBreakpoints>(DEFAULT_BREAKPOINTS);
  const [previewDevice, setPreviewDevice] = useState<DesignerDevice>('responsive');
  const [design, setDesign] = useState<GeneratedDesign | null>(() =>
    generateDesign(createInitialDesignerForm(), loadStoredSkills(), 0, undefined, DEFAULT_BREAKPOINTS),
  );
  const [history, setHistory] = useState<DesignerHistoryEntry[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>('hero');
  const [activeCodeTab, setActiveCodeTab] = useState<DesignerCodeTab>('html');
  const [generationCount, setGenerationCount] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [savedFolderPath, setSavedFolderPath] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const selectedLayer = useMemo(
    () => design?.layers.find((layer) => layer.id === selectedLayerId) ?? null,
    [design, selectedLayerId],
  );

  const persistSkills = (nextSkills: DesignerSkill[]) => {
    setSkills(nextSkills);
    window.localStorage.setItem(SKILLS_STORAGE_KEY, JSON.stringify(nextSkills));
  };

  const pushHistory = (nextDesign: GeneratedDesign, label: string) => {
    setHistory((entries) => [
      {
        id: `${nextDesign.id}-history`,
        label,
        timestamp: Date.now(),
        design: nextDesign,
      },
      ...entries,
    ].slice(0, 24));
  };

  const saveDesignToWorkspace = async (targetDesign: GeneratedDesign): Promise<string | null> => {
    if (!workspacePath) {
      setSaveError('Open a workspace before saving generated pages to the Design folder.');
      return null;
    }

    const root = normalizePath(workspacePath);
    const folderName = `${sanitizeFolderName(targetDesign.title)}-${exportStamp(targetDesign.createdAt)}`;
    const folderPath = `${root}/Design/${folderName}`;
    const metadata = {
      id: targetDesign.id,
      title: targetDesign.title,
      theme: targetDesign.selectedTheme.label,
      savedAt: new Date().toISOString(),
      summary: targetDesign.summary,
      responsiveNotes: targetDesign.responsiveNotes,
      accessibilityChecks: targetDesign.accessibilityChecks,
      suggestedImprovements: targetDesign.suggestedImprovements,
      layers: targetDesign.layers.map((layer) => ({
        id: layer.id,
        name: layer.name,
        type: layer.type,
        selector: layer.selector,
        visible: layer.visible,
      })),
    };

    await invoke<void>('write_file_content', {
      path: `${folderPath}/index.html`,
      content: buildExportDocument(targetDesign),
    });
    await invoke<void>('write_file_content', {
      path: `${folderPath}/styles.css`,
      content: targetDesign.css,
    });
    await invoke<void>('write_file_content', {
      path: `${folderPath}/designer-meta.json`,
      content: JSON.stringify(metadata, null, 2),
    });

    setSavedFolderPath(folderPath.replace(/\//g, '\\'));
    setSaveError(null);
    return folderPath;
  };

  const handleGenerate = async () => {
    const nextDesign = generateDesign(form, skills, generationCount, undefined, breakpoints);
    setGenerationCount((count) => count + 1);
    setDesign(nextDesign);
    setSelectedLayerId(nextDesign.layers[1]?.id ?? nextDesign.layers[0]?.id ?? null);
    pushHistory(nextDesign, `Generated ${generationCount}`);
    setSavedFolderPath(null);
    setSaveError(null);

    if (!workspacePath) return;

    setIsSaving(true);
    try {
      await saveDesignToWorkspace(nextDesign);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (!design) return;
    setIsSaving(true);
    try {
      await saveDesignToWorkspace(design);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const updateDesign = (updater: (current: GeneratedDesign) => GeneratedDesign) => {
    setDesign((current) => {
      if (!current) return current;
      return updater(current);
    });
    setSavedFolderPath(null);
  };

  const handleUpdateLayerStyle = (layerId: string, updates: Partial<DesignerLayerStyle>) => {
    updateDesign((current) => {
      const layers = current.layers.map((layer) =>
        layer.id === layerId
          ? { ...layer, style: { ...layer.style, ...updates } }
          : layer,
      );
      return refreshDesignCode({ ...current, layers }, form, breakpoints);
    });
  };

  const handleRenameLayer = (layerId: string, name: string) => {
    updateDesign((current) => {
      const layers = current.layers.map((layer) => (layer.id === layerId ? { ...layer, name } : layer));
      return refreshDesignCode({ ...current, layers }, form, breakpoints);
    });
  };

  const handleDuplicateLayer = (layerId: string) => {
    updateDesign((current) => {
      const target = current.layers.find((layer) => layer.id === layerId);
      if (!target) return current;
      const duplicate: DesignerLayer = {
        ...target,
        id: `${target.id}-copy-${Date.now()}`,
        name: `${target.name} copy`,
      };
      const targetIndex = current.layers.findIndex((layer) => layer.id === layerId);
      const layers = [
        ...current.layers.slice(0, targetIndex + 1),
        duplicate,
        ...current.layers.slice(targetIndex + 1),
      ];
      return refreshDesignCode({ ...current, layers }, form, breakpoints);
    });
  };

  const handleDeleteLayer = (layerId: string) => {
    updateDesign((current) => {
      const layers = current.layers.filter((layer) => layer.id !== layerId);
      if (selectedLayerId === layerId) {
        setSelectedLayerId(layers[0]?.id ?? null);
      }
      return refreshDesignCode({ ...current, layers }, form, breakpoints);
    });
  };

  const handleToggleLayer = (layerId: string) => {
    updateDesign((current) => {
      const layers = current.layers.map((layer) =>
        layer.id === layerId ? { ...layer, visible: !layer.visible } : layer,
      );
      return refreshDesignCode({ ...current, layers }, form, breakpoints);
    });
  };

  const handleRegenerateLayer = (layerId: string) => {
    updateDesign((current) => {
      const nextDesign = regenerateLayer(current, layerId);
      const refreshedDesign = refreshDesignCode(nextDesign, form, breakpoints);
      pushHistory(refreshedDesign, `Regenerated ${current.layers.find((layer) => layer.id === layerId)?.name ?? 'layer'}`);
      return refreshedDesign;
    });
  };

  const handleBreakpointsChange = (nextBreakpoints: DesignerBreakpoints) => {
    setBreakpoints(nextBreakpoints);
    updateDesign((current) => refreshDesignCode(current, form, nextBreakpoints));
  };

  const handleAddSkill = (text: string) => {
    persistSkills([
      {
        id: `skill-${Date.now()}`,
        text,
        createdAt: Date.now(),
      },
      ...skills,
    ]);
  };

  const handleRemoveSkill = (skillId: string) => {
    persistSkills(skills.filter((skill) => skill.id !== skillId));
  };

  const handleRestoreHistory = (entryId: string) => {
    const entry = history.find((item) => item.id === entryId);
    if (!entry) return;
    setDesign(entry.design);
    setSelectedLayerId(entry.design.layers[0]?.id ?? null);
    setSavedFolderPath(null);
  };

  const handleUndo = () => {
    if (history.length < 2) return;
    const previous = history[1];
    setDesign(previous.design);
    setSelectedLayerId(previous.design.layers[0]?.id ?? null);
    setHistory((entries) => entries.slice(1));
    setSavedFolderPath(null);
  };

  return (
    <div className={`h-screen w-screen overflow-hidden bg-theme-main font-mono text-theme-main ${theme === 'light' ? 'light-theme' : ''}`}>
      <header
        data-tauri-drag-region
        className="relative z-50 flex h-12 shrink-0 items-center border-b border-zinc-800/90 bg-[linear-gradient(180deg,rgba(24,24,29,0.96),rgba(12,12,15,0.92))] shadow-[0_10px_30px_rgba(0,0,0,0.35)] titlebar-drag"
      >
        <div className="flex h-full items-center titlebar-nodrag">
          <button
            onClick={onBack}
            className="flex h-full items-center gap-2 border-r border-zinc-800/80 px-4 text-zinc-500 transition-colors hover:bg-zinc-800/70 hover:text-zinc-100 cursor-pointer"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-[9px] font-bold uppercase tracking-[0.18em]">back</span>
          </button>
          <div className="flex h-full items-center gap-2.5 border-r border-zinc-800/80 px-4">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7h16M4 12h10M4 17h16M17 10l3 2-3 2" />
              </svg>
            </span>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-100">Designer</div>
              <div className="text-[9px] uppercase tracking-[0.16em] text-zinc-600">HTML/CSS visual generator</div>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-center px-4">
          <div className="truncate text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            {workspacePath ? `saving to ${workspacePath}\\Design` : 'preview mode / open a workspace to save files'}
          </div>
        </div>

        <div className="flex h-full items-center titlebar-nodrag">
          <button
            onClick={toggleTheme}
            className="flex h-full w-10 items-center justify-center border-l border-zinc-800/80 text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-100 cursor-pointer"
            title="Toggle theme"
            aria-label="Toggle theme"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v2M12 19v2M5.6 5.6L7 7M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4L7 17M17 7l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
          </button>
          {isWindows && (
            <div className="flex h-full border-l border-zinc-800/80">
              <button onClick={minimizeWindow} className="flex h-full w-[42px] items-center justify-center text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-200 cursor-pointer" title="Minimize">
                <svg className="h-2.5 w-2.5" viewBox="0 0 12 12"><rect fill="currentColor" width="10" height="1" x="1" y="5.5" /></svg>
              </button>
              <button onClick={maximizeWindow} className="flex h-full w-[42px] items-center justify-center text-zinc-500 hover:bg-zinc-800/70 hover:text-zinc-200 cursor-pointer" title="Maximize">
                <svg className="h-2.5 w-2.5" viewBox="0 0 12 12"><rect fill="none" stroke="currentColor" width="8" height="8" x="2" y="2" strokeWidth="1" /></svg>
              </button>
              <button onClick={closeWindow} className="flex h-full w-[48px] items-center justify-center text-zinc-500 hover:bg-[#c42b1c] hover:text-white cursor-pointer" title="Close">
                <svg className="h-2.5 w-2.5" viewBox="0 0 12 12"><path fill="none" stroke="currentColor" strokeWidth="1.2" d="M2.5,2.5 L9.5,9.5 M2.5,9.5 L9.5,2.5" /></svg>
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="grid h-[calc(100vh-3rem)] grid-cols-[360px_minmax(0,1fr)] overflow-hidden bg-[radial-gradient(900px_500px_at_18%_-10%,rgba(34,197,94,0.08),transparent),radial-gradient(760px_420px_at_90%_110%,rgba(56,189,248,0.08),transparent),#09090b]">
        <div className="min-h-0 overflow-y-auto border-r border-zinc-800/80 p-3">
          <div className="space-y-3">
            <DesignerPromptInput
              form={form}
              onChange={(updates) => setForm((current) => ({ ...current, ...updates }))}
              onGenerate={() => void handleGenerate()}
              isSaving={isSaving}
              canSave={Boolean(workspacePath)}
            />
            <ThemeSelector
              selectedThemeId={form.themeId}
              onSelect={(themeId) => setForm((current) => ({ ...current, themeId }))}
            />
            <SkillsManager skills={skills} onAddSkill={handleAddSkill} onRemoveSkill={handleRemoveSkill} />
            <DesignHistory
              entries={history}
              activeDesignId={design?.id ?? null}
              onRestore={handleRestoreHistory}
              onUndo={handleUndo}
            />
            <ExportControls
              design={design}
              workspacePath={workspacePath}
              savedFolderPath={savedFolderPath}
              isSaving={isSaving}
              saveError={saveError}
              onSave={() => void handleSave()}
            />
          </div>
        </div>

        <div className="grid min-w-0 grid-rows-[minmax(0,1fr)_290px] overflow-hidden">
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="grid min-h-0 grid-cols-[245px_minmax(0,1fr)_315px] overflow-hidden"
          >
            <ElementInspector
              layers={design?.layers ?? []}
              selectedLayerId={selectedLayerId}
              onSelectLayer={setSelectedLayerId}
              onRenameLayer={handleRenameLayer}
              onDuplicateLayer={handleDuplicateLayer}
              onDeleteLayer={handleDeleteLayer}
              onToggleLayer={handleToggleLayer}
            />
            <div className="flex min-w-0 flex-col overflow-hidden">
              <ResponsivePreviewControls
                previewDevice={previewDevice}
                breakpoints={breakpoints}
                onPreviewDeviceChange={setPreviewDevice}
                onBreakpointsChange={handleBreakpointsChange}
              />
              <div className="min-h-0 flex-1">
                <DesignPreview design={design} previewDevice={previewDevice} />
              </div>
            </div>
            <CustomizationPanel
              layer={selectedLayer}
              onUpdateStyle={handleUpdateLayerStyle}
              onRegenerateLayer={handleRegenerateLayer}
            />
          </motion.section>

          <div className="min-h-0 border-t border-zinc-800/80 p-3">
            <GeneratedCodePanel design={design} activeTab={activeCodeTab} onTabChange={setActiveCodeTab} />
          </div>
        </div>
      </main>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { Code, Copy, CursorClick, PaperPlaneRight, SelectionAll, X } from '@phosphor-icons/react';
import type {
  BrowserSelectedElement,
  BrowserUiIntegrationMode,
  CapturedUiElementReference,
} from '../../../types';
import { UiReferenceClipboardPanel } from '../UiReferenceClipboardPanel';
import { RichPromptEditor } from '../RichPromptEditor';
import { AgentTargetSelect, type AgentTargetOption } from '../AgentTargetSelect';

interface UiReferencesPanelProps {
  references: CapturedUiElementReference[];
  activeReference: CapturedUiElementReference | null;
  mode: BrowserUiIntegrationMode;
  selectedElement: BrowserSelectedElement | null;
  inspectMode: boolean;
  sessionOptions: AgentTargetOption[];
  targetSessionId: string | null;
  promptHtml: string;
  promptLength: number;
  isSubmitting: boolean;
  onClose: () => void;
  onSelect: (referenceId: string) => void;
  onRemove: (referenceId: string) => void;
  onCopyJson: (reference: CapturedUiElementReference) => void;
  onCopyHtml: (reference: CapturedUiElementReference) => void;
  onModeChange: (mode: BrowserUiIntegrationMode) => void;
  onToggleInspect: () => void;
  onStartCapture: () => void;
  onTargetSessionChange: (sessionId: string | null) => void;
  onPromptChange: (html: string) => void;
  onSend: () => void;
}

const Fact: React.FC<{ label: string; value: string; title?: string }> = ({ label, value, title }) => (
  <div className="bx-fact">
    <div className="bx-fact__label">{label}</div>
    <div className="bx-fact__value" title={title ?? value}>{value}</div>
  </div>
);

export const UiReferencesPanel: React.FC<UiReferencesPanelProps> = ({
  references,
  activeReference,
  mode,
  selectedElement,
  inspectMode,
  sessionOptions,
  targetSessionId,
  promptHtml,
  promptLength,
  isSubmitting,
  onClose,
  onSelect,
  onRemove,
  onCopyJson,
  onCopyHtml,
  onModeChange,
  onToggleInspect,
  onStartCapture,
  onTargetSessionChange,
  onPromptChange,
  onSend,
}) => {
  const [showDetails, setShowDetails] = useState(false);
  useEffect(() => setShowDetails(false), [activeReference?.id]);

  const canSend = !isSubmitting && sessionOptions.length > 0 && promptLength > 0
    && (mode === 'insert' || !!selectedElement);

  return (
    <aside className={`bx-panel${showDetails ? ' bx-panel--wide' : ''}`} aria-label="UI references">
      <div className="bx-panel__head">
        <div className="bx-panel__title">
          <SelectionAll size={15} aria-hidden="true" />
          UI references
          {references.length > 0 && <span className="bx-count">{references.length}</span>}
        </div>
        {activeReference && (
          <button
            type="button"
            className="bx-btn bx-btn--label"
            aria-pressed={showDetails}
            onClick={() => setShowDetails((value) => !value)}
            title="Show the captured structure and styles"
          >
            <Code size={13} aria-hidden="true" /> Details
          </button>
        )}
        <button type="button" className="bx-btn" onClick={onClose} aria-label="Close UI references">
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      <div className="bx-panel__body">
        <div className="bx-panel__stack">
          {showDetails && activeReference && (
            <>
              <section className="bx-section">
                <div className="bx-section__head">
                  <span>Capture</span>
                  <span className="bx-menu__meta">
                    {activeReference.structure.captureStats?.capturedNodeCount ?? activeReference.structure.childCount} nodes
                  </span>
                </div>
                <div className="bx-section__body bx-panel__stack">
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                    <span className="bx-chip bx-mono">&lt;{activeReference.tagName}&gt;</span>
                    <span className="bx-chip bx-mono" title={activeReference.selector}>{activeReference.selector}</span>
                  </div>
                  <div className="bx-facts">
                    <Fact label="Source" value={activeReference.sourceUrl.replace(/^https?:\/\//, '')} title={activeReference.sourceUrl} />
                    <Fact label="Page" value={activeReference.pageTitle || 'Untitled'} />
                    <Fact label="Viewport" value={`${activeReference.viewport.width}×${activeReference.viewport.height}`} />
                    <Fact label="Size" value={`${activeReference.layout.width}×${activeReference.layout.height}`} />
                    <Fact label="Layout" value={`${activeReference.layout.display} / ${activeReference.layout.position}`} />
                    <Fact label="Font" value={`${activeReference.typography.fontSize} ${activeReference.typography.fontWeight}`} title={activeReference.typography.fontFamily} />
                    <Fact label="Spacing" value={activeReference.spacing.padding} />
                    <Fact label="Hover states" value={String(activeReference.interactivity.hoverSelectors.length)} />
                  </div>
                </div>
              </section>

              <section className="bx-section">
                <div className="bx-section__head">
                  <span>HTML</span>
                  <button type="button" className="bx-btn bx-btn--sm bx-btn--label" onClick={() => onCopyHtml(activeReference)}>
                    <Copy size={12} aria-hidden="true" /> Copy
                  </button>
                </div>
                <pre className="bx-code bx-mono">{activeReference.htmlSnippet}</pre>
              </section>
            </>
          )}

          <UiReferenceClipboardPanel
            references={references}
            activeReferenceId={activeReference?.id ?? null}
            onSelect={onSelect}
            onRemove={onRemove}
            onCopyJson={onCopyJson}
            onStartCapture={onStartCapture}
          />

          {activeReference && (
            <section className="bx-section">
              <div className="bx-section__head">
                <span>Rebuild in your project</span>
              </div>
              <div className="bx-section__body bx-panel__stack">
                <div className="bx-choice" role="group" aria-label="Integration mode">
                  <button type="button" className="bx-choice__option" aria-pressed={mode === 'insert'} onClick={() => onModeChange('insert')}>
                    <span className="bx-choice__title">Add new</span>
                    <span className="bx-muted">Insert it somewhere on your site.</span>
                  </button>
                  <button type="button" className="bx-choice__option" aria-pressed={mode === 'replace'} onClick={() => onModeChange('replace')}>
                    <span className="bx-choice__title">Replace</span>
                    <span className="bx-muted">Swap an element already on your page.</span>
                  </button>
                </div>

                {mode === 'replace' && (
                  <div className="bx-panel__stack" style={{ gap: '0.375rem' }}>
                    <button
                      type="button"
                      className="bx-btn bx-btn--outline bx-tool bx-tool--inspect"
                      aria-pressed={inspectMode}
                      onClick={onToggleInspect}
                    >
                      <CursorClick size={13} aria-hidden="true" />
                      {inspectMode ? 'Click the element to replace…' : selectedElement ? 'Pick a different target' : 'Pick target on page'}
                    </button>
                    <div className="bx-chip bx-mono" style={{ height: 'auto', padding: '0.375rem 0.5rem' }}>
                      {selectedElement ? selectedElement.selectors[0] || selectedElement.tagName : 'No target selected'}
                    </div>
                  </div>
                )}

                <AgentTargetSelect
                  value={targetSessionId ?? ''}
                  options={sessionOptions}
                  onChange={onTargetSessionChange}
                />
                {sessionOptions.length === 0 && (
                  <p className="bx-muted" style={{ margin: 0 }}>Open an agent terminal (Claude, Codex, Gemini…) to send this reference.</p>
                )}

                <RichPromptEditor
                  initialHtml={promptHtml}
                  placeholder="Rebuild this as a reusable component for my landing page. Keep the spacing rhythm and hierarchy, use project-native code."
                  onChange={onPromptChange}
                  onSubmit={onSend}
                  submitting={isSubmitting}
                />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span className="bx-muted">
                    <span className="bx-kbd">Enter</span> send · <span className="bx-kbd">Shift</span>+<span className="bx-kbd">Enter</span> newline
                  </span>
                  <button type="button" className="bx-btn bx-btn--primary" onClick={onSend} disabled={!canSend}>
                    <PaperPlaneRight size={13} aria-hidden="true" />
                    {isSubmitting ? 'Sending…' : 'Send to agent'}
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </aside>
  );
};

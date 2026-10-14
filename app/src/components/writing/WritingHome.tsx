import React, { useMemo, useState } from 'react';
import { FileArrowUp, MagnifyingGlass, Trash } from '@phosphor-icons/react';
import { REPORT_CATEGORIES, searchReportTypes, type ReportCategory } from '../../utils/writing/reportTypes';
import { relativeTime } from './ui';
import type { ReportListing } from './useWritingDocument';
import { ReportIcon } from './wizard/reportIcons';

interface WritingHomeProps {
  workspaceName: string;
  reports: ReportListing[];
  loading: boolean;
  onPick: (typeId: string) => void;
  onOpen: (path: string) => void;
  onImport: () => void;
  onDelete: (path: string) => void;
}

/** The studio's start: documents to continue, and every kind of document to begin. */
export const WritingHome: React.FC<WritingHomeProps> = ({ workspaceName, reports, loading, onPick, onOpen, onImport, onDelete }) => {
  const [category, setCategory] = useState<ReportCategory | 'all'>('all');
  const [query, setQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const tabs: Array<{ id: ReportCategory | 'all'; label: string }> = useMemo(
    () => [{ id: 'all' as const, label: 'All' }, ...REPORT_CATEGORIES],
    [],
  );
  const activeIndex = Math.max(0, tabs.findIndex((tab) => tab.id === category));
  const onTabsKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    let next = activeIndex;
    if (event.key === 'ArrowRight') next = (activeIndex + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (activeIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    const target = tabs[next];
    if (target && target.id !== category) setCategory(target.id);
    requestAnimationFrame(() => {
      (event.currentTarget.querySelector(`#wr-home-tab-${String(tabs[next]?.id)}`) as HTMLElement | null)?.focus();
    });
  };
  const kinds = useMemo(
    () => searchReportTypes(query).filter((type) => query.trim() !== '' || category === 'all' || type.category === category),
    [category, query],
  );

  return (
    <div className="wr-home">
      <div className="wr-home__inner">
        <header className="wr-home__head">
          <div>
            <div className="wr-home__kicker">{workspaceName}</div>
            <h1 className="wr-home__title">Writing</h1>
          </div>
          <button type="button" className="wr-btn" onClick={onImport}><FileArrowUp size={14} /> Import Word document</button>
        </header>

        {(reports.length > 0 || loading) && (
          <section className="wr-home__section">
            <h2 className="wr-home__heading">Recent</h2>
            {loading && reports.length === 0 ? (
              <p className="wr-note">Looking for documents…</p>
            ) : (
              <ul className="wr-recent">
                {reports.slice(0, 8).map((report) => (
                  <li key={report.path} className="wr-recent__row">
                    <button type="button" className="wr-recent__open" onClick={() => onOpen(report.path)} title={report.path}>
                      <span className="wr-recent__sheet" aria-hidden="true" />
                      <span className="wr-recent__name">{report.title}</span>
                      <span className="wr-recent__time">{relativeTime(report.modifiedAt)}</span>
                    </button>
                    {confirmDelete === report.path ? (
                      <span className="wr-recent__confirm">
                        <button type="button" className="wr-btn wr-btn--sm wr-btn--danger" onClick={() => { setConfirmDelete(null); onDelete(report.path); }}>Delete</button>
                        <button type="button" className="wr-btn wr-btn--sm" onClick={() => setConfirmDelete(null)}>Keep</button>
                      </span>
                    ) : (
                      <button type="button" className="wr-icon wr-recent__delete" aria-label={`Delete ${report.title}`} title="Delete" onClick={() => setConfirmDelete(report.path)}><Trash size={13} /></button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="wr-home__section">
          <div className="wr-home__bar">
            <h2 className="wr-home__heading">New document</h2>
            <label className="wr-search">
              <MagnifyingGlass size={13} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" aria-label="Search kinds of document" />
            </label>
          </div>
          {!query.trim() && (
            <div className="wr-tabs" role="tablist" aria-label="Category" onKeyDown={onTabsKeyDown}>
              {tabs.map((entry, index) => (
                <button key={entry.id} id={`wr-home-tab-${entry.id}`} type="button" role="tab" aria-selected={category === entry.id} tabIndex={index === activeIndex ? 0 : -1} className="wr-tabs__tab" onClick={() => setCategory(entry.id)}>
                  {entry.label}
                </button>
              ))}
            </div>
          )}
          <div className="wr-kinds">
            {kinds.map((type) => (
              <button key={type.id} type="button" className="wr-kind" onClick={() => onPick(type.id)}>
                <span className="wr-kind__icon"><ReportIcon name={type.icon} size={17} /></span>
                <span className="wr-kind__text">
                  <span className="wr-kind__name">{type.name}</span>
                  <span className="wr-kind__desc">{type.description}</span>
                </span>
              </button>
            ))}
            {kinds.length === 0 && <p className="wr-note">Nothing matches “{query}”. Custom Report takes any description.</p>}
          </div>
        </section>
      </div>
    </div>
  );
};

import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { ArrowSquareOut, MagnifyingGlass, X } from '@phosphor-icons/react';
import LatticeLoader from '../reactbits/LatticeLoader';
import { usePresentationStore } from '../../stores/presentationStore';
import { searchStockImages, STOCK_PROVIDERS, type StockImage, type StockProviderId } from '../../utils/presentation/stockImages';

interface StockImagePickerProps {
  initialQuery: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onPick: (image: StockImage, apiKey: string) => void;
}

const EASE = [0.32, 0.72, 0, 1] as const;

/** Search a stock-photo service and pick one for the selected slide. */
export const StockImagePicker: React.FC<StockImagePickerProps> = ({ initialQuery, busy, error, onClose, onPick }) => {
  const saved = usePresentationStore((state) => state.stockProvider);
  const keys = usePresentationStore((state) => state.stockKeys);
  const [provider, setProvider] = useState<StockProviderId>(saved === 'off' ? 'openverse' : saved);
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<StockImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const meta = STOCK_PROVIDERS.find((entry) => entry.id === provider)!;
  const key = provider === 'unsplash' ? keys.unsplash : provider === 'pexels' ? keys.pexels : '';
  const missingKey = meta.needsKey && !key;

  const search = useCallback(async (nextPage = 1): Promise<void> => {
    if (!query.trim() || missingKey) return;
    setLoading(true);
    setSearchError(null);
    try {
      const found = await searchStockImages(provider, query, nextPage, key);
      setResults((current) => (nextPage === 1 ? found : [...current, ...found]));
      setPage(nextPage);
    } catch (reason) {
      setSearchError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, [key, missingKey, provider, query]);

  // Search straight away for the slide's own description.
  useEffect(() => {
    if (initialQuery.trim()) void search(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [busy, onClose]);

  return (
    <div className="pr-modal" role="dialog" aria-modal="true" aria-label="Search photos" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <motion.div className="pr-modal__panel pr-stock" initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.3, ease: EASE }}>
        <div className="pr-row">
          <span className="pr-eyebrow"><MagnifyingGlass size={12} /> Search photos</span>
          <button type="button" className="pr-icon-btn" onClick={onClose} aria-label="Close" disabled={busy}><X size={15} /></button>
        </div>
        <form className="pr-stock__search" onSubmit={(event) => { event.preventDefault(); void search(1); }}>
          <input className="pr-input" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="e.g. team planning around a whiteboard" onKeyDown={(event) => event.stopPropagation()} />
          <select className="pr-select" value={provider} onChange={(event) => { setProvider(event.target.value as StockProviderId); setResults([]); }} aria-label="Photo service">
            {STOCK_PROVIDERS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
          </select>
          <button type="submit" className="pr-btn pr-btn--primary" disabled={!query.trim() || loading || missingKey}>Search</button>
        </form>
        <p className="pr-hint">
          {meta.hint}{' '}
          {meta.keyUrl && <button type="button" className="pr-link pr-link--inline" onClick={() => void openUrl(meta.keyUrl!).catch(() => undefined)}>Get a key <ArrowSquareOut size={11} /></button>}
        </p>
        {missingKey && <div className="pr-error">Add your {meta.label} key in Settings → Presentation → Images, or search Openverse, which needs none.</div>}
        {(searchError || error) && <div className="pr-error">{searchError ?? error}</div>}
        <div className="pr-stock__grid">
          {results.map((image) => (
            <button key={`${image.provider}:${image.id}`} type="button" className="pr-stock__item" disabled={busy} title={image.title || image.author} onClick={() => onPick(image, key)}>
              <img src={image.thumbUrl} alt={image.title} loading="lazy" draggable={false} />
              <span>{image.author || 'Unknown'}{image.license ? ` · ${image.license}` : ''}</span>
            </button>
          ))}
          {!loading && results.length === 0 && !missingKey && <p className="pr-hint pr-stock__empty">{query.trim() ? 'No results yet. Try other words.' : 'Describe the picture you need.'}</p>}
        </div>
        {loading && <div className="pr-stock__loading"><LatticeLoader label="Searching" status="working" pattern="sweep" color="var(--accent)" fontSize={13} /></div>}
        {busy && <div className="pr-stock__loading"><LatticeLoader label="Adding the photo" status="working" pattern="ripple" color="var(--accent)" fontSize={13} /></div>}
        {results.length > 0 && !loading && results.length % 24 === 0 && (
          <button type="button" className="pr-btn pr-btn--sm" onClick={() => void search(page + 1)}>More results</button>
        )}
        <p className="pr-hint">The photo is saved into the presentation's assets folder, with its credit shown on the slide and in the speaker notes.</p>
      </motion.div>
    </div>
  );
};

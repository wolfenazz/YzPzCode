import React, { memo, useEffect, useMemo, useState } from 'react';
import { buildHtmlPreview } from '../../utils/htmlPreview';
import { localFileUrl } from '../../utils/mediaFiles';

interface HtmlPreviewProps {
  content: string;
  filePath: string;
}

const REDRAW_DELAY_MS = 300;

/**
 * Draws an HTML file as a browser would. The page is untrusted: it runs in a frame
 * with no `allow-same-origin`, so it gets an opaque origin and cannot reach the app's
 * storage, DOM or IPC (Tauri refuses a request whose Origin is not a URL).
 */
const HtmlPreviewInner: React.FC<HtmlPreviewProps> = ({ content, filePath }) => {
  const [shown, setShown] = useState(content);

  // Typing redraws the page after a short pause, not on every key.
  useEffect(() => {
    if (content === shown) return;
    const timer = window.setTimeout(() => setShown(content), REDRAW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [content, shown]);

  const srcDoc = useMemo(() => buildHtmlPreview(shown, filePath, localFileUrl), [shown, filePath]);

  return (
    <iframe
      key={filePath}
      title="HTML preview"
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-forms allow-modals"
      className="h-full w-full border-0"
      // A page without its own background is drawn on white, as in a browser.
      style={{ background: '#ffffff', colorScheme: 'normal' }}
    />
  );
};

export const HtmlPreview = memo(HtmlPreviewInner);

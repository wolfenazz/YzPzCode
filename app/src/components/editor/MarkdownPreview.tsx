import React, { memo, useMemo, useRef } from 'react';
import { Marked } from 'marked';
import hljs from 'highlight.js';

interface MarkdownPreviewProps {
  content: string;
  theme: 'dark' | 'light';
}

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
      const highlighted = hljs.highlight(text, { language }).value;
      return `<pre class="md-code-block"><code class="hljs language-${language}">${highlighted}</code></pre>`;
    },
  },
});

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = React.useState(value);
  const lastUpdateRef = useRef(Date.now());

  if (Date.now() - lastUpdateRef.current >= delay || value === debouncedValue) {
    lastUpdateRef.current = Date.now();
    if (value !== debouncedValue) {
      setDebouncedValue(value);
    }
  }

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
      lastUpdateRef.current = Date.now();
    }, delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

const MarkdownPreviewInner: React.FC<MarkdownPreviewProps> = ({ content, theme }) => {
  const debouncedContent = useDebouncedValue(content, 300);

  const html = useMemo(() => {
    try {
      return marked.parse(debouncedContent) as string;
    } catch {
      return '<p>Failed to render markdown</p>';
    }
  }, [debouncedContent]);

  return (
    <div className={`markdown-preview absolute inset-0 overflow-y-auto overflow-x-hidden p-6 ${theme === 'light' ? 'markdown-light' : 'markdown-dark'}`}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
};

export const MarkdownPreview = memo(MarkdownPreviewInner);

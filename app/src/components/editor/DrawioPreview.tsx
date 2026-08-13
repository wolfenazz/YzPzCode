import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '../../stores/appStore';

interface DrawioPreviewProps {
  filePath: string;
  content: string;
}

interface DrawioMessage {
  event: string;
  xml?: string;
}

const drawioBaseUrl = (): string =>
  new URL('drawio/index.html', window.location.href).href;

export const DrawioPreview: React.FC<DrawioPreviewProps> = ({ filePath, content }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const contentRef = useRef(content);
  const isDark = useAppStore((s) => s.theme) === 'dark';
  const updateFileContent = useAppStore((s) => s.updateFileContent);
  const markFileSaved = useAppStore((s) => s.markFileSaved);
  const closeFileTab = useAppStore((s) => s.closeFileTab);
  const fileName = filePath.split(/[\\/]/).pop() ?? 'diagram';

  contentRef.current = content;

  const send = useCallback((msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(JSON.stringify(msg), '*');
  }, []);

  const persist = useCallback(
    async (xml: string) => {
      updateFileContent(filePath, xml);
      try {
        await invoke('write_file_content', { path: filePath, content: xml });
        markFileSaved(filePath);
      } catch (err) {
        console.error('Failed to save draw.io file:', err);
      }
    },
    [filePath, updateFileContent, markFileSaved]
  );

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;

      let data: DrawioMessage | null = null;
      try {
        data = JSON.parse(event.data) as DrawioMessage;
      } catch {
        return;
      }
      if (!data || typeof data.event !== 'string') return;

      switch (data.event) {
        case 'configure':
          send({
            action: 'configure',
            config: {
              compressXml: false,
              defaultLibraries: 'general',
              noAutoFocus: true,
            },
          });
          break;
        case 'init':
          send({
            action: 'load',
            xml: contentRef.current,
            autosave: 1,
            title: fileName,
            dark: isDark ? 1 : 0,
            fit: 1,
            border: 0,
          });
          break;
        case 'save':
        case 'autosave':
          if (typeof data.xml === 'string') {
            void persist(data.xml);
          }
          break;
        case 'exit':
          if (typeof data.xml === 'string') {
            void persist(data.xml);
          }
          closeFileTab(filePath);
          break;
        default:
          break;
      }
    },
    [send, persist, closeFileTab, filePath, fileName, isDark]
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  const src = useMemo(() => {
    const params = new URLSearchParams({
      embed: '1',
      proto: 'json',
      configure: '1',
      spin: '1',
      libraries: '1',
      ui: 'atlas',
      dark: isDark ? '1' : '0',
    });
    return `${drawioBaseUrl()}?${params.toString()}`;
  }, [isDark]);

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title="draw.io editor"
      className="h-full w-full border-0"
      style={{ background: isDark ? '#0d1117' : '#ffffff' }}
    />
  );
};

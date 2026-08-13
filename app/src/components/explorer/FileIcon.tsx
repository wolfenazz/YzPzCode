import React, { memo, useState, useCallback } from 'react';
import { getIconForFilePath } from 'vscode-material-icons';

interface FileIconProps {
  extension: string | null;
  isDir: boolean;
  isOpen?: boolean;
  className?: string;
  name?: string;
}

const EXTENSION_COLORS: Record<string, string> = {
  ts: '#3b82f6',
  tsx: '#3b82f6',
  js: '#eab308',
  jsx: '#eab308',
  mjs: '#eab308',
  rs: '#f97316',
  py: '#22c55e',
  html: '#ef4444',
  htm: '#ef4444',
  css: '#a855f7',
  scss: '#a855f7',
  sass: '#a855f7',
  json: '#b7b5a6',
  md: '#dcd8cc',
  toml: '#f97316',
  yaml: '#ef4444',
  yml: '#ef4444',
  xml: '#ef4444',
  drawio: '#f59e0b',
  dio: '#f59e0b',
  sql: '#3b82f6',
  sh: '#22c55e',
  bash: '#22c55e',
  go: '#06b6d4',
  java: '#f97316',
  c: '#3b82f6',
  h: '#3b82f6',
  cpp: '#3b82f6',
  rb: '#ef4444',
  php: '#a855f7',
  swift: '#f97316',
  kt: '#a855f7',
  lua: '#3b82f6',
  zig: '#f97316',
  png: '#22c55e',
  jpg: '#22c55e',
  jpeg: '#22c55e',
  svg: '#f97316',
  gif: '#22c55e',
  webp: '#22c55e',
  pdf: '#ef4444',
  docx: '#3b82f6',
  doc: '#3b82f6',
  xlsx: '#22c55e',
  xls: '#22c55e',
  pptx: '#f97316',
  ppt: '#f97316',
  env: '#eab308',
  lock: '#b7b5a6',
};

const FOLDER_CLOSED_SVG = (
  <svg viewBox="0 0 16 16" fill="none" className="w-full h-full">
    <path
      d="M1.5 3.5C1.5 2.67 2.17 2 3 2h3.59a1 1 0 01.7.3l1.42 1.4a1 1 0 00.7.3H13a1.5 1.5 0 011.5 1.5V12.5a1.5 1.5 0 01-1.5 1.5H3A1.5 1.5 0 011.5 12.5v-9z"
      fill="#eab308"
      fillOpacity={0.15}
      stroke="#eab308"
      strokeWidth={0.8}
    />
    <path
      d="M1.5 5.5h13"
      stroke="#eab308"
      strokeWidth={0.5}
      strokeOpacity={0.4}
    />
  </svg>
);

const FOLDER_OPEN_SVG = (
  <svg viewBox="0 0 16 16" fill="none" className="w-full h-full">
    <path
      d="M1.5 3.5C1.5 2.67 2.17 2 3 2h3.59a1 1 0 01.7.3l1.42 1.4a1 1 0 00.7.3H13a1.5 1.5 0 011.5 1.5V6H3.5L1.5 12.5v-9z"
      fill="#eab308"
      fillOpacity={0.12}
      stroke="#eab308"
      strokeWidth={0.8}
    />
    <path
      d="M3.5 6l-2 7h12a1 1 0 001-.75l1.2-5A1 1 0 0014.7 6H3.5z"
      fill="#eab308"
      fillOpacity={0.25}
      stroke="#eab308"
      strokeWidth={0.8}
    />
  </svg>
);

const FileSvgIcon: React.FC<{ color: string; className?: string }> = ({
  color,
  className,
}) => (
  <svg className={className} viewBox="0 0 16 16" fill="none">
    <path
      d="M4 1.5h5L12 4.5v10a1 1 0 01-1 1H4a1 1 0 01-1-1v-13a1 1 0 011-1z"
      stroke={color}
      strokeWidth="1.2"
    />
    <path d="M9 1.5v3h3" stroke={color} strokeWidth="1.2" />
  </svg>
);

const MaterialIcon: React.FC<{
  iconName: string;
  className?: string;
}> = ({ iconName, className }) => {
  const [hasError, setHasError] = useState(false);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  if (hasError) {
    return <FileSvgIcon color="#b7b5a6" className={className} />;
  }

  return (
    <img
      src={`/material-icons/${iconName}.svg`}
      alt=""
      className={className}
      onError={handleError}
      draggable={false}
    />
  );
};

const FileIconInner: React.FC<FileIconProps> = ({
  extension,
  isDir,
  isOpen,
  className = 'w-4 h-4',
  name,
}) => {
  if (isDir) {
    return (
      <div className={className}>
        {isOpen ? FOLDER_OPEN_SVG : FOLDER_CLOSED_SVG}
      </div>
    );
  }

  if (name) {
    try {
      const icon = getIconForFilePath(name);
      if (icon) {
        return <MaterialIcon iconName={icon} className={className} />;
      }
    } catch {
      // fall through to default
    }
  }

  const color = extension
    ? EXTENSION_COLORS[extension.toLowerCase()] ?? '#b7b5a6'
    : '#b7b5a6';
  return <FileSvgIcon color={color} className={className} />;
};

export const FileIcon = memo(FileIconInner);

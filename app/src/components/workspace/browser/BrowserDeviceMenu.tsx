import React, { useEffect, useState } from 'react';
import {
  ArrowsOutSimple,
  CaretDown,
  Check,
  DeviceMobile,
  DeviceRotate,
  DeviceTablet,
  Desktop,
  Minus,
  Plus,
  Ruler,
} from '@phosphor-icons/react';
import type {
  BrowserDeviceId,
  BrowserDeviceOrientation,
  BrowserDevicePreset,
  BrowserViewportSize,
} from '../../../types';
import { BrowserMenu } from './BrowserMenu';
import { BROWSER_DEVICES, DEVICE_GROUPS, getNextZoom, MAX_ZOOM, MIN_ZOOM, type ViewportMetrics } from './browserModel';

interface BrowserDeviceMenuProps {
  device: BrowserDevicePreset;
  orientation: BrowserDeviceOrientation;
  zoom: number;
  metrics: ViewportMetrics;
  customViewport: BrowserViewportSize;
  onDeviceChange: (id: BrowserDeviceId) => void;
  onRotate: () => void;
  onZoomChange: (zoom: number) => void;
  onCustomViewportChange: (size: BrowserViewportSize) => void;
}

export const deviceIcon = (category: BrowserDevicePreset['category'], size = 14) => {
  switch (category) {
    case 'mobile': return <DeviceMobile size={size} aria-hidden="true" />;
    case 'tablet': return <DeviceTablet size={size} aria-hidden="true" />;
    case 'desktop': return <Desktop size={size} aria-hidden="true" />;
    case 'custom': return <Ruler size={size} aria-hidden="true" />;
    default: return <ArrowsOutSimple size={size} aria-hidden="true" />;
  }
};

const CustomSizeFields: React.FC<{
  value: BrowserViewportSize;
  onCommit: (size: BrowserViewportSize) => void;
}> = ({ value, onCommit }) => {
  const [width, setWidth] = useState(String(value.width));
  const [height, setHeight] = useState(String(value.height));

  useEffect(() => {
    setWidth(String(value.width));
    setHeight(String(value.height));
  }, [value.height, value.width]);

  const commit = () => {
    const nextWidth = Number(width);
    const nextHeight = Number(height);
    if (Number.isFinite(nextWidth) && Number.isFinite(nextHeight) && nextWidth > 0 && nextHeight > 0) {
      onCommit({ width: nextWidth, height: nextHeight });
    } else {
      setWidth(String(value.width));
      setHeight(String(value.height));
    }
  };

  const fieldProps = {
    type: 'number' as const,
    min: 240,
    max: 3840,
    className: 'bx-field',
    onBlur: commit,
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') commit();
    },
  };

  return (
    <div className="bx-menu__row">
      <input {...fieldProps} aria-label="Custom viewport width" value={width} onChange={(event) => setWidth(event.target.value)} />
      <span className="bx-menu__meta">×</span>
      <input {...fieldProps} aria-label="Custom viewport height" value={height} onChange={(event) => setHeight(event.target.value)} />
    </div>
  );
};

export const BrowserDeviceMenu: React.FC<BrowserDeviceMenuProps> = ({
  device,
  orientation,
  zoom,
  metrics,
  customViewport,
  onDeviceChange,
  onRotate,
  onZoomChange,
  onCustomViewportChange,
}) => {
  const [open, setOpen] = useState(false);
  const isEmulated = device.category !== 'responsive';
  const shownZoom = isEmulated ? metrics.webviewZoom : zoom;

  const select = (id: BrowserDeviceId) => {
    onDeviceChange(id);
    if (id !== 'custom') setOpen(false);
  };

  return (
    <BrowserMenu
      open={open}
      onOpenChange={setOpen}
      label="Viewport"
      align="end"
      kind="dialog"
      width="17rem"
      trigger={(props) => (
        <button
          {...props}
          type="button"
          className="bx-btn bx-btn--label"
          title={`Viewport: ${device.label} · ${metrics.cssWidth}×${metrics.cssHeight}`}
          aria-label={`Viewport: ${device.label}`}
        >
          {deviceIcon(device.category)}
          <span className="bx-hide-narrow">{device.label}</span>
          {isEmulated && (
            <span className="bx-menu__meta bx-hide-narrow">{metrics.cssWidth}×{metrics.cssHeight}</span>
          )}
          <CaretDown size={11} aria-hidden="true" />
        </button>
      )}
    >
      <button
        type="button"
        role="menuitemradio"
        aria-checked={device.id === 'responsive'}
        className="bx-menu__item"
        onClick={() => select('responsive')}
      >
        {deviceIcon('responsive')}
        <span className="bx-menu__text">Responsive</span>
        <span className="bx-menu__meta">fill pane</span>
      </button>

      {DEVICE_GROUPS.map((group) => (
        <React.Fragment key={group.category}>
          <div className="bx-menu__label">{group.label}</div>
          {BROWSER_DEVICES.filter((entry) => entry.category === group.category).map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="menuitemradio"
              aria-checked={device.id === entry.id}
              className="bx-menu__item"
              onClick={() => select(entry.id)}
            >
              {deviceIcon(entry.category)}
              <span className="bx-menu__text">{entry.label}</span>
              <span className="bx-menu__meta">{entry.width}×{entry.height}</span>
              {device.id === entry.id && <Check size={12} aria-hidden="true" />}
            </button>
          ))}
        </React.Fragment>
      ))}

      <div className="bx-menu__label">Custom</div>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={device.id === 'custom'}
        className="bx-menu__item"
        onClick={() => select('custom')}
      >
        {deviceIcon('custom')}
        <span className="bx-menu__text">Custom size</span>
        <span className="bx-menu__meta">{customViewport.width}×{customViewport.height}</span>
      </button>
      {device.id === 'custom' && (
        <CustomSizeFields value={customViewport} onCommit={onCustomViewportChange} />
      )}

      <div className="bx-menu__separator" />

      <div className="bx-menu__row" style={{ justifyContent: 'space-between' }}>
        <span className="bx-menu__meta">Zoom{metrics.fitted ? ' · fit to pane' : ''}</span>
        <div className="bx-group">
          <button
            type="button"
            className="bx-btn bx-btn--sm"
            onClick={() => onZoomChange(getNextZoom(shownZoom, -1))}
            disabled={shownZoom <= MIN_ZOOM}
            aria-label="Zoom out"
            title="Zoom out (Ctrl+-)"
          >
            <Minus size={12} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="bx-btn bx-btn--sm bx-btn--label"
            onClick={() => onZoomChange(1)}
            aria-label="Reset zoom"
            title="Reset zoom (Ctrl+0)"
            style={{ minWidth: '3rem', fontVariantNumeric: 'tabular-nums' }}
          >
            {Math.round(shownZoom * 100)}%
          </button>
          <button
            type="button"
            className="bx-btn bx-btn--sm"
            onClick={() => onZoomChange(getNextZoom(zoom, 1))}
            disabled={zoom >= MAX_ZOOM || (isEmulated && metrics.fitted)}
            aria-label="Zoom in"
            title="Zoom in (Ctrl+=)"
          >
            <Plus size={12} aria-hidden="true" />
          </button>
        </div>
      </div>

      {isEmulated && device.category !== 'custom' && (
        <button type="button" className="bx-menu__item" onClick={onRotate}>
          <DeviceRotate size={14} aria-hidden="true" />
          <span className="bx-menu__text">Rotate</span>
          <span className="bx-menu__meta">{orientation}</span>
        </button>
      )}
    </BrowserMenu>
  );
};

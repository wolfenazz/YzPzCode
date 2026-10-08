import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import { Channel, invoke } from '@tauri-apps/api/core';
import type { DeviceSkin, EmulatorInfo, IosFrame } from '../../../types';
import { deviceCommand, deviceLayout, iosFrameGeometry, keyAction, screenOnlyGeometry, streamBound, wheelPixels, wheelToDrag } from './deviceModel';
import type { FrameGeometry, IosGeometry } from './deviceModel';

interface EmulatorScreenProps {
  emulator: EmulatorInfo;
  /** iOS: the simulator model's display shape, for the drawn body. */
  iosFrame?: IosFrame | null;
  /** False while the panel or workspace is hidden: the stream pauses. */
  active: boolean;
  showFrame: boolean;
  /** Overlay the delivered frame rate and frame size. */
  showStats?: boolean;
  onRotationChange?: (rotation: number) => void;
  onNotice?: (message: string) => void;
}

interface TouchPoint { id: number; u: number; v: number; down: boolean }

type ScreenEvent =
  | { type: 'meta'; width: number; height: number; rotation: number; displayOff: boolean; naturalOrientation: boolean }
  | { type: 'stats'; fps: number }
  | { type: 'end' };

const STAGE_PADDING = 14;
const MAX_TOUCH_ID = 8;

// Skins never change while the app runs; load each AVD's once.
const skinCache = new Map<string, Promise<DeviceSkin | null>>();
function loadSkin(avdName: string): Promise<DeviceSkin | null> {
  let pending = skinCache.get(avdName);
  if (!pending) {
    pending = invoke<DeviceSkin | null>('android_avd_skin', { avdName }).catch(() => null);
    skinCache.set(avdName, pending);
  }
  return pending;
}

function useElementSize(ref: React.RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((prev) => (prev.width === Math.round(width) && prev.height === Math.round(height) ? prev : { width: Math.round(width), height: Math.round(height) }));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * The live screen of an Android emulator (inside the AVD's own frame, from
 * its SDK skin) or an iOS simulator (inside a body drawn for its model).
 * Frames arrive as an MJPEG stream the browser decodes natively; geometry,
 * rotation and frame rate come over a Tauri channel. Pointer input becomes
 * touches, the wheel becomes short drags, and keys go to the device while the
 * screen has focus.
 */
export function EmulatorScreen({ emulator, iosFrame = null, active, showFrame, showStats = false, onRotationChange, onNotice }: EmulatorScreenProps): React.JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null);
  const stage = useElementSize(stageRef);
  const [skin, setSkin] = useState<DeviceSkin | null>(null);
  const [rotation, setRotation] = useState(0);
  const [naturalFrames, setNaturalFrames] = useState(false);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [hasFrame, setHasFrame] = useState(false);
  const [displayOff, setDisplayOff] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [stats, setStats] = useState<{ fps: number; size: string } | null>(null);
  // Read through a ref so a new callback identity never restarts the stream.
  const rotationListener = useRef(onRotationChange);
  rotationListener.current = onRotationChange;

  const ios = emulator.platform === 'ios';
  const command = (action: Parameters<typeof deviceCommand>[1]): string => deviceCommand(emulator.platform, action);

  useEffect(() => {
    let current = true;
    setSkin(null);
    if (!ios) void loadSkin(emulator.avdName).then((loaded) => { if (current) setSkin(loaded); });
    return () => { current = false; };
  }, [emulator.avdName, ios]);

  const deviceWidth = emulator.width || skin?.screenWidth || (ios ? 1179 : 1080);
  const deviceHeight = emulator.height || skin?.screenHeight || (ios ? 2556 : 2400);
  const iosBody: IosGeometry | null = useMemo(
    () => (ios && showFrame && iosFrame ? iosFrameGeometry(deviceWidth, deviceHeight, iosFrame) : null),
    [ios, showFrame, iosFrame, deviceWidth, deviceHeight],
  );
  const geometry: FrameGeometry = useMemo(
    () => iosBody ?? (showFrame && skin?.background ? skin : screenOnlyGeometry(deviceWidth, deviceHeight, (ios ? iosFrame?.cornerRadius : skin?.cornerRadius) ?? null)),
    [iosBody, showFrame, skin, ios, iosFrame, deviceWidth, deviceHeight],
  );
  const layout = deviceLayout(stage.width - STAGE_PADDING * 2, stage.height - STAGE_PADDING * 2, geometry, rotation, naturalFrames);
  const pixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const bound = useDebounced(layout ? streamBound(layout.screen.width, layout.screen.height, pixelRatio, deviceWidth, deviceHeight) : 0, 250);
  const running = emulator.phase === 'Running';

  // ── Stream ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!active || !running || bound <= 0) return;
    let cancelled = false;
    let streamId: string | null = null;
    const channel = new Channel<ScreenEvent>();
    channel.onmessage = (event) => {
      if (cancelled) return;
      if (event.type === 'meta') {
        setDisplayOff(event.displayOff);
        setNaturalFrames(event.naturalOrientation);
        setRotation(event.rotation % 4);
        rotationListener.current?.(event.rotation % 4);
        setStats((prev) => ({ fps: prev?.fps ?? 0, size: `${event.width}×${event.height}` }));
      } else if (event.type === 'stats') {
        setStats((prev) => ({ fps: event.fps, size: prev?.size ?? '' }));
      } else {
        // The emulator ended the stream; reconnect shortly if it is still up.
        setTimeout(() => { if (!cancelled) setRetry((n) => n + 1); }, 800);
      }
    };
    setStreamError(null);
    const stopCommand = deviceCommand(emulator.platform, 'stream_stop');
    invoke<{ streamId: string; url: string }>(deviceCommand(emulator.platform, 'stream_start'), { serial: emulator.serial, width: bound, height: bound, channel })
      .then((info) => {
        if (cancelled) { void invoke(stopCommand, { streamId: info.streamId }); return; }
        streamId = info.streamId;
        setStreamUrl(info.url);
      })
      .catch((error: unknown) => { if (!cancelled) setStreamError(String(error)); });
    return () => {
      cancelled = true;
      setStreamUrl(null);
      if (streamId) void invoke(stopCommand, { streamId });
    };
  }, [active, running, bound, emulator.serial, emulator.platform, retry]);

  useEffect(() => { if (!running) setHasFrame(false); }, [running]);

  // ── Touch ────────────────────────────────────────────────────────────
  const touchIds = useRef(new Map<number, number[]>());
  const pendingMoves = useRef(new Map<number, TouchPoint[]>());
  const moveFrame = useRef<number | null>(null);

  const sendTouches = useCallback((points: TouchPoint[]) => {
    void invoke(deviceCommand(emulator.platform, 'touch'), { serial: emulator.serial, points }).catch(() => undefined);
  }, [emulator.serial, emulator.platform]);

  const flushMoves = useCallback(() => {
    moveFrame.current = null;
    const points = [...pendingMoves.current.values()].flat();
    pendingMoves.current.clear();
    if (points.length) sendTouches(points);
  }, [sendTouches]);

  // The screen element is rotated with the body; its bounding box is the
  // upright picture on screen, so 0..1 coordinates match the frame image.
  const pointFor = (event: ReactPointerEvent<HTMLElement>): [number, number] => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height];
  };

  const pointsFor = (ids: number[], u: number, v: number, down: boolean): TouchPoint[] =>
    // Ctrl+drag pinches: the second finger mirrors the first through the centre.
    ids.map((id, index) => (index === 0 ? { id, u, v, down } : { id, u: 1 - u, v: 1 - v, down }));

  const freeIds = (count: number): number[] => {
    const used = new Set([...touchIds.current.values()].flat());
    const ids: number[] = [];
    for (let id = 1; id <= MAX_TOUCH_ID && ids.length < count; id++) if (!used.has(id)) ids.push(id);
    return ids;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!running || event.button > 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    const ids = freeIds(event.ctrlKey ? 2 : 1);
    if (!ids.length) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    touchIds.current.set(event.pointerId, ids);
    const [u, v] = pointFor(event);
    sendTouches(pointsFor(ids, u, v, true));
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const ids = touchIds.current.get(event.pointerId);
    if (!ids) return;
    const [u, v] = pointFor(event);
    pendingMoves.current.set(event.pointerId, pointsFor(ids, u, v, true));
    if (moveFrame.current === null) moveFrame.current = requestAnimationFrame(flushMoves);
  };

  const endPointer = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const ids = touchIds.current.get(event.pointerId);
    if (!ids) return;
    if (moveFrame.current !== null) { cancelAnimationFrame(moveFrame.current); flushMoves(); }
    touchIds.current.delete(event.pointerId);
    const [u, v] = pointFor(event);
    sendTouches(pointsFor(ids, u, v, false));
  };

  // ── Wheel ────────────────────────────────────────────────────────────
  const wheel = useRef({ dx: 0, dy: 0, u: 0.5, v: 0.5, timer: null as ReturnType<typeof setTimeout> | null });
  const onWheel = (event: ReactWheelEvent<HTMLDivElement>): void => {
    if (!running) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const state = wheel.current;
    state.u = (event.clientX - rect.left) / rect.width;
    state.v = (event.clientY - rect.top) / rect.height;
    const horizontal = event.shiftKey && event.deltaX === 0;
    state.dx += wheelPixels(horizontal ? event.deltaY : event.deltaX, event.deltaMode, rect.width);
    state.dy += horizontal ? 0 : wheelPixels(event.deltaY, event.deltaMode, rect.height);
    if (state.timer) return;
    state.timer = setTimeout(() => {
      const drag = wheelToDrag(state.u, state.v, state.dx, state.dy, rect.width, rect.height);
      state.dx = 0;
      state.dy = 0;
      state.timer = null;
      if (drag) void invoke(command('scroll'), { serial: emulator.serial, from: drag.from, to: drag.to }).catch(() => undefined);
    }, 70);
  };

  // ── Keyboard ─────────────────────────────────────────────────────────
  const onKey = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (!running) return;
    const action = keyAction({ key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, type: event.type });
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action.kind === 'paste') {
      void navigator.clipboard.readText().then((text) => {
        if (!text) return;
        return invoke<boolean>(command('text'), { serial: emulator.serial, text }).then((typed) => {
          if (!typed) onNotice?.(ios
            ? 'The text was copied to the simulator pasteboard. Tap a field and choose Paste.'
            : 'Long text was copied to the device clipboard. Long-press a field and choose Paste.');
        });
      }).catch((error: unknown) => onNotice?.(`Paste failed: ${String(error)}`));
      return;
    }
    const eventType = action.kind === 'press' ? 'press' : action.kind;
    void invoke(command('key'), { serial: emulator.serial, key: action.key, eventType }).catch(() => undefined);
  };

  const framed = !!iosBody || (showFrame && !!skin?.background);
  const cutout = iosBody && iosFrame?.cutout && layout ? iosFrame.cutout : null;
  const status = streamError
    ? null
    : !running
      ? emulator.phase === 'Booting' ? `Booting ${emulator.displayName}…` : emulator.phase === 'Stopping' ? 'Shutting down…' : null
      : !hasFrame ? 'Connecting to the screen…' : null;

  return (
    <div ref={stageRef} className="dv-screen-stage">
      {layout && (
        <div className="dv-device-box" style={{ width: layout.boxWidth, height: layout.boxHeight }}>
          <div
            className={`dv-device${iosBody ? ' dv-device--ios' : framed ? ' dv-device--skinned' : ''}`}
            style={{ width: layout.frameWidth, height: layout.frameHeight, transform: `translate(-50%, -50%) rotate(${layout.angle}deg)` }}
          >
            {iosBody && <IosBody geometry={iosBody} frame={iosFrame!} scale={layout.scale} />}
            {framed && !iosBody && <img className="dv-device__body" src={skin!.background!} alt="" draggable={false} />}
            <div
              className="dv-screen"
              style={{ left: layout.screen.x, top: layout.screen.y, width: layout.screen.width, height: layout.screen.height, borderRadius: layout.screen.radius }}
              tabIndex={0}
              role="application"
              aria-label={`${emulator.displayName} screen. Click to interact; keys go to the device while focused.`}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endPointer}
              onPointerCancel={endPointer}
              onLostPointerCapture={endPointer}
              onWheel={onWheel}
              onKeyDown={onKey}
              onKeyUp={onKey}
              onContextMenu={(event) => event.preventDefault()}
            >
              {streamUrl && (
                <img
                  key={streamUrl}
                  className="dv-screen__frame"
                  src={streamUrl}
                  alt=""
                  draggable={false}
                  style={{ width: layout.imageWidth, height: layout.imageHeight, transform: `translate(-50%, -50%) rotate(${layout.imageAngle}deg)` }}
                  onLoad={() => setHasFrame(true)}
                  onError={() => { if (running && active) setTimeout(() => setRetry((n) => n + 1), 1000); }}
                />
              )}
              {framed && !iosBody && skin?.mask && <img className="dv-screen__mask" src={skin.mask} alt="" draggable={false} />}
              {cutout && (
                <span
                  className={`dv-cutout dv-cutout--${cutout.kind}`}
                  aria-hidden="true"
                  style={{
                    top: cutout.top * layout.screen.width,
                    width: cutout.width * layout.screen.width,
                    height: cutout.height * layout.screen.width,
                  }}
                />
              )}
              {status && (
                <div className="dv-screen__overlay" style={{ transform: `rotate(${-layout.angle}deg)` }}>
                  <span className="dv-spinner" aria-hidden="true" />
                  <span>{status}</span>
                  {emulator.phase === 'Booting' && (
                    <span className="dv-screen__hint">{ios ? 'Booting the simulator can take a minute.' : 'First boot can take a minute. Later starts resume from a snapshot.'}</span>
                  )}
                </div>
              )}
              {displayOff && hasFrame && running && (
                <div className="dv-screen__overlay dv-screen__overlay--quiet">
                  <span>Screen is off</span>
                  <span className="dv-screen__hint">Press the power button to wake it.</span>
                </div>
              )}
              {streamError && (
                <div className="dv-screen__overlay" role="alert">
                  <span>Could not show the screen</span>
                  <span className="dv-screen__hint">{streamError}</span>
                  <button type="button" className="dv-btn" onClick={() => setRetry((n) => n + 1)}>Try again</button>
                </div>
              )}
            </div>
            {framed && skin?.overlay && <img className="dv-device__overlay" src={skin.overlay} alt="" draggable={false} />}
          </div>
          {showStats && stats && hasFrame && (
            <span className="dv-screen__stats" aria-live="off">{stats.fps} fps{stats.size ? ` · ${stats.size}` : ''}</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * An iPhone or iPad body drawn in CSS around the display (Xcode ships no skin
 * images for simulators): a rounded band, side buttons, and the Touch ID
 * button on older models. Sizes are in body pixels times `scale`.
 */
function IosBody({ geometry, frame, scale }: { geometry: IosGeometry; frame: IosFrame; scale: number }): React.JSX.Element {
  const width = geometry.frameWidth * scale;
  const height = geometry.frameHeight * scale;
  const chin = (geometry.frameHeight - geometry.screenY - geometry.screenHeight) * scale;
  const button = Math.max(2, width * 0.011);
  const homeSize = chin * (frame.tablet ? 0.5 : 0.62);
  return (
    <div className="dv-ios" aria-hidden="true" style={{ ['--dv-ios-btn' as string]: `${button}px` }}>
      <div className="dv-ios__band" style={{ borderRadius: geometry.bodyRadius * scale }} />
      {!frame.tablet && (
        <>
          {!frame.homeButton && <span className="dv-ios__btn dv-ios__btn--left" style={{ top: height * 0.15, height: height * 0.035 }} />}
          <span className="dv-ios__btn dv-ios__btn--left" style={{ top: height * 0.225, height: height * 0.065 }} />
          <span className="dv-ios__btn dv-ios__btn--left" style={{ top: height * 0.305, height: height * 0.065 }} />
          <span className="dv-ios__btn dv-ios__btn--right" style={{ top: height * 0.25, height: height * 0.1 }} />
        </>
      )}
      {frame.homeButton && (
        <span
          className="dv-ios__home"
          style={{ width: homeSize, height: homeSize, left: (width - homeSize) / 2, top: height - chin / 2 - homeSize / 2 }}
        />
      )}
    </div>
  );
}

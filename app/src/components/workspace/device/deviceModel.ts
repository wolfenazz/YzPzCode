/**
 * Pure helpers for the device panel (Android emulators and iOS simulators).
 * No imports, so `npm run test:device` can load this file directly.
 */

export const isLandscape = (rotation: number): boolean => rotation % 2 === 1;

/** A device frame in skin pixels (natural orientation), as `android_avd_skin` returns it. */
export interface FrameGeometry {
  frameWidth: number;
  frameHeight: number;
  screenX: number;
  screenY: number;
  screenWidth: number;
  screenHeight: number;
  /** Display corner radius in display pixels, when known. */
  cornerRadius: number | null;
}

/** The display alone, for AVDs without a skin or with the frame hidden. */
export function screenOnlyGeometry(displayWidth: number, displayHeight: number, cornerRadius: number | null): FrameGeometry {
  return {
    frameWidth: displayWidth,
    frameHeight: displayHeight,
    screenX: 0,
    screenY: 0,
    screenWidth: displayWidth,
    screenHeight: displayHeight,
    cornerRadius: cornerRadius ?? Math.round(Math.min(displayWidth, displayHeight) * 0.035),
  };
}

export type Platform = 'android' | 'ios';

/** Screen and input commands share names across platforms: `<prefix>_<action>`. */
export type DeviceAction = 'stream_start' | 'stream_stop' | 'touch' | 'scroll' | 'key' | 'text' | 'rotate' | 'screenshot';

export const deviceCommand = (platform: Platform | undefined, action: DeviceAction): string =>
  `${platform === 'ios' ? 'ios_simulator' : 'android_emulator'}_${action}`;

interface IosCutoutLike { kind: 'island' | 'notch'; width: number; height: number; top: number }
interface IosFrameLike { cornerRadius: number; cutout: IosCutoutLike | null; homeButton: boolean; tablet: boolean }

/** A drawn iPhone/iPad body: FrameGeometry plus the body's own corner radius. */
export interface IosGeometry extends FrameGeometry {
  bodyRadius: number;
}

/**
 * The body Xcode's simulators have no skin image for, drawn from the model's
 * display shape: thin even bezels around a rounded display, or the tall
 * forehead and chin of Touch ID models.
 */
export function iosFrameGeometry(width: number, height: number, frame: IosFrameLike): IosGeometry {
  let side: number;
  let top: number;
  let bodyRadius: number;
  if (frame.homeButton) {
    side = Math.round(width * (frame.tablet ? 0.06 : 0.07));
    top = Math.round(width * (frame.tablet ? 0.09 : 0.27));
    bodyRadius = Math.round(width * (frame.tablet ? 0.05 : 0.17));
  } else {
    side = Math.round(width * (frame.tablet ? 0.045 : 0.04));
    top = side;
    bodyRadius = frame.cornerRadius + side;
  }
  return {
    frameWidth: width + side * 2,
    frameHeight: height + top * 2,
    screenX: side,
    screenY: top,
    screenWidth: width,
    screenHeight: height,
    cornerRadius: frame.cornerRadius,
    bodyRadius,
  };
}

/** CSS rotation that turns the device body for an emulator rotation. */
export const rotationAngle = (rotation: number): number => [0, -90, 180, 90][rotation % 4] ?? 0;

export interface DeviceLayout {
  /** CSS pixels per skin pixel. */
  scale: number;
  /** The rotated device's box on screen. */
  boxWidth: number;
  boxHeight: number;
  /** The unrotated device body, rotated by `angle` around its centre. */
  frameWidth: number;
  frameHeight: number;
  angle: number;
  /** The display inside the body (body coordinates, CSS pixels). */
  screen: { x: number; y: number; width: number; height: number; radius: number };
  /** The frame image, centred in the display. */
  imageWidth: number;
  imageHeight: number;
  /** Rotation of the frame image inside the display: -angle keeps a display-oriented frame upright. */
  imageAngle: number;
}

/**
 * Fits the device body into the stage for the current rotation. Frames come
 * in display orientation (Android) and are turned back upright, or in the
 * display's natural orientation (`naturalFrames`) and turn with the body.
 */
export function deviceLayout(stageWidth: number, stageHeight: number, geometry: FrameGeometry, rotation: number, naturalFrames = false): DeviceLayout | null {
  const { frameWidth, frameHeight, screenX, screenY, screenWidth, screenHeight, cornerRadius } = geometry;
  if (stageWidth <= 0 || stageHeight <= 0 || frameWidth <= 0 || frameHeight <= 0) return null;
  const landscape = isLandscape(rotation);
  const [visualWidth, visualHeight] = landscape ? [frameHeight, frameWidth] : [frameWidth, frameHeight];
  const scale = Math.min(stageWidth / visualWidth, stageHeight / visualHeight);
  const screen = {
    x: screenX * scale,
    y: screenY * scale,
    width: screenWidth * scale,
    height: screenHeight * scale,
    radius: (cornerRadius ?? 0) * scale,
  };
  return {
    scale,
    boxWidth: Math.floor(visualWidth * scale),
    boxHeight: Math.floor(visualHeight * scale),
    frameWidth: frameWidth * scale,
    frameHeight: frameHeight * scale,
    angle: rotationAngle(rotation),
    screen,
    imageWidth: landscape && !naturalFrames ? screen.height : screen.width,
    imageHeight: landscape && !naturalFrames ? screen.width : screen.height,
    imageAngle: naturalFrames ? 0 : -rotationAngle(rotation),
  };
}

/**
 * Largest frame side requested from the emulator. Measured on a Pixel 9 Pro
 * AVD: ~57 fps at 900 px, ~36 at 1000, ~21 at 1400, ~7 at 1600, because the
 * emulator scales and copies every frame on the CPU and each one is JPEG
 * encoded. Above this the panel upscales slightly instead of dropping frames.
 */
export const MAX_STREAM_BOUND = 1152;

/**
 * The square bound for requested frames: covers either orientation at the
 * screen's device-pixel size, never above the display's own resolution or
 * MAX_STREAM_BOUND, and rounded to 64 px so small resizes don't restart the stream.
 */
export function streamBound(screenWidth: number, screenHeight: number, pixelRatio: number, deviceWidth: number, deviceHeight: number): number {
  const wanted = Math.max(screenWidth, screenHeight) * Math.max(1, pixelRatio);
  const cap = Math.min(Math.max(deviceWidth, deviceHeight) || Infinity, MAX_STREAM_BOUND);
  const rounded = Math.ceil(wanted / 64) * 64;
  return Math.max(64, Math.min(cap, rounded));
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * Turns accumulated wheel movement into a finger drag on the frame (0..1
 * coordinates). Scrolling down moves the finger up. The drag is lengthened by
 * Android's touch slop and kept inside the screen.
 */
export function wheelToDrag(
  u: number,
  v: number,
  deltaX: number,
  deltaY: number,
  screenWidth: number,
  screenHeight: number,
): { from: [number, number]; to: [number, number] } | null {
  if (screenWidth <= 0 || screenHeight <= 0 || (deltaX === 0 && deltaY === 0)) return null;
  const SLOP = 0.02;
  const EDGE = 0.04;
  const along = (delta: number, size: number): number => {
    if (delta === 0) return 0;
    const distance = clamp(Math.abs(delta) / size, 0, 1 - 2 * EDGE - SLOP) + SLOP;
    return -Math.sign(delta) * distance;
  };
  const du = along(deltaX, screenWidth);
  const dv = along(deltaY, screenHeight);
  const start = (pos: number, d: number): number => clamp(pos, EDGE + Math.max(0, -d), 1 - EDGE - Math.max(0, d));
  const fromU = start(u, du);
  const fromV = start(v, dv);
  return { from: [fromU, fromV], to: [fromU + du, fromV + dv] };
}

/** Pixels per wheel event, normalising line and page modes. */
export function wheelPixels(delta: number, deltaMode: number, pageSize: number): number {
  if (deltaMode === 1) return delta * 32;
  if (deltaMode === 2) return delta * pageSize;
  return delta;
}

const NAMED_KEYS = new Set([
  'Enter', 'Backspace', 'Tab', 'Escape', 'Delete', 'Home', 'End', 'PageUp', 'PageDown',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Insert',
]);

export type KeyAction =
  | { kind: 'press'; key: string }
  | { kind: 'down' | 'up'; key: string }
  | { kind: 'paste' };

/** What a host key event should do on the device; null lets the app handle it. */
export function keyAction(event: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; type: string }): KeyAction | null {
  const command = event.ctrlKey || event.metaKey;
  if (command && !event.altKey && event.key.toLowerCase() === 'v') return event.type === 'keydown' ? { kind: 'paste' } : null;
  if (command || event.altKey) return null;
  if (event.key.length === 1) return event.type === 'keydown' ? { kind: 'press', key: event.key } : null;
  if (NAMED_KEYS.has(event.key)) return { kind: event.type === 'keydown' ? 'down' : 'up', key: event.key };
  return null;
}

/** A pubspec belongs to a Flutter app or package when it depends on the Flutter SDK. */
export function isFlutterPubspec(text: string): boolean {
  return /^\s*flutter:\s*\r?\n\s+sdk:\s*flutter\b/m.test(text);
}

export const normalizePath = (path: string): string => path.replace(/\\/g, '/').replace(/\/+$/, '');

export const isDartFile = (path: string): boolean => /\.dart$/i.test(path);

export const isPubspec = (path: string): boolean => /(^|[\\/])pubspec\.yaml$/i.test(path);

/** True when `path` sits inside `dir` (any separator, case-insensitive on Windows paths). */
export function isInside(path: string, dir: string): boolean {
  const p = normalizePath(path);
  const d = normalizePath(dir);
  const windows = /^[a-z]:\//i.test(d);
  const [a, b] = windows ? [p.toLowerCase(), d.toLowerCase()] : [p, d];
  return a === b || a.startsWith(`${b}/`);
}

export interface RunTargetOption {
  /**
   * A Flutter device id, or `avd:<name>` / `ios:<udid>` for an emulator or
   * simulator that is not running yet.
   */
  id: string;
  label: string;
  detail: string;
  group: 'Running emulators' | 'Virtual devices' | 'Devices' | 'Desktop & web';
}

interface DeviceLike { id: string; name: string; targetPlatform: string; emulator: boolean; sdk: string | null; supported: boolean }
interface EmulatorLike { serial: string; avdName: string; displayName: string; phase: string }
interface AvdLike { name: string; displayName: string; apiLevel: number | null; platform?: Platform; variant?: string | null }

/** The run target that boots a stopped emulator or simulator first. */
export const bootTargetId = (avd: { name: string; platform?: Platform }): string =>
  `${avd.platform === 'ios' ? 'ios' : 'avd'}:${avd.name}`;

/** `avd:Pixel_9` → { platform, name }, or null for a Flutter device id. */
export function parseBootTarget(id: string): { platform: Platform; name: string } | null {
  const match = /^(avd|ios):(.+)$/.exec(id);
  return match ? { platform: match[1] === 'ios' ? 'ios' : 'android', name: match[2] } : null;
}

/** Every place `flutter run` can go, emulators first. */
export function runTargetOptions(devices: DeviceLike[], emulators: EmulatorLike[], avds: AvdLike[]): RunTargetOption[] {
  const options: RunTargetOption[] = [];
  const seen = new Set<string>();
  for (const emulator of emulators) {
    if (emulator.phase !== 'Running' && emulator.phase !== 'Booting') continue;
    seen.add(emulator.serial);
    options.push({
      id: emulator.serial,
      label: emulator.displayName,
      detail: emulator.phase === 'Booting' ? 'Booting…' : emulator.serial,
      group: 'Running emulators',
    });
  }
  const runningAvds = new Set(emulators.filter((e) => e.phase === 'Running' || e.phase === 'Booting').map((e) => e.avdName));
  for (const avd of avds) {
    if (runningAvds.has(avd.name)) continue;
    const ios = avd.platform === 'ios';
    options.push({
      id: bootTargetId(avd),
      label: avd.displayName,
      detail: ios
        ? `Start simulator${avd.variant ? ` · ${avd.variant}` : ''}`
        : avd.apiLevel ? `Start emulator · API ${avd.apiLevel}` : 'Start emulator',
      group: 'Virtual devices',
    });
  }
  for (const device of devices) {
    if (seen.has(device.id) || !device.supported) continue;
    const mobile = device.targetPlatform.startsWith('android') || device.targetPlatform.startsWith('ios');
    options.push({
      id: device.id,
      label: device.name,
      detail: device.sdk ?? device.targetPlatform,
      group: mobile ? 'Devices' : 'Desktop & web',
    });
  }
  return options;
}

/** The target to preselect when the user has not chosen one. */
export function defaultRunTarget(options: RunTargetOption[], selectedAvd: string | null): string | null {
  return (
    options.find((o) => o.group === 'Running emulators')?.id ??
    options.find((o) => o.group === 'Devices')?.id ??
    (selectedAvd ? options.find((o) => parseBootTarget(o.id)?.name === selectedAvd)?.id : undefined) ??
    options.find((o) => o.group === 'Virtual devices')?.id ??
    options[0]?.id ??
    null
  );
}

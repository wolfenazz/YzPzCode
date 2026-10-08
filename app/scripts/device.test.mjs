import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const load = async (path) => {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};

const model = await load('../src/components/workspace/device/deviceModel.ts');

const pixel9Pro = { frameWidth: 1408, frameHeight: 2974, screenX: 60, screenY: 61, screenWidth: 1280, screenHeight: 2856, cornerRadius: 109 };

test('the device body fits the stage and keeps the display inside it', () => {
  const layout = model.deviceLayout(352, 800, pixel9Pro, 0);
  assert.ok(layout.boxWidth <= 352 && layout.boxHeight <= 800);
  assert.equal(layout.angle, 0);
  assert.ok(Math.abs(layout.screen.x - 60 * layout.scale) < 1e-9);
  assert.ok(Math.abs(layout.screen.radius - 109 * layout.scale) < 1e-9);
  assert.equal(layout.imageWidth, layout.screen.width);
  assert.equal(model.deviceLayout(0, 800, pixel9Pro, 0), null);
});

test('landscape turns the whole body and keeps the picture upright', () => {
  const layout = model.deviceLayout(800, 800, pixel9Pro, 1);
  assert.ok(layout.boxWidth > layout.boxHeight, 'the rotated device is wide');
  assert.equal(layout.angle, -90);
  assert.equal(layout.imageWidth, layout.screen.height, 'the frame image is landscape');
  assert.equal(layout.imageHeight, layout.screen.width);
  assert.equal(model.deviceLayout(800, 800, pixel9Pro, 3).angle, 90);
  assert.equal(model.deviceLayout(800, 800, pixel9Pro, 2).angle, 180);
});

test('devices without a skin show the display with rounded corners', () => {
  const plain = model.screenOnlyGeometry(1080, 2400, null);
  assert.equal(plain.screenX, 0);
  assert.equal(plain.frameWidth, 1080);
  assert.ok(plain.cornerRadius > 0);
  assert.equal(model.screenOnlyGeometry(1080, 2400, 90).cornerRadius, 90);
});

test('stream bounds cover the screen, respect the display and ignore small resizes', () => {
  assert.equal(model.streamBound(400, 700, 1, 1080, 2400), 704);
  assert.equal(model.streamBound(400, 888, 2, 1080, 2400), model.MAX_STREAM_BOUND, 'large screens are capped for frame rate');
  assert.equal(model.streamBound(300, 640, 2, 480, 800), 800, 'never above the display resolution');
  assert.equal(model.streamBound(400, 880, 1, 1080, 2400), model.streamBound(400, 890, 1, 1080, 2400));
});

test('wheel scrolling becomes a drag that stays on screen', () => {
  const down = model.wheelToDrag(0.5, 0.5, 0, 200, 400, 800);
  assert.ok(down.to[1] < down.from[1], 'scrolling down drags the finger up');
  assert.equal(down.from[0], 0.5);
  const nearTop = model.wheelToDrag(0.5, 0.05, 0, 400, 400, 800);
  assert.ok(nearTop.to[1] >= 0.04 - 1e-9, 'end point stays inside the screen');
  const huge = model.wheelToDrag(0.5, 0.5, 0, -100000, 400, 800);
  assert.ok(huge.from[1] >= 0 && huge.to[1] <= 1);
  const sideways = model.wheelToDrag(0.5, 0.5, 120, 0, 400, 800);
  assert.ok(sideways.to[0] < sideways.from[0]);
  assert.equal(model.wheelToDrag(0.5, 0.5, 0, 0, 400, 800), null);
  assert.equal(model.wheelPixels(3, 1, 800), 96);
});

test('host keys map to device keys', () => {
  const key = (k, extra = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, type: 'keydown', ...extra });
  assert.deepEqual(model.keyAction(key('a')), { kind: 'press', key: 'a' });
  assert.equal(model.keyAction(key('a', { type: 'keyup' })), null);
  assert.deepEqual(model.keyAction(key('Enter')), { kind: 'down', key: 'Enter' });
  assert.deepEqual(model.keyAction(key('Enter', { type: 'keyup' })), { kind: 'up', key: 'Enter' });
  assert.deepEqual(model.keyAction(key('v', { ctrlKey: true })), { kind: 'paste' });
  assert.equal(model.keyAction(key('s', { ctrlKey: true })), null, 'app shortcuts stay with the app');
  assert.equal(model.keyAction(key('Shift')), null);
});

test('Flutter projects are recognised by their pubspec', () => {
  assert.equal(model.isFlutterPubspec('name: app\ndependencies:\n  flutter:\n    sdk: flutter\n'), true);
  assert.equal(model.isFlutterPubspec('name: app\r\ndependencies:\r\n  flutter:\r\n    sdk: flutter\r\n'), true);
  assert.equal(model.isFlutterPubspec('name: pkg\ndependencies:\n  http: ^1.0.0\n'), false);
  assert.equal(model.isDartFile('lib/main.dart'), true);
  assert.equal(model.isPubspec('C:\\proj\\pubspec.yaml'), true);
  assert.equal(model.isInside('C:\\Proj\\lib\\a.dart', 'c:/proj'), true);
  assert.equal(model.isInside('/home/a/proj2/lib/a.dart', '/home/a/proj'), false);
});

test('run targets list emulators first and pick a sensible default', () => {
  const devices = [
    { id: 'emulator-5554', name: 'sdk gphone', targetPlatform: 'android-x64', emulator: true, sdk: 'Android 16', supported: true },
    { id: 'windows', name: 'Windows', targetPlatform: 'windows-x64', emulator: false, sdk: null, supported: true },
    { id: 'R58N', name: 'Galaxy', targetPlatform: 'android-arm64', emulator: false, sdk: 'Android 14', supported: true },
  ];
  const emulators = [{ serial: 'emulator-5554', avdName: 'Pixel_9', displayName: 'Pixel 9', phase: 'Running' }];
  const avds = [{ name: 'Pixel_9', displayName: 'Pixel 9', apiLevel: 36 }, { name: 'Tablet', displayName: 'Tablet', apiLevel: 35 }];
  const options = model.runTargetOptions(devices, emulators, avds);
  assert.deepEqual(options.map((o) => o.id), ['emulator-5554', 'avd:Tablet', 'windows', 'R58N']);
  assert.equal(options.find((o) => o.id === 'R58N').group, 'Devices');
  assert.equal(model.defaultRunTarget(options, null), 'emulator-5554');
  const idle = model.runTargetOptions([devices[1]], [], avds);
  assert.equal(model.defaultRunTarget(idle, 'Tablet'), 'avd:Tablet');
  assert.equal(model.defaultRunTarget(idle, null), 'avd:Pixel_9');
});

test('iOS simulators boot as run targets and use their own commands', () => {
  const avds = [{ name: 'A1B2-UDID', displayName: 'iPhone 16 Pro', apiLevel: null, platform: 'ios', variant: 'iOS 18.2' }];
  const [option] = model.runTargetOptions([], [], avds);
  assert.equal(option.id, 'ios:A1B2-UDID');
  assert.equal(option.detail, 'Start simulator · iOS 18.2');
  assert.deepEqual(model.parseBootTarget('ios:A1B2-UDID'), { platform: 'ios', name: 'A1B2-UDID' });
  assert.deepEqual(model.parseBootTarget('avd:Pixel_9'), { platform: 'android', name: 'Pixel_9' });
  assert.equal(model.parseBootTarget('emulator-5554'), null);
  assert.equal(model.defaultRunTarget([option], 'A1B2-UDID'), 'ios:A1B2-UDID');
  assert.equal(model.deviceCommand('ios', 'touch'), 'ios_simulator_touch');
  assert.equal(model.deviceCommand(undefined, 'stream_start'), 'android_emulator_stream_start');
});

test('iPhone bodies wrap the display and Touch ID models get a chin', () => {
  const pro = model.iosFrameGeometry(1206, 2622, { cornerRadius: 186, cutout: null, homeButton: false, tablet: false });
  assert.equal(pro.screenX, pro.screenY, 'even bezels');
  assert.equal(pro.frameWidth, 1206 + pro.screenX * 2);
  assert.equal(pro.bodyRadius, 186 + pro.screenX);
  const se = model.iosFrameGeometry(750, 1334, { cornerRadius: 0, cutout: null, homeButton: true, tablet: false });
  assert.ok(se.screenY > se.screenX * 3, 'forehead and chin for the home button');
});

test('frames in natural orientation turn with the body', () => {
  const layout = model.deviceLayout(800, 800, pixel9Pro, 1, true);
  assert.equal(layout.imageAngle, 0);
  assert.equal(layout.imageWidth, layout.screen.width);
  assert.equal(model.deviceLayout(800, 800, pixel9Pro, 1).imageAngle, 90);
});

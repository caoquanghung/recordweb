import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import * as policy from '../../src/lib/calibration/policy.ts';

const require = createRequire(import.meta.url);
const ts = require('typescript');
function loadModule(path, dependencies) {
  const mod = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL(`../../src/${path}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  vm.runInNewContext(source, {
    module: mod, exports: mod.exports, require: (name) => {
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected dependency: ${name}`);
    }, Math, Number, Array, Boolean,
  });
  return mod.exports;
}
const geometry = loadModule('lib/calibration/geometry', { './policy': policy });

const UUID = '0b8f6c0e-5a52-4c6e-9a0e-2f4f1c7d9e11';
const USER = 'user_abc123';
const posture = (overrides = {}) => ({
  cellRow: 1, cellCol: 1, pathname: `calibration/${USER}/${UUID}.png`,
  widthPx: 500, heightPx: 1080, sourceWidth: 1920, sourceHeight: 1080,
  sourceBbox: { x: 100, y: 20, width: 400, height: 900 }, scaleFactor: 1.2,
  mirrored: false, poseModel: 'pose_landmarker_full', capturedAt: new Date().toISOString(), ...overrides,
});
const commit = (postures, extra = {}) => ({ mode: 'replace-all', captureSessionId: UUID, postures, ...extra });

test('capture order is row-major from (1,1) to (3,3)', () => {
  assert.equal(policy.CALIBRATION_CELL_ORDER.length, 9);
  assert.deepEqual(policy.CALIBRATION_CELL_ORDER[0], [1, 1]);
  assert.deepEqual(policy.CALIBRATION_CELL_ORDER[3], [2, 1]);
  assert.deepEqual(policy.CALIBRATION_CELL_ORDER[8], [3, 3]);
});

test('pathnames are only valid for their own user and exact shape', () => {
  const good = `calibration/${USER}/${UUID}.png`;
  assert.equal(policy.isCalibrationPathnameFor(USER, good), true);
  assert.equal(policy.isCalibrationPathnameFor('user_other', good), false);
  assert.equal(policy.isCalibrationPathnameFor(USER, `calibration/${USER}/../x/${UUID}.png`), false);
  assert.equal(policy.isCalibrationPathnameFor(USER, `calibration/${USER}/${UUID}.jpg`), false);
  assert.equal(policy.isCalibrationPathnameFor(USER, `recordings/${USER}/${UUID}.png`), false);
  assert.equal(policy.isCalibrationPathnameFor('bad/user', good), false);
  assert.equal(policy.calibrationPathname(USER, UUID), good);
});

test('commit accepts one to nine valid postures', () => {
  const body = policy.parseCalibrationCommit(USER, commit([posture()]));
  assert.equal(body.postures.length, 1);
  assert.equal(body.mode, 'replace-all');
});

test('commit rejects invalid cells, mirroring, height, duplicates and foreign paths', () => {
  const bad = (value) => assert.throws(() => policy.parseCalibrationCommit(USER, value), policy.CalibrationValidationError);
  bad(commit([posture({ cellRow: 4 })]));
  bad(commit([posture({ cellCol: 0 })]));
  bad(commit([posture({ mirrored: true })]));
  bad(commit([posture({ heightPx: 720 })]));
  bad(commit([posture({ widthPx: 50 })]));
  bad(commit([posture({ pathname: `calibration/user_other/${UUID}.png` })]));
  bad(commit([posture(), posture()]));
  bad(commit([]));
  bad(commit(Array.from({ length: 10 }, (_, i) => posture({ cellRow: 1, cellCol: 1, pathname: `calibration/${USER}/${UUID.slice(0, -2)}${String(i).padStart(2, '0')}.png` }))));
  bad(commit([posture()], { mode: 'merge' }));
  bad(commit([posture()], { captureSessionId: 'nope' }));
  bad(commit([posture({ capturedAt: new Date(Date.now() + 3_600_000).toISOString() })]));
  bad(commit([posture({ sourceBbox: { x: 0, y: 0, width: 5000, height: 10 } })]));
});

test('mask bounds find the person and ignore low confidence', () => {
  const w = 10; const h = 8;
  const mask = new Float32Array(w * h);
  for (let y = 2; y <= 6; y += 1) for (let x = 3; x <= 5; x += 1) mask[y * w + x] = 0.9;
  mask[0] = 0.4;
  assert.deepEqual({ ...geometry.maskBounds(mask, w, h) }, { x: 3, y: 2, width: 3, height: 5 });
  assert.equal(geometry.maskBounds(new Float32Array(w * h), w, h), null);
});

function fullBody(overrides = {}) {
  const pose = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.99 }));
  pose[0] = { x: 0.5, y: 0.15, visibility: 0.99 };
  pose[27] = { x: 0.48, y: 0.93, visibility: 0.99 };
  pose[28] = { x: 0.52, y: 0.93, visibility: 0.99 };
  return Object.assign(pose, overrides);
}

test('full-body rule passes when head and feet are visible and unclipped', () => {
  const result = geometry.evaluateFullBody({
    poses: [fullBody()], bounds: { x: 700, y: 60, width: 500, height: 900 }, frameWidth: 1920, frameHeight: 1080,
  });
  assert.equal(result.ok, true);
  assert.deepEqual([...result.issues], []);
});

test('full-body rule blocks hidden feet, clipped head, tiny, missing and multiple people', () => {
  const bounds = { x: 700, y: 60, width: 500, height: 900 };
  const base = { frameWidth: 1920, frameHeight: 1080 };
  const feetHidden = fullBody({ 27: { x: 0.5, y: 1.2, visibility: 0.1 } });
  assert.ok(geometry.evaluateFullBody({ ...base, poses: [feetHidden], bounds }).issues.includes('feet-hidden'));
  const headHidden = fullBody({ 0: { x: 0.5, y: 0.1, visibility: 0.2 } });
  assert.ok(geometry.evaluateFullBody({ ...base, poses: [headHidden], bounds }).issues.includes('head-hidden'));
  assert.ok(geometry.evaluateFullBody({ ...base, poses: [fullBody()], bounds: { ...bounds, y: 2 } }).issues.includes('clipped-top'));
  assert.ok(geometry.evaluateFullBody({ ...base, poses: [fullBody()], bounds: { ...bounds, y: 300, height: 780 } }).issues.includes('clipped-bottom'));
  assert.ok(geometry.evaluateFullBody({ ...base, poses: [fullBody()], bounds: { x: 900, y: 400, width: 100, height: 300 } }).issues.includes('too-small'));
  assert.deepEqual([...geometry.evaluateFullBody({ ...base, poses: [], bounds: null }).issues], ['no-person']);
  assert.deepEqual([...geometry.evaluateFullBody({ ...base, poses: [fullBody(), fullBody()], bounds }).issues], ['multiple-people']);
});

test('head top ignores a raised arm and the crop normalises to 1080 px tall', () => {
  // Nose at y=200, feet at y=1000: the head top is inferred, not taken from a hand at y=50.
  const top = geometry.estimateHeadTop(200, 1000, 50);
  assert.ok(top > 100 && top < 200, `unexpected head top ${top}`);
  assert.equal(geometry.estimateHeadTop(200, 1000, 150), Math.max(1000 - (800 / 0.935), 150));

  const crop = geometry.paddedCrop({ x: 100, y: 20, width: 400, height: 900 }, 1920, 1080);
  assert.ok(crop.x >= 0 && crop.y >= 0 && crop.x + crop.width <= 1920 && crop.y + crop.height <= 1080);
  const size = geometry.normalizedImageSize(crop);
  assert.equal(size.height, 1080);
  assert.equal(size.withinLimits, true);
  assert.ok(Math.abs(size.width - crop.width * size.scale) < 1);
});

test('stage placement makes body height equal the white panel and centres on the blue zone', () => {
  const place = geometry.placeBody(100, 700);
  assert.equal(place.scale * 600, geometry.STAGE.panel.height);
  assert.equal(place.destY, geometry.STAGE.panel.y + geometry.STAGE.panel.height);
  assert.equal(place.destX, geometry.STAGE.zone.x + geometry.STAGE.zone.width / 2);
});

test('alpha ramp feathers edges between confidence 0.35 and 0.75', () => {
  assert.equal(geometry.maskToAlpha(0.2), 0);
  assert.equal(geometry.maskToAlpha(0.9), 255);
  assert.ok(geometry.maskToAlpha(0.55) > 0 && geometry.maskToAlpha(0.55) < 255);
});

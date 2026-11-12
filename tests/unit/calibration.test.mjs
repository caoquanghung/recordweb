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
  mirrored: false, bodyCoverage: 'hips', headToHipPx: 300, poseModel: 'pose_landmarker_full', capturedAt: new Date().toISOString(), ...overrides,
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
  bad(commit([posture({ bodyCoverage: 'legs' })]));
  bad(commit([posture({ headToHipPx: 0 })]));
  bad(commit([posture({ headToHipPx: 5000 })]));
  bad(commit([posture({ bodyCoverage: undefined, headToHipPx: undefined })]));
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

// Landmarks are normalized; nose at y=0.15 and hips at y=0.55 give a 0.40 head-to-hip length.
function body({ feet = true, ...overrides } = {}) {
  const pose = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.99 }));
  pose[0] = { x: 0.5, y: 0.15, visibility: 0.99 };
  pose[2] = { x: 0.49, y: 0.14, visibility: 0.99 };
  pose[5] = { x: 0.51, y: 0.14, visibility: 0.99 };
  pose[23] = { x: 0.48, y: 0.55, visibility: 0.99 };
  pose[24] = { x: 0.52, y: 0.55, visibility: 0.99 };
  const low = feet ? 0.93 : 1.2;
  const vis = feet ? 0.99 : 0.05;
  for (const [i, x] of [[27, 0.48], [28, 0.52], [29, 0.48], [30, 0.52], [31, 0.48], [32, 0.52]]) pose[i] = { x, y: low, visibility: vis };
  return Object.assign(pose, overrides);
}
const frame = { frameWidth: 1920, frameHeight: 1080 };
const evaluate = (poses, bounds) => geometry.evaluateBodyInFrame({ poses, bounds, ...frame });

test('head to just past the hips is accepted even when the legs are not visible', () => {
  // Frame cuts the person at mid-thigh: mask runs to the bottom edge, ankles are not visible.
  const result = evaluate([body({ feet: false })], { x: 700, y: 60, width: 500, height: 1020 });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.coverage, 'hips');
  assert.ok(Math.abs(result.headToHipPx - 499.8) < 1, `head-to-hip ${result.headToHipPx}`);
});

test('a visible whole body is accepted and labelled full, not cropped', () => {
  const result = evaluate([body()], { x: 700, y: 60, width: 500, height: 900 });
  assert.equal(result.ok, true);
  assert.equal(result.coverage, 'full');
  // Feet in view but the frame bottom touches the mask: still accepted, but not "full".
  const touching = evaluate([body()], { x: 700, y: 60, width: 500, height: 1020 });
  assert.equal(touching.ok, true);
  assert.equal(touching.coverage, 'hips');
});

test('the rule blocks hidden hips, hips at the frame edge, hidden head, clipped top, tiny and missing people', () => {
  const bounds = { x: 700, y: 60, width: 500, height: 900 };
  const hidden = body({ 23: { x: 0.48, y: 0.55, visibility: 0.1 } });
  assert.ok(evaluate([hidden], bounds).issues.includes('hips-hidden'));
  // Hips exactly at the bottom edge: the frame does not extend past them.
  const atEdge = body({ 23: { x: 0.48, y: 0.99, visibility: 0.99 }, 24: { x: 0.52, y: 0.99, visibility: 0.99 } });
  assert.ok(evaluate([atEdge], bounds).issues.includes('hips-hidden'));
  const headHidden = body({ 0: { x: 0.5, y: 0.1, visibility: 0.2 } });
  assert.ok(evaluate([headHidden], bounds).issues.includes('head-hidden'));
  assert.ok(evaluate([body()], { ...bounds, y: 2 }).issues.includes('clipped-top'));
  const small = body({ 0: { x: 0.5, y: 0.45, visibility: 0.99 }, 23: { x: 0.48, y: 0.55, visibility: 0.99 }, 24: { x: 0.52, y: 0.55, visibility: 0.99 } });
  assert.ok(evaluate([small], { x: 900, y: 400, width: 100, height: 300 }).issues.includes('too-small'));
  assert.deepEqual([...evaluate([], null).issues], ['no-person']);
  assert.deepEqual([...evaluate([body(), body()], bounds).issues], ['multiple-people']);
  assert.equal('feet-hidden' in geometry.QUALITY_MESSAGES, false);
  assert.equal('clipped-bottom' in geometry.QUALITY_MESSAGES, false);
});

test('head top comes from the nose and hips, so a raised arm or missing feet do not matter', () => {
  // Nose y=200, hips y=600: head top = 200 - 0.157 * 400 = 137.2, below the hand at y=50.
  const top = geometry.estimateHeadTop(200, 600, 50);
  assert.ok(Math.abs(top - 137.2) < 0.01, `unexpected head top ${top}`);
  // Never above the mask top.
  assert.equal(geometry.estimateHeadTop(200, 600, 180), 180);

  const crop = geometry.paddedCrop({ x: 100, y: 20, width: 400, height: 1060 }, 1920, 1080);
  assert.ok(crop.x >= 0 && crop.y >= 0 && crop.x + crop.width <= 1920 && crop.y + crop.height <= 1080);
  const size = geometry.normalizedImageSize(crop);
  assert.equal(size.height, 1080);
  assert.equal(size.withinLimits, true);
  assert.ok(Math.abs(size.width - crop.width * size.scale) < 1);
});

test('raw webcam fallback crops the centre of the frame to the zone aspect', () => {
  const zone = geometry.coverSource(1920, 1080, 355, 835);
  assert.ok(Math.abs(zone.width / zone.height - 355 / 835) < 1e-6);
  assert.equal(zone.height, 1080);
  assert.equal(zone.x + zone.width / 2, 960);
  const wide = geometry.coverSource(400, 1000, 800, 400);
  assert.equal(wide.width, 400);
  assert.equal(wide.height, 200);
});

test('the visible body is as tall as the slide and is shifted, not shrunk, to stay on the stage', () => {
  const { STAGE, STAGE_EDGE_MARGIN } = geometry;
  const bottom = STAGE.panel.y + STAGE.panel.height;
  const zoneCenter = STAGE.zone.x + STAGE.zone.width / 2;

  // Head top to bottom of the mask covers the slide height; feet-side bottom sits on the panel's bottom edge.
  const normal = geometry.placeBody({ x: 100, y: 100, width: 150, height: 400 }, 100);
  assert.ok(Math.abs(normal.scale * 400 - STAGE.panel.height) < 1e-9);
  assert.equal(normal.destY, bottom);
  assert.equal(normal.destX, zoneCenter);

  // Arms spread wide (half-body is wider than the blue zone): still slide-tall, shifted left so the
  // right side is not cut off by the stage edge; the left side may overlap the white panel.
  const wide = { x: 50, y: 100, width: 330, height: 400 };
  const spread = geometry.placeBody(wide, 100);
  assert.ok(Math.abs(spread.scale * 400 - STAGE.panel.height) < 1e-9, 'height rule must not be given up for width');
  const right = spread.destX + (spread.scale * wide.width) / 2;
  const left = spread.destX - (spread.scale * wide.width) / 2;
  assert.ok(right <= STAGE.width - STAGE_EDGE_MARGIN + 1e-9, `right edge ${right}`);
  assert.ok(left >= STAGE_EDGE_MARGIN - 1e-9);
  assert.ok(spread.destX < zoneCenter, 'the body moves left rather than shrinking');
  assert.equal(spread.sourceCenterX, 215);
  assert.equal(spread.sourceBottomY, 500);

  // An arm raised far above the head is not part of the visible height, but it must stay on the stage.
  const raised = geometry.placeBody({ x: 100, y: 0, width: 150, height: 500 }, 100);
  assert.ok(raised.destY - raised.scale * 500 >= STAGE_EDGE_MARGIN - 1e-9);
  assert.ok(raised.scale < normal.scale);

  // Extremely wide poses are capped so the whole mask still fits across the stage.
  const huge = geometry.placeBody({ x: 0, y: 100, width: 1500, height: 400 }, 100);
  assert.ok(huge.scale * 1500 <= STAGE.width - 2 * STAGE_EDGE_MARGIN + 1e-9);
});

test('alpha ramp feathers edges between confidence 0.35 and 0.75', () => {
  assert.equal(geometry.maskToAlpha(0.2), 0);
  assert.equal(geometry.maskToAlpha(0.9), 255);
  assert.ok(geometry.maskToAlpha(0.55) > 0 && geometry.maskToAlpha(0.55) < 255);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPermissions,
  getRoleFromSessionClaims,
  hasPermission,
  parseAppRole,
} from '../../src/lib/auth/roles.ts';

test('unknown and missing roles fail closed to user', () => {
  assert.equal(parseAppRole(undefined), 'user');
  assert.equal(parseAppRole(null), 'user');
  assert.equal(parseAppRole('admin'), 'user');
  assert.equal(parseAppRole('developer'), 'developer');
});

test('reads the preferred Clerk metadata session claim', () => {
  assert.equal(
    getRoleFromSessionClaims({ metadata: { appRole: 'developer' } }),
    'developer'
  );
});

test('supports existing signed Clerk claim shapes', () => {
  assert.equal(
    getRoleFromSessionClaims({ publicMetadata: { appRole: 'developer' } }),
    'developer'
  );
  assert.equal(
    getRoleFromSessionClaims({ public_metadata: { appRole: 'developer' } }),
    'developer'
  );
  assert.equal(getRoleFromSessionClaims({ appRole: 'developer' }), 'developer');
});

test('invalid claims never elevate permissions', () => {
  assert.equal(getRoleFromSessionClaims({ metadata: { appRole: 'admin' } }), 'user');
  assert.equal(getRoleFromSessionClaims({ metadata: 'developer' }), 'user');
  assert.equal(getRoleFromSessionClaims(null), 'user');
});

test('user has only the core recording permission', () => {
  assert.deepEqual(getPermissions('user'), ['recording:use']);
  assert.equal(hasPermission('user', 'recording:use'), true);
  assert.equal(hasPermission('user', 'recording-assets:inspect'), false);
  assert.equal(hasPermission('user', 'diagnostics:internal'), false);
  assert.equal(hasPermission('user', 'experiments:use'), false);
  assert.equal(hasPermission('user', 'users:manage'), false);
});

test('developer has every declared application permission', () => {
  assert.equal(hasPermission('developer', 'recording:use'), true);
  assert.equal(hasPermission('developer', 'recording-assets:inspect'), true);
  assert.equal(hasPermission('developer', 'diagnostics:internal'), true);
  assert.equal(hasPermission('developer', 'telemetry:read'), true);
  assert.equal(hasPermission('developer', 'experiments:use'), true);
  assert.equal(hasPermission('developer', 'users:manage'), true);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.HERMES_RELAY_INTERNAL_SECRET ??= 'test-secret';
const { isBearerSecret } = await import('./internalAuth.js');

test('accepts the shared secret as a bearer token', () => {
  assert.equal(isBearerSecret('Bearer s3cret', 's3cret'), true);
});

test('rejects a missing, wrong or differently framed secret', () => {
  assert.equal(isBearerSecret(undefined, 's3cret'), false);
  assert.equal(isBearerSecret('Bearer s3cre', 's3cret'), false);
  assert.equal(isBearerSecret('s3cret', 's3cret'), false);
  assert.equal(isBearerSecret('Bearer s3cret ', 's3cret'), false);
});

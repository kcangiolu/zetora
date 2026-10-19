import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseGatewayBearerToken } from './auth.js';

const bearer = (raw: string) => `Bearer ${Buffer.from(raw).toString('base64url')}`;

test('splits payload, expiry and signature from the right', () => {
  assert.deepEqual(parseGatewayBearerToken(bearer('gw:with:colons:1760000000:abcdef')), {
    gatewayId: 'gw:with:colons',
    payload: 'gw:with:colons',
    exp: '1760000000',
    sig: 'abcdef',
  });
});

test('rejects headers that are not a well-formed gateway token', () => {
  assert.equal(parseGatewayBearerToken(undefined), null);
  assert.equal(parseGatewayBearerToken('Basic abc'), null);
  assert.equal(parseGatewayBearerToken(bearer('only:two')), null);
  assert.equal(parseGatewayBearerToken(bearer(':1760000000:abcdef')), null);
});

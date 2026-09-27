import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BwClient } from '../dist/bw-client.js';
import { bwDelete } from '../dist/tools/delete.js';

/** A BwClient whose HTTP layer records the DELETE request instead of sending it. */
function recordingClient() {
  const client = Object.create(BwClient.prototype);
  const sent = {};
  client.csrfToken = 'token';
  client.ensureCsrf = async () => {};
  client.cookieHeaders = () => ({});
  client.updateCookies = () => {};
  client.http = {
    delete: async (path, config) => {
      Object.assign(sent, { path, headers: config.headers });
      return { status: 200, data: '<atom:feed/>' };
    },
  };
  return { client, sent };
}

test('the DELETE offers every version up to the discovered one', async () => {
  const { client, sent } = recordingClient();
  await client.delete('ckf', 'OBJECT_NAME', 'HANDLE', 'application/vnd.sap.bw.modeling.ckf-v1_9_0+xml');
  const accept = sent.headers.Accept.split(', ');
  assert.ok(accept.includes('application/vnd.sap.bw.modeling.ckf-v1_8_0+xml'));
  assert.ok(accept.includes('application/vnd.sap.bw.modeling.ckf-v1_9_0+xml'));
  assert.equal(sent.headers['Content-Type'], 'application/xml, application/vnd.sap.bw.modeling.ckf-v1_9_0+xml');
});

test('a successful delete is not turned into an error by a failing unlock', async () => {
  const calls = [];
  const client = {
    lockForDelete: async () => 'HANDLE',
    delete: async () => { calls.push('delete'); return '<atom:feed/>'; },
    unlock: async () => { calls.push('unlock'); throw new Error('HTTP 404'); },
  };
  const result = JSON.parse(await bwDelete(client, 'ckf', 'OBJECT_NAME'));
  assert.equal(result.success, true);
  assert.deepEqual(calls, ['delete', 'unlock']);
});

test('a refused delete still releases the lock and reports the refusal', async () => {
  const calls = [];
  const client = {
    lockForDelete: async () => 'HANDLE',
    delete: async () => { throw new Error('still in use'); },
    unlock: async () => { calls.push('unlock'); },
  };
  await assert.rejects(bwDelete(client, 'hcpr', 'OBJECT_NAME'), /still in use/);
  assert.deepEqual(calls, ['unlock']);
});

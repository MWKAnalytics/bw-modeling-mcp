import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queryTable } from '../dist/tools/metadata_sql.js';
import { isSessionTimeout } from '../dist/bw-client.js';

const EMPTY = '<dataPreview:tableData xmlns:dataPreview="x"></dataPreview:tableData>';

function fakeClient(answer) {
  const client = {
    inFlight: 0,
    maxInFlight: 0,
    calls: 0,
    async getCsrfToken() { return 'TOKEN'; },
    clearCsrfToken() {},
    async rawPost() {
      client.calls++;
      client.inFlight++;
      client.maxInFlight = Math.max(client.maxInFlight, client.inFlight);
      await new Promise((r) => setTimeout(r, 10));
      client.inFlight--;
      return { body: answer(client.calls), headers: {} };
    },
  };
  return client;
}

test('the first statement on a client runs alone, the rest of a burst follows it', async () => {
  const client = fakeClient(() => EMPTY);
  const order = [];
  const original = client.rawPost;
  client.rawPost = async (...args) => {
    order.push(client.inFlight);
    return original(...args);
  };
  await Promise.all([1, 2, 3, 4, 5].map(() => queryTable(client, 'SELECT 1')));
  assert.equal(client.calls, 5);
  // Nothing else is in flight when the first two start: the second waits for the first.
  assert.equal(order[0], 0);
  assert.equal(order[1], 0);
  assert.ok(client.maxInFlight > 1, 'statements after the first still run concurrently');
});

test('a warm client does not serialize', async () => {
  const client = fakeClient(() => EMPTY);
  await queryTable(client, 'SELECT 1');
  client.maxInFlight = 0;
  await Promise.all([1, 2, 3].map(() => queryTable(client, 'SELECT 1')));
  assert.equal(client.maxInFlight, 3);
});

test('when the opening statement fails, the next caller opens the session in its place', async () => {
  const client = fakeClient(() => EMPTY);
  const original = client.rawPost;
  let first = true;
  client.rawPost = async (...args) => {
    if (first) {
      first = false;
      await new Promise((r) => setTimeout(r, 10));
      throw new Error('POST /x → HTTP 400\nsyntax error');
    }
    return original(...args);
  };
  const results = await Promise.allSettled([1, 2, 3].map(() => queryTable(client, 'SELECT 1')));
  assert.equal(results[0].status, 'rejected');
  assert.ok(results.slice(1).every((r) => r.status === 'fulfilled'));
});

test('400 Session timed out is retried once', async () => {
  const client = fakeClient(() => EMPTY);
  const original = client.rawPost;
  let failures = 1;
  client.rawPost = async (...args) => {
    if (failures-- > 0) throw new Error('POST /x → HTTP 400\n400 Session timed out');
    return original(...args);
  };
  assert.deepEqual(await queryTable(client, 'SELECT 1'), []);
});

test('isSessionTimeout recognises only the 400 that names the timeout', () => {
  assert.equal(isSessionTimeout(400, '400 Session timed out\n\n Thu Oct  1 2026'), true);
  assert.equal(isSessionTimeout(400, 'Session Timed Out'), true);
  assert.equal(isSessionTimeout(400, 'syntax error near FROM'), false);
  assert.equal(isSessionTimeout(500, 'Session timed out'), false);
});

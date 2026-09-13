const test = require('node:test');
const assert = require('node:assert/strict');
const { ReadRequests } = require('../read-requests.cjs');

test('cancel releases a pending read and rejects its late result', async () => {
  const reads = new ReadRequests();
  let finish, signal;
  const pending = reads.run('one', s => { signal = s; return new Promise(r => { finish = r; }); });
  const rejected = assert.rejects(pending, /已取消/);
  reads.cancel('one');
  assert.equal(signal.aborted, true);
  finish('obsolete');
  await rejected;
  assert.equal(await reads.run('one', async () => 'fresh'), 'fresh');
});

test('independent reads run together and duplicate request IDs are rejected', async () => {
  const reads = new ReadRequests();
  let finish;
  const first = reads.run('first', () => new Promise(r => { finish = r; }));
  await assert.rejects(reads.run('first', async () => 0), /重复/);
  assert.equal(await reads.run('second', async () => 2), 2);
  finish(1);
  assert.equal(await first, 1);
});

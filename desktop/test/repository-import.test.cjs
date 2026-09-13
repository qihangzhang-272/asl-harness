const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { readRepository } = require('../repository-import.cjs');

test('reopening an unchanged repository reuses the parsed snapshot and still remembers the source', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'asl-repo-cache-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  let downloads = 0, remembered = 0, parses = 0;
  const context = { temp, selected: new Set(), repositories: new Map(), remember: async () => remembered++,
    fetch: async url => {
      if (url.includes('codeload')) {
        downloads++;
        return { ok: true, body: (async function* () { yield Buffer.from('fixture'); })() };
      }
      return { ok: true, text: async () => JSON.stringify(url.includes('/commits/') ? { sha: 'c'.repeat(40) } : { default_branch: 'main' }) };
    },
    core: async (_action, { output }) => {
      parses++; await fs.mkdir(output);
      return { skills: [], repositoryFiles: [], repositoryDependencies: [] };
    },
  };
  const one = await readRepository('https://github.com/qa/cache-fixture', context);
  const two = await readRepository('https://github.com/qa/cache-fixture', context);
  assert.equal(one.snapshot, two.snapshot);
  assert.equal(downloads, 1); assert.equal(parses, 1); assert.equal(remembered, 2);
});

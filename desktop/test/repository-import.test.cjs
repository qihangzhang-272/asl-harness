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

test('ASL repository inspection preserves skill bytes instead of injecting a root license into every skill', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'asl-repo-exact-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const context = { temp, selected: new Set(), repositories: new Map(), remember: async () => {},
    fetch: async url => url.includes('codeload')
      ? { ok: true, body: (async function* () { yield Buffer.from('fixture'); })() }
      : { ok: true, text: async () => JSON.stringify(url.includes('/commits/') ? {sha: 'd'.repeat(40)} : {default_branch: 'main'}) },
    core: async (action, {output}) => {
      if (action === 'catalog') return {modes: [{id:'writing',skills:['example'],architecture:{paradigms:[]}}],skills:[{id:'example',title:'Example'}]};
      await fs.mkdir(path.join(output, 'skills/example'), {recursive: true});
      await fs.mkdir(path.join(output, 'modes'));
      await fs.writeFile(path.join(output, 'WORKSPACE.md'), '# ASL');
      await fs.writeFile(path.join(output, 'LICENSE'), 'root notice');
      await fs.writeFile(path.join(output, 'skills/example/SKILL.md'), 'original');
      return {skills: [{source: path.join(output, 'skills/example'), inspection: {files:['SKILL.md'], reasons:[]}}],
        repositoryFiles:['LICENSE'], repositoryDependencies:[]};
    },
  };
  const report = await readRepository('https://github.com/qa/preserve-asl', context);
  assert.equal(report.catalog.skills[0].title,'Example');
  assert.equal(report.modes[0].id,'writing');
  assert.equal(context.selected.has(report.snapshot),false); // Remote preview is not a writable local library.
  assert.equal(await fs.readFile(path.join(report.snapshot, 'skills/example/SKILL.md'), 'utf8'), 'original');
  assert.equal(await fs.stat(path.join(report.snapshot, 'skills/example/LICENSE')).then(()=>true).catch(()=>false), false);
});

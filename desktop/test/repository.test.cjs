const { test } = require('node:test');
const assert = require('node:assert/strict');
const { upstreamDocument, presetDestination } = require('../repository.cjs');

test('local watcher coalesces content edits, ignores cache files and stops cleanly', async t => {
  const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
  const { watchEnvironment } = require('../repository.cjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'asl-watch-'));
  await fs.mkdir(path.join(root, 'skills', 'sample', '__pycache__'), { recursive: true });
  const events = [];
  const stop = watchEnvironment(root, event => events.push(event));
  t.after(async () => { stop(); await fs.rm(root, { recursive: true, force: true }); });
  const pause = () => new Promise(resolve => setTimeout(resolve, 800));
  await fs.writeFile(path.join(root, 'skills/sample/__pycache__/ignored.pyc'), 'cache');
  await fs.writeFile(path.join(root, 'README.md'), 'navigation');
  await pause();
  assert.equal(events.length, 0);
  await fs.writeFile(path.join(root, 'skills/sample/SKILL.md'), 'first');
  await fs.writeFile(path.join(root, 'skills/sample/SKILL.md'), 'second');
  await pause();
  assert.deepEqual(events, [{ workspace: root }]);
  stop();
  await fs.writeFile(path.join(root, 'skills/sample/SKILL.md'), 'after close');
  await pause();
  assert.equal(events.length, 1);
});

test('cloud binding keeps upstream notices and replaces only its own block', () => {
  const repo = { url: 'https://github.com/example/skills', commit: 'a'.repeat(40) };
  const original = '# Source\nCopyright example\n';
  const text = upstreamDocument(original, repo, repo.url);
  const updated = upstreamDocument(text, { ...repo, commit: 'b'.repeat(40) }, repo.url);
  assert.ok(updated.startsWith(original));
  assert.equal(updated.match(/<!-- asl:upstream -->/g).length, 1);
  assert.ok(updated.includes('- Commit: ' + 'b'.repeat(40)));
  assert.ok(!updated.includes('a'.repeat(40)));
});

test('DeepSeek preset destination uses native root and refuses unsafe mode ids', () => {
  const path = require('node:path');
  const root = path.resolve('native-presets');
  assert.equal(presetDestination(root, 'Creator_Studio'), path.join(root, 'asl-creator-studio'));
  assert.throws(() => presetDestination(root, '../escape'));
});

test('update monitor shares requests, separates new commits from errors, never writes content', async () => {
  const { checkUpstreams } = require('../repository.cjs');
  let calls = 0;
  const fetch = async url => {
    calls++;
    if (url.includes('/offline/')) throw new Error('offline');
    return { ok: true, text: async () => JSON.stringify(url.includes('/commits/') ? { sha: 'b'.repeat(40) } : { default_branch: 'main' }) };
  };
  const rows = await checkUpstreams([
    { id: 'one', upstream: { url: 'https://github.com/example/skills', commit: 'a'.repeat(40) } },
    { id: 'two', upstream: { url: 'https://github.com/example/skills', commit: 'b'.repeat(40) } },
    { id: 'three', upstream: { url: 'https://github.com/offline/skills', commit: 'a'.repeat(40) } },
    { id: 'local-only' },
  ], fetch);
  assert.deepEqual(rows.modes.map(m => m.status), ['new-commit', 'current', 'error']);
  assert.equal(calls, 3);
  assert.ok(rows.checkedAt);
});

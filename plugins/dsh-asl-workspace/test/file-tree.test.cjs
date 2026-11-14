const test=require('node:test');
const assert=require('node:assert/strict');
test('file tree keeps scoped nesting, folder order and filtered ancestors',async()=>{
  const {treeEntries,visibleEntries}=await import('../client/file-tree.mjs');
  const files=['SKILL.md','references/guide.md','references/deep/note.md','scripts/run.py'].map(path=>({path}));
  const entries=treeEntries(files);
  assert.equal(entries[0].path,'references');
  assert.deepEqual(visibleEntries(entries,new Set(),'' ).map(e=>e.path),['references','scripts','SKILL.md']);
  assert.ok(!visibleEntries(entries,new Set(['references']),'').some(e=>e.path==='references/deep/note.md'));
  assert.deepEqual(treeEntries(files,'note').map(e=>e.path),['references','references/deep','references/deep/note.md']);
});

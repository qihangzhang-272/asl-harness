const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
test('screen state survives reopen independently for each library', async t => {
  const {rememberLibrary,rememberView,readPreferences}=require('../library.cjs');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'asl-restore-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file=path.join(root,'preferences.json');
  const first=path.resolve(__dirname,'../../examples/personal-environment');
  const second=path.join(root,'other');
  await fs.mkdir(path.join(second,'skills'),{recursive:true});
  await fs.mkdir(path.join(second,'modes'));
  await fs.writeFile(path.join(second,'WORKSPACE.md'),'# Other');
  await rememberLibrary(file,first); await rememberLibrary(file,second);
  await rememberView(file,first,{mode:'writing',page:'skills',view:'list',skill:'source-research',query:'research'});
  await rememberView(file,second,{mode:'reading',page:'modes',view:'map'});
  const restored=await readPreferences(file);
  assert.equal(restored.views[first].mode,'writing');
  assert.equal(restored.views[first].skill,'source-research');
  assert.equal(restored.views[second].mode,'reading');
  await assert.rejects(rememberView(file,first,{page:'shell',command:'bad'}),/界面/);
});
test('concurrent preference changes preserve remembered views and sources',async t=>{
  const {rememberLibrary,rememberView,updatePreferences,readPreferences}=require('../library.cjs');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'asl-prefs-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file=path.join(root,'preferences.json'),library=path.resolve(__dirname,'../../examples/personal-environment');
  await rememberLibrary(file,library);
  await Promise.all([rememberView(file,library,{mode:'writing',page:'modes',view:'map'}),updatePreferences(file,p=>({...p,repositories:['https://github.com/example/skills']}))]);
  const value=await readPreferences(file);
  assert.equal(value.views[library].mode,'writing');
  assert.deepEqual(value.repositories,['https://github.com/example/skills']);
});
test("recent locations are references only and invalid saved locations are filtered", async () => {
  const { readPreferences, rememberLibrary, writePreferences } = require("../library.cjs");
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "asl-library-test-"));
  try {
    const file = path.join(temp, "preferences.json");
    const root = path.resolve(__dirname, "../../examples/personal-environment");
    await rememberLibrary(file, root);
    await rememberLibrary(file, root);
    const data = await readPreferences(file);
    assert.deepEqual(data.libraries, [root]);
    assert.equal(data.lastLibrary, root);
    assert.ok(!JSON.stringify(data).includes("SKILL.md"));
    const target = { project: temp, host: "workbuddy", mode: "creator-studio" };
    await writePreferences(file, { ...data, targets: [target], repositories: ["https://github.com/example/skills"] });
    const restored = await readPreferences(file);
    assert.deepEqual(restored.targets, [target]);
    assert.deepEqual(restored.repositories, ["https://github.com/example/skills"]);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});

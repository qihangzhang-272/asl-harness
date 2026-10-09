const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

test('all connection records survive beyond fifty, including temporarily unavailable libraries',async t=>{
  const {writePreferences,readPreferences,rememberLibrary}=require('../library.cjs');
  const home=await fs.mkdtemp(path.join(os.tmpdir(),'asl-records-'));
  t.after(()=>fs.rm(home,{recursive:true,force:true}));
  const file=path.join(home,'libraries.json');
  const libraries=Array.from({length:55},(_,i)=>path.join(home,`library-${i}`));
  const repositories=Array.from({length:55},(_,i)=>`https://github.com/example/repo-${i}`);
  await writePreferences(file,{libraries,repositories,lastLibrary:libraries[54],views:{[libraries[0]]:{page:'skills'}}});
  const read=await readPreferences(file);
  assert.deepEqual(read.libraries,libraries);assert.deepEqual(read.repositories,repositories);
  assert.equal(read.lastLibrary,libraries[54]);assert.equal(read.views[libraries[0]].page,'skills');
  const example=path.resolve(__dirname,'../../examples/personal-environment');
  await rememberLibrary(file,example);
  assert.equal((await readPreferences(file)).libraries.length,56);
});

test('exit flush waits for the latest queued preference write',async t=>{
  const {updatePreferences,flushPreferences,readPreferences}=require('../library.cjs');
  const home=await fs.mkdtemp(path.join(os.tmpdir(),'asl-exit-flush-'));
  t.after(()=>fs.rm(home,{recursive:true,force:true}));
  const file=path.join(home,'libraries.json');
  let release;const gate=new Promise(resolve=>{release=resolve;});
  const write=updatePreferences(file,async value=>{await gate;return {...value,activeSource:null};});
  let finished=false;const flush=flushPreferences().then(()=>{finished=true;});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(finished,false);
  release();await flush;await write;
  assert.equal((await readPreferences(file)).activeSource,null);
});
const os = require("node:os");

test('opening registered libraries changes selection without reordering the sidebar',async t=>{
  const {rememberLibrary,readPreferences}=require('../library.cjs');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'asl-stable-libraries-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file=path.join(root,'preferences.json'),libraries=[];
  for(const name of ['personal','public','older']){
    const folder=path.join(root,name);libraries.push(folder);
    await fs.mkdir(path.join(folder,'skills'),{recursive:true});await fs.mkdir(path.join(folder,'modes'));
    await fs.writeFile(path.join(folder,'WORKSPACE.md'),'# Library');await rememberLibrary(file,folder);
  }
  for(const folder of [libraries[0],libraries[2],libraries[1],libraries[0]]){
    const result=await rememberLibrary(file,folder);
    assert.deepEqual(result.libraries,libraries);
    assert.equal(result.lastLibrary,folder);
  }
  assert.deepEqual((await readPreferences(file)).libraries,libraries);
});

test('a packaged example is not a personal library remembered across releases',async t=>{
  const {readPreferences}=require('../library.cjs');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'asl-example-reference-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const example=path.join(root,'old-app','resources','example-environment');
  await fs.mkdir(path.join(example,'skills'),{recursive:true});
  await fs.mkdir(path.join(example,'modes'));
  await fs.writeFile(path.join(example,'WORKSPACE.md'),'# Packaged example');
  const file=path.join(root,'preferences.json');
  await fs.writeFile(file,JSON.stringify({lastLibrary:example,libraries:[example]}));
  const read=await readPreferences(file);
  assert.deepEqual(read.libraries,[]);
  assert.equal(read.lastLibrary,null);
  assert.ok(await fs.stat(example));
});
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
test('a transient windows file lock on rename is retried instead of failing the save', async t => {
  const { writePreferences } = require('../library.cjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'asl-rename-lock-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'libraries.json');
  await writePreferences(file, { libraries: ['old'] });
  const rename = fs.rename;
  let attempts = 0;
  t.mock.method(fs, 'rename', async (from, to) => {
    attempts++;
    if (attempts <= 2) {
      const error = new Error(`EPERM: operation not permitted, rename '${from}' -> '${to}'`);
      error.code = 'EPERM';
      throw error;
    }
    return rename(from, to);
  });
  await writePreferences(file, { libraries: ['new'] });
  assert.equal(attempts, 3);
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { libraries: ['new'] });
});
test('a stuck lock still fails loudly after three attempts and never breaks the old file', async t => {
  const { writePreferences } = require('../library.cjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'asl-rename-stuck-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'libraries.json');
  await writePreferences(file, { libraries: ['old'] });
  let attempts = 0;
  t.mock.method(fs, 'rename', async (from, to) => {
    attempts++;
    const error = new Error(`EPERM: operation not permitted, rename '${from}' -> '${to}'`);
    error.code = 'EPERM';
    throw error;
  });
  await assert.rejects(writePreferences(file, { libraries: ['new'] }), /EPERM/);
  assert.equal(attempts, 3);
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), { libraries: ['old'] });
});
test('a rename failure that is not a known file lock is reported without retrying', async t => {
  const { writePreferences } = require('../library.cjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'asl-rename-hard-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'libraries.json');
  let attempts = 0;
  t.mock.method(fs, 'rename', async () => {
    attempts++;
    const error = new Error('ENOENT: no such file or directory, rename');
    error.code = 'ENOENT';
    throw error;
  });
  await assert.rejects(writePreferences(file, { libraries: ['new'] }), /ENOENT/);
  assert.equal(attempts, 1);
});
test('a failed preference write leaves the queue usable and later updates are not lost', async t => {
  const { rememberLibrary, rememberView, updatePreferences, readPreferences } = require('../library.cjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'asl-prefs-queue-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, 'preferences.json');
  const library = path.resolve(__dirname, '../../examples/personal-environment');
  await rememberLibrary(file, library);
  const rename = fs.rename;
  let locked = true;
  t.mock.method(fs, 'rename', async (from, to) => {
    if (locked) {
      const error = new Error('EBUSY: resource busy or locked, rename');
      error.code = 'EBUSY';
      throw error;
    }
    return rename(from, to);
  });
  await assert.rejects(updatePreferences(file, p => ({ ...p, repositories: ['https://github.com/example/failed'] })), /EBUSY/);
  locked = false;
  await Promise.all([
    rememberView(file, library, { mode: 'writing', page: 'agents', view: 'map' }),
    updatePreferences(file, p => ({ ...p, repositories: ['https://github.com/example/kept'] })),
  ]);
  const value = await readPreferences(file);
  assert.equal(value.views[library].page, 'agents');
  assert.deepEqual(value.repositories, ['https://github.com/example/kept']);
});
test('renderer preference saves report failure instead of leaving an unhandled promise', async () => {
  const source = await fs.readFile(path.join(__dirname, '..', 'src', 'App.jsx'), 'utf8');
  const saves = source.split('\n').filter(line => line.includes("api('selectSource'"));
  assert.ok(saves.length >= 3);
  for (const line of saves) {
    assert.match(line, /\.catch\(/);
    assert.match(line, /setMessage\(\{error:true,text:error\.message\}\)/);
  }
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
test('removing a cloud connection preserves adopted local libraries, other sources and views',async t=>{
  const {writePreferences,readPreferences,forgetRepository}=require('../library.cjs');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'asl-forget-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const file=path.join(root,'preferences.json'),library=path.resolve(__dirname,'../../examples/personal-environment');
  const removed='https://github.com/example/removed',kept='https://github.com/example/kept';
  await writePreferences(file,{libraries:[library],lastLibrary:library,views:{[library]:{mode:'creator-studio',page:'modes'}},repositories:[removed,kept],activeSource:{url:removed,mode:null}});
  const result=await forgetRepository(file,removed);
  assert.deepEqual(result.repositories,[kept]);
  assert.equal(result.activeSource,null);
  const saved=await readPreferences(file);
  assert.equal(saved.lastLibrary,library);
  assert.equal(saved.views[library].mode,'creator-studio');
  assert.ok(await fs.stat(path.join(library,'WORKSPACE.md')));
});
